Set-StrictMode -Version Latest
$script:CollectorSystemDirectory=[Environment]::GetFolderPath([Environment+SpecialFolder]::System)
# Explicit trusted module path; never resolve an elevated helper from user modules.
Import-Module (Join-Path $script:CollectorSystemDirectory 'WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop

function Get-CollectorSpec {
    [pscustomobject]@{ Root='C:\ProgramData\GPTBot\LeadRadarCollector'; User='GPTBotCollector';
        TaskName='LeadRadarCollector'; TaskPath='\GPTBot\'; Schema='gptbot.lead-radar.windows.v1' }
}

function Assert-CollectorRelativePath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or $Path.Length -gt 220 -or
        $Path -match '[\x00-\x1f:*?"<>|]' -or $Path.StartsWith('\') -or $Path.StartsWith('/') -or
        $Path -match '(^|[\\/])\.\.?([\\/]|$)' -or $Path -match '[ .]([\\/]|$)' -or
        $Path -match '(?i)(^|[\\/])(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|[\\/]|$)' -or
        $Path -notmatch '^(python|node|app|windows)[\\/]') { throw 'unsafe_bundle_path' }
    $Path.Replace('/', '\')
}

function Assert-NoReparsePath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full.StartsWith('\\') -or $full -notmatch '^[A-Za-z]:\\') { throw 'local_absolute_path_required' }
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse_path_refused' }
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    $full
}

function Assert-CollectorBundle([string]$BundlePath, [string]$ManifestSha256) {
    $root = Assert-NoReparsePath $BundlePath
    $manifestPath = Join-Path $root 'bundle.manifest.json'
    if ($ManifestSha256 -notmatch '^[a-f0-9]{64}$' -or
        (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ManifestSha256) {
        throw 'bundle_manifest_hash_mismatch'
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.schema -ne 'gptbot.lead-radar.bundle.v1' -or @($manifest.files).Count -lt 5 -or
        @($manifest.files).Count -gt 20000) { throw 'invalid_bundle_manifest' }
    $seen = @{}
    [long]$totalBytes = 0
    foreach ($file in $manifest.files) {
        $relative = Assert-CollectorRelativePath ([string]$file.path)
        if ($seen.ContainsKey($relative.ToLowerInvariant())) { throw 'duplicate_bundle_path' }
        $seen[$relative.ToLowerInvariant()] = $true
        $source = Assert-NoReparsePath (Join-Path $root $relative)
        $item = Get-Item -LiteralPath $source -Force -ErrorAction Stop
        if ($item.PSIsContainer -or $file.sha256 -notmatch '^[a-f0-9]{64}$' -or
            $item.Length -ne [long]$file.sizeBytes -or $item.Length -gt 536870912 -or
            (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) {
            throw 'bundle_file_mismatch'
        }
        if ($relative -match '(^|\\)pyvenv\.cfg$') { throw 'standalone_python_required' }
        $totalBytes += $item.Length
        if ($totalBytes -gt 2147483648) { throw 'bundle_size_limit' }
    }
    foreach ($required in @('python\python.exe','node\node.exe','app\collector\__main__.py','app\extractor.mjs',
                            'windows\Run-Collector.ps1','windows\Bootstrap-Identity.ps1','windows\Common.ps1','windows\Native.cs',
                            'windows\Runtime-Selfcheck.py')) {
        if (-not $seen.ContainsKey($required.ToLowerInvariant())) { throw 'incomplete_bundle' }
    }
    [pscustomobject]@{ Root=$root; Manifest=$manifest; TotalBytes=$totalBytes }
}

function Set-CollectorPrivateAcl([string]$Path, [string]$CollectorSid='', [string]$Rights='ReadAndExecute') {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    $acl = if ($item.PSIsContainer) { New-Object Security.AccessControl.DirectorySecurity } else { New-Object Security.AccessControl.FileSecurity }
    $acl.SetAccessRuleProtection($true, $false)
    $admin = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
    $system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
    $acl.SetOwner($admin)
    $inherit = if ($item.PSIsContainer) { [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
    foreach ($sid in @($admin,$system)) {
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl',$inherit,'None','Allow')))
    }
    if ($CollectorSid) {
        $sid = New-Object Security.Principal.SecurityIdentifier($CollectorSid)
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,$Rights,$inherit,'None','Allow')))
    }
    Set-Acl -LiteralPath $Path -AclObject $acl -ErrorAction Stop
}

function Write-CollectorJson([string]$Path, $Value) {
    $temporary = $Path + '.new'
    [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporary -Destination $Path -Force -ErrorAction Stop
}

function Import-CollectorNative {
    if (-not ('GPTBotCollector.Native' -as [type])) {
        Add-Type -Path (Join-Path $PSScriptRoot 'Native.cs') -ErrorAction Stop
    }
}
