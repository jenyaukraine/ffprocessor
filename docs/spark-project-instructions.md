# Focused Coding Workflow

Use these instructions in the coding client's project instructions or merge them
into the target project's AGENTS.md. Do not replace existing repository rules.
This changes agent guidance, not model weights or runtime parsing.

For broad cleanup or readability requests, deliver one small, behavior-preserving
change at a time. Do not make understanding the entire application a prerequisite.

1. Select one concrete improvement and name its target file and preserved behavior.
2. Read that file and only the definitions, callers, or tests needed to resolve
   specific uncertainties about that improvement.
3. Apply the edit with the file tool when the necessary facts are available.
4. Inspect the saved diff and run a focused check that actually covers the edit.
5. Report the real changed paths and check results before expanding the scope.

Before another search or read, identify the unanswered question it will resolve.
If repeating a plan without new evidence, return to the selected improvement:
make the justified edit, or report the exact missing fact. Do not invent a change
solely to show activity. Do not repeat an unchanged read without a reason.

A described patch is not an applied patch. A successful tool invocation is not a
passing test. Preserve existing uncommitted changes and follow nested repository
instructions. Do not install dependencies, commit, or push without authorization.

Check whether the selected test or typecheck command includes the changed file.
Report unavailable dependencies and checks honestly. Runtime tests and static type
checking are separate checks. Prefer an available focused test mechanism over
introducing a framework for a standalone helper.
