# Spark X2.5 BF16 to ROCmFP4

This documents the reproducible conversion used for the Spark X2.5 4B model.
The source weights are downloaded from the pinned XHToken revision by
`scripts/download-spark-source.ps1`. The conversion does not modify the source
weights and does not commit model files to Git.

## Prerequisites

- Windows PowerShell
- Python 3.14 or another supported Python version
- `torch`, `numpy`, `pyyaml`, `transformers`, and `sentencepiece`
- A Release Vulkan build of this fork containing `llama-quantize.exe`
- At least 12 GB free disk space for the source, intermediate GGUF, and output

Install the Python dependencies once:

```powershell
py -3 -m pip install torch numpy pyyaml transformers sentencepiece
```

## Download and convert

From the repository root:

```powershell
.\scripts\convert-spark-bf16-rocmfp4.ps1 -DownloadSource
```

By default this creates:

- `D:\AI\models\Spark-X2.5-4B-BF16.gguf` (the lossless BF16 intermediate)
- `D:\AI\models\Spark-X2.5-4B-ROCmFP4_COHERENT-DIRECT.gguf` (the final model)

For another location or build directory:

```powershell
.\scripts\convert-spark-bf16-rocmfp4.ps1 `
  -ModelDirectory 'D:\models\Spark-X2.5-4B-BF16' `
  -OutputDirectory 'D:\models\out' `
  -BuildDirectory 'build-vulkan-msvc'
```

The final quantization command is equivalent to:

```powershell
llama-quantize.exe --allow-requantize --leave-output-tensor `
  Spark-X2.5-4B-BF16.gguf `
  Spark-X2.5-4B-ROCmFP4_COHERENT-DIRECT.gguf `
  Q4_0_ROCMFP4_COHERENT 16
```

This is a full BF16 conversion followed by ROCmFP4 quantization. It is not a
requantization of an existing Q4_K_M file. The repository contains the source
revision, scripts, and build instructions; large model artifacts remain local.
