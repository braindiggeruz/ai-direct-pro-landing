param([string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path)
$ErrorActionPreference = 'Stop'
$assetDirectory = Join-Path $RepoRoot 'public/studio-examples'
$evidenceDirectory = Join-Path $RepoRoot 'reports/seo-growth-20261106/studio'
[void](New-Item -ItemType Directory -Path $evidenceDirectory -Force)
$ids = @('uz-oquv-reja-v1', 'ru-korotkoe-vystuplenie-v1')
$alreadyRunning = @(Get-Process -Name POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$powerpoint = $null
$results = @()
try {
    $powerpoint = New-Object -ComObject PowerPoint.Application
    foreach ($id in $ids) {
        $presentation = $null
        try {
            $file = (Resolve-Path -LiteralPath (Join-Path $assetDirectory ($id + '.pptx'))).Path
            $sourceHash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
            $previews = @()
            # ReadOnly, Untitled=false, WithWindow=false: only the sample is opened.
            $presentation = $powerpoint.Presentations.Open($file, -1, 0, 0)
            if ($presentation.Slides.Count -ne 6) { throw "Unexpected slide count for $id" }
            for ($index = 1; $index -le $presentation.Slides.Count; $index++) {
                $output = Join-Path $assetDirectory ($id + '-' + $index + '.png')
                $presentation.Slides.Item($index).Export($output, 'PNG', 960, 540)
                $previews += [pscustomobject]@{ file = ($id + '-' + $index + '.png'); slide = $index; sha256 = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant() }
            }
            if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sourceHash) { throw "Source PPTX changed while rendering $id" }
            $results += [pscustomobject]@{ id = $id; sourcePptxSha256 = $sourceHash; openedInPowerPoint = $true; slides = $presentation.Slides.Count; previewRenderer = 'Microsoft PowerPoint'; width = 960; height = 540; previews = $previews }
        } finally {
            if ($null -ne $presentation) {
                $presentation.Close()
                [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)
            }
        }
    }
} finally {
    if ($null -ne $powerpoint) {
        # Never close an Office session that existed before this task.
        if (-not $alreadyRunning -and $powerpoint.Presentations.Count -eq 0) { $powerpoint.Quit() }
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($powerpoint)
    }
}
$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'preview-validation.json') -Encoding utf8
$results | ConvertTo-Json -Depth 4
