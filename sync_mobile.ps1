[CmdletBinding()]
param(
  [string]$ZipPath,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$projectRoot = $PSScriptRoot
$parentRoot = Split-Path -Parent $projectRoot
$mobileUrl = 'https://wilson86.github.io/tach-dai-mobile/'
$requiredTests = @(
  'CORE RULES', 'DAT RULE', 'ALIASES', 'CHAT FILTER', 'MB CHECK',
  'CUT SYNC', 'UNDO SYNC', 'PWA', 'OFFLINE CACHE', 'AUTO UPDATE'
)
$protectedRoots = @('.git', '.github', 'tests')
$protectedFiles = @('publish_update.ps1', 'UPDATE_MOBILE.bat', 'SYNC_MOBILE.bat', 'sync_mobile.ps1')
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Invoke-Git {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  & git @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Git command failed: git $($Arguments -join ' ')" }
}

function Get-MobileVersion {
  param([Parameter(Mandatory = $true)][string]$Root)

  $indexPath = Join-Path $Root 'index.html'
  $versionPath = Join-Path $Root 'version.json'
  $swPath = Join-Path $Root 'sw.js'
  foreach ($path in @($indexPath, $versionPath, $swPath)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Thiếu file bắt buộc: $path" }
  }

  $index = Get-Content -Raw -LiteralPath $indexPath
  $appMatch = [regex]::Match($index, 'const APP_VERSION = "([^"]+)"')
  if (-not $appMatch.Success) { throw 'Không tìm thấy APP_VERSION trong index.html.' }
  $appVersion = $appMatch.Groups[1].Value
  if ($appVersion -notmatch '^\d+\.\d+\.\d+$') { throw "APP_VERSION không hợp lệ: $appVersion" }

  $json = Get-Content -Raw -LiteralPath $versionPath | ConvertFrom-Json
  $sw = Get-Content -Raw -LiteralPath $swPath
  $cacheMatch = [regex]::Match($sw, 'const CACHE_NAME = "tach-dai-mobile-v([^"]+)"')
  $fallbackMatch = [regex]::Match($sw, 'JSON\.stringify\(\{version:"([^"]+)"\}\)')
  if (-not $cacheMatch.Success -or -not $fallbackMatch.Success) { throw 'Không đọc được version trong sw.js.' }
  if ($json.version -ne $appVersion) { throw "version.json ($($json.version)) không khớp APP_VERSION ($appVersion)." }
  if (-not $cacheMatch.Groups[1].Value.StartsWith($appVersion)) { throw "CACHE_NAME ($($cacheMatch.Groups[1].Value)) không khớp APP_VERSION ($appVersion)." }
  if ($fallbackMatch.Groups[1].Value -ne $appVersion) { throw "SW fallback ($($fallbackMatch.Groups[1].Value)) không khớp APP_VERSION ($appVersion)." }
  if ($index -notmatch (">v" + [regex]::Escape($appVersion) + '<')) { throw "Version hiển thị không khớp APP_VERSION ($appVersion)." }
  return $appVersion
}

function Find-LatestMobileZip {
  $searchRoots = @(
    (Join-Path $env:USERPROFILE 'Downloads'),
    (Join-Path $env:USERPROFILE 'Desktop'),
    (Join-Path $env:USERPROFILE 'OneDrive\Desktop')
  ) | Where-Object { Test-Path -LiteralPath $_ }
  $zips = foreach ($root in $searchRoots) {
    Get-ChildItem -LiteralPath $root -Filter 'tach_dai_mobile*.zip' -File -ErrorAction SilentlyContinue
  }
  return $zips | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

function Get-AppRootFromExtract {
  param([Parameter(Mandatory = $true)][string]$ExtractRoot)
  $candidates = @((Get-Item -LiteralPath $ExtractRoot)) + @(Get-ChildItem -LiteralPath $ExtractRoot -Directory -Recurse -ErrorAction Stop)
  return $candidates |
    Where-Object { (Test-Path -LiteralPath (Join-Path $_.FullName 'index.html')) -and (Test-Path -LiteralPath (Join-Path $_.FullName 'version.json')) } |
    Sort-Object { $_.FullName.Length } |
    Select-Object -First 1
}

function Backup-Project {
  $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
  $backupRoot = Join-Path $parentRoot "TachDaiMobile_BACKUP_$stamp"
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  Get-ChildItem -LiteralPath $projectRoot -Force | Where-Object { $_.Name -ne '.git' } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $backupRoot $_.Name) -Recurse -Force
  }
  Write-Host "Backup: $backupRoot" -ForegroundColor DarkGray
}

function Copy-AppFiles {
  param([Parameter(Mandatory = $true)][string]$AppRoot)
  $copied = 0
  Get-ChildItem -LiteralPath $AppRoot -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($AppRoot.Length).TrimStart('\', '/')
    $firstSegment = ($relative -split '[\\/]', 2)[0]
    $leaf = Split-Path -Leaf $relative
    if ($protectedRoots -contains $firstSegment -or $protectedFiles -contains $leaf) { return }

    $destination = Join-Path $projectRoot $relative
    $destinationDir = Split-Path -Parent $destination
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
    $copied++
  }
  if ($copied -eq 0) { throw 'ZIP không có file app để đồng bộ.' }
  Write-Host "Đã chép $copied file app (giữ nguyên Git/workflow/script/test)." -ForegroundColor DarkGray
}

function Invoke-FullRegression {
  $output = @(& node .\tests\regression-tests.js 2>&1)
  $output | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) { throw 'Regression test thất bại.' }
  $text = $output -join "`n"
  foreach ($name in $requiredTests) {
    if ($text -notmatch "(?m)^$([regex]::Escape($name)): PASS\s*$") { throw "Thiếu kết quả PASS: $name" }
  }
}

