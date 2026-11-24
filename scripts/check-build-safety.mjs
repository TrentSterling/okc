#!/usr/bin/env node
// A failed real compiler must preserve the complete prior deployable output.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'okc-build-failure-'));
function snapshot(directory) {
  const files = {};
  function visit(folder) {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else files[path.relative(directory, file)] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  }
  visit(directory);
  return files;
}
try {
  for (const directory of ['scripts', 'src', 'public', 'dist/assets']) {
    fs.mkdirSync(path.join(fixture, directory), {recursive: true});
  }
  for (const file of ['build.mjs', 'build-city-data.py']) {
    fs.copyFileSync(path.join(root, 'scripts', file), path.join(fixture, 'scripts', file));
  }
  fs.writeFileSync(path.join(fixture, 'public/index.html'), '<title>New build</title>');
  fs.writeFileSync(path.join(fixture, 'src/app.js'), '// New source\n');
  fs.writeFileSync(path.join(fixture, 'dist/index.html'), '<title>Known good release</title>');
  fs.writeFileSync(path.join(fixture, 'dist/assets/preserved.bin'), Buffer.from([0,1,255,128,42]));
  const before = snapshot(path.join(fixture, 'dist'));
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], {
    cwd: fixture, env: {...process.env}, encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  assert.notEqual(result.status, 0, 'Missing saved map input must fail the build');
  assert.match(result.stdout, /Building build-city-data.py/, 'The real compiler must be reached after dependency validation');
  assert.match(result.stderr, /okc-map\.osm\.gz/, 'Failure must be the intentionally absent input');
  assert.deepEqual(snapshot(path.join(fixture, 'dist')), before, 'Failed build changed previous output');
  assert.equal(fs.readdirSync(fixture).filter(name => name.startsWith('.build-')).length, 0, 'Failed build left temporary output behind');
  console.log('Build failure preserved every prior output byte and removed temporary staging.');
} finally {
  fs.rmSync(fixture, {recursive: true, force: true});
}
