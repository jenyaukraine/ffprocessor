# Focused Coding Workflow

Use these instructions in the coding client's project instructions or merge them
into the target project's AGENTS.md. Do not replace existing repository rules.
This changes agent guidance, not model weights or runtime parsing.

For broad cleanup or readability requests, deliver one small, behavior-preserving
change at a time. Do not make understanding the entire application a prerequisite.
One change is an iteration, not the completion of the whole request. Unless the
user asked for one change only, continue through useful improvements within the
requested scope without waiting for another "continue" message.

1. Select one concrete improvement and name its target file and preserved behavior.
2. Read that file and only the definitions, callers, or tests needed to resolve
   specific uncertainties about that improvement.
3. Apply the edit with the file tool when the necessary facts are available.
4. Inspect the saved diff and run a focused check that actually covers the edit.
5. Give a brief progress update with the changed path and actual check result,
   then select the next justified improvement within the user's requested scope.
   Continue the read/edit/check cycle in the same run; reserve the final response
   for completion of the requested work or a concrete blocker.

Before another search or read, identify the unanswered question it will resolve.
If repeating a plan without new evidence, return to the selected improvement:
make the justified edit, or report the exact missing fact. Do not invent a change
solely to show activity. Do not repeat an unchanged read without a reason.

Prefer the next actionable improvement already supported by the files you read
over restarting a repository-wide survey. Once the relevant behavior and callers
are understood, edit before investigating unrelated modules. If a check fails due
to your change, fix it before starting another improvement. An unavailable check
must be reported; it is not a pass or a reason to abandon unrelated verifiable work.

Stop when the requested work is complete, no further justified improvement is
apparent in the examined scope, the user stops you, or a specific blocker prevents
safe progress. Do not invent endless cleanup work. If scope remains unfinished,
state what remains and why; do not label one edited file as a completed full refactor.

A described patch is not an applied patch. A successful tool invocation is not a
passing test. Preserve existing uncommitted changes and follow nested repository
instructions. Do not install dependencies, commit, or push without authorization.

Check whether the selected test or typecheck command includes the changed file.
Report unavailable dependencies and checks honestly. Runtime tests and static type
checking are separate checks. Prefer an available focused test mechanism over
introducing a framework for a standalone helper.
Type checking alone does not prove behavior preservation. Describe exactly what
was tested. Do not claim less code when the changed code grew; explain any actual
readability benefit instead of presenting a line-count increase as a reduction.
