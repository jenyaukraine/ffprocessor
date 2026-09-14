param(
    [string]$LmStudioHome = (Join-Path $HOME '.lmstudio'),
    [string]$BuildDirectory = (Join-Path $HOME 'Downloads/ROCmFPX/build-vulkan-msvc/bin/Release'),
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9.-]*$')]
    [string]$BaseRuntime = 'llama.cpp-win-x86_64-vulkan-avx2-2.37.0',
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version = '1.0.1'
)

$ErrorActionPreference = 'Stop'
$name = 'rocmfpx-win-x86_64-vulkan-avx2'
$backends = Join-Path $LmStudioHome 'extensions/backends'
$source = Join-Path $backends $BaseRuntime
$destination = Join-Path $backends "$name-$Version"
$binaries = @(
    'llama-server.exe', 'llama-common.dll', 'llama.dll', 'mtmd.dll',
    'ggml.dll', 'ggml-base.dll', 'ggml-cpu.dll', 'ggml-vulkan.dll'
)
if (Test-Path -LiteralPath (Join-Path $BuildDirectory 'llama-server-impl.dll')) {
    $binaries += 'llama-server-impl.dll'
}
if (Test-Path -LiteralPath $destination) {
    throw "Runtime already exists: $destination. Choose a new -Version; installed runtimes are never overwritten."
}
foreach ($file in @('backend-manifest.json', 'display-data.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $file))) {
        throw "Missing base runtime file: $file. Install $BaseRuntime first."
    }
}
foreach ($file in $binaries) {
    if (-not (Test-Path -LiteralPath (Join-Path $BuildDirectory $file))) {
        throw "Missing ROCmFPX build artifact: $file"
    }
}
$manifest = Get-Content -LiteralPath (Join-Path $source 'backend-manifest.json') -Raw | ConvertFrom-Json
if ($manifest.engine_protocol_server.runtime_kind -ne 'llama-server') {
    throw 'Base runtime does not declare the llama-server engine protocol.'
}
$engineVersion = & (Join-Path $BuildDirectory 'llama-server.exe') --version 2>&1
if ($LASTEXITCODE -ne 0) { throw 'The ROCmFPX server could not start. Check its DLL dependencies.' }

# Preserve the stock host bindings; the ROCmFPX process uses only its own DLLs.
Copy-Item -LiteralPath $source -Destination $destination -Recurse
$engineDirectory = Join-Path $destination 'rocmfpx'
New-Item -ItemType Directory -Path $engineDirectory | Out-Null
foreach ($file in $binaries) {
    Copy-Item -LiteralPath (Join-Path $BuildDirectory $file) -Destination $engineDirectory
    if ((Get-FileHash -LiteralPath (Join-Path $BuildDirectory $file)).Hash -ne
        (Get-FileHash -LiteralPath (Join-Path $engineDirectory $file)).Hash) {
        throw "Copied artifact failed hash verification: $file"
    }
}
$manifest.name = $name
$manifest.version = $Version
$manifest.engine_protocol_server.executable_relative_path = 'rocmfpx/llama-server.exe'
$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $destination 'backend-manifest.json') -Encoding UTF8
$display = ,@('en', @{
    langKey = 'en'
    displayName = 'ROCmFPX (Vulkan)'
    description = 'Separate local ROCmFPX Vulkan build for custom ROCmFP4/ROCmFPX GGUF tensor types.'
    releaseNotes = @(@{ version = $Version; releaseNotes = 'Isolated ROCmFPX server and matching DLLs; does not replace FFProcessor Spark.' })
})
ConvertTo-Json -InputObject $display -Depth 10 | Set-Content -LiteralPath (Join-Path $destination 'display-data.json') -Encoding UTF8
@{
    schema_version = 1
    runtime_kind = 'llama-server'
    executable_relative_path = 'rocmfpx/llama-server.exe'
    files = @($binaries | ForEach-Object { @{ relative_path = "rocmfpx/$_"; executable = $_ -eq 'llama-server.exe' } })
} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $destination 'engine-protocol-server-artifacts.json') -Encoding UTF8
@{
    engine_version = ($engineVersion -join "`n")
    base_runtime = $BaseRuntime
    artifacts = @($binaries | ForEach-Object {
        @{ file = $_; sha256 = (Get-FileHash -LiteralPath (Join-Path $engineDirectory $_) -Algorithm SHA256).Hash }
    })
} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $destination 'rocmfpx-build.json') -Encoding UTF8
Write-Output "Installed ROCmFPX (Vulkan) $Version at $destination"
Write-Output "Select with: lms runtime select $name@$Version"
Write-Output 'The current runtime selection has not been changed.'
