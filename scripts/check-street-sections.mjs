#!/usr/bin/env node
// Independent polygon checks cover the compiled sections and actual runtime
// marking plan, including the old untested Reno/parking paint path.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerThree} from './lib/register-three.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.env.OKC_BUILD_OUTPUT||path.join(root,'dist'));
registerThree(root);
const {CITY_DATA}=await import(pathToFileURL(path.join(output,'city-data.js')).href);
const {WORLD_SURFACES}=await import(pathToFileURL(path.join(output,'world-surfaces.js')).href);
const {buildRoadMarkings}=await import(pathToFileURL(path.join(output,'world/road-markings.js')).href);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'okc-street-check-'));
try {
  const filename=path.join(temporary,'sections.json');
  fs.writeFileSync(filename,JSON.stringify({city:CITY_DATA,world:WORLD_SURFACES,
    extraPaint:buildRoadMarkings(CITY_DATA.roads)}));
  const result=spawnSync(process.env.OKC_PYTHON||'python3',[path.join(root,'scripts/check-street-sections.py'),filename],
    {encoding:'utf8',maxBuffer:64*1024,timeout:90000});
  if(result.stdout)console.log(result.stdout.trim().slice(-10000));
  if(result.status!==0)throw new Error(`Street geometry checks failed: ${(result.stderr||result.error?.message||'see summary').slice(-4000)}`);
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
