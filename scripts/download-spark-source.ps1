param(
    [string]$Destination = 'D:/AI/models/Spark-X2.5-4B-BF16',
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$Revision = 'b97100a6c9c92fe4fdfedfa6653f5d26350cb619'
)

$ErrorActionPreference = 'Stop'
$repo = 'XHToken/Spark-X2.5-4B'
$metadata = Invoke-RestMethod "https://huggingface.co/api/models/$repo/revision/${Revision}?blobs=true"
if ($metadata.sha -ne $Revision) { throw 'Unexpected source revision.' }
$files = @($metadata.siblings | Where-Object {
    $_.rfilename -match '^[a-zA-Z0-9_.-]+$' -and
    ($_.rfilename -match '\.(safetensors|json|jinja|py|txt)$' -or $_.rfilename -in @('README.md', 'LICENSE'))
})
if (@($files | Where-Object { $_.rfilename -match '\.safetensors$' }).Count -ne 5) {
    throw 'Unexpected weight shard count.'
}
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$Destination = (Resolve-Path -LiteralPath $Destination).Path

function Test-Artifact($File, [string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    if ((Get-Item -LiteralPath $Path).Length -ne $File.size) { return $false }
    if ($File.lfs -and $File.lfs.sha256) {
        return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -eq $File.lfs.sha256
    }
    return $true
}

$verified = @()
foreach ($file in $files) {
    $target = Join-Path $Destination $file.rfilename
    if (Test-Path -LiteralPath $target) {
        if (-not (Test-Artifact $file $target)) {
            throw "Existing file differs from the pinned source; refusing to overwrite: $target"
        }
        Write-Output "Already verified: $($file.rfilename)"
    } else {
        $partial = "$target.partial"
        Write-Output "Downloading $($file.rfilename) ($($file.size) bytes)"
        & curl.exe --fail --location --silent --show-error --retry 3 --connect-timeout 30 --max-time 3600 --speed-limit 1024 --speed-time 60 --continue-at - --output $partial "https://huggingface.co/$repo/resolve/$Revision/$($file.rfilename)?download=true"
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $($file.rfilename). Run again to resume." }
        if (-not (Test-Artifact $file $partial)) { throw "Size or SHA-256 verification failed: $partial" }
        Move-Item -LiteralPath $partial -Destination $target
        Write-Output "Verified: $($file.rfilename)"
    }
    $verified += @{
        file = $file.rfilename
        size = $file.size
        sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
        upstream_sha256 = $file.lfs.sha256
    }
}
$index = Get-Content -LiteralPath (Join-Path $Destination 'model.safetensors.index.json') -Raw | ConvertFrom-Json
foreach ($shard in @($index.weight_map.PSObject.Properties.Value | Sort-Object -Unique)) {
    if ($shard -notin $files.rfilename) { throw "Missing indexed shard: $shard" }
}
@{
    repository = $repo
    revision = $Revision
    files = $verified
    downloaded_at_utc = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $Destination 'download-manifest.json') -Encoding UTF8
Write-Output "PASS: all source files downloaded and weight SHA-256 hashes verified at $Destination"
Write-Output 'Source Python files have only been downloaded, not executed. No quantization has been performed.'
