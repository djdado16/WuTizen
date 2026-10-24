<#
.SYNOPSIS
    Build dist/ and package it into a signed Tizen .wgt.

.DESCRIPTION
    NOT YET EXECUTED — Tizen Studio is not installed. See docs/TIZEN_DEPLOYMENT.md.
    Requires the `tizen` CLI on PATH (Tizen Studio: <studio>\tools\ide\bin) and a
    Samsung security profile that holds the author + TV distributor certificates.

    Certificates must live OUTSIDE OneDrive (e.g. C:\tizen-certs).

.EXAMPLE
    .\scripts\tizen-package.ps1
    .\scripts\tizen-package.ps1 -SecurityProfile wuplay-tv -Minify
#>
param(
    [string]$SecurityProfile = 'wuplay-tv',
    [switch]$Minify
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
    if (-not (Get-Command tizen -ErrorAction SilentlyContinue)) {
        Write-Host "Tizen CLI ('tizen') is not on PATH." -ForegroundColor Red
        Write-Host "Install Tizen Studio 6.1 (web-cli) and add both of these to PATH:"
        Write-Host "  <studio>\tools\ide\bin   (tizen)"
        Write-Host "  <studio>\tools           (sdb)"
        Write-Host "See docs/TIZEN_DEPLOYMENT.md."
        exit 1
    }

    Write-Host '[1/3] building dist/ ...' -ForegroundColor Cyan
    if ($Minify) {
        & node scripts/build.mjs --minify
    } else {
        & node scripts/build.mjs
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host '[2/3] tizen build-web ...' -ForegroundColor Cyan
    & tizen build-web -- dist
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "[3/3] tizen package (profile: $SecurityProfile) ..." -ForegroundColor Cyan
    & tizen package -t wgt -s $SecurityProfile -- dist/.buildResult
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Get-ChildItem -Path . -Filter '*.wgt' | Select-Object Name, Length, LastWriteTime
    Write-Host 'Packaged. Deploy with scripts\tizen-deploy.ps1 -TvIp <TV_IP>' -ForegroundColor Green
}
finally {
    Pop-Location
}
