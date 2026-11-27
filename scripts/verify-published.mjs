#!/usr/bin/env node
// Compare every asset, including compressed maps, geometry and photographs.
// File bytes remain inside this process; only counts, hashes and errors are logged.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createRequestPacer, retryAfterMilliseconds, retryBackoffMilliseconds} from './lib/request-pacing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const base = new URL(process.env.SITE_URL || 'https://tront.xyz/okc/');
const revision = process.env.PAGES_COMMIT;
if (!base.pathname.endsWith('/')) base.pathname += '/';
if (!revision) throw new Error('Set PAGES_COMMIT to the published revision before verifying.');
const release = JSON.parse(fs.readFileSync(path.join(dist, 'release.json'), 'utf8'));
const files = [...release.assets.map(asset => path.join(dist, asset.path)), path.join(dist, 'release.json')].sort();
const actualFiles = [];
function inventory(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    entry.isDirectory() ? inventory(file) : actualFiles.push(file);
  }
}
inventory(dist); actualFiles.sort();
if (JSON.stringify(files) !== JSON.stringify(actualFiles)) throw Error('Release inventory is stale. Run write-release.mjs after validation and before artifact upload.');

const shutdown = new AbortController();
const pacer = createRequestPacer({signal: shutdown.signal});
const maximumAttempts = 12, concurrency = 3, startedAt = Date.now();
let verified = 0, bytes = 0, retries = 0, next = 0, failure = null;

function stop(error) {
  if (!failure) { failure = error; shutdown.abort(error); }
  return failure;
}
function requestLifetime() {
  const controller = new AbortController();
  const abort = () => controller.abort(shutdown.signal.reason);
  shutdown.signal.addEventListener('abort', abort, {once: true});
  if (shutdown.signal.aborted) abort();
  const timer = setTimeout(() => controller.abort(Object.assign(new Error('Request timed out after 30 seconds.'), {name: 'TimeoutError'})), 30000);
  return {signal: controller.signal, dispose() { clearTimeout(timer); shutdown.signal.removeEventListener('abort', abort); }};
}
function progress() {
  console.log(`Verified ${verified}/${files.length} files (${(100 * verified / files.length).toFixed(1)}%), ${(bytes / 1048576).toFixed(1)} MiB; ${retries} retries; shared start spacing ${pacer.state().spacingMilliseconds} ms; elapsed ${Math.round((Date.now() - startedAt) / 1000)} s.`);
}
async function check(file) {
  const relative = path.relative(dist, file).split(path.sep).join('/');
  const expected = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const url = new URL(relative, base);
  url.searchParams.set('revision', revision);
  for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
    let response, lifetime;
    try {
      await pacer.waitForTurn();
      lifetime = requestLifetime();
      response = await fetch(url, {headers: {'accept-encoding': 'identity'}, signal: lifetime.signal});
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        error.retryAfter = response.headers.get('retry-after');
        throw error;
      }
      const hash = createHash('sha256');
      let received = 0;
      if (response.body) for await (const chunk of response.body) { hash.update(chunk); received += chunk.length; }
      const actual = hash.digest('hex');
      if (actual !== expected) throw new Error(`SHA-256 ${actual}, expected ${expected}`);
      verified++;
      bytes += received;
      if (verified % 250 === 0 || verified === files.length) progress();
      return;
    } catch (error) {
      const permanentHttpError = error.status >= 400 && error.status < 500 && ![404, 408, 429].includes(error.status);
      if (!shutdown.signal.aborted && (permanentHttpError || attempt === maximumAttempts)) {
        const reason = permanentHttpError ? 'nonretryable response' : `exhausted ${maximumAttempts} attempts`;
        stop(new Error(`${relative}: ${reason}; ${error.message}`, {cause: error}));
      }
      // Publish a new cooldown before any asynchronous body cleanup, so a
      // waiting peer cannot start while this response is being released.
      const cooldown = !shutdown.signal.aborted && error.status === 429
        ? pacer.rateLimited({attempt, retryAfter: error.retryAfter}) : null;
      // A non-success HTTP response can still own a streaming body/socket.
      // Release it before pausing or starting a retry.
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
      lifetime?.dispose();
      lifetime = null;
      if (shutdown.signal.aborted) throw shutdown.signal.reason || error;
      retries++;
      if (cooldown) {
        console.log(`HTTP 429 for ${relative}, attempt ${attempt}/${maximumAttempts}: all requests paused until ${new Date(cooldown.cooldownUntil).toISOString()} (${Math.ceil(cooldown.waitMilliseconds / 1000)} s); shared start spacing ${cooldown.spacingMilliseconds} ms.`);
        // The next iteration joins the same global cooldown as every other file.
      } else {
        const wait = Math.max(retryBackoffMilliseconds(attempt), retryAfterMilliseconds(error.retryAfter));
        console.log(`Retry ${attempt}/${maximumAttempts} for ${relative} after ${Math.ceil(wait / 1000)} s: ${error.message}`);
        await delay(wait, undefined, {signal: shutdown.signal});
      }
    } finally { lifetime?.dispose(); }
  }
}

console.log(`Verifying all ${files.length} published files against the tested build; ${concurrency} workers, at most 10 request starts/second.`);
await Promise.all(Array.from({length: Math.min(concurrency, files.length)}, async () => {
  try {
    while (!shutdown.signal.aborted && next < files.length) await check(files[next++]);
  } catch (error) {
    stop(error);
  }
}));
if (failure) throw failure;
if (verified !== files.length) throw new Error(`Verification stopped after ${verified}/${files.length} files.`);
console.log(JSON.stringify({verifiedFiles: verified, verifiedBytes: bytes, revision, sourceRevision: release.sourceRevision,
  version: release.version, site: base.href, retries, pacing: pacer.state(), elapsedSeconds: Math.round((Date.now() - startedAt) / 1000)}));
