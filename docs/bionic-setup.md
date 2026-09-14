# Restore Spark and Lightweight Vision in Bionic

Configuration recorded on 2026-09-14: Bionic 1.1.2 build 11, Windows,
RX 7900 XTX 24 GB, FFProcessor runtime 1.0.2. Build and install the runtime
using [the build guide](ffprocessor.md). This repository does not distribute
Bionic, proprietary runtime bindings, model weights, credentials, or chat history.

## Download and Load

Run in PowerShell after installing Bionic and its `lms` CLI:

```powershell
$lms = "$HOME\.lmstudio\bin\lms.exe"
& $lms get "https://huggingface.co/XHToken/Spark-X2.5-4B-GGUF@q4_k_m" --gguf -y
& $lms get "https://huggingface.co/lmstudio-community/Qwen3.5-0.8B-GGUF@q8_0" --gguf -y
& $lms runtime select ffprocessor-spark-win-x86_64-vulkan-avx2@1.0.2
& $lms ps
# Load only when these identifiers are not already loaded.
& $lms load spark-x2.5-4b --context-length 65536 --parallel 4 --gpu max --identifier spark-x2.5-4b -y
& $lms load qwen3.5-0.8b --context-length 8192 --parallel 1 --gpu max --identifier qwen3.5-0.8b -y
& $lms ps
```

If already loaded with different settings, finish current work before using
`lms unload <identifier>` and reloading. The four Spark slots reproduce this
machine's configuration; they are not a requirement or a speed guarantee.

The vision download includes `Qwen3.5-0.8B-Q8_0.gguf` (811,843,040 bytes) and
`mmproj-Qwen3.5-0.8B-BF16.gguf` (207,345,952 bytes), about 1.02 GB total.
Keep both files together in the downloaded model directory. Disk size is not
total runtime VRAM usage. Model source: [LM Studio community GGUF](https://huggingface.co/lmstudio-community/Qwen3.5-0.8B-GGUF).

## Persistent Defaults

The profiles below contain only model settings, not personal app data:

- [Spark 64K profile](../config/bionic/spark-64k.json)
- [Vision 8K profile](../config/bionic/vision-8k.json)

For this Bionic version, close the app before restoring profiles. Back up any
existing files before replacing them. Relative to
`$HOME/.lmstudio/apps/bionic/.internal/user-concrete-model-default-config/`,
the target paths are:

```text
XHToken/Spark-X2.5-4B-GGUF/Spark-X2.5-4B-Q4_K_M.gguf.json
lmstudio-community/Qwen3.5-0.8B-GGUF/Qwen3.5-0.8B-Q8_0.gguf.json
```

Use the matching profile as that file's contents, creating its parent directory
if needed. Different GGUF filenames require matching target filenames. Reload
the models and verify `lms ps`; saving defaults alone does not reload them.
Parallel slot counts are supplied by the load commands above, not these profiles.

In **Settings > Agent**, select Spark as the **Root model** and Qwen3.5 0.8B as
the **Vision subagent model**. This selection is separate from downloading and
loading. Attach screenshots to the chat; this does not enable automatic browser
viewing or browser control. No global settings file or session database is copied.

## Compaction at 50%

Follow [the reversible compaction patch instructions](bionic-compaction.md).
This is a Bionic application patch, not a llama.cpp compilation option. Its
default and effective maximum enabled ratio are 50%; at 64K that is 32,768 tokens.
An administrator terminal is required to modify a Program Files installation.
Restart Bionic afterward. Do not assume a Git pull applies it to the installed app.

## Optional ROCmFPX Runtime

ROCmFP4/ROCmFPX GGUF variants use non-mainline tensor types; the FFProcessor
Spark runtime does not support those types. For an existing Windows Vulkan
build of [ROCmFPX](https://github.com/charlie12345/ROCmFPX), install it separately:

```powershell
.\scripts\install-rocmfpx-runtime.ps1 -BuildDirectory "$HOME\Downloads\ROCmFPX\build-vulkan\bin"
& "$HOME\.lmstudio\bin\lms.exe" runtime select rocmfpx-win-x86_64-vulkan-avx2@1.0.0
```

It appears under **Settings > Runtime > GGUF** as **ROCmFPX (Vulkan) 1.0.0**.
The installer preserves the stock host bindings, places the supplied executable
and matching DLLs in an isolated `rocmfpx` subdirectory, verifies copy hashes,
and refuses to overwrite an existing runtime. It does not select the runtime,
download models, compile ROCmFPX, or modify FFProcessor. The source build must
already exist; this repository does not contain the ROCmFPX binaries or source.

With no conflicting loaded instance, a bounded loading check is:

```powershell
& "$HOME\.lmstudio\bin\lms.exe" load ornith-1.5-9b-rocmfp4-fast --gpu max --context-length 8192 --parallel 1 --identifier rocmfpx-check --ttl 300 -y
& "$HOME\.lmstudio\bin\lms.exe" ps
# Finish testing before unloading and restoring the previous selection:
& "$HOME\.lmstudio\bin\lms.exe" unload rocmfpx-check
& "$HOME\.lmstudio\bin\lms.exe" runtime select ffprocessor-spark-win-x86_64-vulkan-avx2@1.0.2
```

On 2026-09-14 the supplied ROCmFPX build reported `1 (c49ebdb)`, MSVC
19.44.35228.0. Ornith loaded in Bionic at 8K/one slot and returned `4` for a
simple arithmetic request via incremental SSE with a normal stop and `[DONE]`.
The running executable path pointed to the isolated ROCmFPX package. This does
not establish Gemma compatibility, agent reliability, or operation at 220K.
The runtime launcher lets Bionic supply model, port, and load parameters;
the model-specific command line from a standalone BAT file is not hardcoded.

## Verification Scope

Both models loaded together successfully. The vision API reported `vision=true`
and correctly read a small screenshot as `2376 tokens`, `17 seconds`, and
`133.69 t/s`, finishing normally while Spark remained loaded. This was a small
local image test, not a benchmark of UI design understanding or all images.
The automated UI selection of the vision subagent was not completed in that
test; set and verify it using the settings above.

The compaction script passed seven isolated resolver checks; its original
installation attempt was denied by Windows permissions. A complete real-dialogue
compaction run was not verified by those tests. Neither this setup nor the small
vision model guarantees fault-free operation or a fixed token generation speed.
