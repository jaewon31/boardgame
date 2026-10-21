param([string]$Device = 'Pixel_7')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $projectRoot 'apps\mobile'
if (-not $env:JAVA_HOME) {
  $jdkRoot = Join-Path $env:ProgramFiles 'Microsoft'
  $jdk17 = Get-ChildItem -LiteralPath $jdkRoot -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if ($jdk17) { $env:JAVA_HOME = $jdk17.FullName }
}
if (-not $env:JAVA_HOME) {
  $studioJava = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'
  if (Test-Path -LiteralPath (Join-Path $studioJava 'bin\java.exe')) { $env:JAVA_HOME = $studioJava }
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))) { throw 'Android Studio Java or JAVA_HOME is required.' }
if (-not (Test-Path -LiteralPath $env:ANDROID_HOME)) { throw 'Android SDK is required.' }
$env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path
Push-Location $mobileRoot
try {
  & npx.cmd expo run:android --device $Device --no-bundler
  if ($LASTEXITCODE -ne 0) { throw 'Android build/install failed.' }
} finally { Pop-Location }
