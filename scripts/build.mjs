#!/usr/bin/env node
// Build only from checked-in inputs. Keep a usable previous dist on failure.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';

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

// Independent metro and downtown compilers use separate output files. Wait for
// both even on failure so no child can write into a removed staging directory.
function runAsync(command,args,env){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});
    let tail='';const collect=chunk=>{tail=(tail+chunk.toString()).slice(-8000);};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.on('error',reject);child.on('close',code=>{
      if(code!==0){if(tail)console.error(tail);reject(Error(`${command} ${args.join(' ')} failed: exit ${code}`));}
      else{if(tail.trim())console.log(tail.slice(-4000).trim());resolve();}
    });
  });
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
  fs.cpSync(path.join(root, 'src'), staging, {recursive: true,filter:file=>!/\.test\.m?js$/.test(file)});
  const env = {...process.env, OKC_BUILD_OUTPUT: staging};
  const downtown=async()=>{
    for(const script of ['build-city-data.py','build-world-surfaces.py']){
      console.log(`Building ${script}`);await runAsync(python,[path.join('scripts',script)],env);
    }
    console.log('Baking static city geometry');await runAsync(process.execPath,['scripts/bake-world-geometry.mjs'],env);
    console.log('Packing equivalent runtime geometry');await runAsync(process.execPath,['scripts/pack-runtime.mjs'],env);
  };
  const metro=async()=>{console.log('Building the expanded metro atlas in parallel');await runAsync(python,['scripts/build-metro.py'],env);};
  const results=await Promise.allSettled([downtown(),metro()]);
  const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
  console.log('Building original capture downloads');
  run(python, ['scripts/build-downloads.py'], env);
  run(process.execPath,['scripts/write-release.mjs'],env);

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
