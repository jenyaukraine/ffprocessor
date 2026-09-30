# BIONICE SPARK 3.0.0

Installed engine ID: `bionice-spark-win-x86_64-hip-gfx1100@3.0.0`. Display name: **BIONICE SPARK**. Windows HIP Release build for RX 7900 XTX / gfx1100, with the same RDNA3 backend as Ornith Fast v3 plus Spark X2.5 architecture and tokenizer support.

Base source: QingYis/llama-7900xtx-qwen3.8-27b commit `87399780209dd782ceb7696955894a589148e9e7`. Architecture port: https://github.com/charlie12345/ROCmFPX/pull/113 (merged), adapted to this base's newer `n_layer()` and `set_swa_pattern()` APIs. `scripts/patches/spark2-5-gfx1100.patch` is the resolved patch against the base commit. It preserves the 3 sliding-window layers / 1 full-attention layer pattern.

Reproduce: create a clean checkout of the base commit, apply the supplied patch, and use `scripts/build-ornith-fast-hip.ps1`'s toolchain/environment and CMake flags for this patched source (Release, HIP, gfx1100, HIP graphs, native CPU). Build llama-server and llama-bench. Run `scripts/install-bionice-spark-runtime.ps1 -BuildDirectory <build/bin> -SdkPath <TheRock SDK>` to package the host manifest, engine executable, DLLs and gfx1100 rocBLAS kernel pack. The original build script's clean pinned-source guard must not be bypassed and it cannot directly build an already patched checkout; use its documented CMake recipe explicitly.

On this workstation source/build are under `D:/Projects/bionice-spark`; the existing toolchain is `D:/Projects/ornith-fast/toolchain`. Installed runtime is under `%USERPROFILE%/.lmstudio/extensions/backends/bionice-spark-win-x86_64-hip-gfx1100-3.0.0`. No GGUF was downloaded. The preexisting model at `D:/AI/models/nanash66/Spark-X2.5-4B-ROCmFP4-STRIX_LEAN-GGUF/Spark-X2.5-4B-Q4_0_ROCMFP4_STRIX_LEAN.gguf` was used for verification.

Validation: full server/bench build succeeded; packaged server --version succeeded; lms runtime ls discovers the package. A GPU smoke benchmark loaded spark2_5 4.11B / 2.10 GiB with ngl999, ROCm0 (RX7900XTX gfx1100), flash attention: pp32 257.61 tokens/s, tg16 45.50 tokens/s (one repetition). This short test is evidence of architecture and GPU execution, not a representative speed or coding-quality benchmark. Existing Ornith server remained loaded.

For actual Spark sessions, disable RAM checkpoint restoration (`--cache-ram 0 --ctx-checkpoints 0`) and bound output to 1024-2048 tokens, as the model card recommends for SWA/reasoning loops. This runtime installation does not overwrite model/session settings or switch an active loaded model. Choose BIONICE SPARK in Bionic's runtime settings before loading Spark.

Model card: https://huggingface.co/nanash66/Spark-X2.5-4B-ROCmFP4-STRIX_LEAN-GGUF
