import * as THREE from 'three';
import { DEVON_DIMENSIONS } from './dimensions.js';
import { profilePoint, surfaceMesh, clipFaceAbove, addBeams, horizontalGeometry, addBox } from './geometry.js';
import { makeScreenMaterial, triangleScreen } from './screens.js';

export function addDevonCrown({group,plan,glass,bright,dark,roof,frameMaterial,softenFrame,spineFrames}) {
  // The architectural V is centered on the OUTWARD crease of each broad
  // elevation. It does not sit above the recessed corner feature walls. The
  // full 34 m chamfer is reconstructed from the photographs; the manufacturer
  // dimensions describe the smaller lighting installation inside that face.
  const crowns=[{a:0,m:4,b:6},{a:11,m:12,b:13},{a:18,m:19,b:21}];
  const corners=[{a:6,b:11,channel:[7,8,9,10]}, {a:13,b:18,channel:[14,15,16,17]}, {a:21,b:0,channel:[22,23,24,25,26,27]}];
  const crownBase=223.2,crownTop=DEVON_DIMENSIONS.architecturalHeight,crownScale=.992,topScale=.972,roofY=DEVON_DIMENSIONS.mechanicalRoof;
  const crownRibs=[],crownGrid=[],crownPanels=[],crownSides=[],roofBoundary=[];
  const screenMaterial=makeScreenMaterial(),screens=new THREE.Group();screens.name='Programmable crown screens';screens.visible=false;
  const crownPoint=i=>profilePoint(plan[i],crownBase,crownScale);
  const peakPoint=i=>profilePoint(plan[i],crownTop,topScale);
  const roofFraction=(roofY-crownBase)/(crownTop-crownBase);
  const orient=face=>{
    const f=face.map(p=>p.clone());
    const n=new THREE.Vector3().crossVectors(f[1].clone().sub(f[0]),f[2].clone().sub(f[0])).normalize();
    const c=f.reduce((v,p)=>v.add(p),new THREE.Vector3()).divideScalar(f.length);
    if(n.x*c.x+n.z*c.z<0)f.reverse();
    return f;
  };
  for(let k=0;k<crowns.length;k++) {
    const c=crowns[k],baseA=crownPoint(c.a),baseB=crownPoint(c.b),apex=crownPoint(c.m);
    const topA=peakPoint(c.a),topB=peakPoint(c.b),topMiddle=topA.clone().add(topB).multiplyScalar(.5);
    // The bowed shaft crease meets the apex. The rim is a straight chord,
    // making a real inclined triangle with a different reflected sky direction.
    crownPanels.push(orient([apex,topA,topB]));
    crownSides.push(orient([baseA,apex,topA]),orient([apex,baseB,topB]));
    crownRibs.push([apex,topA,.13,.16],[apex,topB,.13,.16],[topA,topB,.19,.23]);
    spineFrames.push([profilePoint(plan[c.m],4.2),profilePoint(plan[c.m],210),.11,.17],[profilePoint(plan[c.m],210),apex,.11,.17]);

    // A roof-level cross-section closes the complete shaft. Its boundary
    // follows the inclined V instead of bridging across a corner recess.
    roofBoundary.push(baseA.clone().lerp(topA,roofFraction),apex.clone().lerp(topA,roofFraction),apex.clone().lerp(topB,roofFraction),baseB.clone().lerp(topB,roofFraction));
    const nextCorner=corners[k];
    const path=[nextCorner.a,...nextCorner.channel,nextCorner.b];
    for(let j=0;j<path.length-1;j++) {
      const ia=path[j],ib=path[j+1],a=crownPoint(ia),b=crownPoint(ib);
      const ta=(j===0?peakPoint(ia):profilePoint(plan[ia],roofY,.983));
      const tb=(j===path.length-2?peakPoint(ib):profilePoint(plan[ib],roofY,.983));
      crownSides.push(orient([a,b,tb,ta]));
      crownRibs.push([ta,tb,.11,.16]);
      if(j<path.length-2)roofBoundary.push(tb.clone());
    }
    // The 75 ft by 85 ft lit area is nested within the architectural glass,
    // with an unlit glass border. It stays independent of sunset reflections.
    const ledTop=255.6,ledBottom=ledTop-22.86;
    const ledApex=apex.clone().lerp(topMiddle,(ledBottom-crownBase)/(crownTop-crownBase));
    const ledCenter=apex.clone().lerp(topMiddle,(ledTop-crownBase)/(crownTop-crownBase));
    const along=topB.clone().sub(topA).normalize();
    screens.add(triangleScreen(ledApex,ledCenter.clone().addScaledVector(along,-12.954),ledCenter.clone().addScaledVector(along,12.954),screenMaterial));
  }

  // Grid lines continue over the complete crown and the flanking triangles.
  // Clipping in each real face plane avoids the former blank beveled cuff.
  const addFaceGrid=face=>{
    const n=new THREE.Vector3().crossVectors(face[1].clone().sub(face[0]),face[2].clone().sub(face[0])).normalize();
    const t=new THREE.Vector3(n.z,0,-n.x).normalize();
    const addCrossing=(axis,value,width,depth)=>{
      const hits=[];
      for(let i=0;i<face.length;i++) {
        const a=face[i],b=face[(i+1)%face.length],va=axis==='y'?a.y:a.dot(t),vb=axis==='y'?b.y:b.dot(t);
        if(Math.abs(vb-va)<1e-7)continue;
        const u=(value-va)/(vb-va);if(u<-.00001||u>1.00001)continue;
        const p=a.clone().lerp(b,Math.max(0,Math.min(1,u)));
        if(!hits.some(q=>q.distanceToSquared(p)<1e-8))hits.push(p);
      }
      if(hits.length===2&&hits[0].distanceToSquared(hits[1])>.01)crownGrid.push([hits[0].addScaledVector(n,.045),hits[1].addScaledVector(n,.045),width,depth]);
    };
    const us=face.map(p=>p.dot(t)),ys=face.map(p=>p.y);
    for(let u=Math.ceil(Math.min(...us)/1.524)*1.524;u<Math.max(...us)-.01;u+=1.524)addCrossing('u',u,.035,.07);
    for(let y=Math.ceil(Math.min(...ys)/2.1)*2.1;y<Math.max(...ys)-.01;y+=2.1)addCrossing('y',y,.035,.065);
  };
  for(const f of [...crownPanels,...crownSides])addFaceGrid(f);
  group.add(surfaceMesh(crownPanels,glass,'Three broad-face architectural V chamfers'));
  group.add(surfaceMesh(crownSides,glass,'Continuous upper facade triangles and recessed feature walls'));
  // The crown genuinely stands above a lower mechanical roof, but is not a
  // set of one-sided paper fins. Silver inner cladding, documented by the
  // fabricator, makes its inside visible from the aerial inspection camera.
  const liningMaterial=new THREE.MeshStandardMaterial({name:'Silver aluminum inner crown cladding',color:0xacb4b8,roughness:.56,metalness:.44});
  const liningFaces=[],rimFaces=[];
  for(const face of [...crownPanels,...crownSides]) {
    const clipped=clipFaceAbove(face,roofY);
    if(clipped.length<3)continue;
    const normal=new THREE.Vector3().crossVectors(face[1].clone().sub(face[0]),face[2].clone().sub(face[0])).normalize();
    const inner=clipped.map(p=>p.clone().addScaledVector(normal,-.18));
    liningFaces.push(inner.slice().reverse());
    for(let i=0;i<clipped.length;i++) {
      const j=(i+1)%clipped.length;
      if(clipped[i].y>roofY+.01&&clipped[j].y>roofY+.01)
        rimFaces.push([clipped[i],clipped[j],inner[j],inner[i]]);
    }
  }
  const lining=surfaceMesh(liningFaces,liningMaterial,'Opaque inner crown lining above mechanical roof');
  lining.userData.claddingThickness=.18;group.add(lining);
  group.add(surfaceMesh(rimFaces,liningMaterial,'Capped upper crown edges'));
  const crownFrame=addBeams(group,crownRibs,bright,'Architectural V edges and pointed crown shoulders');crownFrame.castShadow=false;
  const crownGridMesh=addBeams(group,crownGrid,frameMaterial,'Continuous crown curtain-wall grid');softenFrame(crownGridMesh);
  for(const c of corners)for(const i of [c.a,c.b])spineFrames.push([profilePoint(plan[i],4.2),profilePoint(plan[i],210),.12,.18],[profilePoint(plan[i],210),peakPoint(i),.12,.18]);
  const shaftEdges=addBeams(group,spineFrames,bright,'Recessed corner edges and broad facade creases');shaftEdges.castShadow=false;
  group.add(screens);
  const roofGeometry=horizontalGeometry(roofBoundary.map(p=>[p.x,p.z]),roofY);
  const roofMesh=new THREE.Mesh(roofGeometry,roof);roofMesh.name='Closed mechanical roof at base of projecting crown';roofMesh.castShadow=true;roofMesh.receiveShadow=true;group.add(roofMesh);
  roofMesh.userData.roofElevation=roofY;roofMesh.userData.closedRoof=true;roofMesh.userData.roofOutline=roofBoundary.map(p=>[p.x,p.z]);
  // Small enclosed service plant remains well within the actual roof section;
  // exact plant positions are illustrative, never used as survey evidence.
  addBox(group,[9.8,4.1,8.2],[0,roofY+2.0,0],dark,'Recessed mechanical plant enclosure');
  addBox(group,[10.1,.18,8.5],[0,roofY+4.14,0],liningMaterial,'Mechanical plant metal roof');
  const plantGrilles=[];
  for(let y=roofY+.7;y<roofY+3.9;y+=.42)for(const z of [-4.15,4.15])plantGrilles.push([new THREE.Vector3(-4.7,y,z),new THREE.Vector3(4.7,y,z),.08,.09]);
  addBeams(group,plantGrilles,liningMaterial,'Mechanical plant horizontal louvers');

  return {corners,screenMaterial,screens};
}
