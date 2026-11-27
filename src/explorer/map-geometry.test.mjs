import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {ShapeUtils,Color} from 'three';
import {triangulateFeatures,packMapGeometry,buildingStyle} from './map-geometry.js';
import {createMapBatches} from './map-batches.js';

function area(vertices){let sum=0;for(let i=0;i<vertices.length;i+=6)sum+=Math.abs((vertices[i+2]-vertices[i])*(vertices[i+5]-vertices[i+1])-(vertices[i+4]-vertices[i])*(vertices[i+3]-vertices[i+1]))/2;return sum;}

test('GPU map triangles preserve a closed courtyard hole without filling it',()=>{
 const polygon={p:[[0,0],[10,0],[10,10],[0,10],[0,0]],holes:[[[3,3],[3,7],[7,7],[7,3],[3,3]]]};
 const vertices=triangulateFeatures([polygon],ShapeUtils.triangulateShape);assert.equal(area(vertices),84);
 for(let i=0;i<vertices.length;i+=6){const x=(vertices[i]+vertices[i+2]+vertices[i+4])/3,y=(vertices[i+1]+vertices[i+3]+vertices[i+5])/3;assert.ok(!(x>3&&x<7&&y>3&&y<7),'No triangle centroid should land in the courtyard.');}
 assert.equal(polygon.p.length,5,'Compilation must not mutate source rings.');assert.equal(polygon.holes[0].length,5);
});

test('map geometry retains disjoint polygons, multiple holes, and road classes',()=>{
 const courtyard={kind:'park',p:[[0,0],[20,0],[20,20],[0,20]],holes:[[[2,2],[4,2],[4,4],[2,4]],[[10,10],[15,10],[15,15],[10,15]]]},second={p:[[30,0],[40,0],[40,10],[30,10]],kind:'water'};
 const packed=packMapGeometry({surfaces:[courtyard,second],buildings:[courtyard],roads:[{kind:'motorway',p:[[0,0],[0,0],[10,0]],w:15},{kind:'secondary',p:[{x:0,z:0},{x:0,z:20}],w:10},{kind:'residential',p:[[0,0],[4,5]]}]},ShapeUtils.triangulateShape);
 assert.equal(area(packed.parks),371);assert.equal(area(packed.water),100);assert.equal(area(packed.buildings),371);
 assert.deepEqual(packed.roads.map(v=>v.length),[5,5,5],'Zero-length source road segments are omitted.');assert.ok(Object.values(packed).flat().every(v=>v instanceof Float32Array));
});

test('generic land remains separate from parks, woods, grass and nature areas',()=>{
 const square=side=>[[0,0],[side,0],[side,side],[0,side]];
 const packed=packMapGeometry({surfaces:[{kind:'industrial',p:square(2)},{kind:'residential',p:square(3)},{kind:'forest',p:square(4)},{kind:'grass',p:square(5)},{kind:'nature_reserve',p:square(6)},{kind:'pond',p:square(7)}]},ShapeUtils.triangulateShape);
 assert.equal(area(packed.land),13);assert.equal(area(packed.parks),77);assert.equal(area(packed.water),49);
});

test('footprint colors and transparency follow each feature through hole triangulation',()=>{
 const buildings=[{id:'red',color:'#ff0000',p:[[0,0],[10,0],[10,10],[0,10]],holes:[[[3,3],[7,3],[7,7],[3,7]]]},{id:'custom',color:'#9d7846',p:[[20,0],[22,0],[22,2],[20,2]]},{id:'unknown',color:'invalid',p:[[30,0],[32,0],[32,2],[30,2]]}];
 const packed=packMapGeometry({buildings},ShapeUtils.triangulateShape);
 assert.equal(area(packed.buildings),92);assert.equal(packed.buildingColors.length,packed.buildings.length*2);
 const custom=new Color('#9d7846'),fallback=new Color('#8c9984');
 for(let i=0;i<packed.buildings.length/2;i++){
  const x=packed.buildings[i*2],color=x<15?[1,0,0]:x<25?[custom.r,custom.g,custom.b]:[fallback.r,fallback.g,fallback.b],alpha=x<25?101/255:59/255;
  for(let c=0;c<3;c++)assert.ok(Math.abs(packed.buildingColors[i*4+c]-color[c])<1e-7,'Vertex RGB uses the same linear working space as Three.Color.');
  assert.ok(Math.abs(packed.buildingColors[i*4+3]-alpha)<1e-7);
 }
 assert.equal(buildingStyle({color:'#AaBBcC'}).fill,'#AaBBcC65');assert.equal(buildingStyle({color:'bad'}).fill,'#8c99843b');
});

