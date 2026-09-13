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
- The Windows launcher enables reasoning with a 512-token budget per step and returns
  it separately in `reasoning_content`.
- Streaming tool names with shared prefixes are not published prematurely.
  A tool-call opener also ends reasoning when the model omits `</think>`.
- Invalid read_file line ranges return actionable errors, not empty successes.

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
scripts\run-spark-agent.cmd "C:\models\Spark-X2.5-4B-Q4_K_M.gguf" "D:\my-project"
```

This profile was tested on the RX 7900 XTX; it is not a requirement. The
total context is shared between slots. Larger histories and parallel requests
can reduce responsiveness. Keep the server on loopback when using local tools.
`SPARK_REASONING_BUDGET` overrides the launcher's 512-token reasoning budget.
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
F16 KV cache, 256 generated tokens, seed 42, temperature 0, no prompt reuse:

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
conditional reminder to act on the user's request or report findings. After 16,
the UI asks whether to continue exploration. This checkpoint runs only after a
whole tool batch has returned, so a batch can exceed the threshold. Successful
non-inspection tools and manual continuation reset the counter; failed edits do
not. This is not semantic proof of progress (a shell command can just read files),
and legitimate reviews may also reach the checkpoint. It never forces an edit.
These policies apply to this Web UI, not external API clients such as Penguin.
Rebuild the UI and embedded server, then reload the browser to activate them.

Agent turns default to 4,096 completion tokens when the UI has no positive limit
configured (including its previous unlimited setting). An explicit positive
limit is respected. A streamed agent turn ending with `finish_reason=length`
does not execute its possibly incomplete tool calls. The UI allows one retry
asking for a smaller complete action; a second truncated turn stops with an error.
This total budget includes reasoning and answer/tool output; it does not replace
the server's separate reasoning budget.

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

No LM Studio A/B benchmark has been run. Passing the API smoke test does not
establish parity with LM Studio or reliable autonomous project maintenance.
The first full Web UI test during this change exposed malformed edit arguments
and a subsequent history replay failure, despite the API smoke passing. This
motivated the pre-execution argument check and bounded retry described above.
The subsequent completed Web UI run changed `max_retries` from 2 to 3, preserved
the other field and reread the file in 14 seconds. It still made three unnecessary
shell calls before the read/edit/read sequence. The unit suite now has 703 passing
tests; type checking and targeted lint checks also pass. These checks cover the
new limits and rejection paths, not a claim that exploration is always optimal.

### Checks

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
