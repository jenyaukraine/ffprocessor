# Bionic context control

`scripts/patch-bionic-context-control.mjs` adds a visible global compaction threshold selector next to the composer context counter. Choices: 40%, 50%, 60%, 70%, 80%; default 50%.

The resolver caps enabled compaction modules at `min(resolved model capacity, contextCap) * ratio`. Existing earlier absolute or ratio triggers still win. Disabled compaction modules remain disabled. The conservative global `contextCap` defaults to 32768 tokens, matching this workstation's loaded Ornith configuration. This is a safety cap, not automatic detection of every loaded model. Change it deliberately if using a smaller model context.

Settings live in `%LOCALAPPDATA%/ffprocessor/bionic-context.json`, for example `{"ratio":0.5,"contextCap":32768}`. The selector persists changes through a narrow Electron IPC API; the main process reads the file on each compaction check. No chat databases are edited.

Run with Node.js, elevated for Program Files:

```powershell
node scripts/patch-bionic-context-control.mjs
node scripts/patch-bionic-context-control.mjs --apply
```

Close and reopen Bionic after installation. The first command validates exact bundle anchors and syntax without writing. Installation backs up all three targets before writing and rolls back writes on failure. Restore each `*.ffprocessor-context-control-v1.bak` file to its original name with Bionic closed to uninstall. Bionic updates can replace the patch; rerun validation before reinstalling. The installer rejects unfamiliar bundles instead of guessing.

This changes when an enabled module checks for compaction; it cannot guarantee that a single large tool result will fit or repair an already oversized chat. Use Bionic's existing compaction action or a fresh chat if the request already exceeds its loaded context.

# Ornith MTP

The current julianmb model card recommends `--spec-type draft-mtp --spec-draft-n-max 2 --spec-draft-p-min 0.6`. This workstation's local GGUF SHA256 matches the refreshed artifact: `0f907917a1bfe4e0ca0d281e5709dcf34b6277063e94fab29491bb5c80fda696`. No external draft is needed. The model author's speed measurements are on Strix Halo/Vulkan and do not establish RX 7900 XTX/HIP throughput or stability. Compare coding requests and tool replay after reloading with MTP.

Source: https://huggingface.co/julianmb/Ornith-1.5-35B-A3B-ROCmFP4-GGUF
