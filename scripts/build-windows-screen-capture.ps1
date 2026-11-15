$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "native\windows-screen-capture\Program.cs"
$outputDirectory = Join-Path $root "build\native"
$output = Join-Path $outputDirectory "windows-screen-capture.exe"
$compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
& $compiler /nologo /optimize+ /target:exe /platform:x64 "/out:$output" $source
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output)) {
  throw "Windows screen capture helper compilation failed"
}
Write-Output $output
