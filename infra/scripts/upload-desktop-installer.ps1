#Requires -Version 5.1
<#
.SYNOPSIS
  Publie les artefacts desktop (exe, latest.yml, blockmap) vers GCS.

.PARAMETER Edition
  server -> gs://pos-entrprise-israel-assets/installers/server/
  remote -> gs://pos-entrprise-israel-assets/installers/remote/

.PARAMETER Version
  Si fourni, n'uploade que les .exe/.blockmap contenant cette version (ex. 4.0.1).
  latest.yml est toujours uploade.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra/scripts/upload-desktop-installer.ps1 -Edition remote -Version 4.0.1
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('server', 'remote')]
  [string] $Edition,

  [string] $ReleaseDir = '',
  [string] $Bucket = 'pos-entrprise-israel-assets',
  [string] $Version = ''
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $ScriptDir '..\..')).Path
$ResolvedReleaseDir = if ($ReleaseDir) {
  (Resolve-Path -LiteralPath $ReleaseDir).Path
} else {
  Join-Path $RepoRoot 'apps\desktop\release'
}

if (-not (Test-Path -LiteralPath $ResolvedReleaseDir)) {
  Write-Error "Dossier release introuvable: $ResolvedReleaseDir - lancez dist:win:$Edition d'abord."
}

if (-not (Get-Command gsutil -ErrorAction SilentlyContinue)) {
  Write-Error 'gsutil requis (Google Cloud SDK). Installez gcloud puis relancez.'
}

$editionToken = if ($Edition -eq 'remote') { 'Remote' } else { 'Server' }
$dest = "gs://$Bucket/installers/$Edition/"

Write-Host "Upload $ResolvedReleaseDir -> $dest (edition=$Edition version=$Version)"

$files = @()
$files += Get-ChildItem -LiteralPath $ResolvedReleaseDir -Filter 'latest.yml' -File -ErrorAction SilentlyContinue
$files += Get-ChildItem -LiteralPath $ResolvedReleaseDir -Filter "*$editionToken*.exe" -File -ErrorAction SilentlyContinue
$files += Get-ChildItem -LiteralPath $ResolvedReleaseDir -Filter "*$editionToken*.blockmap" -File -ErrorAction SilentlyContinue

if ($Version) {
  $files = $files | Where-Object {
    $_.Name -eq 'latest.yml' -or $_.Name -like "*$Version*"
  }
}

$files = $files | Sort-Object FullName -Unique
if (-not $files -or $files.Count -eq 0) {
  Write-Error "Aucun artefact a uploader dans $ResolvedReleaseDir"
}

foreach ($file in $files) {
  Write-Host "  -> $($file.Name)"
  & gsutil cp $file.FullName $dest
  if ($LASTEXITCODE -ne 0) {
    throw "gsutil cp a echoue pour $($file.Name)"
  }
}

Write-Host "Termine. URL publique: https://storage.googleapis.com/$Bucket/installers/$Edition/"
