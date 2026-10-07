param([int]$Port = 8082)
$ErrorActionPreference = 'Stop'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
if (!(Test-Path -LiteralPath $adb)) { throw 'Android SDK platform-tools/adb.exe was not found.' }
$devices = @(& $adb devices | Where-Object { $_ -match '^\S+\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
if (!$devices.Count) { throw 'Start Pixel_7 and Boardgame_Guest in Android Studio Device Manager first.' }
foreach ($device in $devices) {
  & $adb -s $device reverse "tcp:$Port" "tcp:$Port"
  if ($LASTEXITCODE -ne 0) { throw "Expo forwarding failed: $device" }
  & $adb -s $device reverse tcp:3000 tcp:3000
  if ($LASTEXITCODE -ne 0) { throw "Game server forwarding failed: $device" }
  & $adb -s $device shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:$Port" -p host.exp.exponent
  if ($LASTEXITCODE -ne 0) { throw "Expo Go failed to open: $device" }
}
