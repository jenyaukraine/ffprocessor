param(
    [string]$Bf16Gguf = 'D:/AI/models/Spark-X2.5-4B-BF16.gguf',
    [string]$CalibrationFile = 'D:/AI/models/spark-coding-calibration.txt',
    [string]$ImatrixFile = 'D:/AI/models/spark-coding.imatrix.gguf',
    [string]$OutputFile = 'D:/AI/models/Spark-X2.5-4B-ROCmFPX-Q3-AGENT-CODING.gguf',
    [string]$BuildDirectory = 'build-vulkan-msvc',
    [int]$Chunks = 60,
    [switch]$RebuildCalibration
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$imatrixTool = Join-Path $repoRoot "$BuildDirectory/bin/Release/llama-imatrix.exe"
$quantizer = Join-Path $repoRoot "$BuildDirectory/bin/Release/llama-quantize.exe"
$calibrationScript = Join-Path $PSScriptRoot 'build-spark-coding-calibration.ps1'

foreach ($required in @($Bf16Gguf, $imatrixTool, $quantizer, $calibrationScript)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required input not found: $required"
    }
}

if ($RebuildCalibration -or -not (Test-Path -LiteralPath $CalibrationFile)) {
    Write-Output 'Step 1/3: building the coding calibration corpus'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $calibrationScript -OutputFile $CalibrationFile
    if ($LASTEXITCODE -ne 0) { throw 'Calibration corpus generation failed.' }
} else {
    Write-Output 'Step 1/3: using existing coding calibration corpus'
}

if (-not (Test-Path -LiteralPath $ImatrixFile)) {
    Write-Output "Step 2/3: computing importance matrix over $Chunks chunks"
    & $imatrixTool -m $Bf16Gguf -f $CalibrationFile -o $ImatrixFile `
        --output-format gguf --no-ppl --chunks $Chunks -c 2048 -b 2048 -ub 1024 `
        -ngl 999 --flash-attn on --parse-special --output-frequency 10
    if ($LASTEXITCODE -ne 0) { throw 'Importance matrix computation failed.' }
} else {
    Write-Output 'Step 2/3: using existing importance matrix'
}

if (Test-Path -LiteralPath $OutputFile) {
    throw "Output already exists; choose another -OutputFile or remove it manually: $OutputFile"
}

Write-Output 'Step 3/3: quantizing BF16 to agent-oriented ROCmFPX Q3'
& $quantizer --imatrix $ImatrixFile $Bf16Gguf $OutputFile Q3_0_ROCMFPX_AGENT
if ($LASTEXITCODE -ne 0) { throw 'ROCmFPX Q3 quantization failed.' }

Get-Item -LiteralPath $CalibrationFile, $ImatrixFile, $OutputFile |
    Select-Object FullName, Length, LastWriteTime
Write-Output "PASS: created $OutputFile"
