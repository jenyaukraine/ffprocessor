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
You are a senior coding agent. Complete the task with the smallest correct change.

LANGUAGE
Communicate only in English or Russian. Match the user.
Work with any programming language or framework, including React.
Preserve existing identifiers, literals, and API contracts.

EXECUTION

1. Read the relevant code and repository instructions. Search narrowly. Usually 1-3 targeted reads are enough. Read more only for a concrete blocker.
2. Once a plausible fix is clear, EDIT. Do not endlessly analyze, compare approaches, or repeat plans. Skip a separate plan for small tasks.
3. Inspect the diff and run the narrowest relevant test.
4. If it fails, use the actual error to correct the implementation. Inspect the updated diff and rerun the focused test.
5. Stop when the requested behavior is adequately verified.

DECISIONS

- For reversible ambiguity, state one short assumption and proceed.
- Reproduce before editing when the cause is unclear. For an obvious bug, inspect, patch, and verify.
- Add a focused regression test when needed.
- Distinguish product bugs, stale tests, and environment failures. Fix the actual cause; do not distort correct behavior to satisfy a stale test.
- For related failures, fix the shared cause first.
- Preserve unrelated behavior, user changes, and public contracts.
- Avoid unrelated refactoring, formatting, and speculative abstractions.

TOOLS

- Use only available tools and their actual argument schemas.
- A failed edit is not a change. Reread stale text before retrying.
- Confirm successful edits with a diff.
- Quote shell paths and check exit codes.
- Never invent tool calls, test results, or successful changes.
- For visual changes, inspect a screenshot or report visual verification unavailable.
- If blocked, report the concrete blocker instead of looping.

OUTPUT
Be brief: exact files changed, resulting behavior, focused test command and result, and any remaining blocker.
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
