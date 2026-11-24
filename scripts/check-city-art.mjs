#!/usr/bin/env node
// Check actual built placement/marking exports. Shapely independently validates
// complete polygons, including concavities and holes; no GPU/Canvas required.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerThree} from './lib/register-three.mjs';

const root=process.argv[2]?path.resolve(process.argv[2]):path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
registerThree(root);
const built=name=>import(pathToFileURL(path.join(root,'dist',name)).href);
const [THREE,{CITY_DATA},{WORLD_SURFACES},{planStreetDressing,addStreetDressing},{addPlanting},
  {buildRoadMarkings},{footprintFits,footprintsOverlap},{createDrivingWorld,isDrivingPoseClear}]=await Promise.all([
  built('vendor/three.module.js'),built('city-data.js'),built('world-surfaces.js'),built('world/street-dressing.js'),
  built('world/planting.js'),built('world/road-markings.js'),built('world/placement.js'),built('driving.js'),
]);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same=(a,b,message)=>assert.equal(digest(a),digest(b),message);
const finite=values=>values.every(Number.isFinite);
// Texture painting is irrelevant to geometry. No native Canvas package is
// needed in CI; actual Three BufferGeometry and transforms are retained.
const context=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},
  {get:(object,key)=>key in object?object[key]:(()=>{}),set:(object,key,value)=>(object[key]=value,true)});
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>context})};

function transformedBounds(min,max,position,scale,yaw=0) {
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(...scale));
  const points=[];
  for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]]) {
    const p=new THREE.Vector3(x,y,z).applyMatrix4(matrix);points.push(p.toArray());
  }
  assert.ok(points.every(finite),'Rendered prop bounds must be finite');
  return {points:points.map(p=>[p[0],p[2]]),bottom:Math.min(...points.map(p=>p[1])),top:Math.max(...points.map(p=>p[1]))};
}

function captureDressing(seed) {
  const parts=[],material=new THREE.MeshStandardMaterial();
  const plan=addStreetDressing({seed,materials:{wood:material,darkSteel:material,steel:material},
    addBatch(geometry,_material,position,scale,yaw=0) {
      geometry.computeBoundingBox();const box=geometry.boundingBox;
      parts.push(transformedBounds(box.min.toArray(),box.max.toArray(),position,scale,yaw));
    },
    addBox(_material,x,y,z,w,h,d,yaw=0) {
      parts.push(transformedBounds([-w/2,-h/2,-d/2],[w/2,h/2,d/2],[x,y,z],[1,1,1],yaw));
    },
  });
  return {plan,parts};
}

function capturePlanting(seed) {
  const trunks=[],treeBounds=[];
  const planting=addPlanting({seed,addBatch(geometry,material,position,scale,yaw=0) {
    const isTrunk=material.name==='Weathered tree bark';
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(...scale));
    const p=geometry.attributes.position,foot=[];
    let radius=0,bottom=Infinity,top=-Infinity;
    for(let i=0;i<p.count;i++) {
      const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix);
      assert.ok(finite(v.toArray()),'Tree geometry must remain finite');
      radius=Math.max(radius,Math.hypot(v.x-position[0],v.z-position[2]));
      bottom=Math.min(bottom,v.y);top=Math.max(top,v.y);
      // Ground-level trunk projection, excluding branches above head height.
      if(isTrunk&&v.y<=1.7)foot.push([v.x,v.z]);
    }
    treeBounds.push({x:position[0],z:position[2],kind:isTrunk?'trunk':'crown',radius,bottom,top});
    if(isTrunk) {
      assert.ok(foot.length>=3,'Every submitted tree retains a ground-level trunk');
      trunks.push({x:position[0],z:position[2],foot});
    }
  }});
  assert.equal(trunks.length,planting.placements.length,'Every planned tree has an actual trunk batch');
  same(trunks.map(p=>[p.x,p.z]),planting.placements.map(p=>[p.x,p.z]),'Submitted trunks match planned tree positions');
  const mapped=planting.placements.filter(p=>p.mapped),suppressed=planting.suppressed.filter(p=>p.mapped);
  const locations=points=>points.map(p=>JSON.stringify(p)).sort();
  same(locations([...mapped,...suppressed].map(p=>[p.x,p.z])),locations(CITY_DATA.trees),
    'Original mapped positions are preserved or explicitly suppressed, never moved or silently removed');
  assert.equal(planting.mappedTrees,CITY_DATA.trees.length,'Source tree inventory is unchanged');
  assert.equal(planting.renderedMappedTrees,mapped.length);assert.equal(planting.suppressedMappedTrees,suppressed.length);
  assert.ok(mapped.length>0,'Mapped trees remain visible');
  assert.ok(planting.gardenTrees>0&&planting.gardenTrees<=96,'The bounded garden planting pass is present');
  return {planting,treeBounds,gardenTrunks:trunks.filter((_,i)=>!planting.placements[i].mapped)};
}

