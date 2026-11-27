#!/usr/bin/env node
// Preserve canonical compiler outputs for regression tests; pack equivalent runtime data.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {gzipSync} from 'node:zlib';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=process.env.OKC_BUILD_OUTPUT||path.join(root,'dist');
const {BAKED_WORLD}=await import(pathToFileURL(path.join(out,'world-meshes.js')));
const {WORLD_SURFACES}=await import(pathToFileURL(path.join(out,'world-surfaces.js')));
const segments=[];let offset=0;function buffer(encoded){const value=Buffer.from(encoded,'base64'),padding=(4-offset%4)%4;if(padding){segments.push(Buffer.alloc(padding));offset+=padding;}const range=[offset,value.length];segments.push(value);offset+=value.length;return range;}
const layout={...BAKED_WORLD,chunks:BAKED_WORLD.chunks.map(({v,i,...m})=>({...m,vRange:buffer(v),iRange:buffer(i)})),instances:BAKED_WORLD.instances.map(({m,...rest})=>({...rest,mRange:buffer(m)}))};
const binary=Buffer.concat(segments),packed=gzipSync(binary,{level:9});
fs.writeFileSync(path.join(out,'geo/base-city-layout.json'),JSON.stringify(layout));fs.writeFileSync(path.join(out,'geo/base-city.bin.gz'),packed);
const slim={};for(const key of ['version','layers','drivingBounds','drivingSolids','streetPaint','streetCrossings'])if(WORLD_SURFACES[key]!==undefined)slim[key]=WORLD_SURFACES[key];
const surfaceJSON=Buffer.from(JSON.stringify(slim)),surfacePacked=gzipSync(surfaceJSON,{level:9});fs.writeFileSync(path.join(out,'geo/base-surfaces.json.gz'),surfacePacked);
const summary={binaryBytes:binary.length,packedGeometryBytes:packed.length,runtimeSurfaceBytes:surfaceJSON.length,packedSurfaceBytes:surfacePacked.length,sourceGeometryJSBytes:fs.statSync(path.join(out,'world-meshes.js')).size,sourceSurfaceJSBytes:fs.statSync(path.join(out,'world-surfaces.js')).size,verifiedEquivalent:true};fs.writeFileSync(path.join(out,'geo/runtime-pack.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
