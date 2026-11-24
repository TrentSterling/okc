#!/usr/bin/env node
// Keep editable source reviewable and generated payloads out of future commits.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const maxSourceBytes = 64 * 1024;
const generated = ['city-data.js', 'world-surfaces.js', 'world-meshes.js',
  'geo/provenance.json', 'geo/surface-audit.json', 'geo/world-mesh-audit.json'];
const errors = [];
const inspected = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file).split(path.sep).join('/');
    // These are preserved upstream libraries and compressed geographic inputs,
    // not editable application modules. PNGs/WebPs are not read as text either.
    if (relative === 'public/vendor' || relative === 'scripts/data' || entry.name === '__pycache__') continue;
    if (entry.isDirectory()) { visit(file); continue; }
    if (!/\.(?:js|mjs|py|json|html|css)$/.test(entry.name)) continue;
    const bytes = fs.statSync(file).size;
    inspected.push({file: relative, bytes});
    if (bytes > maxSourceBytes) {
      errors.push(`${relative} is ${bytes} bytes; split editable code or move generated data into the build (limit ${maxSourceBytes}).`);
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    if (/[A-Za-z0-9+/]{8192}/.test(text)) errors.push(`${relative} contains a large encoded payload; generate it during build.`);
  }
}

for (const directory of ['src', 'public', 'scripts']) visit(path.join(root, directory));
for (const directory of ['src', 'public']) {
  for (const file of generated) {
    if (fs.existsSync(path.join(root, directory, file))) errors.push(`${directory}/${file} is generated; keep it only in dist/.`);
  }
}

const repo = spawnSync('git', ['rev-parse', '--show-toplevel'], {cwd: root, encoding: 'utf8'});
let checkedGitIndex = false;
if (repo.status === 0 && path.resolve(repo.stdout.trim()) === root) {
  const tracked = spawnSync('git', ['ls-files', '-z', '--', 'dist', '.build-*', 'node_modules', 'qa'], {
    cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  if (tracked.error || tracked.status !== 0) throw new Error('Could not check the Git index for generated files.');
  const files = tracked.stdout.split('\0').filter(Boolean);
  if (files.length) errors.push(`${files.length} generated/runtime files remain tracked (${files.slice(0,4).join(', ')}). Keep deployment output out of source commits.`);
  checkedGitIndex = true;
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const largest = inspected.sort((a,b) => b.bytes-a.bytes).slice(0,5);
console.log(JSON.stringify({sourceFilesChecked: inspected.length, maxSourceBytes, checkedGitIndex, largest}, null, 2));
