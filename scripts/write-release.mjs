// An exact inventory makes compressed geometry, map tiles and images verifiable.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.OKC_BUILD_OUTPUT||path.join(root,'dist');
const files=[];
function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);if(entry.isDirectory())walk(file);
  else if(entry.name!=='release.json')files.push(file);
}}
walk(out);files.sort();
const assets=files.map(file=>{const bytes=fs.readFileSync(file);return {path:path.relative(out,file).split(path.sep).join('/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};});
const manifest=JSON.parse(fs.readFileSync(path.join(out,'geo/metro/manifest.json'),'utf8'));
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
let revision=process.env.GITHUB_SHA||null;try{revision??=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
const release={version,sourceRevision:revision,counts:manifest.counts,totalBytes:assets.reduce((n,a)=>n+a.bytes,0),assets};
fs.writeFileSync(path.join(out,'release.json'),JSON.stringify(release)+'\n');
console.log(JSON.stringify({version,sourceRevision:revision,assets:assets.length,totalBytes:release.totalBytes}));
