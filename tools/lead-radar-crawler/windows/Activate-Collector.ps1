<#
.SYNOPSIS
Verify and activate only the owned, disabled Lead Radar collector task.
.DESCRIPTION
Run as one explicitly approved elevated process after server enrollment/release
is ready. Enabling permits authenticated polling and any already-approved queued
job. The script does not enqueue work, send messages or prove a server receipt.
Old/New bundle parameters are all-or-none; BundleManifestSha256 is the currently
installed OLD digest. Keep the original bundle immutable during installation.
Changed runtime files are backed up before copying; failures preserve backups
and state, disable the owned task, and refuse automatic destructive restoration.
ReportPath must be a new file in an existing private caller directory. It contains
only bounded operational metadata, never credentials. Successful activation
changes installation state to active; retry is accepted only after a failed,
verified-disabled activation, not against an already-active task.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$InstallationId,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$BundleManifestSha256,
    [Parameter(Mandatory=$true)][string]$ReportPath,
    [string]$OldBundlePath,
    [string]$OldBundleManifestSha256,
    [string]$NewBundlePath,
    [string]$NewBundleManifestSha256,
    [ValidateRange(10,300)][int]$MaxWaitSeconds=300
)

$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'

function Read-ActivationJson([string]$Path, [int]$MaximumBytes=65536) {
    $null=Assert-NoReparsePath $Path
    $stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try {
        $buffer=New-Object byte[] ($MaximumBytes+1)
        $length=0
        while ($length -lt $buffer.Length) {
            $count=$stream.Read($buffer,$length,$buffer.Length-$length)
            if ($count -eq 0) { break }
            $length+=$count
        }
        if ($length -gt $MaximumBytes) { throw 'activation_json_too_large' }
        $utf8=New-Object Text.UTF8Encoding($false,$true)
        $utf8.GetString($buffer,0,$length) | ConvertFrom-Json
    } finally { $stream.Dispose() }
}

