param(
    [Parameter(Mandatory)][string]$BuildDirectory,
    [Parameter(Mandatory)][string]$SdkPath,
    [string]$LmStudioHome = (Join-Path $HOME '.lmstudio'),
    [string]$BaseRuntime = 'rocmfpx-win-x86_64-vulkan-avx2-1.0.1',
    [ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version = '3.0.0'
)
$ErrorActionPreference = 'Stop'
$taskName = 'ornith-fast-win-x86_64-hip-gfx1100'
$taskBase = Join-Path $LmStudioHome "extensions/backends/$BaseRuntime"
$taskDestination = Join-Path $LmStudioHome "extensions/backends/$taskName-$Version"
if (Test-Path -LiteralPath $taskDestination) { throw 'Runtime already exists. Use a new version.' }
$taskManifest = Get-Content -LiteralPath (Join-Path $taskBase 'backend-manifest.json') -Raw | ConvertFrom-Json
if ($taskManifest.engine_protocol_server.runtime_kind -ne 'llama-server') { throw 'Base runtime must support the llama-server engine protocol.' }
$taskArtifacts = @('llama-server.exe', 'llama-bench.exe', 'llama-bench-impl.dll', 'llama-common.dll', 'llama.dll', 'mtmd.dll', 'ggml.dll', 'ggml-base.dll', 'ggml-cpu.dll', 'ggml-hip.dll', 'llama-server-impl.dll')
foreach ($taskFile in $taskArtifacts) {
    if (-not (Test-Path -LiteralPath (Join-Path $BuildDirectory $taskFile))) { throw "Missing build artifact: $taskFile" }
}
$taskLibraries = @('amdhip64_7.dll', 'amd_comgr.dll', 'hipblas.dll', 'rocblas.dll', 'rocsolver.dll', 'libhipblaslt.dll', 'origami.dll', 'rocm_kpack.dll', 'rocm-openblas.dll', 'rocm-openblas64.dll')
foreach ($taskFile in $taskLibraries) {
    if (-not (Test-Path -LiteralPath (Join-Path $SdkPath "bin/$taskFile"))) { throw "Missing SDK library: $taskFile" }
}
if (-not (Test-Path -LiteralPath (Join-Path $SdkPath 'bin/rocblas'))) { throw 'Missing rocBLAS kernel resources.' }
Copy-Item -LiteralPath $taskBase -Destination $taskDestination -Recurse
$taskEngine = Join-Path $taskDestination 'ornith-fast/bin'
New-Item -ItemType Directory -Path $taskEngine -Force | Out-Null
foreach ($taskFile in $taskArtifacts) { Copy-Item -LiteralPath (Join-Path $BuildDirectory $taskFile) -Destination $taskEngine }
foreach ($taskFile in $taskLibraries) { Copy-Item -LiteralPath (Join-Path $SdkPath "bin/$taskFile") -Destination $taskEngine }
Copy-Item -LiteralPath (Join-Path $SdkPath 'bin/rocblas') -Destination $taskEngine -Recurse
Copy-Item -LiteralPath (Join-Path $SdkPath 'bin/hipblaslt') -Destination $taskEngine -Recurse
if (Test-Path -LiteralPath (Join-Path $SdkPath '.kpack')) {
    $taskPack = Join-Path $taskDestination 'ornith-fast/.kpack'
    New-Item -ItemType Directory -Path $taskPack -Force | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $SdkPath '.kpack') -Filter 'blas_lib_gfx1100*' -Force | Copy-Item -Destination $taskPack
}
& (Join-Path $taskEngine 'llama-server.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'Packaged server cannot start. Check bundled DLL dependencies.' }
$taskManifest.name = $taskName
$taskManifest.version = $Version
$taskManifest.engine_protocol_server.executable_relative_path = 'ornith-fast/bin/llama-server.exe'
# Native host bindings stay with their original vendor metadata; inference uses HIP in the server process.
$taskManifest | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $taskDestination 'backend-manifest.json') -Encoding utf8
$taskDisplay = ,@('en', @{langKey='en'; displayName='Ornith Fast - ROCmFPX gfx1100'; description='ROCmFP4 HIP backend for RX 7900 XTX. RDNA3 MMQ/MMVQ and HIP graphs.'; releaseNotes=@(@{version=$Version; releaseNotes='Independent gfx1100 source, Release build, bundled ROCm runtime. Speed depends on context and workload.'})})
ConvertTo-Json -InputObject $taskDisplay -Depth 10 | Set-Content -LiteralPath (Join-Path $taskDestination 'display-data.json') -Encoding utf8
$taskFiles = @(Get-ChildItem -LiteralPath (Join-Path $taskDestination 'ornith-fast') -File -Recurse -Force | ForEach-Object {
    @{relative_path=$_.FullName.Substring($taskDestination.Length + 1).Replace('\','/'); executable=$_.Name -eq 'llama-server.exe'}
})
@{schema_version=1; runtime_kind='llama-server'; executable_relative_path='ornith-fast/bin/llama-server.exe'; files=$taskFiles} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $taskDestination 'engine-protocol-server-artifacts.json') -Encoding utf8
@{source='https://github.com/QingYis/llama-7900xtx-qwen3.8-27b'; revision='87399780209dd782ceb7696955894a589148e9e7'; gpu='gfx1100'; artifacts=@($taskArtifacts | ForEach-Object { @{file=$_; sha256=(Get-FileHash -LiteralPath (Join-Path $taskEngine $_)).Hash} })} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $taskDestination 'ornith-fast-build.json') -Encoding utf8
Write-Output "Installed: $taskDestination"
Write-Output "Select: lms runtime select $taskName@$Version"
