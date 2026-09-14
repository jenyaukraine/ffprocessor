# ffprocessor: Spark X2.5 local agent

This fork is based on llama.cpp commit
`3ad1ba7336986d98592d3e28cafd1a406715351f` (b10828).
It uses the existing llama.cpp Web UI. PenguinHarness is optional.

## Changes

- A specialized Spark X2.5 parser separates reasoning and native tagged tool
  calls, and supports incremental chat output.
- Turn-end markers are consumed instead of appearing in the answer.
- Built-in file/shell tool descriptions encourage targeted edits and validation.
- The built-in Web UI adds a coding protocol to agent conversations.
  This protocol does not change prompts sent by external clients such as Penguin.
- Tool-call reasoning is retained in chat requests and cache pre-encoding even
  when ordinary reasoning is excluded from context. Existing missing reasoning
  is not fabricated or recovered from another conversation.
- The Windows launcher enables reasoning and returns it separately in
  `reasoning_content`. Forced reasoning closure is disabled by default.
- Streaming tool names with shared prefixes are not published prematurely.
  A tool-call opener also ends reasoning when the model omits `</think>`.
- Invalid read_file line ranges return actionable errors, not empty successes.
- Spark's native C++ grammar constrains non-string tagged arguments with their
  JSON schemas. Nested `edit_file.edits` values must contain properly escaped
  JSON strings; malformed code payloads are prevented during generation rather
  than repaired after generation. Raw top-level string arguments remain literal.

These are integration changes, not new model weights or a guarantee of agent
quality. Review file changes and test results before accepting them.

## Build on Windows

Install Git, Visual Studio 2022 Build Tools with Desktop development with C++,
CMake, Node.js 24 with npm, and the Vulkan SDK. Vulkan was used for the tested
AMD Radeon RX 7900 XTX setup. Other backends are covered in [build.md](build.md).

From a Developer Command Prompt for VS 2022:

```bat
git clone https://github.com/jenyaukraine/ffprocessor.git
cd ffprocessor
git switch main
cmake -S . -B build -A x64 -DGGML_VULKAN=ON -DLLAMA_BUILD_UI=ON -DLLAMA_USE_PREBUILT_UI=OFF
cmake --build build --config Release --target llama-server test-chat-template
build\bin\Release\test-chat-template.exe --stop-on-first-fail
cmake -S . -B build-tests -A x64 -DBUILD_SHARED_LIBS=OFF -DGGML_VULKAN=OFF -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF
cmake --build build-tests --config Release --target test-chat
build-tests\bin\Release\test-chat.exe --template Spark2.5
```

`LLAMA_BUILD_UI=ON` builds this fork's UI from source. Disabling prebuilt UI
downloads avoids silently using the upstream UI without our coding protocol.
For UI development, run `npm ci`, `npm run check`, and `npm run build` in
`tools/ui`, then rebuild the server. A local `tools/ui/dist` takes precedence
over CMake's automatic UI build, so rebuild that directory after UI edits.

## Install as an LM Studio / Bionic runtime

Build the Windows Vulkan shared-library Release target above first. Install the
official `llama.cpp-win-x86_64-vulkan-avx2` runtime version `2.37.0` through the
application's runtime manager. Then run from this repository in PowerShell:

```powershell
.\scripts\install-lmstudio-runtime.ps1
& "$HOME\.lmstudio\bin\lms.exe" runtime select ffprocessor-spark-win-x86_64-vulkan-avx2@1.0.1
& "$HOME\.lmstudio\bin\lms.exe" load spark-x2.5-4b --gpu max --context-length 32768 --parallel 1 --identifier spark-x2.5 -y
```

Unload an already-loaded Spark instance before loading it with the new runtime.
Use `lms ps` to find its identifier and `lms unload <identifier>` to unload it.
The model key in the example must match a model reported by `lms ls`.

The runtime appears as **FFProcessor Spark (Vulkan) 1.0.1**. It is installed at
`$HOME/.lmstudio/extensions/backends/ffprocessor-spark-win-x86_64-vulkan-avx2-1.0.1`.
The inference executable is `ffprocessor/llama-server.exe` inside that directory.
The installer copies our server and its matching DLLs into that isolated
subdirectory. Stock host bindings and their DLLs stay together in the runtime
root; the original stock runtime directory is not modified. This relies on the
installed application's `engine_protocol_server` support and is not a published
or officially supported LM Studio extension.