function Invoke-Http200 {
  param([Parameter(Mandatory = $true)][string]$Url)
  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30
  if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode): $Url" }
  Write-Host "HTTP 200: $Url" -ForegroundColor DarkGray
}

try {
  Set-Location -LiteralPath $projectRoot
  foreach ($tool in @('git', 'node', 'gh')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Không tìm thấy $tool." }
  }
  Invoke-Git -Arguments @('rev-parse', '--is-inside-work-tree') | Out-Null
  $remote = (& git remote get-url origin).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $remote) { throw 'Chưa có remote origin.' }
  Write-Host "Remote: $remote"

  & gh auth status
  if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI chưa login. Hãy chạy: gh auth login' }

  if ($CheckOnly) {
    $version = Get-MobileVersion -Root $projectRoot
    Invoke-FullRegression
    Write-Host ''
    Write-Host '================================'
    Write-Host 'STATUS: PASS'
    Write-Host "VERSION: $version"
    Write-Host 'REGRESSION: PASS'
    Write-Host 'GITHUB PUSH: SKIPPED (CHECK ONLY)'
    Write-Host 'PAGES DEPLOY: SKIPPED (CHECK ONLY)'
    Write-Host "MOBILE: $mobileUrl"
    Write-Host '================================'
    exit 0
  }

  $preStatus = @(& git status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw 'Không đọc được git status.' }
  if ($preStatus.Count -gt 0) { throw 'Project đang có thay đổi chưa commit. Hãy commit hoặc xử lý chúng trước khi sync ZIP để tránh commit nhầm.' }

  $zip = if ($ZipPath) { Get-Item -LiteralPath $ZipPath -ErrorAction Stop } else { Find-LatestMobileZip }
  if (-not $zip) { throw 'Không tìm thấy ZIP tach_dai_mobile*.zip trong Downloads/Desktop/OneDrive\Desktop.' }
  Write-Host "ZIP: $($zip.FullName)" -ForegroundColor Cyan
  Write-Host "LastWriteTime: $($zip.LastWriteTime)" -ForegroundColor DarkGray

  $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('TachDaiMobileSync_' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  try {
    Expand-Archive -LiteralPath $zip.FullName -DestinationPath $tempRoot -Force
    $appRoot = Get-AppRootFromExtract -ExtractRoot $tempRoot
    if (-not $appRoot) { throw 'ZIP không chứa index.html và version.json ở cùng một app root.' }
    $zipVersion = Get-MobileVersion -Root $appRoot
    Write-Host "ZIP version: $zipVersion" -ForegroundColor Cyan

    Backup-Project
    Copy-AppFiles -AppRoot $appRoot.FullName
    $version = Get-MobileVersion -Root $projectRoot
    Invoke-FullRegression

    Invoke-Git -Arguments @('add', '-A')
    Invoke-Git -Arguments @('diff', '--cached', '--check')
    $staged = @(& git diff --cached --name-only)
    if ($LASTEXITCODE -ne 0) { throw 'Không đọc được staged diff.' }
    if ($staged.Count -gt 0) {
      Invoke-Git -Arguments @('commit', '-m', "Update Tách Đài Mobile v$version")
      Invoke-Git -Arguments @('push', 'origin', 'main')
    } else {
      Write-Host 'ZIP không tạo thay đổi Git; bỏ qua commit/push.' -ForegroundColor Yellow
    }

    & gh run list --repo wilson86/tach-dai-mobile --limit 5
    if ($LASTEXITCODE -ne 0) { throw 'Không đọc được GitHub Actions runs.' }
    if ($staged.Count -gt 0) {
      Start-Sleep -Seconds 2
      $runJson = & gh run list --repo wilson86/tach-dai-mobile --workflow deploy-pages.yml --limit 1 --json databaseId,status
      if ($LASTEXITCODE -ne 0) { throw 'Không tìm thấy GitHub Pages workflow.' }
      $run = $runJson | ConvertFrom-Json | Select-Object -First 1
      if (-not $run.databaseId) { throw 'Không lấy được Pages run mới.' }
      & gh run watch $run.databaseId --repo wilson86/tach-dai-mobile --exit-status
      if ($LASTEXITCODE -ne 0) { throw 'GitHub Pages deploy thất bại.' }
    }

    Invoke-Http200 -Url $mobileUrl
    Invoke-Http200 -Url ($mobileUrl + 'version.json')
    $liveJson = (Invoke-WebRequest -Uri ($mobileUrl + 'version.json?sync=' + [uri]::EscapeDataString($version)) -UseBasicParsing -TimeoutSec 30).Content
    if ($liveJson -is [byte[]]) { $liveJson = [Text.Encoding]::UTF8.GetString($liveJson) }
    $liveVersion = ($liveJson | ConvertFrom-Json).version
    if ($liveVersion -ne $version) { throw "Version online ($liveVersion) không khớp local ($version)." }

    Write-Host ''
    Write-Host '================================'
    Write-Host 'STATUS: PASS' -ForegroundColor Green
    Write-Host "VERSION: $version"
    Write-Host 'REGRESSION: PASS'
    Write-Host 'GITHUB PUSH: PASS'
    Write-Host 'PAGES DEPLOY: PASS'
    Write-Host "MOBILE: $mobileUrl"
    Write-Host '================================'
  } finally {
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
  }
} catch {
  Write-Host ''
  Write-Host '================================' -ForegroundColor Red
  Write-Host 'STATUS: FAIL' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host 'Không commit/push khi regression hoặc kiểm tra thất bại.' -ForegroundColor Yellow
  Write-Host '================================' -ForegroundColor Red
  exit 1
}
