[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InstallationId)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
Import-Module (Join-Path $script:CollectorSystemDirectory 'WindowsPowerShell\v1.0\Modules\ScheduledTasks\ScheduledTasks.psd1') -ErrorAction Stop
Import-CollectorNative
$spec=Get-CollectorSpec
$current=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'elevation_required' }
$manifestPath=Join-Path $spec.Root 'installation.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -ne $spec.Schema -or $manifest.root -cne $spec.Root -or $manifest.installationId -cne $InstallationId -or
    $manifest.userName -cne $spec.User -or $manifest.taskName -cne $spec.TaskName -or $manifest.taskPath -cne $spec.TaskPath) { throw 'owned_manifest_mismatch' }
if ($manifest.taskRegistered) {
    $task=Get-ScheduledTask -TaskName $spec.TaskName -TaskPath $spec.TaskPath
    if ($task.Description -cne ('GPTBotLeadRadarCollector:'+$InstallationId)) { throw 'task_ownership_mismatch' }
    $null=Disable-ScheduledTask -TaskName $spec.TaskName -TaskPath $spec.TaskPath
    Stop-ScheduledTask -TaskName $spec.TaskName -TaskPath $spec.TaskPath
}
if ($manifest.accountCreated) {
    $account=[GPTBotCollector.LocalAccount]::Get()
    if ($null -eq $account -or $account.SID.Value -cne $manifest.userSid) { throw 'account_ownership_mismatch' }
    [GPTBotCollector.LocalAccount]::DisableOwned($manifest.userSid,$manifest.installationId)
}
$manifest.state='disabled_by_owner'
Write-CollectorJson $manifestPath $manifest
# Intentionally no file/user/task deletion and no wholesale ACL restore.
@{disabled=$true;statePreserved=$true;accountPreserved=$true;otherAclsPreserved=$true} | ConvertTo-Json
