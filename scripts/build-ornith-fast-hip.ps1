param(
    [Parameter(Mandatory)][string]$SdkPath,
    [string]$WorkDirectory = (Join-Path $PSScriptRoot '../.ornith-fast'),
    [int]$Jobs = 8,
    [string]$SourceRevision = '87399780209dd782ceb7696955894a589148e9e7'
)
$ErrorActionPreference = 'Stop'
$taskSdk = (Resolve-Path -LiteralPath $SdkPath).Path.Replace('\', '/')
if (-not (Test-Path -LiteralPath "$taskSdk/lib/llvm/bin/clang++.exe")) { throw 'Expected a TheRock Windows SDK with lib/llvm/bin/clang++.exe.' }
$taskVswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$taskVs = & $taskVswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $taskVs) { throw 'Visual Studio x64 C++ Build Tools are required.' }
Import-Module (Join-Path $taskVs 'Common7/Tools/Microsoft.VisualStudio.DevShell.dll')
Enter-VsDevShell -VsInstallPath $taskVs -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64'
New-Item -ItemType Directory -Path $WorkDirectory -Force | Out-Null
$taskRoot = (Resolve-Path -LiteralPath $WorkDirectory).Path
$taskSource = Join-Path $taskRoot 'src'
if (-not (Test-Path -LiteralPath $taskSource)) {
    git clone --no-checkout https://github.com/QingYis/llama-7900xtx-qwen3.8-27b.git $taskSource
    if ($LASTEXITCODE -ne 0) { throw 'Source clone failed.' }
    git -C $taskSource checkout --detach $SourceRevision
    if ($LASTEXITCODE -ne 0) { throw 'Source checkout failed.' }
}
$taskHead = git -C $taskSource rev-parse HEAD
if ($taskHead -ne $SourceRevision -or (git -C $taskSource status --porcelain)) { throw 'Source must be clean and match SourceRevision.' }
$env:HIP_PATH = $taskSdk
$env:ROCM_PATH = $taskSdk
$env:HIP_DEVICE_LIB_PATH = "$taskSdk/lib/llvm/amdgcn/bitcode"
$env:PATH = "$taskSdk/bin;$taskSdk/lib/llvm/bin;$(Join-Path $taskVs 'Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja');$env:PATH"
$taskCmake = Get-Command cmake -ErrorAction SilentlyContinue
if (-not $taskCmake) { $taskCmake = Get-Command (Join-Path $env:ProgramFiles 'CMake/bin/cmake.exe') }
$taskBuild = Join-Path $taskRoot 'build-hip'
& $taskCmake -S $taskSource -B $taskBuild -G Ninja -DCMAKE_BUILD_TYPE=Release "-DCMAKE_C_COMPILER=$taskSdk/lib/llvm/bin/clang.exe" "-DCMAKE_CXX_COMPILER=$taskSdk/lib/llvm/bin/clang++.exe" "-DCMAKE_PREFIX_PATH=$taskSdk" -DGGML_HIP=ON -DGPU_TARGETS=gfx1100 -DGGML_NATIVE=ON -DGGML_HIP_GRAPHS=ON -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_APP=OFF -DLLAMA_BUILD_UI=OFF -DLLAMA_OPENSSL=OFF -DLLAMA_ALL_WARNINGS=OFF
if ($LASTEXITCODE -ne 0) { throw 'CMake configuration failed.' }
& $taskCmake --build $taskBuild -j $Jobs --target llama-server llama-bench
if ($LASTEXITCODE -ne 0) { throw 'Compilation failed.' }
Write-Output "Build ready: $taskBuild/bin"
