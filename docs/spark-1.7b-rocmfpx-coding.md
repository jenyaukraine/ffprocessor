# Spark X2.5 1.7B AMD Coding Quantization

This recipe creates reproducible AMD ROCmFPX GGUF files from the full Spark
X2.5 1.7B BF16 GGUF. It keeps the source weights and generated models outside
the repository; only the recipe and calibration logic are versioned here.

## Inputs

- Source: `D:/AI/models/XHToken/Spark-X2.5-1.7B-GGUF/Spark-X2.5-1.7B.gguf`
- Coding corpus: `D:/AI/models/spark-coding-calibration.txt`
- 1.7B imatrix: `D:/AI/models/spark-coding-1.7b-v2.imatrix.gguf`
- ROCmFPX quantizer: `C:/Users/jenya/Downloads/ROCmFPX/build-vulkan-msvc/bin/Release/llama-quantize.exe`

The source must be the full BF16 GGUF. Do not build this recipe from an
already-quantized Q4 or Q8 file.

## Build the coding corpus

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  C:/llama.cpp-spark2/scripts/build-spark-coding-calibration.ps1 `
  -SourceDirectory D:/albert `
  -OutputFile D:/AI/models/spark-coding-calibration.txt
```

The prompt in `scripts/build-spark-coding-calibration.ps1` makes the model read
narrowly, edit once the fix is clear, inspect the diff, run a focused test, and
stop. It also explicitly separates product regressions, stale tests, and
environment failures.

## Compute the 1.7B coding imatrix

```powershell
C:/llama.cpp-spark2/build/bin/Release/llama-imatrix.exe `
  -m D:/AI/models/XHToken/Spark-X2.5-1.7B-GGUF/Spark-X2.5-1.7B.gguf `
  -f D:/AI/models/spark-coding-calibration.txt `
  -o D:/AI/models/spark-coding-1.7b-v2.imatrix.gguf `
  --output-format gguf --no-ppl --chunks 60 `
  -c 2048 -b 2048 -ub 1024 -ngl 999 `
  --flash-attn on --parse-special --output-frequency 10
```

Do not reuse a matrix made from the 4B model: tensor shapes and importance
entries are model-specific.

## Pure ROCmFP4 coding model

This is the validated quality-first 1.7B profile:

```powershell
C:/Users/jenya/Downloads/ROCmFPX/build-vulkan-msvc/bin/Release/llama-quantize.exe `
  --pure `
  --imatrix D:/AI/models/spark-coding-1.7b-v2.imatrix.gguf `
  D:/AI/models/XHToken/Spark-X2.5-1.7B-GGUF/Spark-X2.5-1.7B.gguf `
  D:/AI/models/Spark-X2.5-1.7B-ROCmFP4-CODING.gguf `
  Q4_0_ROCMFP4_FAST_EVEN
```

The resulting file is about 913 MB and uses the AMD ROCmFP4 Vulkan kernels.
Smoke-test it with a deterministic short request before using it as an agent
model.

## Mixed Q4/Q2 experiment

Generate the routing file from the same 1.7B imatrix:

```powershell
python C:/llama.cpp-spark2/scripts/build-spark-q4-q2-routing.py `
  D:/AI/models/spark-coding-1.7b-v2.imatrix.gguf `
  D:/AI/models/spark-1.7b-coding-q4-q2-routing-80.txt `
  --important-fraction 0.80 `
  --q4 Q4_0_ROCMFP4_FAST `
  --q2 Q2_0_ROCMFPX
```

Then run the ROCmFPX quantizer with `--tensor-type-file`. The 80% Q4 variant
is the minimum mixed profile that passed the basic output smoke test. The
40% Q4 variant produced repetitive reasoning and must not be treated as a
working coding model.

## Runtime

Use the ROCmFPX Vulkan runtime, full GPU offload, `parallel 1`, and a context
that fits the task. For a long coding session, start with `65536`; for a pure
speed test, use `32768`. Keep speculative decoding disabled until the base
model passes the output smoke test.

## Verification

At minimum, test:

1. `Reply with exactly: 4` must return exactly `4`.
2. A small TypeScript edit must produce code rather than repeated reasoning.
3. A tool-call-shaped request must return valid structured output.

The generated GGUF files are local artifacts and are intentionally not stored
in Git because they are hundreds of megabytes to several gigabytes.
