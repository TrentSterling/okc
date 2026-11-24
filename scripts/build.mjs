#!/usr/bin/env node
// Build only from checked-in inputs. Keep a usable previous dist on failure.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const python = process.env.OKC_PYTHON || 'python3';
const args = process.argv.slice(2);
if (args.length) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Build Prairie Prism from public/, src/, and saved map snapshots.');
    console.log('Install requirements-build.txt first. Set OKC_PYTHON to choose Python.');
    process.exit(0);
  }
  throw new Error(`Unknown build arguments: ${args.join(' ')}`);
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root, env, encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  // Report summaries; never turn a failing build into an asset dump.
  const summary = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (result.error || result.status !== 0) {
    if (summary) console.error(summary.slice(-8000));
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message || `exit ${result.status}`}`);
  }
  if (summary) console.log(summary.slice(-4000));
}

// Check the one external build dependency before touching the previous output.
run(python, ['-c', 'import shapely; assert shapely.__version__ == "2.1.2", "Install requirements-build.txt (Shapely 2.1.2 required)"']);
for (const directory of ['public', 'src']) {
  if (!fs.statSync(path.join(root, directory)).isDirectory()) throw new Error(`Missing ${directory}/`);
}

const staging = fs.mkdtempSync(path.join(root, '.build-'));
const previous = `${staging}-previous`;
let previousMoved = false;
let installed = false;
try {
  fs.cpSync(path.join(root, 'public'), staging, {recursive: true});
  fs.cpSync(path.join(root, 'src'), staging, {recursive: true});
  const env = {...process.env, OKC_BUILD_OUTPUT: staging};
  for (const script of ['build-city-data.py', 'build-world-surfaces.py']) {
    console.log(`Building ${script}`);
    run(python, [path.join('scripts', script)], env);
  }
  console.log('Baking static city geometry');
  run(process.execPath, ['scripts/bake-world-geometry.mjs'], env);
  console.log('Building original capture downloads');
  run(python, ['scripts/build-downloads.py'], env);

  if (fs.existsSync(output)) {
    fs.renameSync(output, previous);
    previousMoved = true;
  }
  fs.renameSync(staging, output);
  installed = true;
  console.log('Built dist/ from source. Existing output was replaced only after the build succeeded.');
} catch (error) {
  if (previousMoved && !installed) fs.renameSync(previous, output);
  throw error;
} finally {
  fs.rmSync(staging, {recursive: true, force: true});
  if (installed) fs.rmSync(previous, {recursive: true, force: true});
}
