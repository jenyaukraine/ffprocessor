# Ornith Fast 3.0.0

Independent ROCmFP4 HIP runtime for RX 7900 XTX (gfx1100), packaged as a selectable Bionic/LM Studio engine. The FFProcessor engine source and Spark parser are unchanged.

Source: https://github.com/QingYis/llama-7900xtx-qwen3.8-27b at `87399780209dd782ceb7696955894a589148e9e7`. It includes ROCmFP4/FAST MMVQ, RDNA3 MMQ and MoE dispatch. The local build used AMD's portable TheRock Windows gfx110X SDK 10.0.0, Clang 23, Release, native CPU instructions and HIP graphs.

Official SDK: https://stable.repo.amd.com/rocm/core/tarball/therock-dist-windows-gfx110X-all-10.0.0.tar.gz

Extract the SDK into a directory, then run with Visual Studio C++ Build Tools and CMake installed:

```powershell
./scripts/build-ornith-fast-hip.ps1 -SdkPath D:/Projects/ornith-fast/toolchain -WorkDirectory D:/Projects/ornith-fast
./scripts/install-ornith-fast-runtime.ps1 -SdkPath D:/Projects/ornith-fast/toolchain -BuildDirectory D:/Projects/ornith-fast/build-hip/bin
```

The installer preserves the base runtime's native host bindings and metadata and points the engine protocol to the isolated HIP server. It bundles dependent ROCm DLLs and kernel resources. It never replaces an existing version or changes the selected engine. Choose `Ornith Fast - ROCmFPX gfx1100`, version `3.0.0`, in Bionic, or use `lms runtime select ornith-fast-win-x86_64-hip-gfx1100@3.0.0` for the CLI's connected application.

## Measurements on 2026-09-30

Model: `Ornith-1.5-35B-A3B-ROCmFP4.gguf`, 19,052,438,944 bytes. Three repetitions, full GPU offload, flash attention, batch 2048, microbatch 512, 8 CPU threads, no speculative decoding.

| Runtime | Test | Mean tokens/s | Standard deviation |
| --- | --- | ---: | ---: |
| Existing ROCmFPX Vulkan | tg128, short benchmark | 80.45 | 0.94 |
| New HIP | tg128, short benchmark | 126.11 | 1.43 |
| Packaged HIP, RX 7900 XTX only | tg256, short benchmark | 125.22 | 2.87 |
| Packaged HIP, RX 7900 XTX only | pp4096 | 710.57 | See local benchmark log |

These are synthetic `llama-bench` results, not a promise of chat speed. The initial short HIP/Vulkan runs used automatic device selection; both APIs detected the integrated GPU as well. The packaged HIP follow-up selected `ROCm0` explicitly. No model-quality or long-context speed claim follows from these numbers.

The user measured about 545 prompt tokens/s and 47 generated tokens/s in Bionic with 90,000 context, four slots, f16 KV, 32 checkpoints, unified KV and draft-MTP. Those settings and a real conversation differ from the benchmark. The active Bionic settings were inspected but not changed. A separate 32K test server failed to allocate GPU model memory while the user loaded the same model in Bionic; that test is not a successful server validation.

For a controlled interactive baseline, test 32K context, one slot and speculation disabled before comparing MTP on the same prompt and conversation. Check memory usage, accepted draft tokens and end-to-end latency. A faster raw kernel does not repair repeated file inspection in the agent client.

Validation completed: HIP compilation, device detection, benchmark inference, packaged DLL startup/device detection, and engine discovery through `lms runtime ls`. The user also loaded the packaged engine in Bionic. Autonomous file editing and long-context stability are not yet validated.
