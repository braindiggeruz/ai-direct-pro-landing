[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$StageRoot, [switch]$Finalize, [switch]$RefreshApp)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$stage=[IO.Path]::GetFullPath($StageRoot)
if ($stage -notmatch '^F:\\Claude\\\.lead-radar-collector-stage-[a-f0-9]{32}$') { throw 'stage_target_invalid' }
. (Join-Path $repo 'tools\lead-radar-crawler\windows\Common.ps1')
$null=Assert-NoReparsePath $stage
$bundle=Join-Path $stage 'bundle'
function JsonFile([string]$Path,$Value) {
    [IO.File]::WriteAllText($Path,($Value | ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)))
}
function CopyTree([string]$Source,[string]$Destination,[bool]$ReplaceOwned=$false) {
    $sourcePath=Assert-NoReparsePath $Source
    $null=New-Item -ItemType Directory -Path $Destination -Force
    foreach ($item in Get-ChildItem -LiteralPath $sourcePath -Force) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'runtime_reparse_refused' }
        if ($item.Name -in @('__pycache__','site-packages') -or $item.Extension -in @('.pyc','.pyo')) { continue }
        $dest=Join-Path $Destination $item.Name
        if ($item.PSIsContainer) { CopyTree $item.FullName $dest $ReplaceOwned } else { [IO.File]::Copy($item.FullName,$dest,$ReplaceOwned) }
    }
}
if (-not ($Finalize -or $RefreshApp)) {
    if (Test-Path -LiteralPath $stage) { throw 'stage_already_exists' }
    $null=New-Item -ItemType Directory -Path $stage
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true,$false)
    foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User,
        (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),
        (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
    }
    Set-Acl -LiteralPath $stage -AclObject $acl
    JsonFile (Join-Path $stage 'stage.json') @{schema='gptbot.lead-radar.staging.v1';root=$stage;repository=$repo}
    $null=New-Item -ItemType Directory -Path $bundle
    $pythonBase='C:\Users\Borinio\AppData\Roaming\uv\python\cpython-3.12.11-windows-x86_64-none'
    $pythonTarget=Join-Path $bundle 'python'
    $null=New-Item -ItemType Directory -Path $pythonTarget
    foreach ($name in @('DLLs','Lib','libs','include','tcl')) { CopyTree (Join-Path $pythonBase $name) (Join-Path $pythonTarget $name) }
    foreach ($file in Get-ChildItem -LiteralPath $pythonBase -File) {
        if ($file.Extension -in @('.exe','.dll','.txt')) { [IO.File]::Copy($file.FullName,(Join-Path $pythonTarget $file.Name),$false) }
    }
    $null=New-Item -ItemType Directory -Path (Join-Path $bundle 'node')
    [IO.File]::Copy('C:\Program Files\nodejs\node.exe',(Join-Path $bundle 'node\node.exe'),$false)
    $site=Join-Path $pythonTarget 'Lib\site-packages'
    & 'C:\Users\Borinio\.local\bin\uv.exe' pip install --python (Join-Path $pythonTarget 'python.exe') --target $site --only-binary :all: --require-hashes -r (Join-Path $repo 'tools\lead-radar-crawler\benchmarks\requirements-scrapling.lock')
    if ($LASTEXITCODE -ne 0) { throw 'locked_dependency_install_failed' }
    & (Join-Path $pythonTarget 'python.exe') -I -B -c 'import sys,sqlite3,ssl; from scrapling import Selector; assert Selector("<p>ok</p>").css("p::text").get()=="ok"; print("standalone_python_ok")'
    if ($LASTEXITCODE -ne 0) { throw 'standalone_python_smoke_failed' }
    JsonFile (Join-Path $stage 'dependencies.json') @{ready=$true;lockHash=(Get-FileHash -LiteralPath (Join-Path $repo 'tools\lead-radar-crawler\benchmarks\requirements-scrapling.lock')).Hash.ToLowerInvariant()}
    @{stage=$stage;dependenciesReady=$true;tokenCreated=$false} | ConvertTo-Json
    exit 0
}
$marker=Get-Content -LiteralPath (Join-Path $stage 'stage.json') -Raw | ConvertFrom-Json
if ($marker.root -cne $stage -or $marker.repository -cne $repo -or -not (Test-Path -LiteralPath (Join-Path $stage 'dependencies.json'))) { throw 'stage_ownership_mismatch' }
if ($RefreshApp) {
    $previous=Get-Content -LiteralPath (Join-Path $stage 'install-inputs.json') -Raw | ConvertFrom-Json
    if ($previous.bundlePath -cne $bundle -or (Get-FileHash -LiteralPath (Join-Path $bundle 'bundle.manifest.json')).Hash.ToLowerInvariant() -ne $previous.bundleManifestSha256) { throw 'previous_bundle_changed' }
    $oldManifest=Get-Content -LiteralPath (Join-Path $bundle 'bundle.manifest.json') -Raw | ConvertFrom-Json
    foreach ($file in $oldManifest.files) {
        $path=Assert-NoReparsePath (Join-Path $bundle (Assert-CollectorRelativePath $file.path))
        if ((Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant() -ne $file.sha256) { throw 'previous_bundle_file_changed' }
    }
} elseif (Test-Path -LiteralPath (Join-Path $bundle 'bundle.manifest.json')) { throw 'bundle_already_finalized' }
$null=New-Item -ItemType Directory -Path (Join-Path $bundle 'app') -Force
CopyTree (Join-Path $repo 'tools\lead-radar-crawler\collector') (Join-Path $bundle 'app\collector') ([bool]$RefreshApp)
CopyTree (Join-Path $repo 'tools\lead-radar-crawler\windows') (Join-Path $bundle 'windows') ([bool]$RefreshApp)
& 'C:\Program Files\nodejs\node.exe' --import tsx (Join-Path $repo 'scripts\lead-radar\build-crawler-extractor.ts') --out (Join-Path $bundle 'app\extractor.mjs')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $bundle 'app\extractor.mjs'))) { throw 'extractor_build_failed' }
$files=@(Get-ChildItem -LiteralPath $bundle -Recurse -File | Where-Object { $_.FullName -ne (Join-Path $bundle 'bundle.manifest.json') } | Sort-Object FullName | ForEach-Object {
    @{path=$_.FullName.Substring($bundle.Length+1).Replace('\','/');sizeBytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
})
JsonFile (Join-Path $bundle 'bundle.manifest.json') @{schema='gptbot.lead-radar.bundle.v1';files=$files}
if ($RefreshApp) {
    $previous.bundleManifestSha256=(Get-FileHash -LiteralPath (Join-Path $bundle 'bundle.manifest.json')).Hash.ToLowerInvariant()
    JsonFile (Join-Path $stage 'install-inputs.json') $previous
    $previous | ConvertTo-Json
    exit 0
}
$random=New-Object byte[] 32
$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($random) } finally { $rng.Dispose() }
$token='lrcr_'+([BitConverter]::ToString($random)).Replace('-','').ToLowerInvariant()
$tokenPath=Join-Path $stage 'collector.token'
[IO.File]::WriteAllText($tokenPath,$token,(New-Object Text.UTF8Encoding($false)))
[Array]::Clear($random,0,$random.Length); $token=$null
$result=@{bundlePath=$bundle;bundleManifestSha256=(Get-FileHash -LiteralPath (Join-Path $bundle 'bundle.manifest.json')).Hash.ToLowerInvariant();
    tokenStagingPath=$tokenPath;tokenStagingSha256=(Get-FileHash -LiteralPath $tokenPath).Hash.ToLowerInvariant();workerId='lrcw_'+[Guid]::NewGuid().ToString('N')}
JsonFile (Join-Path $stage 'install-inputs.json') $result
$result | ConvertTo-Json
