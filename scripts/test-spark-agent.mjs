import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// This test executes only read_file/edit_file against one temporary fixture.
const base = new URL(process.argv[2] || 'http://127.0.0.1:8080');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Use a local server');
const cwd = await mkdtemp(path.join(tmpdir(), 'spark-agent-test-'));
const fixture = path.join(cwd, 'settings.json');
await writeFile(fixture, '{"max_retries":7,"keep":"unchanged"}\n');
console.log(`Fixture: ${fixture}`);

async function request(route, body, headers = {}) {
    const response = await fetch(new URL(route, base), {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
    });
    assert(response.ok, `${route}: ${response.status} ${response.ok ? '' : await response.text()}`);
    return response;
}

async function completion(messages, tools, thinking, budget = 256) {
    const started = performance.now();
    const response = await request('/v1/chat/completions', {
        messages, tools, stream: true, temperature: 0, seed: 42, max_tokens: 1024,
        reasoning_format: 'deepseek', reasoning_budget_tokens: budget,
        chat_template_kwargs: { enable_thinking: thinking },
    });
    const message = { role: 'assistant', content: '', reasoning_content: '' };
    const calls = [];
    let buffer = '', finish, done = false, chunks = 0, firstChunkMs;
    const decoder = new TextDecoder();
    for await (const bytes of response.body) {
        buffer += decoder.decode(bytes, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, end).trimEnd();
            buffer = buffer.slice(end + 1);
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6);
            if (payload === '[DONE]') { done = true; continue; }
            const event = JSON.parse(payload);
            assert(!event.error, JSON.stringify(event.error));
            const choice = event.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta || {};
            if (delta.content || delta.reasoning_content || delta.tool_calls?.length) {
                chunks++;
                firstChunkMs ??= Math.round(performance.now() - started);
            }
            message.content += delta.content || '';
            message.reasoning_content += delta.reasoning_content || '';
            for (const call of delta.tool_calls || []) {
                const accumulated = calls[call.index] ??= {
                    id: '', type: 'function', function: { name: '', arguments: '' },
                };
                if (call.id) accumulated.id = call.id;
                if (call.function?.name) accumulated.function.name += call.function.name;
                accumulated.function.arguments += call.function?.arguments || '';
            }
            if (choice.finish_reason) finish = choice.finish_reason;
        }
    }
    assert(done, 'SSE ended without [DONE]');
    assert.notEqual(finish, 'length', 'Generation exhausted max_tokens');
    assert(chunks > 1, 'Expected incremental streaming, not one buffered response');
    assert(!/<tool_call>|<think>|<\uff5cend/.test(message.content), 'Protocol tags leaked into content');
    let reasoningTokens = 0;
    if (thinking) {
        const tokenized = await (await request('/tokenize', { content: message.reasoning_content })).json();
        reasoningTokens = tokenized.tokens.length;
        assert(reasoningTokens <= budget + 64, `Reasoning budget exceeded: ${reasoningTokens}`);
    }
    if (calls.length) {
        assert.equal(finish, 'tool_calls');
        message.tool_calls = calls;
    }
    console.log(JSON.stringify({ thinking, budget, reasoningTokens, finish, chunks, firstChunkMs, elapsedMs: Math.round(performance.now() - started), tools: calls.map(c => c.function.name) }));
    return message;
}

for (const thinking of [false, true]) {
    const reply = await completion([{ role: 'user', content: 'Write the numbers 1 through 30, separated by spaces.' }], undefined, thinking);
    assert(reply.content.includes('30'), 'Missing final answer');
}
// A one-token budget exercises forced closure without asking for an unbounded answer.
const bounded = await completion([{ role: 'user', content: 'What is 17 times 23? Answer with the number only.' }], undefined, true, 1);
assert(bounded.content.trim(), 'Reasoning budget left no final answer');

const listing = await (await request('/tools')).json();
const tools = listing.filter(t => ['read_file', 'edit_file'].includes(t.tool)).map(t => t.definition);
assert.equal(tools.length, 2, 'Start llama-server with --agent');
for (const range of [{ start_line: 4, end_line: 2 }, { start_line: 0 }, { start_line: 9 }]) {
    const result = await (await request('/tools', { tool: 'read_file', params: { path: fixture, ...range } })).json();
    assert(result.error, `Invalid line range silently accepted: ${JSON.stringify(range)}`);
}
const messages = [
    { role: 'system', content: `You are a local coding agent. Use tools to make the requested change, not just describe it. Read before editing and read back to verify. Working directory: ${cwd}` },
    { role: 'user', content: 'In settings.json change max_retries to 2. Preserve every other setting. Verify the saved file and report the result.' },
];
let edits = 0, readsAfterEdit = 0, finished = false;
for (let turn = 0; turn < 8; turn++) {
    const reply = await completion(messages, tools, true);
    messages.push(reply);
    if (!reply.tool_calls?.length) { finished = true; break; }
    for (const call of reply.tool_calls) {
        assert(['read_file', 'edit_file'].includes(call.function.name));
        const params = JSON.parse(call.function.arguments);
        assert.equal(path.resolve(cwd, params.path), fixture, 'Tool tried to access outside fixture');
        const result = await (await request('/tools', { tool: call.function.name, params }, { 'x-tool-cwd': cwd })).json();
        assert(!result.error, JSON.stringify(result));
        if (call.function.name === 'edit_file') edits++;
        if (call.function.name === 'read_file' && edits) readsAfterEdit++;
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
}
assert(finished, 'Agent did not finish within 8 turns');
assert(edits > 0, 'Agent only talked; no edit_file call');
assert(readsAfterEdit > 0, 'Agent did not verify the saved file');
assert.deepEqual(JSON.parse(await readFile(fixture, 'utf8')), { max_retries: 2, keep: 'unchanged' });

// Exercise nested JSON string escaping, not just a numeric setting replacement.
const codeFixture = path.join(cwd, 'example.php');
const oldCode = 'function load() {\n\treturn "C:\\project\\file.php";\n}\n';
const newCode = 'function load() {\n\treturn ["path" => "C:\\project\\file.php", "message" => "quoted \\\"value\\\""];\n}\n';
await writeFile(codeFixture, '<?php\n' + oldCode + '// keep unchanged\n');
const codeReply = await completion([
    { role: 'system', content: 'Call edit_file once with exactly the supplied path and replacement strings. Do not describe the change or run other tools.' },
    { role: 'user', content: `Apply this exact replacement: ${JSON.stringify({ path: codeFixture, edits: [{ old_text: oldCode, new_text: newCode }] })}` },
], tools.filter(t => t.function.name === 'edit_file'), true);
assert.equal(codeReply.tool_calls?.length, 1, 'Expected one code edit');
const codeCall = codeReply.tool_calls[0];
assert.equal(codeCall.function.name, 'edit_file');
const codeParams = JSON.parse(codeCall.function.arguments);
assert.equal(path.resolve(cwd, codeParams.path), codeFixture, 'Tool tried to access outside code fixture');
assert.equal(codeParams.edits.length, 1, 'Expected one replacement');
const codeResult = await (await request('/tools', { tool: 'edit_file', params: codeParams }, { 'x-tool-cwd': cwd })).json();
assert(!codeResult.error, JSON.stringify(codeResult));
assert.equal(await readFile(codeFixture, 'utf8'), '<?php\n' + newCode + '// keep unchanged\n');
console.log('PASS: streaming, bounded reasoning, multi-turn tool replay, actual edit/read-back, multiline code escaping');