test('many building colors share one GPU batch and generic land follows the parks layer toggle',()=>{
 const p=[[0,0],[2,0],[2,2],[0,2]],buildings=Array.from({length:200},(_,i)=>({p,color:'#'+(i*65793).toString(16).padStart(6,'0')}));
 const packed=packMapGeometry({buildings,surfaces:[{p,kind:'industrial'},{p,kind:'park'},{p,kind:'water'}],roads:[{p:[[0,0],[1,1]],kind:'residential'},{p:[[0,0],[1,1]],kind:'secondary'},{p:[[0,0],[1,1]],kind:'motorway'}]},ShapeUtils.triangulateShape),batches=createMapBatches();
 batches.setBase(packed);batches.setBuildings(packed);assert.equal(batches.stats.batches,7,'Feature colors must not multiply draw batches.');
 let scene;const renderer={autoClear:true,render:value=>scene=value},view={center:{x:0,z:0},scale:.4,width:390,height:844,layers:{roads:true,parks:true,water:true,buildings:true}};
 batches.render(renderer,view);const mesh=scene.getObjectByName('buildings');assert.equal(mesh.geometry.attributes.featureColor.array,packed.buildingColors);assert.equal(mesh.material.defines.MAP_FEATURE_COLOR,1);assert.equal(mesh.material.transparent,true);
 assert.ok(scene.children.every(v=>v.material.transparent&&v.material.forceSinglePass),'Atlas layers must share the ordered render queue and blend each feature only once.');
 assert.deepEqual(scene.children.map(v=>v.renderOrder).sort((a,b)=>a-b),[0,1,2,3,4,5,6]);
 assert.ok(scene.getObjectByName('land').visible);view.layers.parks=false;batches.render(renderer,view);assert.equal(scene.getObjectByName('land').visible,false);assert.equal(scene.getObjectByName('parks').visible,false);assert.equal(scene.getObjectByName('water').visible,true);assert.equal(renderer.autoClear,true);
 batches.dispose();assert.equal(batches.stats.batches,0);
});

test('the actual map worker transfers land and footprint color buffers with geometry',async()=>{
 const source=await readFile(new URL('./map-geometry.worker.js',import.meta.url),'utf8');let reply,transfers;
 const self={postMessage:(value,buffers)=>{reply=value;transfers=buffers;}};
 // Supply the worker's browser-imported dependencies directly; execute its real
 // message handler instead of reproducing its serialization/transfer logic.
 runInNewContext(source.replace(/^import .*;\s*$/gm,''),{self,packMapGeometry,ShapeUtils});
 const p=[[0,0],[4,0],[4,4],[0,4]];self.onmessage({data:{id:42,input:{surfaces:[{kind:'industrial',p}],buildings:[{color:'#884422',p}]}}});
 assert.equal(reply.id,42);assert.equal(reply.error,undefined);assert.ok(reply.packed.land.length>0);assert.ok(reply.packed.buildingColors.length>0);
 for(const array of [...reply.packed.roads,reply.packed.land,reply.packed.parks,reply.packed.water,reply.packed.buildings,reply.packed.buildingColors])assert.ok(transfers.includes(array.buffer));
 assert.equal(transfers.length,new Set(transfers).size,'Transfer list contains each owned buffer once.');
});
