[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$BundlePath,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$BundleManifestSha256,
    [Parameter(Mandatory=$true)][string]$TokenStagingPath,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$TokenStagingSha256,
    [string]$ResumeInstallationId,
    [string]$ResumePreviousBundlePath,
    [string]$ResumePreviousManifestSha256,
    [string]$ReportPath,
    [switch]$ValidateOnly
)

function Assert-CollectorResumeManifest($Value,$Account,$Spec,[string]$ExpectedId,[string]$PreviousHash) {
    $parsed=[Guid]::Empty
    if (-not [Guid]::TryParseExact($ExpectedId,'D',[ref]$parsed) -or $PreviousHash -cnotmatch '^[a-f0-9]{64}$' -or
        $Value.schema -cne $Spec.Schema -or $Value.root -cne $Spec.Root -or $Value.installationId -cne $ExpectedId -or
        $Value.bundleManifestSha256 -cne $PreviousHash -or $Value.userName -cne $Spec.User -or
        $Value.taskName -cne $Spec.TaskName -or $Value.taskPath -cne $Spec.TaskPath -or
        $Value.state -notin @('creating','failed_disabled') -or $Value.accountCreated -ne $true -or
        $Value.accountCreationStarted -ne $true -or $Value.taskRegistered -ne $false -or $Value.taskInitiallyDisabled -ne $true -or
        @($Value.isolationProofs).Count -ne 0 -or $null -eq $Account -or $Account.Name -cne $Spec.User -or
        $Account.SID.Value -cne $Value.userSid -or $Account.Comment -cne ('GPTBot collector '+$ExpectedId)) { throw 'resume_ownership_mismatch' }
    foreach ($field in @('runtimeProof','dpapiScope','activation','traverseBypassRemoved')) {
        if ($Value.PSObject.Properties[$field] -and $null -ne $Value.$field) { throw 'resume_already_provisioned' }
    }
}

