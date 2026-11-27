#!/usr/bin/env node
// Static hosting checks with Node built-ins. Browser/GPU behavior is not tested.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const base = new URL('https://tront.xyz/okc/');
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Deployable assets must not be symbolic links: ' + file);
    if (entry.isDirectory()) walk(file);
    else files.push(file);
  }
}
walk(dist);
const relative = file => path.relative(dist, file).split(path.sep).join('/');
const fileURL = file => new URL(relative(file), base);
const text = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(text(file));
let references = 0;

function localReference(value, from, label, allowExternal = false) {
  if (!value || value.startsWith('#') || /^(data|blob|mailto|tel):/i.test(value)) return null;
  assert.ok(!value.startsWith('//'), 'Protocol-relative runtime URL: ' + label);
  const resolved = new URL(value, from);
  if (resolved.origin !== base.origin) {
    assert.ok(allowExternal, 'External runtime dependency: ' + value + ' in ' + label);
    return null;
  }
  assert.ok(resolved.pathname.startsWith(base.pathname), 'URL escapes /okc/: ' + value + ' in ' + label);
  const suffix = decodeURIComponent(resolved.pathname.slice(base.pathname.length));
  let file = path.resolve(dist, suffix);
  assert.ok(file === dist || file.startsWith(dist + path.sep), 'Asset path escapes dist: ' + value);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  assert.ok(fs.existsSync(file) && fs.statSync(file).isFile(), 'Missing local asset: ' + value + ' in ' + label);
  references++;
  return file;
}

