import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://127.0.0.1:1234';
const model = process.argv[3] ?? 'spark-x2.5-4b';
const prompts = [
  'Reply with exactly OK.',
  'This is a synthetic context-cache test line. '.repeat(1600) + ' Reply OK.',
  'What is 2 plus 2? Reply briefly.',
  'Return the single word READY.',
  'Reply with exactly OK.',
];

for (const [index, prompt] of prompts.entries()) {
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }],
      max_tokens: 512, temperature: 0, stream: true }),
    signal: AbortSignal.timeout(120_000),
  });
  assert.ok(response.ok, `Request ${index + 1}: HTTP ${response.status}`);
  let pending = '';
  let content = '';
  let finish;
  let done = false;
  let chunks = 0;
  const decoder = new TextDecoder();
  for await (const bytes of response.body) {
    pending += decoder.decode(bytes, { stream: true });
    let newline;
    while ((newline = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, newline).trim();
      pending = pending.slice(newline + 1);
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') { done = true; continue; }
      const event = JSON.parse(payload);
      assert.ok(!event.error, JSON.stringify(event.error));
      const choice = event.choices?.[0];
      content += choice?.delta?.content ?? '';
      finish = choice?.finish_reason ?? finish;
      chunks++;
    }
  }
  assert.ok(done, 'Missing SSE completion marker');
  assert.ok(chunks > 1, 'Missing incremental SSE events');
  // This regression checks transport/cache survival, not the model's reasoning length.
  assert.ok(['stop', 'length'].includes(finish), `Request ${index + 1}: invalid termination`);
  if (finish === 'stop') assert.ok(content.trim(), 'Missing final content');
  console.log(JSON.stringify({ request: index + 1, chunks, finish, content: content.slice(0, 160) }));
}
console.log('PASS: sequential SSE/cache survival (not an agent-quality test)');