function Assert-CollectorUnprovisioned($Spec,[string]$Sid) {
    foreach ($path in @('C:\Users\GPTBotCollector',(Join-Path $Spec.Root 'config.json'),
        (Join-Path $Spec.Root 'secrets\token.dpapi'),(Join-Path $Spec.Root 'private\state.sqlite3'),
        ('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\'+$Sid))) {
        if (Test-Path -LiteralPath $path -ErrorAction Stop) { throw 'resume_provisioned_state_present' }
    }
    $lookupErrors=@()
    $foundTask=Get-ScheduledTask -TaskName $Spec.TaskName -TaskPath $Spec.TaskPath -ErrorAction SilentlyContinue -ErrorVariable lookupErrors
    if (@($lookupErrors | Where-Object { $_.CategoryInfo.Category -ne 'ObjectNotFound' }).Count -ne 0) { throw 'resume_task_lookup_failed' }
    if ($foundTask) { throw 'resume_task_present' }
}

function Get-CollectorResumeChanges($Previous,$Next,[string]$Root) {
    $old=@{};$nextFiles=@{}
    foreach ($file in $Previous.Manifest.files) { $old[(Assert-CollectorRelativePath ([string]$file.path)).ToLowerInvariant()]=$file }
    foreach ($file in $Next.Manifest.files) { $nextFiles[(Assert-CollectorRelativePath ([string]$file.path)).ToLowerInvariant()]=$file }
    foreach ($relative in $old.Keys) { if (-not $nextFiles.ContainsKey($relative)) { throw 'resume_file_removal_refused' } }
    foreach ($relative in $nextFiles.Keys) {
        if (-not $old.ContainsKey($relative) -and $relative -cne 'windows\activate-collector.ps1') { throw 'resume_new_file_refused' }
    }
    $changes=@()
    foreach ($relative in @($nextFiles.Keys | Sort-Object)) {
        $path=Assert-NoReparsePath (Join-Path $Root $relative)
        $before=$old[$relative];$after=$nextFiles[$relative]
        if ($null -ne $before) {
            $item=Get-Item -LiteralPath $path -Force -ErrorAction Stop
            if ($item.PSIsContainer -or $item.Length -ne [long]$before.sizeBytes -or
                (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $before.sha256) { throw 'resume_installed_file_mismatch' }
        } elseif (Test-Path -LiteralPath $path) { throw 'resume_addition_already_exists' }
        if ($null -eq $before -or $before.sha256 -cne $after.sha256) {
            $changes+=@{path=$relative;oldSha256=$(if ($null -eq $before) {$null} else {$before.sha256});sha256=$after.sha256;sizeBytes=[long]$after.sizeBytes}
        }
    }
    ,$changes
}

function Get-CollectorWin32Failure($Exception) {
    $base=$Exception.GetBaseException()
    $value=$base.Data['Win32Error']
    if ($null -eq $value -and $base -is [ComponentModel.Win32Exception]) { $value=$base.NativeErrorCode }
    if ($value -is [int] -and $value -gt 0 -and $value -le 65535) { return $value }
    return $null
}

$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$spec=$null
$manifest=$null
$password=$null
$token=$null
$tokenBytes=$null
$securePassword=$null
$reportReady=$false
$ownedMutationStarted=$false
$resumeChanges=@()
$bootstrapFailureStage=$null
$failureStage='load_common'
try {
    . (Join-Path $PSScriptRoot 'Common.ps1')
    $spec=Get-CollectorSpec
    $failureStage='validate_report'
    if ($ReportPath) {
        $ReportPath=Assert-NoReparsePath $ReportPath
        if ((Test-Path -LiteralPath $ReportPath) -or $ReportPath.StartsWith($spec.Root+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'report_target_refused' }
        $reportParent=Split-Path -Parent $ReportPath
        $reportAcl=Get-Acl -LiteralPath $reportParent
        $trusted=@('S-1-5-18','S-1-5-32-544',([Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
        foreach ($ace in $reportAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
            if ($ace.AccessControlType -eq 'Allow' -and $trusted -notcontains $ace.IdentityReference.Value -and
                ($ace.FileSystemRights -band [Security.AccessControl.FileSystemRights]::ReadData)) { throw 'report_parent_acl_not_private' }
        }
        $reportReady=$true
    }
    $failureStage='load_system_helpers'
    Import-Module (Join-Path $script:CollectorSystemDirectory 'WindowsPowerShell\v1.0\Modules\ScheduledTasks\ScheduledTasks.psd1') -ErrorAction Stop
    Import-CollectorNative
    $failureStage='validate_targets'
    $resumeCount=@(@($ResumeInstallationId,$ResumePreviousBundlePath,$ResumePreviousManifestSha256) | Where-Object { -not [string]::IsNullOrEmpty($_) }).Count
    if ($resumeCount -ne 0 -and $resumeCount -ne 3) { throw 'resume_parameters_incomplete' }
    $isResume=$resumeCount -eq 3
    $null=Assert-NoReparsePath $spec.Root
    if ($isResume) {
        $existing=Get-Content -LiteralPath (Join-Path $spec.Root 'installation.json') -Raw | ConvertFrom-Json
        $account=[GPTBotCollector.LocalAccount]::Get()
        Assert-CollectorResumeManifest $existing $account $spec $ResumeInstallationId $ResumePreviousManifestSha256
        Assert-CollectorUnprovisioned $spec $account.SID.Value
        if ([GPTBotCollector.LocalAccount]::IsMemberOfBuiltin('S-1-5-32-544')) { throw 'collector_unexpected_administrator' }
        $manifest=$existing
    } else {
        if (Test-Path -LiteralPath $spec.Root) { throw 'installation_target_exists' }
        if ($null -ne [GPTBotCollector.LocalAccount]::Get()) { throw 'dedicated_account_exists' }
        if (Test-Path -LiteralPath 'C:\Users\GPTBotCollector') { throw 'unexpected_collector_profile_exists' }
    }
    if (Get-ScheduledTask -TaskName $spec.TaskName -TaskPath $spec.TaskPath -ErrorAction SilentlyContinue) { throw 'scheduled_task_exists' }
    $failureStage='validate_bundle'
    $bundle=Assert-CollectorBundle $BundlePath $BundleManifestSha256
    if ($isResume) {
        $previousBundle=Assert-CollectorBundle $ResumePreviousBundlePath $ResumePreviousManifestSha256
        $resumeChanges=Get-CollectorResumeChanges $previousBundle $bundle $spec.Root
    }
    $failureStage='validate_token_metadata'
    $tokenPath=Assert-NoReparsePath $TokenStagingPath
    $tokenItem=Get-Item -LiteralPath $tokenPath -Force -ErrorAction Stop
    if ($tokenItem.PSIsContainer -or $tokenItem.Length -lt 69 -or $tokenItem.Length -gt 256 -or
        (Get-FileHash -LiteralPath $tokenPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $TokenStagingSha256) { throw 'token_staging_hash_mismatch' }
    $tokenAcl=Get-Acl -LiteralPath $tokenPath
    $trustedSids=@('S-1-5-18','S-1-5-32-544',([Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
    foreach ($ace in $tokenAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($ace.AccessControlType -eq 'Allow' -and $trustedSids -notcontains $ace.IdentityReference.Value -and
            ($ace.FileSystemRights -band [Security.AccessControl.FileSystemRights]::ReadData)) { throw 'token_staging_acl_not_private' }
    }
    $failureStage='validate_isolation_paths'
    $forbiddenRoots=@('C:\Users\Borinio','F:\Claude')
    $probes=@('C:\Users\Borinio','F:\Claude','C:\Users\Borinio\AppData\Local\GPTBot\LeadRadarTelegramBridge\vault.dpapi',
        'F:\Claude\gptbot-lead-radar-integration-20260827\AGENTS.md')
    foreach ($path in $probes) {
        $null=Assert-NoReparsePath $path
        if (-not (Test-Path -LiteralPath $path)) { throw 'required_deny_probe_missing' }
    }
    if ($ValidateOnly) {
        @{ready=$true;target=$spec.Root;account=$spec.User;task=($spec.TaskPath+$spec.TaskName);
          bundleBytes=$bundle.TotalBytes;willStartDisabled=$true;changesMade=$false;resume=$isResume;changedFiles=@($resumeChanges).Count} | ConvertTo-Json
        return
    }
    $failureStage='require_elevation'
    $current=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'elevation_required' }
    # Only the reviewed elevated invocation reaches this point. No downloads.
    $ownedMutationStarted=$true
    if ($isResume) {
        $failureStage='resume_verified_runtime'
        $installationId=$ResumeInstallationId
        $manifestPath=Join-Path $spec.Root 'installation.json'
        Assert-CollectorUnprovisioned $spec $account.SID.Value
        $recoveryRoot=Join-Path $spec.Root ('recovery\'+[Guid]::NewGuid().ToString())
        $null=New-Item -ItemType Directory -Path $recoveryRoot -Force
        Set-CollectorPrivateAcl $recoveryRoot
        [IO.File]::Copy($manifestPath,(Join-Path $recoveryRoot 'installation.before.json'),$false)
        $journal=@{installationId=$installationId;oldHash=$ResumePreviousManifestSha256;newHash=$BundleManifestSha256;files=$resumeChanges;copied=@()}
        Write-CollectorJson (Join-Path $recoveryRoot 'recovery.json') $journal
        foreach ($change in $resumeChanges) {
            if ($null -eq $change.oldSha256) { continue }
            $backup=Join-Path $recoveryRoot ('files\'+$change.path)
            $null=New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force
            [IO.File]::Copy((Join-Path $spec.Root $change.path),$backup,$false)
            if ((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant() -cne $change.oldSha256) { throw 'resume_backup_mismatch' }
        }
        foreach ($change in $resumeChanges) {
            $destination=Assert-NoReparsePath (Join-Path $spec.Root $change.path)
            $source=Assert-NoReparsePath (Join-Path $bundle.Root $change.path)
            $null=New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force
            [IO.File]::Copy($source,$destination,($null -ne $change.oldSha256))
            if ((Get-Item -LiteralPath $destination).Length -ne $change.sizeBytes -or
                (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -cne $change.sha256) { throw 'resume_copied_file_mismatch' }
            $journal.copied+=@($change.path)
            Write-CollectorJson (Join-Path $recoveryRoot 'recovery.json') $journal
        }
        $manifest.state='creating'
        $manifest.bundleManifestSha256=$BundleManifestSha256
        $manifest | Add-Member -NotePropertyName recovery -NotePropertyValue @{backupPath=$recoveryRoot;oldHash=$ResumePreviousManifestSha256;newHash=$BundleManifestSha256} -Force
        Write-CollectorJson $manifestPath $manifest
    } else {
    $failureStage='create_protected_target'
    $parent=Split-Path -Parent $spec.Root
    if (-not (Test-Path -LiteralPath $parent)) { $null=New-Item -ItemType Directory -Path $parent }
    $null=New-Item -ItemType Directory -Path $spec.Root
    Set-CollectorPrivateAcl $spec.Root
    $installationId=[Guid]::NewGuid().ToString()
    $manifest=[pscustomobject][ordered]@{schema=$spec.Schema;installationId=$installationId;root=$spec.Root;userName=$spec.User;
        userSid=$null;taskName=$spec.TaskName;taskPath=$spec.TaskPath;bundleManifestSha256=$BundleManifestSha256;
        createdAt=[DateTime]::UtcNow.ToString('o');state='creating';accountCreationStarted=$false;accountCreated=$false;taskRegistered=$false;
        taskInitiallyDisabled=$true;addedDenyRules=@();isolationProofs=@()}
    $manifestPath=Join-Path $spec.Root 'installation.json'
    Write-CollectorJson $manifestPath $manifest
    $failureStage='copy_verified_bundle'
    foreach ($file in $bundle.Manifest.files) {
        $relative=Assert-CollectorRelativePath ([string]$file.path)
        $destination=Join-Path $spec.Root $relative
        $directory=Split-Path -Parent $destination
        if (-not (Test-Path -LiteralPath $directory)) { $null=New-Item -ItemType Directory -Path $directory -Force }
        [IO.File]::Copy((Join-Path $bundle.Root $relative),$destination,$false)
        if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw 'copied_bundle_hash_mismatch' }
    }
    }
    # Password is transient memory only; Task Scheduler stores its own protected credential.
    $failureStage='create_dedicated_account'
    $random=New-Object byte[] 48
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($random) } finally { $rng.Dispose() }
    $password='Aa1!'+[Convert]::ToBase64String($random)
    [Array]::Clear($random,0,$random.Length)
    $securePassword=ConvertTo-SecureString $password -AsPlainText -Force
    $manifest.accountCreationStarted=$true
    Write-CollectorJson $manifestPath $manifest
    if ($isResume) {
        $failureStage='reset_only_unprovisioned_owned_account'
        Assert-CollectorUnprovisioned $spec $manifest.userSid
        [GPTBotCollector.LocalAccount]::ResetUnprovisionedOwned($manifest.userSid,$installationId,$securePassword)
        $account=[GPTBotCollector.LocalAccount]::Get()
    } else { $account=[GPTBotCollector.LocalAccount]::Create($securePassword,$installationId) }
    $manifest.userSid=$account.SID.Value
    $manifest.accountCreated=$true
    Write-CollectorJson $manifestPath $manifest
    # Native helper resolves localized builtin names by SID and verifies direct/indirect membership.
    $failureStage='verify_nonadmin_membership'
    [GPTBotCollector.LocalAccount]::AddToBuiltinUsers($account.SID.Value,$installationId)
    $failureStage='apply_scoped_isolation'
    Set-CollectorPrivateAcl $spec.Root $account.SID.Value 'ReadAndExecute'
    foreach ($dir in @('private','private\tmp','secrets')) {
        $path=Join-Path $spec.Root $dir
        $null=New-Item -ItemType Directory -Path $path -Force
        Set-CollectorPrivateAcl $path $account.SID.Value $(if ($dir -eq 'secrets') {'ReadAndExecute'} else {'Modify'})
    }
    foreach ($path in $forbiddenRoots) {
        # Existing effective deny is untouched; missing deny is root-only, never propagated.
        $ruleRecord=@{path=$path;sid=$account.SID.Value;rights='FullControl';inheritance='None';type='Deny';method='set_file_security_root_only';state='intent'}
        $manifest.addedDenyRules += $ruleRecord
        Write-CollectorJson $manifestPath $manifest
        $changed=[GPTBotCollector.Native]::EnsureFixedRootDeny($path,$account.SID.Value,$installationId)
        $ruleRecord.state=$(if ($changed) {'added_root_only'} else {'existing_deny_preserved'})
        Write-CollectorJson $manifestPath $manifest
    }
    $config=@{schema=$spec.Schema;installationId=$installationId;root=$spec.Root;userSid=$account.SID.Value;
        apiBase='https://gptbot.uz/api/lead-radar/crawler';denyProbePaths=$probes}
    $configPath=Join-Path $spec.Root 'config.json'
    Write-CollectorJson $configPath $config
    Set-CollectorPrivateAcl $configPath $account.SID.Value 'Read'
    $failureStage='read_verified_token'
    $tokenBytes=[IO.File]::ReadAllBytes($tokenPath)
    $sha=[Security.Cryptography.SHA256]::Create()
    try { $actualTokenHash=([BitConverter]::ToString($sha.ComputeHash($tokenBytes))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
    if ($actualTokenHash -ne $TokenStagingSha256) { throw 'token_staging_changed' }
    $token=[Text.Encoding]::UTF8.GetString($tokenBytes).Trim()
    if ($token -cnotmatch '^lrcr_[a-f0-9]{64}$') { throw 'dedicated_token_required' }
    $failureStage='isolated_bootstrap'
    $bootstrap=New-Object Diagnostics.ProcessStartInfo
    $bootstrap.FileName=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $bootstrap.WorkingDirectory=Join-Path $spec.Root 'app'
    $bootstrap.Arguments='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $spec.Root 'windows\Bootstrap-Identity.ps1')+'" -ConfigPath "'+$configPath+'"'
    $bootstrap.UserName=$spec.User; $bootstrap.Domain=$env:COMPUTERNAME; $bootstrap.Password=$securePassword; $bootstrap.LoadUserProfile=$true
    $bootstrap.EnvironmentVariables.Clear()
    $bootstrap.EnvironmentVariables['SystemRoot']=$env:SystemRoot
    $bootstrap.EnvironmentVariables['WINDIR']=$env:WINDIR
    $bootstrap.EnvironmentVariables['PATH']=(Join-Path $env:SystemRoot 'System32')+';'+(Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0')
    $bootstrap.EnvironmentVariables['TEMP']=Join-Path $spec.Root 'private\tmp'
    $bootstrap.EnvironmentVariables['TMP']=$bootstrap.EnvironmentVariables['TEMP']
    $boot=[GPTBotCollector.Native]::Run($bootstrap,$token,60)
    if ($boot.ExitCode -ne 0 -or $boot.TimedOut) {
        try {
            $diagnostic=$boot.Output | ConvertFrom-Json
            $allowedStages=@('read_config','validate_identity','load_native','remove_traverse','probe_owner_root',
                'probe_workspace_root','probe_bridge_vault','probe_workspace_file','offline_runtime','read_token','protect_token','proof_output')
            if ($diagnostic.ok -eq $false -and $allowedStages -ccontains $diagnostic.failureStage) { $bootstrapFailureStage=$diagnostic.failureStage }
        } catch { $bootstrapFailureStage=$null }
        throw 'isolated_bootstrap_failed'
    }
    $proof=$boot.Output | ConvertFrom-Json
    if ($proof.sid -ne $account.SID.Value -or @($proof.proofs).Count -ne $probes.Count -or $proof.traverseBypassRemoved -ne $true -or
        $proof.runtimeProof.traverseBypassRemoved -ne $true -or @($proof.proofs.path | Select-Object -Unique).Count -ne $probes.Count -or
        @($proof.proofs | Where-Object { -not $_.accessDenied -or $probes -cnotcontains $_.path }).Count -ne 0) { throw 'isolation_proof_invalid' }
    $failureStage='save_private_dpapi'
    $cipher=[Convert]::FromBase64String($proof.ciphertext)
    $secretPath=Join-Path $spec.Root 'secrets\token.dpapi'
    [IO.File]::WriteAllBytes($secretPath,$cipher)
    Set-CollectorPrivateAcl $secretPath $account.SID.Value 'Read'
    $manifest.isolationProofs=@($proof.proofs)
    $manifest | Add-Member -NotePropertyName runtimeProof -NotePropertyValue $proof.runtimeProof -Force
    $manifest | Add-Member -NotePropertyName dpapiScope -NotePropertyValue 'CurrentUser' -Force
    $manifest | Add-Member -NotePropertyName traverseBypassRemoved -NotePropertyValue $true -Force
    Write-CollectorJson $manifestPath $manifest
    $failureStage='register_disabled_task'
    $scheduler=New-Object -ComObject 'Schedule.Service'
    $scheduler.Connect()
    try { $null=$scheduler.GetFolder($spec.TaskPath) } catch { $null=$scheduler.GetFolder('\').CreateFolder('GPTBot') }
    $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $action=New-ScheduledTaskAction -Execute $powershell -Argument ('-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $spec.Root 'windows\Run-Collector.ps1')+'" -ConfigPath "'+$configPath+'"') -WorkingDirectory (Join-Path $spec.Root 'app')
    $minute=New-ScheduledTaskTrigger -Once -At ([DateTime]::Now.AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $startup=New-ScheduledTaskTrigger -AtStartup
    $settings=New-ScheduledTaskSettingsSet -Disable -Hidden -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $principal=New-ScheduledTaskPrincipal -UserId $account.SID.Value -LogonType Password -RunLevel Limited
    $task=New-ScheduledTask -Action $action -Trigger @($minute,$startup) -Settings $settings -Principal $principal -Description ('GPTBotLeadRadarCollector:'+$installationId)
    $null=Register-ScheduledTask -TaskName $spec.TaskName -TaskPath $spec.TaskPath -InputObject $task -User ($env:COMPUTERNAME+'\'+$spec.User) -Password $password
    $manifest.taskRegistered=$true
    Write-CollectorJson $manifestPath $manifest
    $registered=$scheduler.GetFolder($spec.TaskPath).GetTask($spec.TaskName)
    $registered.SetSecurityDescriptor('D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;GRGX;;;'+$account.SID.Value+')',0)
    $failureStage='task_safety_readback'
    $readback=Get-ScheduledTask -TaskName $spec.TaskName -TaskPath $spec.TaskPath
    if ($readback.State -ne 'Disabled' -or $readback.Principal.RunLevel -ne 'Limited') { throw 'task_safety_readback_failed' }
    $manifest.state='installed_disabled'
    Write-CollectorJson $manifestPath $manifest
    $report=@{installed=$true;taskDisabled=$true;manifest=$manifestPath;installationId=$installationId;
        isolationVerified=$true;runtimeProof=$proof.runtimeProof;traverseBypassRemoved=$true;failureCode=$null;failureStage=$null;failureLine=$null}
    if ($reportReady) { Write-CollectorJson $ReportPath $report }
    $report | ConvertTo-Json -Depth 5
} catch {
    $failureLine=$_.InvocationInfo.ScriptLineNumber
    $baseException=$_.Exception.GetBaseException()
    $failureWin32Code=Get-CollectorWin32Failure $_.Exception
    $failureCode=if ($baseException.Message -match '^[a-z_][a-z_0-9]{0,79}$') { $baseException.Message } else { $baseException.GetType().Name }
    $cleanupVerified=$true
    $taskDisabledVerified=$null
    if ($ownedMutationStarted -and $null -ne $manifest) {
        $manifest | Add-Member -NotePropertyName failureCode -NotePropertyValue $failureCode -Force
        $manifest | Add-Member -NotePropertyName failureStage -NotePropertyValue $failureStage -Force
        $manifest | Add-Member -NotePropertyName failureLine -NotePropertyValue $failureLine -Force
        $manifest | Add-Member -NotePropertyName failureWin32Code -NotePropertyValue $failureWin32Code -Force
        $manifest | Add-Member -NotePropertyName bootstrapFailureStage -NotePropertyValue $bootstrapFailureStage -Force
        try {
            $lookupErrors=@()
            $ownedTask=Get-ScheduledTask -TaskName $spec.TaskName -TaskPath $spec.TaskPath -ErrorAction SilentlyContinue -ErrorVariable lookupErrors
            if (@($lookupErrors | Where-Object { $_.CategoryInfo.Category -ne 'ObjectNotFound' }).Count -ne 0) { throw 'task_cleanup_lookup_failed' }
            if ($null -eq $ownedTask) { $taskDisabledVerified=$true }
            else {
                if ($ownedTask.Description -cne ('GPTBotLeadRadarCollector:'+$manifest.installationId)) { throw 'task_cleanup_ownership_mismatch' }
                $taskIdentity=[string]$ownedTask.Principal.UserId
                $taskSid=if ($taskIdentity -match '^S-1-') { $taskIdentity } else { (New-Object Security.Principal.NTAccount($taskIdentity)).Translate([Security.Principal.SecurityIdentifier]).Value }
                if ($taskSid -cne $manifest.userSid) { throw 'task_cleanup_identity_mismatch' }
                $null=Disable-ScheduledTask -TaskName $spec.TaskName -TaskPath $spec.TaskPath
                Stop-ScheduledTask -TaskName $spec.TaskName -TaskPath $spec.TaskPath
                $afterTask=Get-ScheduledTask -TaskName $spec.TaskName -TaskPath $spec.TaskPath
                $service=New-Object -ComObject 'Schedule.Service';$service.Connect()
                $instances=$service.GetFolder($spec.TaskPath).GetTask($spec.TaskName).GetInstances(0).Count
                if ($afterTask.Settings.Enabled -ne $false -or $instances -ne 0) { throw 'task_cleanup_not_verified' }
                $taskDisabledVerified=$true
            }
        } catch { $cleanupVerified=$false;$taskDisabledVerified=$null }
        try {
            if ($manifest.accountCreationStarted) {
                $created=[GPTBotCollector.LocalAccount]::Get()
                if ($null -ne $created -and $created.Comment -ceq ('GPTBot collector '+$manifest.installationId)) {
                    $manifest.accountCreated=$true
                    $manifest.userSid=$created.SID.Value
                    [GPTBotCollector.LocalAccount]::DisableOwned($manifest.userSid,$manifest.installationId)
                } elseif ($manifest.accountCreated) { throw 'account_cleanup_ownership_mismatch' }
            }
        } catch { $cleanupVerified=$false }
        $manifest.state=$(if ($cleanupVerified -and $taskDisabledVerified -eq $true) {'failed_disabled'} else {'failed_unknown'})
        try { Write-CollectorJson (Join-Path $spec.Root 'installation.json') $manifest } catch { $cleanupVerified=$false }
    }
    $report=@{installed=$false;taskDisabled=$taskDisabledVerified;failureCode=$failureCode;failureStage=$failureStage;
        failureLine=$failureLine;failureWin32Code=$failureWin32Code;bootstrapFailureStage=$bootstrapFailureStage;statePreserved=$true;cleanupVerified=$cleanupVerified}
    if ($reportReady) { Write-CollectorJson $ReportPath $report }
    $report | ConvertTo-Json
    [Console]::Error.WriteLine('collector_installation_failed')
    exit 2
} finally {
    $token=$null; $password=$null
    if ($null -ne $tokenBytes) { [Array]::Clear($tokenBytes,0,$tokenBytes.Length) }
    if ($null -ne $securePassword) { $securePassword.Dispose() }
}
