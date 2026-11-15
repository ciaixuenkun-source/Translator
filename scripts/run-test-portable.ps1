param(
  [Parameter(Mandatory = $true)]
  [string]$PortablePath,

  [string[]]$PortableArguments = @(),

  [string]$TestBuildsRoot = $env:TRANSLATOR_TEST_BUILDS_DIR
)

$ErrorActionPreference = "Stop"

$resolvedPortable = (Resolve-Path -LiteralPath $PortablePath).Path
if ([System.IO.Path]::GetExtension($resolvedPortable) -ne ".exe") {
  throw "PortablePath must point to an .exe file: $resolvedPortable"
}

if ([string]::IsNullOrWhiteSpace($TestBuildsRoot)) {
  $sourceRoot = Split-Path -Parent $PSScriptRoot
  $projectRoot = Split-Path -Parent $sourceRoot
  $TestBuildsRoot = Join-Path $projectRoot "TestBuilds"
}
$testBuildsRoot = [System.IO.Path]::GetFullPath($TestBuildsRoot)
$portableTempRoot = [System.IO.Path]::GetFullPath((Join-Path $testBuildsRoot "PortableTemp"))
$runName = "run-{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), ([guid]::NewGuid().ToString("N"))
$runRoot = [System.IO.Path]::GetFullPath((Join-Path $portableTempRoot $runName))

if (-not $runRoot.StartsWith($portableTempRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use a portable temporary directory outside the approved root: $runRoot"
}

New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
$exitCode = 1

try {
  $env:TEMP = $runRoot
  $env:TMP = $runRoot

  Write-Host "Portable temporary directory: $runRoot"
  if ($PortableArguments.Count -gt 0) {
    $process = Start-Process -FilePath $resolvedPortable -ArgumentList $PortableArguments -PassThru -Wait
  } else {
    $process = Start-Process -FilePath $resolvedPortable -PassThru -Wait
  }
  $exitCode = $process.ExitCode
} finally {
  $env:TEMP = $previousTemp
  $env:TMP = $previousTmp

  $activeProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ExecutablePath -and
    [System.IO.Path]::GetFullPath($_.ExecutablePath).StartsWith(
      $runRoot + [System.IO.Path]::DirectorySeparatorChar,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  })

  if ($activeProcesses.Count -gt 0) {
    Write-Warning "Portable processes are still using this run directory. It has been preserved: $runRoot"
  } elseif (Test-Path -LiteralPath $runRoot) {
    Remove-Item -LiteralPath $runRoot -Recurse -Force
    Write-Host "Removed this run's portable temporary directory: $runRoot"
  }
}

exit $exitCode
