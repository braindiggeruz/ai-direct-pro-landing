param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
$bootstrapStage='read_config'
try {
    $config=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    $bootstrapStage='validate_identity'
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    $principal=New-Object Security.Principal.WindowsPrincipal($identity)
    if ($identity.User.Value -ne $config.userSid -or $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'bootstrap_identity_mismatch'
    }
    $bootstrapStage='load_native'
    Import-CollectorNative
    $bootstrapStage='remove_traverse'
    [GPTBotCollector.Native]::RemoveTraverseBypass()
    if ([GPTBotCollector.Native]::TraverseBypassPresent()) { throw 'bootstrap_traverse_privilege_present' }
    $proofs=@()
    $expectedProbes=@('C:\Users\Borinio','F:\Claude','C:\Users\Borinio\AppData\Local\GPTBot\LeadRadarTelegramBridge\vault.dpapi',
        'F:\Claude\gptbot-lead-radar-integration-20260827\AGENTS.md')
    if (@($config.denyProbePaths).Count -ne 4 -or @($config.denyProbePaths | Select-Object -Unique).Count -ne 4 -or
        @($config.denyProbePaths | Where-Object { $expectedProbes -cnotcontains $_ }).Count -ne 0) { throw 'bootstrap_probe_config_invalid' }
    foreach ($path in $config.denyProbePaths) {
        $bootstrapStage=@('probe_owner_root','probe_workspace_root','probe_bridge_vault','probe_workspace_file')[[Array]::IndexOf($expectedProbes,$path)]
        if (-not [GPTBotCollector.Native]::ReadAccessDenied($path)) { throw 'bootstrap_forbidden_path_readable' }
        $proofs += @{path=$path;accessDenied=$true}
    }
    $bootstrapStage='offline_runtime'
    $runtime=New-Object Diagnostics.ProcessStartInfo
    $runtime.FileName=Join-Path $config.root 'python\python.exe'
    $runtime.WorkingDirectory=Join-Path $config.root 'app'
    $runtime.Arguments='-B "'+(Join-Path $config.root 'windows\Runtime-Selfcheck.py')+'"'
    $runtime.EnvironmentVariables.Clear()
    $runtime.EnvironmentVariables['SystemRoot']=$env:SystemRoot
    $runtime.EnvironmentVariables['WINDIR']=$env:WINDIR
    $runtime.EnvironmentVariables['PATH']=(Join-Path $config.root 'python')+';'+(Join-Path $config.root 'node')+';'+(Join-Path $env:SystemRoot 'System32')
    $runtime.EnvironmentVariables['TEMP']=Join-Path $config.root 'private\tmp'
    $runtime.EnvironmentVariables['TMP']=$runtime.EnvironmentVariables['TEMP']
    $runtime.EnvironmentVariables['PYTHONHOME']=Join-Path $config.root 'python'
    $runtime.EnvironmentVariables['PYTHONNOUSERSITE']='1'
    $runtime.EnvironmentVariables['PYTHONUTF8']='1'
    $selfcheck=[GPTBotCollector.Native]::Run($runtime,$null,40,$true)
    if ($selfcheck.ExitCode -ne 0 -or $selfcheck.TimedOut -or -not $selfcheck.TraverseBypassRemoved) { throw 'offline_runtime_selfcheck_failed' }
    $runtimeProof=$selfcheck.Output | ConvertFrom-Json
    if ($runtimeProof.ok -ne $true -or $runtimeProof.networkUsed -ne $false -or $runtimeProof.traverseBypassRemoved -ne $true) { throw 'offline_runtime_proof_invalid' }
    $bootstrapStage='read_token'
    $token=[Console]::In.ReadLine()
    if ($token -cnotmatch '^lrcr_[a-f0-9]{64}$') { throw 'bootstrap_token_invalid' }
    $bootstrapStage='protect_token'
    Add-Type -AssemblyName System.Security
    $bytes=[Text.Encoding]::UTF8.GetBytes($token)
    try {
        $entropy=[Text.Encoding]::UTF8.GetBytes($config.installationId)
        $cipher=[Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        $roundtrip=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        if ([Convert]::ToBase64String($roundtrip) -ne [Convert]::ToBase64String($bytes)) { throw 'dpapi_roundtrip_failed' }
        [Array]::Clear($roundtrip,0,$roundtrip.Length)
        $bootstrapStage='proof_output'
        [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
        [Console]::Out.WriteLine((@{sid=$identity.User.Value;proofs=$proofs;runtimeProof=$runtimeProof;traverseBypassRemoved=$true;ciphertext=[Convert]::ToBase64String($cipher)} | ConvertTo-Json -Depth 5 -Compress))
    } finally { [Array]::Clear($bytes,0,$bytes.Length); $token=$null }
    exit 0
} catch {
    $allowed=@('bootstrap_identity_mismatch','bootstrap_forbidden_path_readable','bootstrap_traverse_privilege_present',
        'bootstrap_probe_config_invalid','offline_runtime_selfcheck_failed','offline_runtime_proof_invalid',
        'bootstrap_token_invalid','dpapi_roundtrip_failed','deny_probe_not_access_denied',
        'traverse_privilege_lookup_failed','traverse_privilege_removal_failed','traverse_privilege_still_present',
        'child_traverse_privilege_present','restricted_child_parent_invalid')
    $reason=$_.Exception.GetBaseException().Message
    if ($allowed -cnotcontains $reason) { $reason='bootstrap_step_failed' }
    [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
    [Console]::Out.WriteLine((@{ok=$false;failureStage=$bootstrapStage;failureCode=$reason} | ConvertTo-Json -Compress))
    [Console]::Error.WriteLine('collector_bootstrap_failed')
    exit 2
}
