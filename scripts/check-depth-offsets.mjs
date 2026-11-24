#!/usr/bin/env node
// Material-state regression. Native pixel test is check-depth-offsets-gles.py.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerThree} from './lib/register-three.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
registerThree(root);
const THREE=await import('three');
const {configureDepthOffsets}=await import('../src/app/renderer.js');
const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry();
const road=new THREE.MeshStandardMaterial({polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
const crown=new THREE.ShaderMaterial({polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
const recess=new THREE.MeshStandardMaterial({polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:3});
const plain=new THREE.MeshStandardMaterial();
scene.add(new THREE.Mesh(geometry,road),new THREE.Mesh(geometry,road),new THREE.Mesh(geometry,[crown,recess,plain]));
const snapshot=()=>[road,crown,recess].map(m=>[m.polygonOffsetFactor,m.polygonOffsetUnits]);
const authored=[[-1,-2],[-2,-2],[2,3]];
assert.equal(configureDepthOffsets(scene,false),3);
assert.deepEqual(snapshot(),authored);
assert.equal(configureDepthOffsets(scene,true),3);
assert.deepEqual(snapshot(),[[1,2],[2,2],[-2,-3]]);
configureDepthOffsets(scene,true);
assert.deepEqual(snapshot(),[[1,2],[2,2],[-2,-3]],'Repeated configuration must not invert again.');
configureDepthOffsets(scene,false);
assert.deepEqual(snapshot(),authored,'Switching modes must restore authored intent.');
assert.equal(plain.polygonOffset,false);
const late=new THREE.MeshStandardMaterial({polygonOffset:true,polygonOffsetFactor:-.5,polygonOffsetUnits:-1});
scene.add(new THREE.Mesh(geometry,late));
assert.equal(configureDepthOffsets(scene,true),4);
assert.deepEqual([late.polygonOffsetFactor,late.polygonOffsetUnits],[.5,1]);
assert.deepEqual(snapshot(),[[1,2],[2,2],[-2,-3]]);

// v0.5 already performed one scene-wide sign inversion. This test preserves
// that behavior and makes repeated configuration safe; it is not evidence of
// a previously missing reversed-depth correction.
const report={passed:true,uniqueMaterials:4,sharedMaterialDeduplicated:true,arraysCovered:true,
  repeatedConfigurationSafe:true,depthModeRestorationSafe:true,lateMaterialCovered:true,
  roadPaint:{ordinary:authored[0],reversed:snapshot()[0]},
  note:'v0.5 already inverted offsets at startup. This is regression coverage and idempotent state binding, not a claimed old sign defect.'};
const outputIndex=process.argv.indexOf('--output');
if(outputIndex>=0){const output=path.resolve(process.argv[outputIndex+1]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
