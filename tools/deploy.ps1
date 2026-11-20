<#
  Copy Motherboard: Quest Log to the Foundry server (via SSH).

  Run from the repo folder:
    powershell -ExecutionPolicy Bypass -File tools\deploy.ps1

  The target lives in tools\target.txt (not in git), e.g.
    myserver:/srv/foundry/Data/modules/motherboard-quest-log
  The last folder name must be the module id from module.json.

  Steps: tests -> copy only the module files to a staging folder ->
  scp into a folder next to the target -> swap the old folder ->
  same owner as the "modules" folder.
#>
param(
  [string]$Target
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$manifest = Get-Content module.json -Raw -Encoding UTF8 | ConvertFrom-Json
$moduleId = $manifest.id
if (-not $Target) {
  $targetFile = Join-Path $PSScriptRoot "target.txt"
  if (-not (Test-Path $targetFile)) { throw "No target. Create tools\target.txt (e.g. myserver:/path/Data/modules/$moduleId)." }
  $Target = (Get-Content $targetFile -TotalCount 1).Trim()
}
if ($Target -notmatch ('^([^:]+):(/.+/modules/' + [regex]::Escape($moduleId) + ')$')) { throw "Target must look like host:/.../modules/$moduleId - got: $Target" }
$hostName = $Matches[1]
$remotePath = $Matches[2]
$parent = $remotePath.Substring(0, $remotePath.LastIndexOf('/'))   # Linux path, not Split-Path (that makes backslashes)

Write-Host "Tests ..."
node --test
if ($LASTEXITCODE -ne 0) { throw "Tests failed - nothing copied." }

$version = $manifest.version
$staging = Join-Path ([System.IO.Path]::GetTempPath()) "$moduleId-deploy"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory $staging | Out-Null
foreach ($part in @("module.json", "scripts", "templates", "styles", "lang", "assets")) {
  if (Test-Path $part) { Copy-Item $part -Destination $staging -Recurse }
}

Write-Host "Copying version $version to ${hostName}:$remotePath ..."
ssh $hostName "rm -rf '$remotePath.new' && mkdir -p '$remotePath.new'"
if ($LASTEXITCODE -ne 0) { throw "SSH failed." }
foreach ($entry in Get-ChildItem $staging) {
  scp -r -q $entry.FullName "${hostName}:$remotePath.new/"
  if ($LASTEXITCODE -ne 0) { throw "scp failed for $($entry.Name)." }
}
ssh $hostName "set -e; cd '$parent'; rm -rf '$remotePath.old'; if [ -d '$remotePath' ]; then mv '$remotePath' '$remotePath.old'; fi; mv '$remotePath.new' '$remotePath'; rm -rf '$remotePath.old'; chown -R --reference=. '$remotePath'; chmod -R u=rwX,g=rX,o= '$remotePath'"
if ($LASTEXITCODE -ne 0) { throw "Swapping the folder on the server failed." }

Remove-Item $staging -Recurse -Force
Write-Host "Done: $($manifest.title) $version is on the server."
Write-Host "First time: restart Foundry (or return to setup), then enable the module in the world."
Write-Host "After that, F5 in the world is usually enough."
