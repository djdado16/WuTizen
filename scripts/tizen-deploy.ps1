<#
.SYNOPSIS
    Install and launch the packaged .wgt on the Samsung TV over sdb.

.DESCRIPTION
    NOT YET EXECUTED — Tizen Studio is not installed.

    Prerequisites (see docs/TIZEN_DEPLOYMENT.md):
      * TV developer mode enabled, this PC's LAN IP allowed, TV power-cycled
      * TV on the same network as this PC
      * .wgt signed with a Samsung certificate whose distributor certificate
        includes the TV's DUID

.EXAMPLE
    .\scripts\tizen-deploy.ps1 -TvIp 192.168.1.50
    .\scripts\tizen-deploy.ps1 -TvIp 192.168.1.50 -Wgt .\WuTizen.WuTizen.wgt
#>
param(
    [Parameter(Mandatory = $true)][string]$TvIp,
    [string]$Wgt,
    [string]$PackageId = 'WuTizen.WuTizen'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
    foreach ($tool in @('sdb', 'tizen')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            Write-Host "'$tool' is not on PATH. See docs/TIZEN_DEPLOYMENT.md." -ForegroundColor Red
            exit 1
        }
    }

    if (-not $Wgt) {
        $candidate = Get-ChildItem -Path . -Filter '*.wgt' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $candidate) {
            Write-Host 'No .wgt found. Run scripts\tizen-package.ps1 first.' -ForegroundColor Red
            exit 1
        }
        $Wgt = $candidate.FullName
    }

    Write-Host "[1/4] sdb connect ${TvIp}:26101" -ForegroundColor Cyan
    & sdb connect "${TvIp}:26101"
    & sdb devices

    Write-Host '[2/4] install permission (accept the prompt on the TV)' -ForegroundColor Cyan
    & tizen install-permit

    Write-Host "[3/4] installing $Wgt" -ForegroundColor Cyan
    & tizen install -n $Wgt
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "[4/4] launching $PackageId" -ForegroundColor Cyan
    & tizen run -p $PackageId

    Write-Host 'Done. Logs: sdb shell dlogutil' -ForegroundColor Green
}
finally {
    Pop-Location
}