function Assert-ActivationReportPath([string]$Path, [string]$Root) {
    if (-not [IO.Path]::IsPathRooted($Path)) { throw 'report_absolute_path_required' }
    $full=Assert-NoReparsePath $Path
    if ($full.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or
        (Test-Path -LiteralPath $full) -or (Test-Path -LiteralPath ($full+'.new'))) { throw 'report_target_refused' }
    $parent=Split-Path -Parent $full
    $item=Get-Item -LiteralPath $parent -Force -ErrorAction Stop
    if (-not $item.PSIsContainer) { throw 'report_parent_required' }
    $trusted=@('S-1-5-18','S-1-5-32-544',([Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
    $acl=Get-Acl -LiteralPath $parent
    foreach ($ace in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($ace.AccessControlType -eq 'Allow' -and $trusted -notcontains $ace.IdentityReference.Value -and
            [long]$ace.FileSystemRights -ne 0) { throw 'report_parent_acl_not_private' }
    }
    $full
}

function Assert-ActivationManifest($Manifest, [string]$ExpectedId, [string]$ExpectedHash, $Spec) {
    $parsed=[Guid]::Empty
    if (-not [Guid]::TryParseExact($ExpectedId,'D',[ref]$parsed)) { throw 'installation_id_invalid' }
    if ($Manifest.schema -cne $Spec.Schema -or $Manifest.root -cne $Spec.Root -or
        $Manifest.installationId -cne $ExpectedId -or $Manifest.bundleManifestSha256 -cne $ExpectedHash -or
        $Manifest.userName -cne $Spec.User -or $Manifest.taskName -cne $Spec.TaskName -or $Manifest.taskPath -cne $Spec.TaskPath -or
        -not $Manifest.accountCreated -or -not $Manifest.taskRegistered -or
        $Manifest.state -notin @('installed_disabled','activation_failed_disabled') -or
        $Manifest.dpapiScope -cne 'CurrentUser') { throw 'owned_manifest_mismatch' }
    $expected=@('C:\Users\Borinio','F:\Claude','C:\Users\Borinio\AppData\Local\GPTBot\LeadRadarTelegramBridge\vault.dpapi',
        'F:\Claude\gptbot-lead-radar-integration-20260827\AGENTS.md')
    $proofs=@($Manifest.isolationProofs)
    if ($proofs.Count -ne $expected.Count -or
        @($proofs | Where-Object { $_.accessDenied -ne $true -or $expected -cnotcontains $_.path }).Count -ne 0 -or
        @($proofs.path | Select-Object -Unique).Count -ne $expected.Count -or
        $Manifest.traverseBypassRemoved -ne $true -or $Manifest.runtimeProof.traverseBypassRemoved -ne $true -or
        $Manifest.runtimeProof.ok -ne $true -or $Manifest.runtimeProof.networkUsed -ne $false) { throw 'installation_proof_missing' }
}

function Assert-ActivationTask($Task, $Manifest, [bool]$RequireDisabled=$true) {
    $root=[string]$Manifest.root
    $system=[Environment]::GetFolderPath([Environment+SpecialFolder]::System)
    $powershell=Join-Path $system 'WindowsPowerShell\v1.0\powershell.exe'
    $arguments='-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+
        (Join-Path $root 'windows\Run-Collector.ps1')+'" -ConfigPath "'+(Join-Path $root 'config.json')+'"'
    $actions=@($Task.Actions)
    if ($Task.TaskName -cne $Manifest.taskName -or $Task.TaskPath -cne $Manifest.taskPath -or
        $Task.Description -cne ('GPTBotLeadRadarCollector:'+$Manifest.installationId) -or
        $actions.Count -ne 1 -or $actions[0].Execute -ine $powershell -or $actions[0].Arguments -cne $arguments -or
        $actions[0].WorkingDirectory -ine (Join-Path $root 'app')) { throw 'task_action_ownership_mismatch' }
    $principalId=[string]$Task.Principal.UserId
    if ($principalId -match '^S-1-') { $sid=(New-Object Security.Principal.SecurityIdentifier($principalId)).Value }
    else { $sid=(New-Object Security.Principal.NTAccount($principalId)).Translate([Security.Principal.SecurityIdentifier]).Value }
    if ($sid -cne $Manifest.userSid -or [string]$Task.Principal.LogonType -notin @('Password','1') -or
        [string]$Task.Principal.RunLevel -notin @('Limited','0')) { throw 'task_principal_mismatch' }
    $settings=$Task.Settings
    $duration=[Xml.XmlConvert]::ToTimeSpan([string]$settings.ExecutionTimeLimit)
    if ([string]$settings.MultipleInstances -notin @('IgnoreNew','2') -or $duration.TotalSeconds -le 0 -or $duration.TotalSeconds -gt 300 -or
        $settings.Hidden -ne $true -or $settings.AllowDemandStart -ne $true -or $settings.StartWhenAvailable -ne $true -or
        $settings.RunOnlyIfNetworkAvailable -ne $true -or $settings.DisallowStartIfOnBatteries -ne $false -or
        $settings.StopIfGoingOnBatteries -ne $false) { throw 'task_settings_mismatch' }
    $triggers=@($Task.Triggers)
    $minute=@($triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskTimeTrigger' })
    $boot=@($triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' })
    if ($triggers.Count -ne 2 -or $minute.Count -ne 1 -or $boot.Count -ne 1 -or
        $minute[0].Enabled -ne $true -or $boot[0].Enabled -ne $true -or
        $minute[0].Repetition.Interval -cne 'PT1M' -or
        -not [string]::IsNullOrEmpty([string]$minute[0].Repetition.Duration)) { throw 'task_triggers_mismatch' }
    if ($RequireDisabled -and ($Task.State -ne 'Disabled' -or $settings.Enabled -ne $false)) { throw 'task_must_be_disabled' }
}

function Get-ActivationUpdatePlan($OldBundle, $NewBundle, [string]$Root) {
    $old=@{}; $next=@{}
    foreach ($file in $OldBundle.Manifest.files) { $old[(Assert-CollectorRelativePath ([string]$file.path)).ToLowerInvariant()]=$file }
    foreach ($file in $NewBundle.Manifest.files) { $next[(Assert-CollectorRelativePath ([string]$file.path)).ToLowerInvariant()]=$file }
    foreach ($relative in $old.Keys) { if (-not $next.ContainsKey($relative)) { throw 'update_file_removal_refused' } }
    foreach ($relative in $next.Keys) {
        if (-not $old.ContainsKey($relative) -and $relative -cne 'windows\activate-collector.ps1') { throw 'update_new_file_refused' }
    }
    $changes=@()
    foreach ($relative in @($next.Keys | Sort-Object)) {
        $destination=Assert-NoReparsePath (Join-Path $Root $relative)
        $before=$old[$relative]
        $after=$next[$relative]
        if ($null -ne $before) {
            $item=Get-Item -LiteralPath $destination -Force -ErrorAction Stop
            if ($item.PSIsContainer -or $item.Length -ne [long]$before.sizeBytes -or
                (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -cne $before.sha256) {
                throw 'installed_old_file_mismatch'
            }
        } elseif (Test-Path -LiteralPath $destination) { throw 'update_addition_already_exists' }
        if ($null -eq $before -or $before.sha256 -cne $after.sha256 -or [long]$before.sizeBytes -ne [long]$after.sizeBytes) {
            $changes+=@{path=$relative;oldSha256=$(if ($null -eq $before) {$null} else {$before.sha256});
                newSha256=$after.sha256;sizeBytes=[long]$after.sizeBytes}
        }
    }
    ,$changes
}

function Get-ActivationRunOutcome($Run, [DateTime]$StartedUtc) {
    $finished=[DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse([string]$Run.finishedAt,[ref]$finished) -or
        $finished.UtcDateTime -lt $StartedUtc -or $finished.UtcDateTime -gt [DateTime]::UtcNow.AddSeconds(30)) { throw 'run_report_not_fresh' }
    if ($Run.exitCode -isnot [int] -and $Run.exitCode -isnot [long]) { throw 'run_report_invalid' }
    if ($Run.exitCode -ne 0) { throw 'collector_process_failed' }
    if ($Run.traverseBypassRemoved -ne $true) { throw 'collector_isolation_not_verified' }
    switch -CaseSensitive ([string]$Run.status) {
        'no_job' { 'idle' }
        'completed' { 'crawl_completed' }
        'partial' { 'crawl_partial' }
        'deferred' { 'source_deferred' }
        'failed' { 'source_failed' }
        'delivery_waiting' { throw 'collector_delivery_pending' }
        'worker_busy' { throw 'collector_worker_busy' }
        default { throw 'collector_runtime_error' }
    }
}

$stage='load_reviewed_helpers'
$reportReady=$false
$manifest=$null
$manifestOwned=$false
$taskOwned=$false
$activationStarted=$false
$updateSummary=$null
$report=$null
$cleanupVerified=$true
try {
    . (Join-Path $PSScriptRoot 'Common.ps1')
    $spec=Get-CollectorSpec
    $stage='validate_report'
    $ReportPath=Assert-ActivationReportPath $ReportPath $spec.Root
    $reportReady=$true
    $stage='require_elevation'
    $current=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'elevation_required' }
    $stage='validate_manifest'
    $manifestPath=Join-Path $spec.Root 'installation.json'
    $manifest=Read-ActivationJson $manifestPath
    Assert-ActivationManifest $manifest $InstallationId $BundleManifestSha256 $spec
    $manifestOwned=$true
    $stage='validate_identity'
    Import-CollectorNative
    $account=[GPTBotCollector.LocalAccount]::Get()
    if ($null -eq $account -or $account.SID.Value -cne $manifest.userSid -or
        $account.Comment -cne ('GPTBot collector '+$InstallationId) -or ($account.Flags -band 2) -ne 0 -or
        [GPTBotCollector.LocalAccount]::IsMemberOfBuiltin('S-1-5-32-544') -or
        -not [GPTBotCollector.LocalAccount]::IsMemberOfBuiltin('S-1-5-32-545')) { throw 'collector_account_mismatch' }
    $config=Read-ActivationJson (Join-Path $spec.Root 'config.json')
    if ($config.schema -cne $spec.Schema -or $config.root -cne $spec.Root -or $config.installationId -cne $InstallationId -or
        $config.userSid -cne $manifest.userSid -or $config.apiBase -cne 'https://gptbot.uz/api/lead-radar/crawler' -or
        @($config.denyProbePaths).Count -ne 4 -or
        @($config.denyProbePaths | Where-Object { @($manifest.isolationProofs.path) -cnotcontains $_ }).Count -ne 0 -or
        @($config.denyProbePaths | Select-Object -Unique).Count -ne 4) { throw 'installed_config_mismatch' }
    $stage='validate_task'
    Import-Module (Join-Path $script:CollectorSystemDirectory 'WindowsPowerShell\v1.0\Modules\ScheduledTasks\ScheduledTasks.psd1') -ErrorAction Stop
    $task=Get-ScheduledTask -TaskPath $spec.TaskPath -TaskName $spec.TaskName
    Assert-ActivationTask $task $manifest $false
    $taskOwned=$true
    Assert-ActivationTask $task $manifest $true
    $stage='validate_update_inputs'
    $updateInputs=@($OldBundlePath,$OldBundleManifestSha256,$NewBundlePath,$NewBundleManifestSha256)
    $given=@($updateInputs | Where-Object { -not [string]::IsNullOrEmpty($_) }).Count
    if ($given -ne 0 -and $given -ne 4) { throw 'update_parameters_incomplete' }
    if ($given -eq 4) {
        if ($OldBundleManifestSha256 -cne $BundleManifestSha256 -or $NewBundleManifestSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'update_manifest_hash_mismatch' }
        $stage='verify_update_bundles'
        $oldBundle=Assert-CollectorBundle $OldBundlePath $OldBundleManifestSha256
        $newBundle=Assert-CollectorBundle $NewBundlePath $NewBundleManifestSha256
        $changes=Get-ActivationUpdatePlan $oldBundle $newBundle $spec.Root
        if (@($changes).Count -gt 0) {
            $stage='backup_changed_files'
            $updateId=[Guid]::NewGuid().ToString()
            $updatesRoot=Assert-NoReparsePath (Join-Path $spec.Root 'updates')
            if (-not (Test-Path -LiteralPath $updatesRoot)) { $null=New-Item -ItemType Directory -Path $updatesRoot; Set-CollectorPrivateAcl $updatesRoot }
            $backupRoot=Join-Path $updatesRoot $updateId
            $null=New-Item -ItemType Directory -Path $backupRoot
            Set-CollectorPrivateAcl $backupRoot
            $updateSummary=@{id=$updateId;backupPath=$backupRoot;changedFiles=@($changes).Count;oldHash=$OldBundleManifestSha256;newHash=$NewBundleManifestSha256}
            $journalPath=Join-Path $backupRoot 'update.json'
            $journal=@{schema='gptbot.lead-radar.update.v1';installationId=$InstallationId;oldHash=$OldBundleManifestSha256;
                newHash=$NewBundleManifestSha256;state='backing_up';files=$changes;copied=@()}
            Write-CollectorJson $journalPath $journal
            foreach ($change in $changes) {
                if ($null -eq $change.oldSha256) { continue }
                $backup=Join-Path $backupRoot ('files\'+$change.path)
                $null=New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force
                [IO.File]::Copy((Join-Path $spec.Root $change.path),$backup,$false)
                if ((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant() -cne $change.oldSha256) { throw 'update_backup_hash_mismatch' }
            }
            $journal.state='copying'
            Write-CollectorJson $journalPath $journal
            $stage='copy_verified_changes'
            foreach ($change in $changes) {
                $destination=Assert-NoReparsePath (Join-Path $spec.Root $change.path)
                $source=Assert-NoReparsePath (Join-Path $newBundle.Root $change.path)
                $null=New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force
                [IO.File]::Copy($source,$destination,($null -ne $change.oldSha256))
                if ((Get-Item -LiteralPath $destination).Length -ne $change.sizeBytes -or
                    (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -cne $change.newSha256) { throw 'updated_file_hash_mismatch' }
                $journal.copied+=@($change.path)
                Write-CollectorJson $journalPath $journal
            }
            $journal.state='files_verified'
            Write-CollectorJson $journalPath $journal
        }
        $stage='record_updated_manifest'
        $manifest.bundleManifestSha256=$NewBundleManifestSha256
        $manifest | Add-Member -NotePropertyName lastUpdate -NotePropertyValue $updateSummary -Force
        Write-CollectorJson $manifestPath $manifest
    }
    $stage='pre_enable_fence'
    $task=Get-ScheduledTask -TaskPath $spec.TaskPath -TaskName $spec.TaskName
    Assert-ActivationTask $task $manifest $true
    if ([GPTBotCollector.LocalAccount]::IsMemberOfBuiltin('S-1-5-32-544')) { throw 'collector_unexpected_administrator' }
    $stage='verify_batch_logon_right'
    # Read-only preflight: activation never grants rights or changes an existing deny policy.
    $batchRight=[GPTBotCollector.LocalAccount]::InspectBatchLogonRightOwned($manifest.userSid,$InstallationId)
    if (-not $batchRight.EffectiveGranted -or -not $batchRight.DenyPolicyClear) { throw 'batch_logon_right_missing' }
    $stage='enable_and_start'
    $startedUtc=[DateTime]::UtcNow
    $activationStarted=$true
    $null=Enable-ScheduledTask -TaskPath $spec.TaskPath -TaskName $spec.TaskName
    Start-ScheduledTask -TaskPath $spec.TaskPath -TaskName $spec.TaskName
    $stage='verify_fresh_scheduled_run'
    $lastRunPath=Join-Path $spec.Root 'private\last-run.json'
    $waitClock=[Diagnostics.Stopwatch]::StartNew()
    $verifiedRun=$null
    while ($waitClock.Elapsed.TotalSeconds -lt $MaxWaitSeconds) {
        $info=Get-ScheduledTaskInfo -TaskPath $spec.TaskPath -TaskName $spec.TaskName
        $task=Get-ScheduledTask -TaskPath $spec.TaskPath -TaskName $spec.TaskName
        if ($task.Settings.Enabled -ne $true) { throw 'task_disabled_during_activation' }
        $freshScheduler=$info.LastRunTime.ToUniversalTime() -ge $startedUtc.AddSeconds(-1)
        if ($freshScheduler -and $task.State -notin @('Running','Queued')) {
            if ([long]$info.LastTaskResult -ne 0) { throw ('scheduled_run_failed_'+([long]$info.LastTaskResult).ToString()) }
            if (Test-Path -LiteralPath $lastRunPath) {
                $candidate=Read-ActivationJson $lastRunPath 4096
                try { $outcome=Get-ActivationRunOutcome $candidate $startedUtc; $verifiedRun=$candidate; break }
                catch { if ($_.Exception.Message -cne 'run_report_not_fresh') { throw } }
            }
        }
        Start-Sleep -Milliseconds 1000
    }
    if ($null -eq $verifiedRun) { throw 'scheduled_run_not_verified' }
    Assert-ActivationTask $task $manifest $false
    $stage='record_activation'
    $manifest.state='active'
    $manifest | Add-Member -NotePropertyName activation -NotePropertyValue @{verifiedAt=[DateTime]::UtcNow.ToString('o');
        localStatus=$verifiedRun.status;localRunVerified=$true;serverAckVerified=$false} -Force
    Write-CollectorJson $manifestPath $manifest
    $report=@{activated=$true;taskEnabled=$true;installationId=$InstallationId;bundleManifestSha256=$manifest.bundleManifestSha256;
        localRunVerified=$true;serverAckVerified=$false;status=$verifiedRun.status;outcome=$outcome;finishedAt=$verifiedRun.finishedAt;
        exitCode=$verifiedRun.exitCode;isolationProofs=$manifest.isolationProofs;runtimeProof=$manifest.runtimeProof;update=$updateSummary;
        failureCode=$null;failureStage=$null;failureLine=$null;cleanupVerified=$true}
    Write-CollectorJson $ReportPath $report
    $report | ConvertTo-Json -Depth 8
} catch {
    $failureLine=$_.InvocationInfo.ScriptLineNumber
    $baseException=$_.Exception.GetBaseException()
    $failureCode=if ($baseException.Message -match '^[a-z_][a-z_0-9]{0,99}$') { $baseException.Message } else { $baseException.GetType().Name }
    if ($taskOwned) {
        try {
            $task=Get-ScheduledTask -TaskPath $spec.TaskPath -TaskName $spec.TaskName
            Assert-ActivationTask $task $manifest $false
            $null=Disable-ScheduledTask -TaskPath $spec.TaskPath -TaskName $spec.TaskName
            Stop-ScheduledTask -TaskPath $spec.TaskPath -TaskName $spec.TaskName
            if ((Get-ScheduledTask -TaskPath $spec.TaskPath -TaskName $spec.TaskName).Settings.Enabled -ne $false) { throw 'task_disable_not_verified' }
        } catch { $cleanupVerified=$false }
    }
    if ($manifestOwned -and $taskOwned) {
        try {
            $manifest.state=$(if ($cleanupVerified) {'activation_failed_disabled'} else {'activation_failed_unknown'})
            $manifest | Add-Member -NotePropertyName activation -NotePropertyValue @{verifiedAt=[DateTime]::UtcNow.ToString('o');
                localRunVerified=$false;serverAckVerified=$false;failureCode=$failureCode;failureStage=$stage;failureLine=$failureLine;
                cleanupVerified=$cleanupVerified} -Force
            Write-CollectorJson $manifestPath $manifest
        } catch { $cleanupVerified=$false }
    }
    $report=@{activated=$false;taskEnabled=$(if ($taskOwned -and $cleanupVerified) {$false} else {$null});
        activationAttempted=$activationStarted;localRunVerified=$false;serverAckVerified=$false;
        failureCode=$failureCode;failureStage=$stage;failureLine=$failureLine;cleanupVerified=$cleanupVerified;
        statePreserved=$true;update=$updateSummary}
    if ($reportReady) { try { Write-CollectorJson $ReportPath $report } catch { [Console]::Error.WriteLine('activation_report_write_failed') } }
    $report | ConvertTo-Json -Depth 8
    [Console]::Error.WriteLine('collector_activation_failed')
    exit 2
}
