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
set SPARK_CTX=400000
set SPARK_PARALLEL=3
scripts\run-spark-agent.cmd "C:\models\Spark-X2.5-4B-Q4_K_M.gguf" "D:\my-project"
```

That larger configuration was tested locally; it is not a requirement. The
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

With the server running on the same machine, from the repository root:

```bat
node scripts\test-spark-agent.mjs
cd tools\ui
npm ci
npm run check
npm run test:unit -- --run
```

The live smoke test uses only read_file/edit_file on one new temporary JSON
file, checks streaming with reasoning on and off, checks a 256-token reasoning
budget, rejects invalid line ranges, and requires a real edit followed by
read-back. It exits nonzero when the agent only describes a change. No arbitrary
model-generated shell commands are executed. The fixture is left for inspection.
This tests the API/tool loop; the UI replay unit tests cover request serialization.

On the development machine, this smoke test passed in about 5.5 seconds, including
two text requests and the read/edit/read/final sequence. All 680 Web UI unit tests
passed, as did the Spark parser and chat-template regression tests.

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
