# Spark coding defaults

Run `node scripts/configure-bionice-spark-coding.mjs --apply` to save Bionic model defaults for the installed nanash66 Spark X2.5 ROCmFP4 model. The script preserves a before-coding backup and does not reload or interrupt an active model.

Profile: 65536 context, full GPU offload, eight CPU threads, batch 2048/512, one parallel prediction, flash attention, checkpoint count zero, separate KV slots and no speculative draft. Sampling: temperature 0.4, top-k 20, top-p 0.95, min-p zero, repetition penalty one. Output cap 2048; thinking off by default, optional thinking budget 512. The system prompt encourages focused reads, concrete edits, tool evidence and verification. These are practical initial settings, not proof of a globally fastest or highest-quality configuration.

The Spark model card requires disabling RAM checkpoint restoration. A typed llama.cpp argument override sets `--cache-ram 0`. Bionic excludes argument overrides from loaded-model reload controls: fully unload and load Spark when idle to apply that flag. Ordinary Reload applied the other settings but the current process was verified to lack `--cache-ram 0`; do not claim that override is already active. Existing context checkpoint count is zero.

Verified live through `/api/v1/models` and safe process-argument inspection: BIONICE SPARK 3.0.0 executable, ctx65536, ngl999999, checkpoints0, b2048, ub512, threads8 and parallel1. Prediction settings are persisted defaults; existing sessions can override them.

`scripts/test-spark-coding.mjs` exercises a temporary JSON file through read/edit/verify/final tool replay. It uses explicit request sampling and thinking off, so it does not test Bionic UI session overrides. Do not run competing tests while a single-slot coding session is active; queueing makes wall-time measurements meaningless.
