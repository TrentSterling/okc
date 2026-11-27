#!/usr/bin/env node
// Compare every asset, including compressed maps, geometry and photographs.
// File bytes remain inside this process; only counts, hashes and errors are logged.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const base = new URL(process.env.SITE_URL || 'https://tront.xyz/okc/');
const revision = process.env.PAGES_COMMIT;
if (!base.pathname.endsWith('/')) base.pathname += '/';
if (!revision) throw new Error('Set PAGES_COMMIT to the published revision before verifying.');
const release=JSON.parse(fs.readFileSync(path.join(dist,'release.json'),'utf8'));
const files=[...release.assets.map(asset=>path.join(dist,asset.path)),path.join(dist,'release.json')].sort();
const actualFiles=[];
function inventory(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);entry.isDirectory()?inventory(file):actualFiles.push(file);
}}
inventory(dist);actualFiles.sort();
if(JSON.stringify(files)!==JSON.stringify(actualFiles))throw Error('Release inventory is stale. Run write-release.mjs after validation and before artifact upload.');
let verified = 0;
let bytes = 0;
async function check(file) {
  const relative = path.relative(dist, file).split(path.sep).join('/');
  const expected = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const url = new URL(relative, base);
  url.searchParams.set('revision', revision);
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const response = await fetch(url, {headers:{'accept-encoding':'identity'},signal: AbortSignal.timeout(30_000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const hash = createHash('sha256');
      let received = 0;
      for await (const chunk of response.body) { hash.update(chunk); received += chunk.length; }
      const actual = hash.digest('hex');
      if (actual !== expected) throw new Error(`SHA-256 ${actual}, expected ${expected}`);
      verified++;
      bytes += received;
      return;
    } catch (error) {
      if (attempt === 12) throw new Error(`${relative}: ${error.message}`);
      if (attempt === 1) console.log(`Waiting for ${relative}: ${error.message}`);
      await delay(5000);
    }
  }
}
console.log(`Verifying ${files.length} published files against the tested build.`);
let next = 0;
await Promise.all(Array.from({length: Math.min(8, files.length)}, async () => {
  while (next < files.length) await check(files[next++]);
}));
console.log(JSON.stringify({verifiedFiles: verified, verifiedBytes: bytes, revision,sourceRevision:release.sourceRevision,version:release.version,site: base.href}));
