[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & git @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Git command failed: git $($Arguments -join ' ')" }
}

$projectRoot = $PSScriptRoot
Set-Location -LiteralPath $projectRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Không tìm thấy Git.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Không tìm thấy Node.js để chạy regression test.' }

Invoke-Git -Arguments @('rev-parse','--is-inside-work-tree') | Out-Null
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') { throw "Phải chạy trên branch main (hiện tại: $branch)." }

$origin = (& git remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or -not $origin) { throw 'Chưa có remote origin; chưa thể publish an toàn.' }

# git status/diff phải chạy được và không có lỗi whitespace nghiêm trọng.
& git status --porcelain=v1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Không đọc được git status.' }
Invoke-Git -Arguments @('diff','--check')

$versionPath = Join-Path $projectRoot 'version.json'
$indexPath = Join-Path $projectRoot 'index.html'
$swPath = Join-Path $projectRoot 'sw.js'
foreach ($file in @($versionPath, $indexPath, $swPath, (Join-Path $projectRoot 'tests\regression-tests.js'))) {
  if (-not (Test-Path -LiteralPath $file)) { throw "Thiếu file bắt buộc: $file" }
}

$originalVersion = Get-Content -Raw -LiteralPath $versionPath
$current = $originalVersion | ConvertFrom-Json
if ($current.version -notmatch '^(\d+)\.(\d+)\.(\d+)$') { throw "Version không hợp lệ: $($current.version)" }
$nextVersion = '{0}.{1}.{2}' -f $Matches[1], $Matches[2], ([int]$Matches[3] + 1)

$originalIndex = Get-Content -Raw -LiteralPath $indexPath
$index = $originalIndex
if ($index -notmatch 'const APP_VERSION = "[^"]+";') { throw 'Không tìm thấy APP_VERSION trong index.html.' }
$index = $index -replace 'const APP_VERSION = "[^"]+";', "const APP_VERSION = `"$nextVersion`";"
if ($index -notmatch 'Tách Đài 3 Miền <span[^>]*>v[^<]+</span>') { throw 'Không tìm thấy version hiển thị trong index.html.' }
$index = $index -replace '(Tách Đài 3 Miền <span[^>]*>v)[^<]+(</span>)', ('${1}' + $nextVersion + '${2}')

$originalSw = Get-Content -Raw -LiteralPath $swPath
$sw = $originalSw
if ($sw -notmatch 'const CACHE_NAME = "tach-dai-mobile-v[^"]+";') { throw 'Không tìm thấy CACHE_NAME trong sw.js.' }
$sw = $sw -replace 'const CACHE_NAME = "tach-dai-mobile-v[^"]+";', "const CACHE_NAME = `"tach-dai-mobile-v$nextVersion`";"
if ($sw -notmatch 'JSON.stringify\(\{version:"[^"]+"\}\)') { throw 'Không tìm thấy version fallback trong sw.js.' }
$sw = $sw -replace 'JSON.stringify\(\{version:"[^"]+"\}\)', ('JSON.stringify({version:"' + $nextVersion + '"})')

$current.version = $nextVersion
$current.updated = (Get-Date).ToString('yyyy-MM-dd')
$json = $current | ConvertTo-Json -Depth 8
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
try {
  [System.IO.File]::WriteAllText($indexPath, $index, $utf8NoBom)
  [System.IO.File]::WriteAllText($swPath, $sw, $utf8NoBom)
  [System.IO.File]::WriteAllText($versionPath, $json + [Environment]::NewLine, $utf8NoBom)

  # Không commit/push nếu rule tách/check hoặc PWA audit không đậu sau khi tăng version.
  & node .\tests\regression-tests.js
  if ($LASTEXITCODE -ne 0) { throw 'Regression test thất bại; đã dừng trước git commit/push.' }
} catch {
  # Không để một lần test fail làm kẹt version bump dở dang trong working tree.
  [System.IO.File]::WriteAllText($indexPath, $originalIndex, $utf8NoBom)
  [System.IO.File]::WriteAllText($swPath, $originalSw, $utf8NoBom)
  [System.IO.File]::WriteAllText($versionPath, $originalVersion, $utf8NoBom)
  throw
}

Invoke-Git -Arguments @('add','-A')
Invoke-Git -Arguments @('diff','--cached','--check')
Invoke-Git -Arguments @('commit','-m',"Update Tách Đài Mobile v$nextVersion")
Invoke-Git -Arguments @('push','origin','main')

Write-Host "Đã publish Tách Đài Mobile v$nextVersion" -ForegroundColor Green
