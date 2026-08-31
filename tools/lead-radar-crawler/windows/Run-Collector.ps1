param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
$plainBytes=$null
try {
    $spec=Get-CollectorSpec
    if ([IO.Path]::GetFullPath($ConfigPath) -ne (Join-Path $spec.Root 'config.json')) { throw 'config_path_mismatch' }
    $config=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    if ($config.apiBase -cne 'https://gptbot.uz/api/lead-radar/crawler' -or $config.root -cne $spec.Root) { throw 'runtime_target_mismatch' }
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    $principal=New-Object Security.Principal.WindowsPrincipal($identity)
    if ($identity.User.Value -ne $config.userSid -or $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'worker_identity_mismatch' }
    Import-CollectorNative
    [GPTBotCollector.Native]::RemoveTraverseBypass()
    if ([GPTBotCollector.Native]::TraverseBypassPresent()) { throw 'worker_traverse_privilege_present' }
    foreach ($path in $config.denyProbePaths) {
        if (-not [GPTBotCollector.Native]::ReadAccessDenied($path)) { throw 'worker_isolation_regressed' }
    }
    Add-Type -AssemblyName System.Security
    $cipher=[IO.File]::ReadAllBytes((Join-Path $spec.Root 'secrets\token.dpapi'))
    $plainBytes=[Security.Cryptography.ProtectedData]::Unprotect($cipher,[Text.Encoding]::UTF8.GetBytes($config.installationId),[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $token=[Text.Encoding]::UTF8.GetString($plainBytes)
    if ($token -cnotmatch '^lrcr_[a-f0-9]{64}$') { throw 'worker_token_invalid' }
    $start=New-Object Diagnostics.ProcessStartInfo
    $start.FileName=Join-Path $spec.Root 'python\python.exe'
    $start.WorkingDirectory=Join-Path $spec.Root 'app'
    $start.Arguments='-B -m collector --once --state "' + (Join-Path $spec.Root 'private\state.sqlite3') + '"'
    $start.EnvironmentVariables.Clear()
    $start.EnvironmentVariables['SystemRoot']=$env:SystemRoot
    $start.EnvironmentVariables['WINDIR']=$env:WINDIR
    $start.EnvironmentVariables['PATH']=(Join-Path $spec.Root 'python')+';'+(Join-Path $spec.Root 'node')+';'+(Join-Path $env:SystemRoot 'System32')
    $start.EnvironmentVariables['TEMP']=Join-Path $spec.Root 'private\tmp'
    $start.EnvironmentVariables['TMP']=$start.EnvironmentVariables['TEMP']
    $start.EnvironmentVariables['PYTHONHOME']=Join-Path $spec.Root 'python'
    $start.EnvironmentVariables['PYTHONNOUSERSITE']='1'
    $start.EnvironmentVariables['PYTHONUTF8']='1'
    $start.EnvironmentVariables['PYTHONDONTWRITEBYTECODE']='1'
    $start.EnvironmentVariables['CRAWLER_NODE']=Join-Path $spec.Root 'node\node.exe'
    $start.EnvironmentVariables['CRAWLER_EXTRACTOR']=Join-Path $spec.Root 'app\extractor.mjs'
    $start.EnvironmentVariables['CRAWLER_API_BASE']=$config.apiBase
    $start.EnvironmentVariables['CRAWLER_TOKEN']=$token
    $result=[GPTBotCollector.Native]::Run($start,$null,240,$true)
    $status=$result.Output.Trim()
    if ($status -notmatch '^(completed|partial|deferred|failed|delivery_waiting|worker_busy|no_job)$') { $status='runtime_error' }
    $errorCode=$result.ErrorCode
    if ($status -eq 'runtime_error' -and $null -eq $errorCode) { $errorCode='python_output_invalid' }
    Write-CollectorJson (Join-Path $spec.Root 'private\last-run.json') @{finishedAt=[DateTime]::UtcNow.ToString('o');status=$status;
        exitCode=$result.ExitCode;errorCode=$errorCode;traverseBypassRemoved=$result.TraverseBypassRemoved}
    $start.EnvironmentVariables.Remove('CRAWLER_TOKEN')
    $token=$null
    exit $result.ExitCode
} catch { [Console]::Error.WriteLine('collector_wrapper_failed'); exit 2 }
finally { if ($null -ne $plainBytes) { [Array]::Clear($plainBytes,0,$plainBytes.Length) } }
