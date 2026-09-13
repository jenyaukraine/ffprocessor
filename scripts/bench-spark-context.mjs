import assert from 'node:assert/strict';

const base = new URL(process.argv[2] || 'http://127.0.0.1:8080');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Use a local server');
for (const repetitions of [100, 1000, 3000]) {
    const response = await fetch(new URL('/completion', base), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: 'A local agent reads a file and checks its result.\n'.repeat(repetitions) + '\nContinue the explanation:',
            n_predict: 256, temperature: 0, seed: 42, ignore_eos: true,
            cache_prompt: false, stream: false,
        }),
        signal: AbortSignal.timeout(180_000),
    });
    assert(response.ok, `${response.status}: ${await response.clone().text()}`);
    const result = await response.json();
    assert.equal(result.timings.predicted_n, 256);
    console.log(JSON.stringify({ repetitions, ...result.timings }));
}
