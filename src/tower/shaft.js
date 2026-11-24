import * as THREE from 'three';
import { signedPlanArea, profilePoint, profileNormal, surfaceMesh, addBeams } from './geometry.js';

export function addDevonShaft({group,plan,glass,silver}) {
  const sign=Math.sign(signedPlanArea(plan));
  const levels=[{y:.6,scale:1},{y:210,scale:1},{y:223.2,scale:.992}];
  const frameMaterial=silver.clone();frameMaterial.name='Fine silver facade blades';frameMaterial.transparent=true;frameMaterial.depthWrite=false;
  const softenFrame=mesh=>{mesh.castShadow=false;mesh.receiveShadow=false;mesh.onBeforeRender=(_renderer,_scene,camera)=>{const distance=Math.hypot(camera.position.x,camera.position.z);frameMaterial.opacity=.75*(1-THREE.MathUtils.smoothstep(distance,250,750));};};
  const wallFaces=[],mullions=[],floorBands=[],spineFrames=[];
  for(let i=0;i<plan.length;i++) {
    const a=plan[i],b=plan[(i+1)%plan.length];
    const edge=new THREE.Vector3(b[0]-a[0],0,b[1]-a[1]),len=edge.length();
    if(len<.04)continue;
    const normal=profileNormal(a,b,sign),tangent=new THREE.Vector3(normal.z,0,-normal.x);
    for(let k=0;k<levels.length-1;k++) {
      const lo=levels[k],hi=levels[k+1];
      const f=[profilePoint(a,lo.y,lo.scale),profilePoint(a,hi.y,hi.scale),profilePoint(b,hi.y,hi.scale),profilePoint(b,lo.y,lo.scale)];
      if(sign<0)f.reverse();wallFaces.push(f);
    }
    // The actual facade is a densely articulated silver curtain wall. Long
    // panels use the architect's five-foot blade module; recessed corners keep
    // their smaller edge members. The shader supplies subpixel grid coverage.
    const ta=new THREE.Vector3(a[0],0,a[1]).dot(tangent),tb=new THREE.Vector3(b[0],0,b[1]).dot(tangent);
    for(let s=Math.ceil(Math.min(ta,tb)/1.524)*1.524;s<Math.max(ta,tb)-.04;s+=1.524) {
      const u=(s-ta)/(tb-ta);if(u<.01||u>.99)continue;
      const q=[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];
      for(let k=0;k<levels.length-1;k++) {
        const lo=levels[k],hi=levels[k+1];
        mullions.push([profilePoint(q,Math.max(4.2,lo.y),lo.scale).addScaledVector(normal,.055),profilePoint(q,hi.y,hi.scale).addScaledVector(normal,.055),.04,.10]);
      }
    }
    for(let y=8.4;y<223.2;y+=4.2) {
      const scale=y<=210?1:1-.008*(y-210)/13.2;
      floorBands.push([profilePoint(a,y,scale).addScaledVector(normal,.055),profilePoint(b,y,scale).addScaledVector(normal,.055),.05,.085]);
      // Half-floor transoms are deliberately finer and do not cast shadows.
      if(y+2.1<223.2)floorBands.push([profilePoint(a,y+2.1,scale).addScaledVector(normal,.05),profilePoint(b,y+2.1,scale).addScaledVector(normal,.05),.035,.07]);
    }
  }
  group.add(surfaceMesh(wallFaces,glass,'Mapped shaft: six broad facets and three recessed corner walls'));
  const bladeMesh=addBeams(group,mullions,frameMaterial,'Five-foot silver facade blades');softenFrame(bladeMesh);
  const floorMesh=addBeams(group,floorBands,frameMaterial,'Curtain-wall floor bands and transoms');softenFrame(floorMesh);

  return {frameMaterial,softenFrame,spineFrames};
}