`ffprocessor-build.json` records the repository HEAD and binary SHA-256 hashes.
Build before installation: the installer copies existing binaries; it does not
prove that they correspond to HEAD or rebuild them. Git contains the installer
and instructions, not the GGUF, proprietary host bindings, or compiled DLLs.
The stock runtime must be obtained separately on each machine.

Optional installer parameters: `-LmStudioHome`, `-BuildDirectory`, `-BaseRuntime`,
and `-Version`. Defaults do not contain a machine-specific username or checkout
path. Existing custom versions are never overwritten; install subsequent builds
with a new version and select that exact version.

To return to the stock runtime, unload the model and run:

```powershell
& "$HOME\.lmstudio\bin\lms.exe" runtime select llama.cpp-win-x86_64-vulkan-avx2@2.37.0
```

Verified locally: Spark load with 32K context and full GPU offload, the running
executable path, binary hashes matching the local build, and an SSE tool call
with valid JSON through `http://127.0.0.1:1234/v1/chat/completions`.
This does not validate autonomous project refactoring. Native parser changes
apply, but our built-in Web UI's agent loop and context management do not run
inside the LM Studio/Bionic interface.

### Runtime 1.0.1: large-context cache crash

Version 1.0.0 can abort with `tensor not allocated` in `ggml_backend_tensor_get`
when Vulkan buffer splitting leaves trailing KV views uninitialized. Bionic
reports this as `Engine protocol ngPredictTokens request failed: fetch failed`.
It was reproduced with Auto load (550912 context, 4 slots) on the second distinct
request, while short single-slot smoke tests passed.

