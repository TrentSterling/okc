import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestPacer, retryAfterMilliseconds, retryBackoffMilliseconds} from './request-pacing.mjs';

class FakeClock {
  time = 0;
  timers = [];
  now = () => this.time;
  sleep = (milliseconds, {signal} = {}) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = {at: this.time + milliseconds};
    const remove = () => { this.timers = this.timers.filter(item => item !== timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { remove(); reject(signal.reason); };
    timer.resolve = () => { remove(); resolve(); };
    signal?.addEventListener('abort', abort, {once: true});
    this.timers.push(timer);
  });
  async flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
  async advance(milliseconds) {
    const target = this.time + milliseconds;
    await this.flush();
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const timer = this.timers[0];
      if (!timer || timer.at > target) break;
      this.time = timer.at;
      timer.resolve();
      await this.flush();
    }
    this.time = target;
    await this.flush();
  }
}

function makePacer(clock, options = {}) {
  return createRequestPacer({now: clock.now, sleep: clock.sleep, ...options});
}

test('all workers share one 100ms request-start schedule', async () => {
  const clock = new FakeClock(), pacer = makePacer(clock), starts = [];
  const requests = Array.from({length: 5}, () => pacer.waitForTurn().then(time => starts.push(time)));
  await clock.flush(); assert.deepEqual(starts, [0]);
  await clock.advance(99); assert.deepEqual(starts, [0]);
  await clock.advance(1); assert.deepEqual(starts, [0, 100]);
  await clock.advance(300); await Promise.all(requests);
  assert.deepEqual(starts, [0, 100, 200, 300, 400]);
  assert.throws(() => makePacer(clock, {spacingMilliseconds: 50}), /at least 100/);
});

test('a new cooldown blocks a request that was already sleeping for its turn', async () => {
  const clock = new FakeClock(), pacer = makePacer(clock), starts = [];
  await pacer.waitForTurn();
  const waiting = [pacer.waitForTurn().then(time => starts.push(time)), pacer.waitForTurn().then(time => starts.push(time))];
  await clock.advance(50);
  const cooldown = pacer.rateLimited({attempt: 1, retryAfter: '60'});
  assert.equal(cooldown.cooldownUntil, 60050);
  assert.equal(cooldown.spacingMilliseconds, 200);
  await clock.advance(59999); assert.deepEqual(starts, []);
  await clock.advance(1); assert.deepEqual(starts, [60050]);
  await clock.advance(200); await Promise.all(waiting);
  assert.deepEqual(starts, [60050, 60250]);
});

test('overlapping 429s extend a shared cooldown without repeatedly slowing one wave', async () => {
  const clock = new FakeClock(), pacer = makePacer(clock);
  const first = pacer.rateLimited({attempt: 1, retryAfter: '2'});
  assert.equal(first.waitMilliseconds, 30000, 'the minimum cooldown is 30 seconds');
  await clock.advance(1000);
  const second = pacer.rateLimited({attempt: 1, retryAfter: '90'});
  assert.equal(second.cooldownUntil, 91000);
  assert.equal(second.rateLimitWaves, 1);
  assert.equal(second.spacingMilliseconds, 200);
  assert.equal(pacer.rateLimited({attempt: 1, retryAfter: '0'}).cooldownUntil, 91000, 'a short reply cannot shorten the existing cooldown');
  await clock.advance(90000);
  const third = pacer.rateLimited({attempt: 3});
  assert.equal(third.waitMilliseconds, 120000);
  assert.equal(third.spacingMilliseconds, 400);
  assert.equal(third.rateLimitWaves, 2);
  assert.equal(pacer.rateLimited({attempt: 20}).waitMilliseconds, 300000, 'exponential delay caps at five minutes');
  assert.equal(pacer.rateLimited({attempt: 20, retryAfter: '600'}).waitMilliseconds, 600000, 'a longer server request overrides the cap');
});

test('Retry-After parses seconds and HTTP dates against the supplied clock', () => {
  const now = Date.UTC(2026, 10, 27, 20, 0, 0);
  assert.equal(retryAfterMilliseconds('15', now), 15000);
  assert.equal(retryAfterMilliseconds(' 2.5 ', now), 2500);
  assert.equal(retryAfterMilliseconds('0', now), 0);
  assert.equal(retryAfterMilliseconds(new Date(now + 45000).toUTCString(), now), 45000);
  assert.equal(retryAfterMilliseconds(new Date(now - 1000).toUTCString(), now), 0);
  for (const value of [undefined, null, '', 'not a date', '-3', '+3', 'Infinity']) assert.equal(retryAfterMilliseconds(value, now), 0);
});

test('HTTP date cooldown is global and can exceed the usual backoff cap', () => {
  const clock = new FakeClock(); clock.time = Date.UTC(2026, 10, 27, 20, 0, 0);
  const pacer = makePacer(clock);
  const result = pacer.rateLimited({attempt: 1, retryAfter: new Date(clock.time + 900000).toUTCString()});
  assert.equal(result.waitMilliseconds, 900000);
  assert.equal(result.cooldownUntil, clock.time + 900000);
});

test('permanent failure cancels both sleeping and queued turns without new starts', async () => {
  const clock = new FakeClock(), controller = new AbortController(), pacer = makePacer(clock, {signal: controller.signal});
  const starts = [await pacer.waitForTurn()];
  const pending = Array.from({length: 3}, () => pacer.waitForTurn().then(time => { starts.push(time); return null; }, error => error));
  await clock.flush(); assert.equal(clock.timers.length, 1);
  const failure = new Error('A file exhausted all verification attempts.');
  controller.abort(failure);
  const errors = await Promise.all(pending);
  assert.ok(errors.every(error => error === failure));
  assert.equal(clock.timers.length, 0);
  await clock.advance(1000000); assert.deepEqual(starts, [0]);
});

test('transport and 5xx backoff grows with a bounded maximum', () => {
  assert.deepEqual([1, 2, 3, 4, 8, 100].map(attempt => retryBackoffMilliseconds(attempt)), [1000, 2000, 4000, 8000, 30000, 30000]);
});
