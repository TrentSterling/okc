import assert from 'node:assert/strict';
import test from 'node:test';
import {ShapeUtils} from 'three';
import {triangulateFeatures,packMapGeometry} from './map-geometry.js';

function area(vertices){let sum=0;for(let i=0;i<vertices.length;i+=6)sum+=Math.abs((vertices[i+2]-vertices[i])*(vertices[i+5]-vertices[i+1])-(vertices[i+4]-vertices[i])*(vertices[i+3]-vertices[i+1]))/2;return sum;}

test('GPU map triangles preserve a closed courtyard hole without filling it',()=>{
 const polygon={p:[[0,0],[10,0],[10,10],[0,10],[0,0]],holes:[[[3,3],[3,7],[7,7],[7,3],[3,3]]]};
 const vertices=triangulateFeatures([polygon],ShapeUtils.triangulateShape);assert.equal(area(vertices),84);
 for(let i=0;i<vertices.length;i+=6){const x=(vertices[i]+vertices[i+2]+vertices[i+4])/3,y=(vertices[i+1]+vertices[i+3]+vertices[i+5])/3;assert.ok(!(x>3&&x<7&&y>3&&y<7),'No triangle centroid should land in the courtyard.');}
 assert.equal(polygon.p.length,5,'Compilation must not mutate source rings.');assert.equal(polygon.holes[0].length,5);
});

test('map geometry retains disjoint polygons, multiple holes, and road classes',()=>{
 const courtyard={p:[[0,0],[20,0],[20,20],[0,20]],holes:[[[2,2],[4,2],[4,4],[2,4]],[[10,10],[15,10],[15,15],[10,15]]]},second={p:[[30,0],[40,0],[40,10],[30,10]],kind:'water'};
 const packed=packMapGeometry({surfaces:[courtyard,second],buildings:[courtyard],roads:[{kind:'motorway',p:[[0,0],[0,0],[10,0]],w:15},{kind:'secondary',p:[{x:0,z:0},{x:0,z:20}],w:10},{kind:'residential',p:[[0,0],[4,5]]}]},ShapeUtils.triangulateShape);
 assert.equal(area(packed.parks),371);assert.equal(area(packed.water),100);assert.equal(area(packed.buildings),371);
 assert.deepEqual(packed.roads.map(v=>v.length),[5,5,5],'Zero-length source road segments are omitted.');assert.ok(Object.values(packed).flat().every(v=>v instanceof Float32Array));
});