Version 1.0.1 initializes remaining views after context buffer allocation. It
does not remove allocation assertions, skip KV tensors, or disable prompt cache.
The diagnosis is also described in upstream [PR #25584](https://github.com/ggml-org/llama.cpp/pull/25584).
Our focused allocator regression fails before the change and passes afterward;
all 15 `test-alloc` cases pass. The same Auto/4-slot runtime completed five
sequential requests, including a 16020-token prompt and revisiting an earlier
prompt, without exiting. To run the regression after building:

```powershell
.\build\bin\Release\test-alloc.exe
node scripts/test-lmstudio-runtime.mjs http://127.0.0.1:1234 spark-x2.5-4b
```

Load the model with Auto and four slots before the API regression to exercise
the large-buffer path. Do not run it alongside a live coding task. A smaller
manually configured context is still preferable when the task does not need
Auto's large context allocation.
The API regression bounds each prediction and accepts a clean `length` finish;
it tests process/stream survival, not whether reasoning reliably ends or code
changes are correct. Each actual finish reason is printed.

## Run the built-in Web UI

Download your Spark X2.5 GGUF separately; model files are not in this repository.
Use the model's embedded chat template. Specify your own absolute paths:

```bat
scripts\run-spark-agent.cmd "C:\models\Spark-X2.5-4B-Q4_K_M.gguf" "D:\my-project"
```

Open <http://127.0.0.1:8080/>. Start a new conversation, set its working directory
to your project, and check that file/shell tools are enabled in the tools menu.
The server stays in the terminal; Ctrl+C stops it. Existing services on port 8080
are not stopped automatically.

The launcher defaults to one slot and 65536 context tokens. Adjust for your GPU:

```bat
set SPARK_CTX=131072
set SPARK_PARALLEL=1
set SPARK_FLASH_ATTN=on
set SPARK_UBATCH=1024
scripts\run-spark-agent.cmd "C:\models\Spark-X2.5-4B-Q4_K_M.gguf" "D:\my-project"
```

This profile was tested on the RX 7900 XTX; it is not a requirement. The
total context is shared between slots. Larger histories and parallel requests
can reduce responsiveness. Keep the server on loopback when using local tools.
`SPARK_REASONING_BUDGET` optionally sets a reasoning budget; the default `-1`
lets reasoning finish naturally. The former 512-token default was too aggressive
for project-level requests and has been removed. Without a reasoning budget,
reasoning can be long; configured completion/context limits still apply.
An explicit reasoning effort in a client can override the server default.
Use a new chat for evaluation so old failed plans do not dominate the history.

## Optional: PenguinHarness 0.2.11

Configure a model ID and a base URL separately. Do not put the URL in the model
ID field, and do not point this server's client at LM Studio's port 1234.

```bat
penguin config model add --project-id default_project --provider custom --model-id spark-x2.5 --client-type openai-chat --base-url http://127.0.0.1:8080/v1 --api-key local --context-window 65536 --max-tokens 8192 --no-vision --set-default
set "PENGUIN_SHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
penguin web
```

`local` is a placeholder for an unauthenticated loopback server, not a secret.
Set `PENGUIN_SHELL` before starting Penguin and restart an existing Penguin
server so it inherits that setting. Use PowerShell-compatible commands; Windows
PowerShell 5.1 does not support `&&` or `||`. Set Penguin's context window no
higher than one server slot. Select this model in a new chat; old chats may keep
their previous model. Project config, credentials, histories, and local paths
from the development machine are not included in this fork.

## Validation and limits

### Native Vulkan profile (2026-09-14)

The native Release build uses Vulkan with compiler optimization enabled and
Vulkan validation/debug instrumentation disabled. No extra API proxy is required:
clients use `/v1/chat/completions` with SSE streaming and standard `tool_calls`.
The client executes tool calls and returns tool results; a completion endpoint
alone is not an autonomous coding agent.

Direct `/completion` measurements on RX 7900 XTX, Spark X2.5 4B Q4_K_M,
F16 KV cache, microbatch 512, 256 generated tokens, seed 42, temperature 0,
no prompt reuse:

| Prompt tokens | 400000 context / 3 slots / FA auto | 131072 context / 1 slot / FA on |
| --- | ---: | ---: |
| 1205 | 161.05 tokens/s | 164.04 tokens/s |
| 12005 | 129.61 tokens/s | 146.97 tokens/s |
| 36005 | 92.20 tokens/s | 125.24 tokens/s |

Windows process GPU counters changed from 16.08 to 7.37 GiB dedicated memory
and 0.90 to 0.18 GiB shared memory. These counters are not proof of paging.
The new profile retains roughly the old per-slot context but serves one request
at a time. Other browser requests occurred between measurements; these are
single-run decode timings, not isolated repeated benchmarks or end-to-end agent
throughput. The profile changes multiple settings, so it does not isolate the
effect of any single setting. No new inference-kernel optimization was made.
Longer contexts still slow generation; 300 useful output tokens/s is not achieved.

Reproduce with an idle server using the profile above:

```bat
node scripts\bench-spark-context.mjs http://127.0.0.1:8080
```

#### Batch tuning

Additional native `llama-bench` runs stopped the server to avoid competing GPU
inference. Flash attention, F16 KV, batch 2048 and 8 CPU threads were unchanged.
The first two configurations used three repetitions, the last used five:

| Microbatch | Prompt processing, 4096 tokens | Generation, empty starting context |
| --- | ---: | ---: |
| 512 | 4034.92 +/- 11.55 tokens/s | 197.61 +/- 0.62 tokens/s |
| 1024 | 4189.64 +/- 6.06 tokens/s | 195.53 +/- 0.39 tokens/s |
| 2048 | 4140.38 +/- 9.00 tokens/s | 195.01 +/- 1.58 tokens/s |

Four CPU threads and `GGML_VK_MAX_NODES_PER_SUBMIT=500` did not produce a useful
overall gain and were not retained. The tested profile above uses microbatch
1024 for a modest prefill improvement, not faster answer generation. The portable
launcher retains 512 unless `SPARK_UBATCH` is set, for smaller-memory machines.
The model weights and cache precision were not changed.

With microbatch 1024 the direct server test measured 164.32, 147.91 and 125.42
decode tokens/s at 1205, 12005 and 36005 prompt tokens. At 36005 tokens, prefill
took 13.11 seconds versus 13.51 with microbatch 512. Process GPU counters read
7.62 GiB dedicated and 0.34 GiB shared memory. This is a small prefill gain,
not evidence that filling free VRAM improves decoding. The streaming and real
read/edit/read smoke test passed again.

Reproduce the batch comparison with other GPU inference stopped:

```bat
cmake --build build --config Release --target llama-bench
build\bin\Release\llama-bench.exe -m "C:\models\Spark-X2.5-4B-Q4_K_M.gguf" -ngl 999 -fa on -p 4096 -n 256 -b 2048 -ub 512,1024,2048 -t 8 -r 5 -o json
```

### Web UI context and exploration guard

The bundled Web UI now projects read/search/get_info results into a smaller
request context. Each text-only result is capped at 16,000 characters, retaining
its beginning and end with an explicit omission notice. Above 64,000 characters
of these results, older entries are shortened to 1,000 characters toward a
32,000-character target. The latest four results remain protected from this
second pass. These are character-based soft limits, not a tokenizer or a hard
limit on the entire conversation. Large user messages, reasoning, shell output,
and multimodal results can still fill the context.

Full results remain in saved chat history. Tool-call IDs, arguments and reasoning
replay remain intact; omitted text must be reread before editing it. No automatic
claim that a file is correct is generated. The same projection is used for normal
requests and KV pre-encoding. Changing an older prompt prefix can require some
prefill again; this does not change model weights or guarantee higher tokens/s.

After eight consecutive built-in inspection calls, the agent receives a
conditional reminder to act on the user's request or report findings. This is
advisory only: there is no automatic pause after 16 reads. Successful non-inspection
tools and manual continuation reset the counter; failed edits do not. This is
not semantic proof of progress (a shell command can just read files). It never
forces an edit. The user's configured agent turn limit remains in effect.
These policies apply to this Web UI, not external API clients such as Penguin.
Rebuild the UI and embedded server, then reload the browser to activate them.

Agent turns respect the configured completion limit, including the server default
or an explicit unlimited setting. The hidden 4,096-token override has been removed.
A streamed agent turn ending with `finish_reason=length`
does not execute its possibly incomplete tool calls. The UI allows one retry
asking for a smaller complete action; a second truncated turn stops with an error.
This total budget includes reasoning and answer/tool output; it does not replace
the server's separate reasoning budget. A reasoning-only response is labelled
`No final response`, not `Cancelled`: absence of answer text does not establish
that the user cancelled the generation.

Malformed tool arguments are rejected before any call in the batch is executed
or stored as a replayable tool call. The UI reports the rejection and allows one
automatic retry per flow; a second malformed batch stops with an error. Arguments
are never silently repaired or used to guess a file edit.

### LM Studio comparison (2026-09-14)

This is a comparison with the public LM Studio TypeScript SDK, not an audit of
the complete desktop application or its model-specific native runtime. The
inspected SDK revision was `c47dce0d37a3008d3e4c393e40452825a2a9790b`.

- [act.ts](https://github.com/lmstudio-ai/lmstudio-js/blob/c47dce0d37a3008d3e4c393e40452825a2a9790b/packages/lms-client/src/llm/act.ts)
  validates tool parameters, executes tools sequentially by default, appends
  ordered results to history and exposes prediction-round limits. Our loop has
  corresponding sequencing and limits, but does not implement the SDK's full
  tool-schema validation and callback surface. The SDK may execute a completed
  tool request while generation continues; our UI waits for the full turn.
- [LLMPredictionConfig.ts](https://github.com/lmstudio-ai/lmstudio-js/blob/c47dce0d37a3008d3e4c393e40452825a2a9790b/packages/lms-shared-types/src/llm/LLMPredictionConfig.ts)
  separates total completion and reasoning budgets, and exposes `stopAtLimit`,
  `truncateMiddle` and `rollingWindow` context policies. Our read-result excerpts
  are a narrower policy, not equivalent whole-conversation context management.
- The public SDK's `act` loop appends tool outputs; it does not automatically
  decide a file is correct and remove its contents from history.
- [Spark's official README](https://github.com/XHToken/Spark-X2.5)
  documents LM Studio deployment and names coding harness integrations; it does
  not establish this fork's Web UI as the reference coding harness.

No broad LM Studio A/B benchmark has been run. Passing the API smoke test does not
establish parity with LM Studio or reliable autonomous project maintenance.
The first full Web UI test during this change exposed malformed edit arguments
and a subsequent history replay failure, despite the API smoke passing. This
motivated the pre-execution argument check and bounded retry described above.
The subsequent completed Web UI run changed `max_retries` from 2 to 3, preserved
the other field and reread the file in 14 seconds. It still made three unnecessary
shell calls before the read/edit/read sequence. The unit suite now has 696 passing
tests; type checking and targeted lint checks also pass. These checks cover the
new limits and rejection paths, not a claim that exploration is always optimal.

### Checks

The Spark parser regression includes multiline code with quotes, tabs and
backslashes, with incremental parsing checked at every UTF-8-safe prefix. Negative
grammar tests reject literal newlines inside JSON strings, unescaped quotes,
wrong nested value types and missing required nested fields. The old grammar
accepted the literal-newline case; the corrected grammar rejects it. This fixes
a demonstrated parser constraint gap, not every possible model/tool failure.
The API smoke additionally applies a multiline PHP replacement to a temporary
fixture and compares the saved bytes, including unchanged surrounding content.

With the server running on the same machine, from the repository root:

```bat
node scripts\test-spark-agent.mjs
cd tools\ui
npm ci
npm run check
npm run test:unit -- --run
```

The live smoke test uses only read_file/edit_file on one new temporary JSON
file, checks streaming with reasoning on and off, checks 1- and 256-token reasoning
budget, rejects invalid line ranges, and requires a real edit followed by
read-back. It exits nonzero when the agent only describes a change. No arbitrary
model-generated shell commands are executed. The fixture is left for inspection.
This tests the API/tool loop; the UI replay unit tests cover request serialization.

An initial idle-server smoke run passed in about 5.5 seconds, including two text
requests and the read/edit/read/final sequence. All 680 Web UI unit tests
passed, as did the Spark parser and chat-template regression tests.
The rebuilt Web UI also performed and verified an actual file edit, but took
unnecessary shell/search steps first. These fixes do not eliminate all inefficient
model decisions. A reasoning budget limits the reasoning block, not answer length
or the number of tool calls; shortening it can also reduce answer quality.

The local integration was exercised with streamed text, streamed tool calls,
and a Penguin task that read, repaired, and tested a small JavaScript module.
That task passed seven tests and 1953 independent pagination input combinations.
This is a smoke test, not a broad agent benchmark.

Short direct generation measured about 167-170 tokens/s on the tested RX 7900
XTX setup. The agent task reported about 116 output tokens/s including reasoning
and took about 80 seconds. These are different measurements, neither a promise
of 300 useful answer tokens/s nor a guarantee for another machine.

The reasoning replay investigation was informed by
[OmniRoute issue 2637](https://github.com/diegosouzapw/OmniRoute/issues/2637).
That issue concerns a different integration and model family; this fork fixes
the locally verified Spark parser and Web UI paths, not OmniRoute itself.

### LM Studio Agent Replay Check (2026-09-14)

The cache-survival script is not an agent test. The separate script below requires
a complete streamed read/edit/verify/final cycle through LM Studio's API. It keeps
`reasoning_content` in assistant history, validates tool batches before execution,
and only reads/writes one temporary JSON fixture. It never executes generated code
or shell commands. A truncated completion is a failure, not a passing smoke test.

```bat
node scripts\test-lmstudio-agent.mjs http://127.0.0.1:1234 spark-x2.5-4b spark
node scripts\test-lmstudio-agent.mjs http://127.0.0.1:1234 spark-x2.5-4b default
```

The `spark` profile uses temperature 1, top-p 0.95, disabled top-k/min-p and repeat
penalty 1, based on the [authors' example](https://github.com/XHToken/Spark-X2.5).
The `default` profile uses the observed local client values: temperature 0.8,
top-k 40, top-p 0.95, min-p 0.05 and repeat penalty 1.1. These options affect only
the test requests; the script does not change Bionic's saved settings.

Both profiles completed four turns on runtime 1.0.1. The first profile's initial
request included a long startup/wait interval, so these runs are not a throughput
comparison. The native `/apply-template` check also preserved reasoning, a tool
call and its result across an additional user turn. These findings do not prove
that Bionic replays all history correctly or that broad refactoring is reliable.

In the desktop client, a combined edit-and-test request continued planning without
an edit until interrupted. A subsequent explicit single-edit request actually
changed the helper and finished in 44 seconds. Independent checks passed eight
input cases, alias identity and focused TypeScript checking. That is evidence of
working editing, not a fix for open-ended agent planning.

For broad project work, [focused project instructions](spark-project-instructions.md)
provide a small-change workflow without a forced read-count limit or artificial
reasoning terminator. They are guidance, not a guarantee. Merge them into the
target project and ensure the client loads them on the next turn.

A subsequent local failure was a client configuration conflict: total response
length was limited to 810 tokens while the reasoning budget was 2048 tokens.
The native slot confirmed `max_tokens=810`, and the saved assistant turn contained
810 tokens of unfinished reasoning with no final answer. Check **Limit Response
Length** in the model's defaults before changing parsers. A finite total budget
must leave room for reasoning AND the answer/tool arguments (for example, 16384
total with 2048 reasoning). Disabling that total cap is also supported, but allows
long output; it is not a cure for repetitive reasoning. Do not silently force a
different budget in the backend.

After removal of the 810-token cap and loading the project instructions, the
desktop client created a focused `node:test` file, ran it and reported its result.
All ten cases passed on an independent rerun. This was a narrowly specified task
in an existing long conversation, not an autonomous full-project refactor.

Native measurements with 256 output tokens, no thinking and no concurrent
generation: 171.7 tokens/s on a 37-token prompt; 131.2 tokens/s on a 29738-token
prompt. The latter took 10.40 seconds to process its uncached input. Repeating it
reused 29737 cached tokens, reducing total elapsed time from 12.48 to 2.09 seconds,
while decode speed remained 131.7 tokens/s. These are synthetic generation tests,
not useful-code throughput or Bionic task completion times.
