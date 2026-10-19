param([int]$Port = 8082)
$ErrorActionPreference = 'Stop'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
if (!(Test-Path -LiteralPath $adb)) { throw 'Android SDK platform-tools/adb.exe was not found.' }
$devices = @(& $adb devices | Where-Object { $_ -match '^\S+\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
if (!$devices.Count) { throw 'Start Pixel_7 and Boardgame_Guest in Android Studio Device Manager first.' }
# Verify the same IPv4 endpoints used by adb reverse before opening Expo Go.
try {
  $metro = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/status" -UseBasicParsing -TimeoutSec 5
  $body = $metro.Content
  if ($body -is [byte[]]) { $body = [Text.Encoding]::UTF8.GetString($body) }
  if ($body -notmatch 'packager-status:running') { throw 'Unexpected Metro response.' }
} catch {
  throw "Expo is not reachable on IPv4 port $Port. In the project folder, run: npm.cmd start -- --lan --port $Port (do not use --localhost). Wait until Metro is ready, then retry."
}
try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/health' -TimeoutSec 5
  if ($health.status -ne 'ok' -or $health.service -ne 'boardgame-server') { throw 'Unexpected game server response.' }
} catch {
  throw 'Game server is not ready on port 3000. In the project folder, run: npm.cmd run server. If the port is already in use, check the existing server instead of starting another copy.'
}
foreach ($device in $devices) {
  & $adb -s $device reverse "tcp:$Port" "tcp:$Port"
  if ($LASTEXITCODE -ne 0) { throw "Expo forwarding failed: $device" }
  & $adb -s $device reverse tcp:3000 tcp:3000
  if ($LASTEXITCODE -ne 0) { throw "Game server forwarding failed: $device" }
  & $adb -s $device shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:$Port" -p host.exp.exponent
  if ($LASTEXITCODE -ne 0) { throw "Expo Go failed to open: $device" }
}
