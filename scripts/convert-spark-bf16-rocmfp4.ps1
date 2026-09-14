param(
    [string]$ModelDirectory = 'D:/AI/models/Spark-X2.5-4B-BF16',
    [string]$OutputDirectory = 'D:/AI/models',
    [string]$Python = 'py.exe',
    [string[]]$PythonArguments = @('-3'),
    [string]$BuildDirectory = 'build-vulkan-msvc',
    [switch]$DownloadSource
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$converter = Join-Path $repoRoot 'convert_hf_to_gguf.py'
$quantizer = Join-Path $repoRoot "$BuildDirectory/bin/Release/llama-quantize.exe"
$bf16Gguf = Join-Path $OutputDirectory 'Spark-X2.5-4B-BF16.gguf'
$rocmFp4Gguf = Join-Path $OutputDirectory 'Spark-X2.5-4B-ROCmFP4_COHERENT-DIRECT.gguf'

if ($DownloadSource) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'download-spark-source.ps1') -Destination $ModelDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Spark source download failed.' }
}

if (-not (Test-Path -LiteralPath $ModelDirectory -PathType Container)) {
    throw "Model directory not found: $ModelDirectory"
}
if (-not (Test-Path -LiteralPath $converter -PathType Leaf)) {
    throw "Converter not found: $converter"
}
if (-not (Test-Path -LiteralPath $quantizer -PathType Leaf)) {
    throw "Quantizer not found: $quantizer. Build the Release Vulkan target first."
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

Write-Output 'Step 1/2: converting original BF16 safetensors to BF16 GGUF'
& $Python @PythonArguments $converter $ModelDirectory --outfile $bf16Gguf --outtype bf16 --use-temp-file
if ($LASTEXITCODE -ne 0) { throw 'BF16 to GGUF conversion failed.' }

Write-Output 'Step 2/2: quantizing BF16 GGUF to ROCmFP4'
& $quantizer --allow-requantize --leave-output-tensor $bf16Gguf $rocmFp4Gguf Q4_0_ROCMFP4_COHERENT 16
if ($LASTEXITCODE -ne 0) { throw 'ROCmFP4 quantization failed.' }

Get-Item -LiteralPath $bf16Gguf, $rocmFp4Gguf | Select-Object FullName, Length, LastWriteTime
Write-Output "PASS: created $rocmFp4Gguf"
