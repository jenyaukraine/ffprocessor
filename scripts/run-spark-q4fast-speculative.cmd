@echo off
setlocal

rem Maximum single-request throughput profile for Spark X2.5 on the ROCmFPX Vulkan build.
rem Keep the target model at Q4 ROCmFP4 FAST; the small draft model is only a proposer.
set "SERVER=C:\Users\jenya\Downloads\ROCmFPX\build-vulkan\bin\llama-server.exe"
set "TARGET=D:\AI\models\XHToken\Spark-X2.5-4B-ROCmFP4-TURBO-CODING\Spark-X2.5-4B-ROCmFP4-TURBO-CODING.gguf"
set "DRAFT=D:\AI\models\Qwen2.5-Coder-0.5B-Q8_0.gguf"

if not exist "%SERVER%" (
  echo Missing ROCmFPX llama-server: %SERVER%
  exit /b 1
)
if not exist "%TARGET%" (
  echo Missing target model: %TARGET%
  exit /b 1
)
if not exist "%DRAFT%" (
  echo Missing draft model: %DRAFT%
  echo Download it first; see docs/spark-speed.md.
  exit /b 1
)

cd /d D:\albert
"%SERVER%" ^
  --model "%TARGET%" ^
  --model-draft "%DRAFT%" ^
  --spec-type draft-simple ^
  --spec-draft-n-max 8 ^
  --spec-draft-n-min 3 ^
  --spec-draft-ngl all ^
  --ctx-size 32768 ^
  --parallel 1 ^
  --batch-size 2048 ^
  --ubatch-size 512 ^
  --threads 6 ^
  --n-gpu-layers 999999 ^
  --flash-attn on ^
  --cache-type-k f16 ^
  --cache-type-v f16 ^
  --jinja ^
  --host 127.0.0.1 ^
  --port 8080 ^
  --tools all
pause
