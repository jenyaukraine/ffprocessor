import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:1234');
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Local servers only');
const model = process.argv[3] ?? 'spark-x2.5-4b';
const profile = process.argv[4] ?? 'spark';
assert(['spark', 'default'].includes(profile), 'Profile must be spark or default');
const sampling = profile === 'spark'
  ? { temperature: 1, top_k: 0, top_p: 0.95, min_p: 0, repeat_penalty: 1 }
  : { temperature: 0.8, top_k: 40, top_p: 0.95, min_p: 0.05, repeat_penalty: 1.1 };
const dir = await mkdtemp(path.join(tmpdir(), 'spark-lms-agent-'));
const fixture = path.join(dir, 'settings.json');
await writeFile(fixture, '{"max_retries":7,"keep":"unchanged"}\n');
console.log(JSON.stringify({ fixture, profile, sampling }));

const tools = [
  { name: 'read_file', description: 'Read settings.json.', parameters: {
    type: 'object', properties: { path: { type: 'string' } }, required: ['path'],
  } },
  { name: 'edit_file', description: 'Replace one exact string in settings.json.', parameters: {
    type: 'object', properties: { path: { type: 'string' },
      old_text: { type: 'string' }, new_text: { type: 'string' } },
    required: ['path', 'old_text', 'new_text'],
  } },
  { name: 'verify_settings', description: 'Run regression checks on the saved settings.json.', parameters: {
    type: 'object', properties: {}, additionalProperties: false,
  } },
].map(fn => ({ type: 'function', function: fn }));
const messages = [
  { role: 'system', content: `You are a coding agent. Work only on ${fixture}. Read it, apply the requested edit using edit_file, then run verify_settings and report its result. Never claim an action without its successful tool result.` },
  { role: 'user', content: 'Change max_retries to 2 in settings.json, preserve everything else, and verify the saved result.' },
];
let reads = 0, edits = 0, verified = false, finished = false, reasoningSeen = false;
for (let turn = 1; turn <= 6; turn++) {
  const started = performance.now();
  const response = await fetch(new URL('/v1/chat/completions', base), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, tools, ...sampling, seed: 42,
      stream: true, max_tokens: 4096, parallel_tool_calls: false,
      chat_template_kwargs: { enable_thinking: true } }),
    signal: AbortSignal.timeout(180_000),
  });
  assert(response.ok, `HTTP ${response.status}: ${response.ok ? '' : await response.text()}`);
  const reply = { role: 'assistant', content: '', reasoning_content: '' };
  const calls = [];
  const decoder = new TextDecoder();
  let pending = '', finish, done = false, deltas = 0, firstDeltaMs;
  for await (const bytes of response.body) {
    pending += decoder.decode(bytes, { stream: true });
    let newline;
    while ((newline = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, newline).trimEnd();
      pending = pending.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trimStart();
      if (payload === '[DONE]') { done = true; continue; }
      const event = JSON.parse(payload);
      assert(!event.error, JSON.stringify(event.error));
      const choice = event.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      if (delta.content || delta.reasoning_content || delta.tool_calls?.length) {
        deltas++;
        firstDeltaMs ??= Math.round(performance.now() - started);
      }
      reply.content += delta.content ?? '';
      reply.reasoning_content += delta.reasoning_content ?? '';
      for (const call of delta.tool_calls ?? []) {
        assert(Number.isInteger(call.index) && call.index >= 0 && call.index < 16);
        const accumulated = calls[call.index] ??= {
          id: '', type: 'function', function: { name: '', arguments: '' },
        };
        if (call.id) accumulated.id = call.id;
        accumulated.function.name += call.function?.name ?? '';
        accumulated.function.arguments += call.function?.arguments ?? '';
      }
      finish = choice.finish_reason ?? finish;
    }
  }
  console.log(JSON.stringify({ turn, finish, deltas, firstDeltaMs,
    elapsedMs: Math.round(performance.now() - started),
    reasoningChars: reply.reasoning_content.length,
    contentChars: reply.content.length, tools: calls.map(c => c.function.name) }));
  assert(done, 'Missing SSE [DONE]');
  assert(deltas > 1, 'Response was not incremental');
  reasoningSeen ||= reply.reasoning_content.length > 0;
  assert.notEqual(finish, 'length', 'Completion exhausted its test budget; no tools executed');
  assert(!/<\/?think>|<tool_call>/.test(reply.content), 'Protocol tags leaked into content');
  if (!calls.length) {
    assert.equal(finish, 'stop');
    assert(reply.content.trim(), 'Missing final answer');
    finished = true;
    break;
  }
  assert.equal(finish, 'tool_calls');
  // Validate the whole batch before any write. Never repair incomplete model arguments.
  const validated = Array.from(calls, call => {
    assert(call?.id && tools.some(t => t.function.name === call.function.name), 'Unknown tool');
    const args = JSON.parse(call.function.arguments);
    assert(args && typeof args === 'object' && !Array.isArray(args), 'Arguments must be an object');
    if (call.function.name !== 'verify_settings') {
      assert.equal(typeof args.path, 'string');
      assert.equal(path.resolve(dir, args.path), fixture, 'Path outside fixture');
    }
    if (call.function.name === 'edit_file') {
      assert.equal(typeof args.old_text, 'string');
      assert(args.old_text.length > 0);
      assert.equal(typeof args.new_text, 'string');
    }
    return { call, args };
  });
  reply.tool_calls = calls;
  messages.push(reply);
  for (const { call, args } of validated) {
    let result;
    if (call.function.name === 'read_file') {
      result = { content: await readFile(fixture, 'utf8') };
      reads++;
    } else if (call.function.name === 'edit_file') {
      assert(reads > 0, 'Edit without reading');
      const old = await readFile(fixture, 'utf8');
      assert.equal(old.split(args.old_text).length, 2, 'Replacement must match exactly once');
      const updated = old.replace(args.old_text, () => args.new_text);
      assert.deepEqual(JSON.parse(updated), { max_retries: 2, keep: 'unchanged' });
      await writeFile(fixture, updated);
      edits++;
      verified = false;
      result = { success: true, path: fixture };
    } else {
      assert(edits > 0, 'Verification before edit');
      assert.deepEqual(JSON.parse(await readFile(fixture, 'utf8')), { max_retries: 2, keep: 'unchanged' });
      verified = true;
      result = { passed: true, checks: ['max_retries is 2', 'keep is unchanged'] };
    }
    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
  }
}
assert(finished && reads > 0 && edits > 0 && verified, 'Agent did not finish read/edit/verify');
assert(reasoningSeen, 'No separate reasoning was returned; reasoning replay was not exercised');
console.log('PASS: LM Studio API streamed reasoning, tool replay, real edit, verification and final answer. Not a Bionic UI quality benchmark.');
