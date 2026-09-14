# Spark X2.5 coding Q3 with imatrix

This is the reproducible path used to create the coding-oriented Spark X2.5
Q3 artifact:

```text
Spark X2.5 BF16 GGUF
  -> coding calibration corpus
  -> llama-imatrix
  -> Q3_0_ROCMFPX_AGENT
  -> Vulkan/ROCmFPX runtime
```

The calibration matrix is model-specific and data-specific. It must be
computed from the same Spark BF16 model that will be quantized. A matrix from
another model or architecture must not be reused.

## What is in the calibration corpus

`scripts/build-spark-coding-calibration.ps1` writes a text corpus containing:

- coding, refactoring, debugging, API, frontend, database, and shell tasks;
- `read_file -> edit/apply_patch -> focused test` tool-call examples;
- verification rules, including distinguishing a product regression from a
  stale test or an environment/setup problem;
- up to 160 source files from `D:/albert` with common build, cache, dependency,
  and secret directories excluded.

The corpus is used only to measure quantization importance. It does not train
the model or add new knowledge.

## Prerequisites

- Windows PowerShell;
- the original Spark BF16 GGUF;
- a Release Vulkan build containing `llama-imatrix.exe` and
  `llama-quantize.exe`;
- enough free disk space for the BF16 input and output model.

Build the required tools from the fork:

```powershell
cmake --build build-vulkan-msvc --config Release --target llama-imatrix llama-quantize -- /m:6
```

## One-command reproduction

From the repository root:

```powershell
.\scripts\quantize-spark-coding-q3.ps1
```

The default paths are:

```text
D:/AI/models/Spark-X2.5-4B-BF16.gguf
D:/AI/models/spark-coding-calibration.txt
D:/AI/models/spark-coding.imatrix.gguf
D:/AI/models/Spark-X2.5-4B-ROCmFPX-Q3-AGENT-CODING.gguf
```

To regenerate the corpus and matrix for another checkout:

```powershell
.\scripts\quantize-spark-coding-q3.ps1 `
  -Bf16Gguf 'D:/AI/models/Spark-X2.5-4B-BF16.gguf' `
  -CalibrationFile 'D:/AI/models/spark-coding-calibration.txt' `
  -ImatrixFile 'D:/AI/models/spark-coding.imatrix.gguf' `
  -OutputFile 'D:/AI/models/Spark-X2.5-4B-ROCmFPX-Q3-AGENT-CODING.gguf' `
  -RebuildCalibration
```

To use a different project as calibration data:

```powershell
.\scripts\build-spark-coding-calibration.ps1 `
  -SourceDirectory 'D:/path/to/project' `
  -OutputFile 'D:/AI/models/project-coding-calibration.txt'
```

Then pass that file as `-CalibrationFile` to the quantization script.

## Why the output can be larger than Q4

`Q3_0_ROCMFPX_AGENT` is an agent-oriented mixed scheme. It routes some
tool-call- and coding-sensitive tensors through higher precision Q5/Q6 paths
while using Q3 for the remaining tensors. This protects coding and tool-call
behavior, but the resulting average bits per weight can be higher than a
uniform ROCmFP4 Q4 artifact. `imatrix` changes error weighting; it does not
promise a smaller file.

For a smaller, less conservative file, use `Q3_0_ROCMFPX` instead of
`Q3_0_ROCMFPX_AGENT`. Test tool calls and coding tasks before adopting it.

## Mixed Q4/Q2 variant

For a smaller model with a precision budget focused on coding-sensitive
weights, generate a tensor routing file from the same imatrix:

```powershell
python .\scripts\build-spark-q4-q2-routing.py `
  D:/AI/models/spark-coding-output.imatrix.gguf `
  D:/AI/models/spark-q4-q2-routing.txt `
  --important-fraction 0.40
```

Then quantize with Q4 for the selected important tensors and Q2 as the
catch-all for the remaining quantizable tensors:

```powershell
llama-quantize.exe `
  --imatrix D:/AI/models/spark-coding-output.imatrix.gguf `
  --tensor-type-file D:/AI/models/spark-q4-q2-routing.txt `
  --output-tensor-type Q4_0_ROCMFP4_FAST `
  --token-embedding-type Q4_0_ROCMFP4_FAST `
  D:/AI/models/Spark-X2.5-4B-BF16.gguf `
  D:/AI/models/Spark-X2.5-4B-ROCmFPX-Q4-Q2-CODING.gguf `
  Q2_0_ROCMFPX
```

The tested result was about 1.46 GiB. This is an experimental quality/speed
trade-off: validate tool calls, patch application, and tests against the
uniform Q4 model before making it the default.

## Validation

Load the output with the same Vulkan/ROCmFPX runtime used for Spark X2.5:

```powershell
llama-server.exe `
  -m 'D:/AI/models/Spark-X2.5-4B-ROCmFPX-Q3-AGENT-CODING.gguf' `
  -ngl 999 -c 2048 -np 1 `
  --host 127.0.0.1 --port 8080 --tools all
```

Before using it in an agent, verify at least:

1. normal text generation;
2. a file-read tool call;
3. one patch/edit tool call;
4. a focused test command;
5. streaming and end-of-turn behavior.

The large GGUF, BF16 weights, calibration corpus, and imatrix are build
artifacts and are intentionally not committed to Git. The scripts and this
document are the reproducible source of the conversion.
