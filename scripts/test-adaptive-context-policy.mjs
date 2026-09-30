import assert from 'node:assert/strict';
import {planContext,acknowledgeCompaction} from './adaptive-context-policy.mjs';
const sample={capacity:32768,promptTokens:16000,turn:1};
const normal=planContext(sample);
assert.equal(normal.compact,false);
const first=planContext({...sample,ttftMs:4000});
const second=planContext({...sample,ttftMs:4000,turn:2},first.state);
assert.ok(second.budget<normal.budget);
assert.equal(second.compact,true);
assert.equal(second.reason,'slow-prefill');
const acknowledged=acknowledgeCompaction(second.state,2);
assert.equal(planContext({...sample,turn:3},acknowledged).compact,false);
assert.equal(planContext({...sample,promptTokens:30000,turn:3},acknowledged).compact,true);
assert.equal(planContext({...sample,promptTokens:30000,turn:3,compacting:true},acknowledged).compact,false);
let state=normal.state;
for(let turn=2;turn<=4;turn++)state=planContext({...sample,turn,ttftMs:500,complexTask:true},state).state;
assert.ok(state.budget>normal.budget);
assert.equal(planContext({...sample,ttftMs:9000,cachedTokens:15900},first.state).budget,first.budget);
for(const capacity of [8192,16384,32768,65536]) {
  let state={};
  for(let turn=0;turn<100;turn++){
    const result=planContext({capacity,promptTokens:capacity-4097,turn,ttftMs:10000},state);
    assert.ok(result.budget<=capacity-4096);
    assert.ok(result.targetTokens<result.budget);
    state=result.state;
  }
}
assert.throws(()=>planContext({...sample,cachedTokens:17000}));
assert.throws(()=>planContext({...sample,capacity:4096}));
console.log('PASS: adaptation, cache filtering, safety reserve, cooldown, successful compaction acknowledgment and budget bounds');
