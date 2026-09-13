@echo off
setlocal
if "%~1"=="" goto usage
if "%~2"=="" goto usage

set "SERVER=%~dp0..\build\bin\Release\llama-server.exe"
if defined LLAMA_SERVER_EXE set "SERVER=%LLAMA_SERVER_EXE%"
if not exist "%SERVER%" (
  echo Server not found: "%SERVER%"
  echo Build this fork first. See docs\ffprocessor.md.
  exit /b 1
)
if not exist "%~1" (
  echo Model not found: "%~1"
  exit /b 1
)
if not exist "%~2\." (
  echo Workspace directory not found: "%~2"
  exit /b 1
)

set "MODEL=%~f1"
if not defined SPARK_CTX set "SPARK_CTX=65536"
if not defined SPARK_PARALLEL set "SPARK_PARALLEL=1"
if not defined SPARK_PORT set "SPARK_PORT=8080"
if not defined SPARK_REASONING_BUDGET set "SPARK_REASONING_BUDGET=512"
if not defined SPARK_FLASH_ATTN set "SPARK_FLASH_ATTN=auto"
if not defined SPARK_UBATCH set "SPARK_UBATCH=512"

pushd "%~2" || exit /b 1
echo Web UI: http://127.0.0.1:%SPARK_PORT%/
"%SERVER%" -m "%MODEL%" -ngl 999 ^
  -c "%SPARK_CTX%" -np "%SPARK_PARALLEL%" ^
  -fa "%SPARK_FLASH_ATTN%" ^
  -b 2048 -ub "%SPARK_UBATCH%" ^
  --alias spark-x2.5 --host 127.0.0.1 --port "%SPARK_PORT%" ^
  --agent --reasoning on --reasoning-format deepseek --reasoning-budget "%SPARK_REASONING_BUDGET%"
set "SERVER_EXIT=%ERRORLEVEL%"
popd
exit /b %SERVER_EXIT%

:usage
echo Usage: %~nx0 "C:\models\Spark-X2.5-4B-Q4_K_M.gguf" "D:\my-project"
echo Optional environment: SPARK_CTX, SPARK_PARALLEL, SPARK_PORT, SPARK_REASONING_BUDGET, SPARK_FLASH_ATTN, SPARK_UBATCH, LLAMA_SERVER_EXE
exit /b 2