const firstPlan=planStreetDressing(1907),firstPlanting=capturePlanting(1907);
planStreetDressing(42);capturePlanting(42);
same(firstPlan,planStreetDressing(1907),'Other seeds cannot perturb an existing dressing plan');
same(firstPlanting,capturePlanting(1907),'Other seeds cannot perturb existing planting');
const cases=[],collisionSummary=[];
for(const seed of [1907,42]) {
  const {plan,parts}=captureDressing(seed),{planting,gardenTrunks,treeBounds}=capturePlanting(seed);
  same(plan,planStreetDressing(seed),'Rendered dressing and pure plan agree');
  assert.ok(plan.placements.length>0&&plan.placements.length<=64,'Street dressing remains bounded');
  assert.equal(new Set(plan.placements.map(p=>p.id)).size,plan.placements.length,'Dressing IDs are unique');
  for(const kind of ['parked-car','bench','bin'])assert.ok(plan.placements.some(p=>p.kind===kind),`${kind} dressing is present`);
  assert.equal(plan.solids.length,plan.placements.length,'Every prop retains a collision volume');
  for(const solid of plan.solids)assert.ok(Number.isFinite(solid.bottom)&&Number.isFinite(solid.height)&&solid.height>solid.bottom,
    `Prop ${solid.id} needs a positive finite collision height`);
  const dressed=createDrivingWorld([...WORLD_SURFACES.drivingSolids,...plan.solids],WORLD_SURFACES.drivingBounds);
  const propsOnly=createDrivingWorld(plan.solids,WORLD_SURFACES.drivingBounds);
  for(const p of plan.placements) {
    const pose={x:p.x,z:p.z,heading:-p.yaw};
    assert.ok(!isDrivingPoseClear(propsOnly,pose)&&!isDrivingPoseClear(dressed,pose),`Prop ${p.id} blocks a vehicle pose`);
  }
  let laneSpawns=0;
  for(let i=1;i<CITY_DATA.route.length;i++) {
    const a=CITY_DATA.route[i-1],b=CITY_DATA.route[i],heading=Math.atan2(b[1]-a[1],b[0]-a[0]);
    for(const t of [0,.5])for(const offset of [-7,-3.5,3.5,7]) {
      const pose={x:a[0]+(b[0]-a[0])*t-Math.sin(heading)*offset,z:a[1]+(b[1]-a[1])*t+Math.cos(heading)*offset,heading};
      assert.ok(isDrivingPoseClear(dressed,pose),`Seed ${seed} dressing obstructs a Reno lane takeover`);laneSpawns++;
    }
  }
  collisionSummary.push({seed,propCenters:plan.placements.length,laneSpawns});
  cases.push({seed,plan,parts,gardenTrees:planting.placements.filter(p=>!p.mapped),gardenTrunks,treeBounds,
    mappedTrees:planting.renderedMappedTrees,suppressedMappedTrees:planting.suppressedMappedTrees});
}

