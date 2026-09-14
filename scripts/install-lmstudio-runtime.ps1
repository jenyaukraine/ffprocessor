param(
    [string]$LmStudioHome = (Join-Path $HOME '.lmstudio'),
    [string]$BuildDirectory = (Join-Path $PSScriptRoot '../build/bin/Release'),
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9.-]*$')]
    [string]$BaseRuntime = 'llama.cpp-win-x86_64-vulkan-avx2-2.37.0',
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version = '1.0.2'
)

$ErrorActionPreference = 'Stop'
$name = 'ffprocessor-spark-win-x86_64-vulkan-avx2'
$backends = Join-Path $LmStudioHome 'extensions/backends'
$source = Join-Path $backends $BaseRuntime
$destination = Join-Path $backends "$name-$Version"
$binaries = @(
    'llama-server.exe', 'llama-server-impl.dll', 'llama-common.dll',
    'llama.dll', 'mtmd.dll', 'ggml.dll', 'ggml-base.dll',
    'ggml-cpu.dll', 'ggml-vulkan.dll'
)

if (Test-Path -LiteralPath $destination) {
    throw "Runtime already exists: $destination. Use a new -Version to install without overwriting it."
}
foreach ($file in @('backend-manifest.json', 'display-data.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $file))) {
        throw "Missing base runtime file: $file. Install $BaseRuntime in LM Studio first."
    }
}
foreach ($file in $binaries) {
    if (-not (Test-Path -LiteralPath (Join-Path $BuildDirectory $file))) {
        throw "Missing build artifact: $file. Build the Vulkan Release llama-server target first."
    }
}

# Keep the host bindings with their original DLLs; run our engine in its own directory.
Copy-Item -LiteralPath $source -Destination $destination -Recurse
$engineDirectory = Join-Path $destination 'ffprocessor'
New-Item -ItemType Directory -Path $engineDirectory | Out-Null
foreach ($file in $binaries) {
    Copy-Item -LiteralPath (Join-Path $BuildDirectory $file) -Destination $engineDirectory
}

$manifest = Get-Content -LiteralPath (Join-Path $source 'backend-manifest.json') -Raw | ConvertFrom-Json
$manifest.name = $name
$manifest.version = $Version
$manifest.engine_protocol_server.executable_relative_path = 'ffprocessor/llama-server.exe'
$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $destination 'backend-manifest.json') -Encoding UTF8

$display = ,@('en', @{
    langKey = 'en'
    displayName = 'FFProcessor Spark (Vulkan)'
    description = 'Local FFProcessor llama.cpp build for Spark-X2.5; isolated server executable.'
    releaseNotes = @(@{ version = $Version; releaseNotes = 'Uses the local repository Release build, not the stock inference server.' })
})
ConvertTo-Json -InputObject $display -Depth 10 | Set-Content -LiteralPath (Join-Path $destination 'display-data.json') -Encoding UTF8

$artifacts = @{
    schema_version = 1
    runtime_kind = 'llama-server'
    executable_relative_path = 'ffprocessor/llama-server.exe'
    files = @($binaries | ForEach-Object { @{ relative_path = "ffprocessor/$_"; executable = $_ -eq 'llama-server.exe' } })
}
$artifacts | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $destination 'engine-protocol-server-artifacts.json') -Encoding UTF8

$provenance = @{
    repository = 'https://github.com/jenyaukraine/ffprocessor'
    commit = (& git -C (Join-Path $PSScriptRoot '..') rev-parse HEAD)
    source_dirty = [bool](& git -C (Join-Path $PSScriptRoot '..') status --porcelain)
    base_runtime = $BaseRuntime
    artifacts = @($binaries | ForEach-Object {
        @{ file = $_; sha256 = (Get-FileHash -LiteralPath (Join-Path $engineDirectory $_) -Algorithm SHA256).Hash }
    })
}
$provenance | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $destination 'ffprocessor-build.json') -Encoding UTF8
Write-Output "Installed FFProcessor Spark (Vulkan) $Version at $destination"
Write-Output "Select with: lms runtime select $name@$Version"
