# Adaptive working context for Bionic

The composer currently shows estimated context size. A fixed percentage does not capture the tradeoff between uncached prefill time and history needed for coding. This proposal replaces the percentage selector with a visible automatic working budget, without reloading the model or discarding saved chat history.

Example label: `Context 17.2K / working 18.6K · Auto`. Clicking it shows the loaded model capacity, output/tool reserve, current budget, recent eligible prefill latency, next compaction trigger and the reason for the last change. Provide Auto, Fast and Preserve detail overrides plus Compact now. Do not call an estimated token count exact.

## Policy prototype

`scripts/adaptive-context-policy.mjs` is an independently testable prototype, not an installed Bionic integration. It starts at 65% of usable capacity, reserves 4096 tokens, and bounds the working budget. Two uncached prefill measurements above three seconds reduce it by 20%; three below one second can grow it by 10% for a complex task. Those numbers are initial tunable heuristics, not measured optimums. Three-turn cooldown prevents repeated summarization; capacity safety overrides cooldown. A successful summary aims at 70% of the working budget and acknowledges compaction only after success.

The application must provide the actual loaded context capacity, token estimates, uncached token count and eligible first-token timing. Exclude queue delays, cold model loads, canceled/failed requests, backend warmup and unrelated network latency. State must be per session/model, reset when model or capacity changes, and reject stale asynchronous updates. Derive reserve from response allowance plus anticipated tool output; the prototype's 4096 default is not sufficient for arbitrary large tool results. Clamp tool output before it enters the next request and recheck the budget after each tool result.

Compaction must preserve the user's active objective and constraints, unresolved questions, file paths and symbols, accepted edits, recent tool calls/results needed for replay, and verification outcomes. Archive the full history; do not silently truncate tool-call/result pairs. If pinned material alone exceeds the budget, explain the limit and ask the user to narrow the task instead of repeatedly summarizing it. Keep the summary at the model's current request boundary and validate the next request token count before sending. Capacity safety does not override the user's decision to disable compaction.

## Integration status

No public Bionic application source repository was found in the LM Studio GitHub organization. Its public repositories include the SDK, CLI, documentation and `lmstudio-bug-tracker`. Therefore this PR is a portable policy and upstream implementation proposal, not a PR against Bionic's private code. The existing local 50% compaction patch remains installed until actual adaptive integration is implemented and validated. Do not present its fixed safety cap as automatic performance adaptation.

Validation: `node scripts/test-adaptive-context-policy.mjs`. Future integration must test session isolation, cached and uncached requests, compaction failure, oversize tool output, pending tool pairs, shrinking loaded capacity, and timing contamination. Measure wall time to a verified coding result, summary overhead, tool success and context retention alongside tokens/second.

## Installed occupancy-based compactor v2

The latency policy above remains a prototype. scripts/patch-bionic-auto-compaction.mjs installs a conservative automatic compactor into the previously patched Bionic 1.1.6 bundle. It adds an automatic loaded-capacity calculation, queries the local API for capacity when exactly one model is loaded, uses the resolved capacity without the former 32K cap, applies the slider percentage while reserving at least 4096 tokens, and requires fresh token growth after successful context replacement. Disabled modules remain disabled. Per-module state prevents summarizing an unchanged oversized result repeatedly. An already oversized summary can still produce a capacity error instead of a loop.

Validate with Node without arguments, then install elevated with --apply. Backups end in .ffprocessor-auto-compaction-v2.bak. Installation does not restart or hot-patch the running process: activate after finishing current work by restarting Bionic. Restore both backups with Bionic closed to roll back. This version does not use latency telemetry, pinning or automatic tool-output clipping; it is distinct from the full policy proposal.

Final UI: clicking the existing Context token counter opens the slider popover. There is no second Compact button. Install the original context-control patch, then patch-bionic-auto-compaction.mjs, patch-bionic-context-popover.mjs, and patch-bionic-context-counter-trigger.mjs, each with --apply elevated. The slider has five thresholds (40-80%). The current live old patch had its stale contextCap corrected to 65536; the actual loaded capacity returned by the API was 64768. New main-process code activates only after a later restart; no active session was interrupted for this installation.