const marks=buildRoadMarkings(CITY_DATA.roads);
assert.ok(marks.length>100&&marks.length<=8000,'Additional street markings exist within their budget');
same(marks,buildRoadMarkings([...CITY_DATA.roads].reverse()),'Road input order does not perturb markings');
for(const mark of marks)assert.ok(finite([mark.x,mark.z,mark.length,mark.width,mark.rotation])&&mark.length>0&&mark.width>0,'Road marking dimensions are valid');
const road=(id,p,oneway=false,lanes=2,w=7.3)=>({id,p,oneway,lanes,w,name:'Test street',kind:'primary'});
const east=road('east',[[-80,0],[80,0]]),north=road('north',[[0,-80],[0,80]]);
const fixtures=[
  {name:'one-way',roads:[road('one',[[-80,0],[80,0]],true,3,10.5)]},
  {name:'two-way',roads:[east]},
  {name:'crossing',roads:[east,north]},
];
for(const fixture of fixtures) {
  fixture.marks=buildRoadMarkings(fixture.roads,[-100,-100,100,100]);
  assert.ok(fixture.marks.length>0,`${fixture.name} produces useful markings`);
}
assert.ok(fixtures[0].marks.every(m=>m.color==='white'),'One-way roads use white lane separators, never yellow centerlines');
assert.ok(fixtures[0].marks.some(m=>m.z<0)&&fixtures[0].marks.some(m=>m.z>0),'Three-lane one-way fixture marks both lane boundaries');
assert.ok(fixtures[1].marks.some(m=>m.color==='yellow'&&m.z<0)&&fixtures[1].marks.some(m=>m.color==='yellow'&&m.z>0),'Two-way road retains both centerline stripes');

const holed={outer:[[0,0],[10,0],[10,10],[0,10]],holes:[[[4,4],[6,4],[6,6],[4,6]]]},
  concave={outer:[[0,0],[8,0],[8,8],[5,8],[5,3],[3,3],[3,8],[0,8]],holes:[]};
const placementFixtures=[
  {name:'enclosed hole',container:holed,footprint:[[2,2],[8,2],[8,8],[2,8]],margin:.2},
  {name:'concave incursion',container:concave,footprint:[[1,1],[7,1],[7,7],[1,7]],margin:.2},
  {name:'valid concave arm',container:concave,footprint:[[.8,1],[2,1],[2,6],[.8,6]],margin:.2},
  {name:'inside hole',container:holed,footprint:[[4.4,4.4],[5.6,4.4],[5.6,5.6],[4.4,5.6]],margin:.2},
];
for(const fixture of placementFixtures) {
  fixture.fits=footprintFits(fixture.container,fixture.footprint,fixture.margin);
  fixture.overlaps=footprintsOverlap(fixture.container,fixture.footprint,fixture.margin);
}
const payload={layers:WORLD_SURFACES.layers.filter(l=>['road','path','water','parking','paving','grass'].includes(l.kind)),
  solids:WORLD_SURFACES.drivingSolids,mappedTrees:CITY_DATA.trees,
  garden:CITY_DATA.features.find(f=>f.name==='Myriad Botanical Gardens')?.p,cases,marks,fixtures,placementFixtures};
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'okc-city-art-'));
try {
  const input=path.join(temporary,'geometry.json'),json=JSON.stringify(payload);
  assert.ok(Buffer.byteLength(json)<12*1024*1024,'Geometry-check interchange must stay bounded');
  fs.writeFileSync(input,json);
  const result=spawnSync(process.env.OKC_PYTHON||'python3',[path.join(root,'scripts/check-city-art.py'),input],
    {encoding:'utf8',maxBuffer:64*1024,timeout:90000});
  if(result.stdout)console.log(result.stdout.trim().slice(-8000));
  if(result.status!==0)throw new Error(`Independent city-art geometry checks failed: ${(result.stderr||result.error?.message||'see summary').slice(-3000)}`);
  console.log(JSON.stringify({scope:'Built geometry, independent polygon clearance, actual prop bounds, stable seeded placement and dressed-world collision; no GPU verification.',collisionSummary,determinism:true,roadFixtures:fixtures.length,placementFixtures:placementFixtures.length}));
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
