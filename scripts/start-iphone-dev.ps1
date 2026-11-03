param(
    [ValidateSet('check', 'server', 'mobile')][string]$Mode = 'check',
    [string]$InterfaceAlias,
    [ValidateRange(1024, 65535)][int]$Port = 3000
)
$ErrorActionPreference = 'Stop'
if ($env:NODE_ENV -eq 'production' -or $env:APP_ENV -in @('preview', 'production')) {
    throw 'LAN development is disabled in preview/production. Use a separate development terminal.'
}
$addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.AddressState -eq 'Preferred' -and
    $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and
    (!$InterfaceAlias -or $_.InterfaceAlias -eq $InterfaceAlias)
} | Where-Object {
    (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Status -eq 'Up'
})
if ($addresses.Count -ne 1) {
    $addresses | Select-Object InterfaceAlias, IPAddress | Format-Table | Out-Host
    throw 'Expected one active private LAN IPv4. Connect PC and iPhone to the same router; use -InterfaceAlias if multiple adapters are listed. Public and 169.254 addresses are not selected.'
}
$lanAddress = $addresses[0].IPAddress
$endpoint = "ws://${lanAddress}:${Port}/lobby"
Write-Host "Adapter: $($addresses[0].InterfaceAlias)"
Write-Host "Game: $endpoint"
Write-Host "iPhone Safari health check: http://${lanAddress}:${Port}/health"
Write-Host 'Allow TCP game port and Metro 8081 only on the trusted private network. This script does not modify firewall rules.'
if ($Mode -eq 'check') { return }
$root = Split-Path -Parent $PSScriptRoot
$keys = @('NODE_ENV', 'APP_ENV', 'HOST', 'PORT', 'EXPO_PUBLIC_GAME_SERVER_URL', 'REACT_NATIVE_PACKAGER_HOSTNAME')
$saved = @{}
foreach ($key in $keys) { $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
Push-Location $root
try {
    $env:NODE_ENV = 'development'
    $env:APP_ENV = 'development'
    if ($Mode -eq 'server') {
        $env:HOST = $lanAddress
        $env:PORT = "$Port"
        & npm.cmd run server
    } else {
        $env:EXPO_PUBLIC_GAME_SERVER_URL = $endpoint
        $env:REACT_NATIVE_PACKAGER_HOSTNAME = $lanAddress
        Set-Location (Join-Path $root 'apps/mobile')
        & npx.cmd expo start --dev-client --lan --port 8081
    }
    if ($LASTEXITCODE -ne 0) { throw "Development command exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
    foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
}