import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Version-specific, reversible configuration of Bionic 1.1.2 build 11.
// Never edit session databases or execute the application bundle here.
const root = process.env.BIONIC_BUNDLE_DIR ?? 'C:/Program Files/Bionic/resources/app/.webpack-bionic';
const apply = process.argv.includes('--apply');
const rules = [
  ['main/index.js', [
    ["'autoCompactionTriggerRatio':0xf/0x10", "'autoCompactionTriggerRatio':0.5", 2],
    ['_0x4f497c*_0x1ac58a', '_0x4f497c*Math.min(_0x1ac58a,0.5)', 1],
    [
      'await _0x34faec[_0x4a9842(0xa401)]();',
      "await _0x34faec[_0x4a9842(0xa401)]({'maxTokens':0x400,'temperature':0.1,'stopStrings':[],'enableThinking':!0x1});",
      1,
    ],
  ]],
  ['renderer/main_window.js', [
    ['autoCompactionTriggerRatio:15/16', 'autoCompactionTriggerRatio:0.5', 1],
  ]],
];

function rewrite(source, replacements) {
  for (const [before, after, count] of replacements) {
    const oldCount = source.split(before).length - 1;
    const newCount = source.split(after).length - 1;
    if (oldCount === 0 && newCount === count) continue;
    assert.equal(oldCount, count, `Unsupported Bionic bundle: ${before}`);
    assert.equal(newCount, 0, 'Partially patched bundle; restore its backup first');
    source = source.replaceAll(before, after);
  }
  return source;
}

const edits = rules.map(([relative, replacements]) => {
  const file = path.join(root, relative);
  const original = fs.readFileSync(file, 'utf8');
  const updated = rewrite(original, replacements);
  new vm.Script(updated, { filename: file });
  assert.equal(rewrite(updated, replacements), updated, 'Patch must be idempotent');
  return { file, original, updated };
});

// Test the actual patched resolver in isolation with a stub model context lookup.
const main = edits[0].updated;
const start = main.indexOf("['resolveContextCompactionTriggerLength']=async function(");
assert.ok(start >= 0, 'Missing compaction resolver');
const end = main.indexOf(",_0x4e0ebb['createContextCompactionSummary']", start);
assert.ok(end > start, 'Missing resolver boundary');
const expression = main.slice(start, end).split('=async function')[1];
const resolver = vm.runInNewContext(`(async function${expression})`, {
  _0x1f4ad8: key => ({ 0x956c: 'push', 0xa65: 'POSITIVE_INFINITY' })[key],
  _0x6815db: async ({ controller }) => controller.contextLength,
});
for (const [length, ratio, absolute, expected] of [
  [65536, 0.9375, undefined, 32768],
  [65536, 0.5, undefined, 32768],
  [32768, 0.9375, undefined, 16384],
  [65536, 0.25, undefined, 16384],
  [65536, 0.5, 8192, 8192],
  [65536, undefined, undefined, Infinity],
  [65536, undefined, 8192, 8192],
]) {
  assert.equal(await resolver({
    autoCompactionTriggerRatio: ratio,
    autoCompactionTriggerLength: absolute,
    controller: { contextLength: length },
    deps: {},
  }), expected);
}
console.log('PASS: bundle syntax, idempotency, 7 actual-resolver checks');

if (apply) {
  const changed = edits.filter(edit => edit.original !== edit.updated);
  // Back up every target before modifying any of them; never replace an old backup.
  for (const edit of changed) {
    const backup = `${edit.file}.ffprocessor-compaction-50.bak`;
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, edit.original, { flag: 'wx' });
  }
  const written = [];
  try {
    for (const edit of changed) {
      written.push(edit);
      fs.writeFileSync(edit.file, edit.updated);
      assert.equal(fs.readFileSync(edit.file, 'utf8'), edit.updated);
    }
  } catch (error) {
    for (const edit of written) fs.writeFileSync(edit.file, edit.original);
    throw error;
  }
  console.log(`Applied ${changed.length} files. Restart Bionic to activate. Session history unchanged.`);
} else {
  console.log('Check only. Pass --apply to set default and maximum enabled ratio to 50%.');
}