const runtimeModules = new Set();
function visitModule(file, importMap, documentURL) {
  const identity = file + '|' + documentURL.href;
  if (runtimeModules.has(identity)) return;
  runtimeModules.add(identity);
  const source = text(file);
  assert.ok(!/capture-runner|\/api\/capture|OAI-Sites-Authorization|siwc_bypass_bearer_token/.test(source),
            'Private capture bootstrap reachable from public HTML: ' + relative(file));
  const imports = [];
  const staticPattern = /(?:^|\n)\s*(?:import|export)\s+(?:[^'";]+?\s+from\s*)?(['"])([^'"\r\n]+)\1/g;
  const dynamicPattern = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    for (const match of source.matchAll(pattern)) imports.push(match[2]);
  }
  for (const specifier of imports) {
    const isBare = !/^(?:\.{0,2}\/|[a-z][a-z0-9+.-]*:)/i.test(specifier);
    // Import maps also remap normalized relative URLs (the packed runtime data).
    const normalized=new URL(specifier,fileURL(file)).href;
    const mapped = importMap.get(specifier)||[...importMap.entries()].find(([key])=>key.startsWith('.')&&new URL(key,documentURL).href===normalized)?.[1];
    assert.ok(!isBare || mapped, 'Unmapped module import: ' + specifier + ' in ' + relative(file));
    const target = localReference(mapped || specifier, mapped ? documentURL : fileURL(file),
                                  relative(file) + ' import');
    if (target) visitModule(target, importMap, documentURL);
  }
  // Literal fetch URLs resolve against the document, not the module file.
  for (const match of source.matchAll(/\bfetch\s*\(\s*(['"])([^'"]+)\1/g)) {
    localReference(match[2], documentURL, relative(file) + ' fetch');
  }
  for(const match of source.matchAll(/new URL\(\s*(['"])([^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g)){
    const target=localReference(match[2],fileURL(file),relative(file)+' module URL');
    if(target&&/\.m?js$/.test(target))visitModule(target,new Map(),fileURL(file));
  }
}

for (const file of files) {
  const extension = path.extname(file);
  assert.notEqual(path.basename(file).toUpperCase(), 'CNAME', 'Project site must inherit the owner custom domain');
  if (['.html', '.js', '.mjs', '.css', '.json', '.txt'].includes(extension)) {
    assert.ok(!/https?:\/\/[^/\s"'<>]*\.chatgpt\.site/i.test(text(file)),
              'Private Site URL in deployed asset: ' + relative(file));
  }
  if (extension === '.js' || extension === '.mjs') {
    const result = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8', maxBuffer: 32 * 1024});
    const diagnostic = result.error?.code === 'ENOBUFS'
      ? 'Syntax diagnostic exceeded 32 KiB; generated asset contents were omitted.'
      : String(result.stderr || result.error?.message || '').slice(-2000);
    assert.equal(result.status, 0, 'JavaScript syntax failed: ' + relative(file) + '\n' + diagnostic);
  }
  if (extension === '.css') {
    for (const match of text(file).matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
      localReference(match[2].trim(), fileURL(file), relative(file) + ' CSS');
    }
  }
  if (extension !== '.html') continue;
  const source = text(file), documentURL = fileURL(file), importMap = new Map();
  for (const match of source.matchAll(/<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const entries = JSON.parse(match[1]).imports || {};
    for (const [name, destination] of Object.entries(entries)) {
      localReference(destination, documentURL, relative(file) + ' import map');
      importMap.set(name, destination);
    }
  }
  for (const match of source.matchAll(/<(script|link|a|img|source)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase(), attributes = match[2];
    for (const attribute of attributes.matchAll(/\b(?:src|href)\s*=\s*(['"])(.*?)\1/gi)) {
      const allowExternal = tag === 'a' || tag === 'link' && /\brel=["']canonical["']/i.test(attributes);
      const target = localReference(attribute[2], documentURL, relative(file) + ' ' + tag, allowExternal);
      if (tag === 'script' && target && /\btype=["']module["']/i.test(attributes)) {
        visitModule(target, importMap, documentURL);
      }
    }
  }
}
assert.ok(!fs.existsSync(path.join(root, 'CNAME')), 'Do not override the inherited project-site domain');
assert.ok(!fs.existsSync(path.join(dist, 'server', 'index.js')), 'GitHub Pages must not include the capture Worker build');

const galleryFile = path.join(dist, 'gallery', 'shots.json');
const manifest = json(galleryFile);
assert.equal(manifest.shots.length, 29, 'All 29 captures must remain available');
assert.equal(new Set(manifest.shots.map(shot => shot.id)).size, 29, 'Duplicate capture IDs');
const {SHOT_PRESETS, SHOT_BY_ID, REFLECTION_SHOT_PRESETS, STREET_SHOT_PRESETS} = await import(pathToFileURL(path.join(dist, 'capture-presets.js')));
const current = manifest.shots.filter(shot => shot.id.startsWith('v02-'));
assert.equal(current.length, 10);
assert.equal(SHOT_PRESETS.length, 10);
assert.deepEqual(current.map(shot => shot.viewId).sort(), SHOT_PRESETS.map(shot => shot.id).sort(),
                 'Current gallery links must match the live camera presets');
for (const study of REFLECTION_SHOT_PRESETS) {
  assert.equal(SHOT_BY_ID.get(study.id), study, 'Optical study must be addressable by its live URL');
  assert.equal(study.state.exposure, 1.08, 'Optical comparisons keep exposure fixed');
  assert.equal(study.state.screen, false, 'Optical comparisons exclude the crown display');
  assert.ok(!manifest.shots.some(shot => shot.viewId === study.id), 'Do not label an old photograph as a new optical study');
  assert.ok(text(path.join(dist, 'app', 'settings-view.js')).includes("'" + study.id + "'"), 'Live optical study must be available in the GPU viewpoint control');
}
assert.equal(STREET_SHOT_PRESETS.length,3);
for(const study of STREET_SHOT_PRESETS){
  assert.equal(SHOT_BY_ID.get(study.id),study);
  assert.equal(study.state.driving,false);
  assert.equal(study.state.screen,false);
  assert.equal(study.state.exposure,.95);
  assert.ok(!manifest.shots.some(shot=>shot.viewId===study.id),'Street studies must not reuse an older capture as a new image');
  assert.ok(text(path.join(dist,'app','settings-view.js')).includes("'"+study.id+"'"),'Street study must remain in the GPU viewpoint control');
}
for (const shot of manifest.shots) {
  assert.ok(/^[a-z0-9-]+$/.test(shot.id), 'Unsafe capture ID');
  assert.ok(shot.id.startsWith('v02-') || shot.viewId === null, 'Archived images must not claim an exact live replay');
  const png = localReference(shot.src, fileURL(galleryFile), shot.id + ' PNG');
  const thumbnail = localReference(shot.thumb, fileURL(galleryFile), shot.id + ' thumbnail');
  assert.ok(png && thumbnail, 'Capture and thumbnail paths are required: ' + shot.id);
  const header = fs.readFileSync(png).subarray(0, 24);
  assert.ok(header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Invalid PNG: ' + shot.id);
  assert.equal(header.readUInt32BE(16), shot.width, 'Wrong PNG width: ' + shot.id);
  assert.equal(header.readUInt32BE(20), shot.height, 'Wrong PNG height: ' + shot.id);
  const webp = fs.readFileSync(thumbnail).subarray(0, 12);
  assert.equal(webp.toString('ascii', 0, 4), 'RIFF', 'Invalid thumbnail: ' + shot.id);
  assert.equal(webp.toString('ascii', 8, 12), 'WEBP', 'Invalid thumbnail: ' + shot.id);
  if (shot.viewId) localReference('../?view=' + encodeURIComponent(shot.viewId), fileURL(galleryFile), shot.id + ' live view');
}

const notice = text(path.join(dist, 'geo', 'NOTICE.txt'));
assert.match(notice, /OpenStreetMap/);
assert.match(notice, /ODbL/);
assert.match(notice, /City of Oklahoma City/);
assert.match(text(path.join(dist, 'vendor', 'THREE-LICENSE.txt')), /Permission is hereby granted/);
const provenance = json(path.join(dist, 'geo', 'provenance.json'));
assert.ok(provenance.footprints?.url && provenance.streetsAndContext?.copyrightURL, 'Source attribution URLs missing');
for (const filename of ['okc-map.osm.gz', 'okc-buildings-source.geojson.gz']) {
  const source = fs.readFileSync(path.join(root, 'scripts', 'data', filename));
  assert.equal(source.readUInt16BE(0), 0x1f8b, 'Geographic source archive missing or invalid: ' + filename);
}
if (fs.existsSync(path.join(dist, 'world-surfaces.js'))) {
  const {WORLD_SURFACES} = await import(pathToFileURL(path.join(dist, 'world-surfaces.js')));
  const hash = createHash('sha256').update(fs.readFileSync(path.join(dist, 'city-data.js'))).digest('hex');
  assert.equal(WORLD_SURFACES.cityDataSha256, hash, 'Compiled surface geometry is stale');
  if(WORLD_SURFACES.customLandmarkSha256){
    const customHash=createHash('sha256').update(fs.readFileSync(path.join(dist,'geo/custom-landmark-volumes.json'))).digest('hex');
    assert.equal(WORLD_SURFACES.customLandmarkSha256,customHash,'Custom landmark exclusions are stale');
  }
}
if(fs.existsSync(path.join(dist,'world-meshes.js'))){
  const {BAKED_WORLD}=await import(pathToFileURL(path.join(dist,'world-meshes.js')));
  const hash=createHash('sha256').update(fs.readFileSync(path.join(dist,'world-surfaces.js'))).digest('hex');
  assert.equal(BAKED_WORLD.worldSurfacesSha256,hash,'Baked static meshes are stale');
}
const packs = spawnSync('python3', [path.join(root, 'scripts', 'build-downloads.py'), '--check'], {encoding: 'utf8'});
assert.equal(packs.status, 0, 'Build or refresh the capture archives first:\n' + packs.stderr);
console.log(JSON.stringify({
  baseURL: base.href, javascriptFiles: files.filter(file => /\.m?js$/.test(file)).length,
  reachableModuleContexts: runtimeModules.size, localReferences: references,
  captures: manifest.shots.length, currentPresetLinks: current.length,
  capturePacks: 2, licensesAndSourcesPresent: true, privateCaptureBootstrap: false,
  scope: 'Static files, literal module/asset paths, capture metadata, and download integrity; no browser/GPU test.'
}, null, 2));
