# Spark-X2.5 integration audit (2026-09-14)

Scope: FFProcessor's Spark-X2.5 4B GGUF path on Windows / RX 7900 XTX / Vulkan,
including the custom LM Studio/Bionic runtime. This is a bounded audit, not a
claim that every possible model or integration bug has been eliminated.

## Confirmed and fixed

### Exact GELU

[SGLang #37609](https://github.com/sgl-project/sglang/issues/37609) reports a
tanh-GELU versus exact-GELU mismatch. Independently checked the official
[configuration](https://huggingface.co/XHToken/Spark-X2.5-4B/blob/main/config.json)
and [reference MLP](https://huggingface.co/XHToken/Spark-X2.5-4B/blob/main/modeling_spark.py):
`hidden_act=gelu`, `ACT2FN[config.hidden_act]`, activated gate multiplied by up.
Our Spark graph selected `LLM_FFN_GELU`, whose fused path uses tanh GEGLU.

Added explicit `LLM_FFN_GELU_ERF` selection for Spark, reusing existing GGML
operators. Other models retain their existing activation. The architecture test
now checks the actual Spark graph operator, since CPU/GPU agreement alone can
pass with the same wrong formula on both backends. It failed before the change
and passed afterward. This establishes an implementation mismatch, not its
effect on downstream coding scores or repeated reasoning.

The 36-layer model also lacked the existing 4B type classification; added it.
This affects model description, not the number of loaded weights or speed.

### Composed tool schemas

[SGLang #36626](https://github.com/sgl-project/sglang/pull/36626) describes missing
argument type discovery through composed schemas. Our independent native API
reproduction supplied a `record` tool whose object properties were inside
`allOf`. Before the fix, the response contained the desired payload in ordinary
content but `tool_calls[0].function.arguments` was `{}`.

Spark now discovers property declarations through `allOf`, `anyOf`, `oneOf`
and registered local references, with cycle protection. Repeated declarations
are kept as alternatives rather than silently dropping later types. Direct
properties and composed properties are both visited. Non-string nested values
continue to use the schema-constrained JSON parser. Four native API probes now
return an object `payload` with integer `value=7` for all four schema forms.

This is property discovery for tagged argument parsing, NOT full JSON Schema
validation of the enclosing object. Cross-property branch dependencies,
required-property combinations and mutually exclusive branches still require
validation by the tool executor. Mixed string/non-string argument unions retain
the existing raw-string preference. Do not execute unvalidated or partial calls.

## Verification

```powershell
cmake --build build-tests --config Release --target test-llama-archs test-chat test-json-schema-to-grammar --parallel 6
.\build-tests\bin\Release\test-llama-archs.exe -a spark2_5 -s 42
.\build-tests\bin\Release\test-llama-archs.exe -a gemma2 -s 42
.\build-tests\bin\Release\test-chat.exe --template Spark2.5
.\build-tests\bin\Release\test-json-schema-to-grammar.exe
cmake --build build --config Release --target llama-server test-backend-ops --parallel 6
.\build\bin\Release\test-backend-ops.exe test -o GEGLU_ERF -b Vulkan0
```

Use the documented static `build-tests` configuration for Windows internal
tests, and enable `LLAMA_BUILD_TESTS=ON` in the Vulkan `build` configuration for
`test-backend-ops`. Replace `Vulkan0` if the desired device has another name.

Observed results:

- Spark architecture regression: failed with the old activation, passed with exact GELU.
- Gemma2 CPU architecture and save/load roundtrip: passed; existing GELU path unchanged.
- Vulkan GEGLU_ERF: 24/24 F16/F32, split, swapped and strided-view cases passed.
- Spark parser: passed, including byte-prefix streaming accumulation and grammar checks for composed schemas, local references and object/array alternatives.
- C++ schema conversion and new property discovery checks: passed. Optional Python/JavaScript implementations were skipped in this run using `LLAMA_SKIP_TESTS_SLOW_ON_EMULATOR=1`.
- Native API schema probes: `allOf`, `anyOf`, `oneOf`, `$ref` all returned the expected typed payload after the fix.
- Native SSE agent fixture: read/edit/verify/final completed with the default sampling test profile. A separate Spark-profile run failed because the model supplied a nonmatching exact replacement string. No write was performed for that invalid edit. An earlier Spark-profile run with just the GELU fix passed.
- Installed runtime 1.0.2: all nine packaged artifact hashes verified; LM Studio loaded a separate `spark-audit` instance with 32K context and one slot. Its process path resolved to the 1.0.2 engine. The same default-profile SSE agent fixture passed through port 1234 in four turns, including an actual saved edit and verification. The test instance was then unloaded; runtime selection remains 1.0.2.

The agent test uses the existing `scripts/test-lmstudio-agent.mjs` against a local
server. A temporary fixture is not a broad Bionic project benchmark. These runs
do not establish a reliability percentage or a performance comparison.

## Other reports reviewed

- [llama.cpp #28300](https://github.com/ggml-org/llama.cpp/issues/28300), [#28317](https://github.com/ggml-org/llama.cpp/issues/28317), [LM Studio #2378](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/2378): unsupported architecture in older runtimes. Our tree already contains Spark model support; no duplicate architecture patch needed.
- [SGLang #37608](https://github.com/sgl-project/sglang/issues/37608): automatic parser chooses GLM instead of Spark. Our template is handled by the specialized Spark parser; verified by the parser tests, not by changing a SGLang flag in llama.cpp.
- [XHToken #2](https://github.com/XHToken/Spark-X2.5/issues/2): a 1.7B long-context retrieval report on SGLang. Accepting 1M tokens does not prove retrieval quality. Not reproduced on this 4B/Vulkan setup; no speculative RoPE or context patch applied.
- [Reddit model launch discussion](https://www.reddit.com/r/LocalLLaMA/comments/1w4dsrw/new_model_sparkx254b_sparkx2517b/) and [comparison discussion](https://www.reddit.com/r/LocalLLaMA/comments/1wao3d5/xhtokensparkx254b_vs_inclusionailing30tiny_vs/): searched for user reports. These anecdotes are not a reproducible diagnosis of this runtime. No specific Reddit-only patch was justified.

DGX Spark hardware reports about MiMo are not evidence of a bug in XHToken's
Spark-X2.5 model. Runtime 1.0.1's previously reproduced KV-view allocation fix
remains included. No UI cutoffs, forced edits, disabled assertions or training
changes were introduced in this audit. Keep a known-good runtime for rollback.
