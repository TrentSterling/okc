import {setTimeout as delay} from 'node:timers/promises';

/** Retry-After accepts delay seconds or an HTTP date. Past/invalid values add no delay. */
export function retryAfterMilliseconds(value, now = Date.now()) {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const milliseconds = Number(text) * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : 0;
  }
  if (!text || /^[-+]\d/.test(text)) return 0;
  const deadline = Date.parse(text);
  return Number.isFinite(deadline) ? Math.max(0, deadline - now) : 0;
}

export function retryBackoffMilliseconds(attempt, {minimum = 1000, maximum = 30000} = {}) {
  return Math.min(maximum, minimum * 2 ** Math.min(30, Math.max(0, attempt - 1)));
}

/**
 * Every worker takes its turn through this same gate. A sleeper rechecks the
 * current cooldown after waking, so a later 429 also stops already queued work.
 * Time and sleep are injectable for deterministic tests; there is no network here.
 */
export function createRequestPacer({
  spacingMilliseconds = 100,
  maximumSpacingMilliseconds = 1000,
  now = () => Date.now(),
  sleep = (milliseconds, {signal} = {}) => delay(milliseconds, undefined, {signal}),
  signal,
} = {}) {
  if (!Number.isFinite(spacingMilliseconds) || spacingMilliseconds < 100) throw new Error('Public verification spacing must be at least 100 ms.');
  let spacing = spacingMilliseconds, nextStart = -Infinity, cooldownUntil = 0, rateLimitWaves = 0;
  let tail = Promise.resolve();
  const state = () => ({spacingMilliseconds: spacing, cooldownUntil, rateLimitWaves});
  function throwIfAborted() {
    if (signal?.aborted) throw signal.reason || Object.assign(new Error('Verification cancelled.'), {name: 'AbortError'});
  }
  function waitForTurn() {
    const turn = tail.then(async () => {
      for (;;) {
        throwIfAborted();
        const wait = Math.max(nextStart, cooldownUntil) - now();
        if (wait <= 0) break;
        await sleep(wait, {signal});
      }
      throwIfAborted();
      const startedAt = now();
      nextStart = startedAt + spacing;
      return startedAt;
    });
    // Keep the serialization chain usable when one queued consumer is cancelled.
    tail = turn.catch(() => {});
    return turn;
  }
  function rateLimited({attempt = 1, retryAfter} = {}) {
    const observedAt = now();
    const backoff = retryBackoffMilliseconds(attempt, {minimum: 30000, maximum: 300000});
    const duration = Math.max(backoff, retryAfterMilliseconds(retryAfter, observedAt));
    // Three simultaneous in-flight responses are one rate-limit wave, not three
    // independent pace doublings. Every response can still extend the deadline.
    if (observedAt >= cooldownUntil) {
      rateLimitWaves++;
      spacing = Math.max(spacing, Math.min(maximumSpacingMilliseconds, spacing * 2));
    }
    cooldownUntil = Math.max(cooldownUntil, observedAt + duration);
    return {...state(), waitMilliseconds: Math.max(0, cooldownUntil - observedAt)};
  }
  return {waitForTurn, rateLimited, state};
}
