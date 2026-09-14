param(
    [string]$SourceDirectory = 'D:/albert',
    [string]$OutputFile = 'D:/AI/models/spark-coding-calibration.txt',
    [int]$MaxFiles = 160,
    [int]$MaxCharsPerFile = 12000
)

$ErrorActionPreference = 'Stop'
$extensions = @('.c', '.cc', '.cpp', '.h', '.hpp', '.cs', '.go', '.java', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.json', '.sql', '.py', '.ps1', '.md')
$excluded = @('node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.cache', '.env', 'secrets', 'keys')
$prompts = @'
Senior coding agent task: inspect the repository, identify the smallest safe change, edit the file, run the focused test, then report the exact files changed and the result.
When a task is ambiguous, preserve existing behavior, state the assumption, and verify it with a regression test before broadening the change.
Use a read/search step before editing. Do not claim a file was changed unless the edit tool succeeded and a diff confirms it.
Tool call example: {"name":"read_file","arguments":{"path":"src/example.ts","line_start":1,"line_end":160}}
Tool call example: {"name":"edit_file","arguments":{"path":"src/example.ts","edits":[{"old_string":"const oldValue = true;","new_string":"const oldValue = false;"}]}}
After editing, inspect the diff, run the narrowest relevant test, and only then summarize the result.
For a refactor, keep public behavior stable, remove duplication, improve names and types, and avoid unrelated formatting churn.
For a bug, reproduce it first, isolate the invariant that is broken, patch the smallest owner, and add a test for the failure mode.
For an API change, validate malformed input, preserve useful error messages, and test both streaming and non-streaming paths.
For a frontend change, check loading, error, empty, mobile, and keyboard states and avoid claiming visual work without a screenshot check.
For a database change, consider migration order, rollback behavior, indexes, nullability, and existing production rows.
For a shell command, quote paths, check exit codes, avoid deleting user data, and print the concrete output needed for verification.
Before changing production code, determine whether the failure is caused by a real product regression, a stale or incorrect test, or an environment/setup problem. Do not modify production behavior solely to satisfy an outdated test.
When multiple tests fail from the same architectural change, identify the shared root cause before fixing individual failures.
'@

if (-not (Test-Path -LiteralPath $SourceDirectory -PathType Container)) {
    throw "Source directory not found: $SourceDirectory"
}
New-Item -ItemType Directory -Path (Split-Path -Parent $OutputFile) -Force | Out-Null
$builder = [System.Text.StringBuilder]::new()
[void]$builder.AppendLine($prompts)

$files = Get-ChildItem -LiteralPath $SourceDirectory -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $candidate = $_
        $isExcluded = $false
        foreach ($part in $excluded) {
            if ($candidate.FullName -like "*\$part\*" -or $candidate.Name -eq $part) {
                $isExcluded = $true
                break
            }
        }
        $candidate.Extension.ToLowerInvariant() -in $extensions -and
        $candidate.Length -gt 0 -and $candidate.Length -le 2MB -and
        -not $isExcluded
    } |
    Sort-Object Length -Descending |
    Select-Object -First $MaxFiles

foreach ($file in $files) {
    $relative = $file.FullName.Substring((Resolve-Path $SourceDirectory).Path.Length).TrimStart('\', '/')
    $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($content)) { continue }
    if ($content.Length -gt $MaxCharsPerFile) { $content = $content.Substring(0, $MaxCharsPerFile) }
    [void]$builder.AppendLine("`n--- FILE $relative ---`n$content")
}

$builder.ToString() | Set-Content -LiteralPath $OutputFile -Encoding UTF8
Write-Output "Created calibration corpus: $OutputFile"
Write-Output "Files included: $($files.Count); characters: $($builder.Length)"
