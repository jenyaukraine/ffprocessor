// Portable policy prototype. No Bionic internals or conversation text.
export function planContext(sample, previous = {}) {
  const { capacity, promptTokens, reserveTokens = 4096, ttftMs,
    cachedTokens = 0, turn, complexTask = false, compacting = false } = sample;
  for (const [key, value] of Object.entries({capacity,promptTokens,reserveTokens,cachedTokens,turn})) {
    if (!Number.isInteger(value) || value < 0) throw Error(`Invalid ${key}`);
  }
  if (capacity <= reserveTokens + 2048 || cachedTokens > promptTokens) throw Error('Invalid context budget');
  if (ttftMs !== undefined && (!Number.isFinite(ttftMs) || ttftMs < 0)) throw Error('Invalid latency');
  const limit = capacity - reserveTokens;
  const min = Math.min(8192, Math.floor(limit * .5));
  const max = Math.floor(limit * .85);
  let budget = Math.max(min, Math.min(max, previous.budget ?? Math.floor(limit * .65)));
  // Only uncached prefill latency should influence the context budget. Queueing,
  // cold loading and cancellations must be excluded by the caller.
  const measurable = ttftMs !== undefined && promptTokens - cachedTokens >= 2048;
  let slowStreak = measurable && ttftMs > 3000 ? (previous.slowStreak ?? 0) + 1 : 0;
  let fastStreak = measurable && ttftMs < 1000 ? (previous.fastStreak ?? 0) + 1 : 0;
  let reason = 'keep';
  if (slowStreak >= 2) { budget = Math.max(min, Math.floor(budget * .8)); slowStreak = 0; reason = 'slow-prefill'; }
  else if (fastStreak >= 3 && complexTask) { budget = Math.min(max, Math.floor(budget * 1.1)); fastStreak = 0; reason = 'complex-task-headroom'; }
  const overflow = promptTokens >= limit;
  const cooldown = previous.lastCompactionTurn !== undefined && turn - previous.lastCompactionTurn < 3;
  const compact = !compacting && (overflow || (!cooldown && promptTokens >= budget));
  const targetTokens = Math.max(1024, Math.floor(budget * .7));
  return { budget, targetTokens, reserveTokens, compact,
    reason: compact ? (overflow ? 'capacity-safety' : reason === 'keep' ? 'budget-reached' : reason) : reason,
    state: {budget,slowStreak,fastStreak,lastCompactionTurn:previous.lastCompactionTurn} };
}

// Call only after compaction succeeds; a proposal must not consume the cooldown.
export function acknowledgeCompaction(state, turn) {
  if (!Number.isInteger(turn) || turn < 0) throw Error('Invalid turn');
  return {...state,lastCompactionTurn:turn};
}
