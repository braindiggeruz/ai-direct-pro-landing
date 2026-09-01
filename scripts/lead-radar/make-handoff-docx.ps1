$ErrorActionPreference = 'Stop'

$mdPath = 'F:\Claude\gptbot-lead-radar-release-20260901\docs\lead-radar\HANDOFF_LEAD_RADAR_STUCK_SEARCH_RECOVERY_2026-09-01.md'
$docxPath = 'F:\Claude\gptbot-lead-radar-release-20260901\docs\lead-radar\HANDOFF_LEAD_RADAR_STUCK_SEARCH_RECOVERY_2026-09-01.docx'

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

if (Test-Path -LiteralPath $docxPath) {
  Remove-Item -LiteralPath $docxPath -Force
}

$tmpRoot = [System.IO.Path]::GetTempPath()
$tmp = Join-Path $tmpRoot ('lead-radar-docx-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tmp '_rels') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tmp 'word') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tmp 'word\_rels') | Out-Null

function Escape-Xml([string] $text) {
  return [System.Security.SecurityElement]::Escape($text)
}

function New-Paragraph([string] $text, [string] $style) {
  $safe = Escape-Xml $text
  $styleXml = if ($style.Length -gt 0) { '<w:pPr><w:pStyle w:val="' + $style + '"/></w:pPr>' } else { '' }
  return '<w:p>' + $styleXml + '<w:r><w:t xml:space="preserve">' + $safe + '</w:t></w:r></w:p>'
}

$body = New-Object System.Collections.Generic.List[string]
$inCode = $false

foreach ($line in (Get-Content -LiteralPath $mdPath -Encoding UTF8)) {
  if ($line -match '^```') {
    $inCode = -not $inCode
    continue
  }
  if ($line.Trim().Length -eq 0) {
    $body.Add('<w:p/>')
    continue
  }
  if ($inCode) {
    $body.Add((New-Paragraph $line 'Code'))
    continue
  }
  if ($line -match '^# (.+)$') {
    $body.Add((New-Paragraph $Matches[1] 'Title'))
    continue
  }
  if ($line -match '^## (.+)$') {
    $body.Add((New-Paragraph $Matches[1] 'Heading1'))
    continue
  }
  if ($line -match '^### (.+)$') {
    $body.Add((New-Paragraph $Matches[1] 'Heading2'))
    continue
  }
  if ($line -match '^- (.+)$') {
    $body.Add((New-Paragraph ('- ' + $Matches[1]) 'ListParagraph'))
    continue
  }
  if ($line -match '^\d+\. (.+)$') {
    $body.Add((New-Paragraph $line 'ListParagraph'))
    continue
  }
  $body.Add((New-Paragraph $line 'Normal'))
}

$contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'
$rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
$docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
$styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:ind w:left="360"/></w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr></w:style></w:styles>'
$document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + ($body -join '') + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>'

Set-Content -LiteralPath (Join-Path $tmp '[Content_Types].xml') -Value $contentTypes -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tmp '_rels\.rels') -Value $rels -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tmp 'word\_rels\document.xml.rels') -Value $docRels -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tmp 'word\styles.xml') -Value $styles -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tmp 'word\document.xml') -Value $document -Encoding UTF8

$archive = [System.IO.Compression.ZipFile]::Open($docxPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $tmp '[Content_Types].xml'), '[Content_Types].xml') | Out-Null
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $tmp '_rels\.rels'), '_rels/.rels') | Out-Null
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $tmp 'word\document.xml'), 'word/document.xml') | Out-Null
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $tmp 'word\styles.xml'), 'word/styles.xml') | Out-Null
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $tmp 'word\_rels\document.xml.rels'), 'word/_rels/document.xml.rels') | Out-Null
} finally {
  $archive.Dispose()
}
Remove-Item -LiteralPath $tmp -Recurse -Force

Get-Item -LiteralPath $docxPath | Select-Object FullName, Length, LastWriteTime | ConvertTo-Json
