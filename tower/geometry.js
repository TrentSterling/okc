import * as THREE from 'three';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function addBox(group, size, position, material, name = '') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function beamTransform(a, b, width, depth = width) {
  const m = new THREE.Matrix4();
  const delta = new THREE.Vector3().subVectors(b, a);
  const rotation = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, delta.clone().normalize());
  m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(.5), rotation,
    new THREE.Vector3(width, delta.length(), depth));
  return m;
}

export function addBeams(group, entries, material, name) {
  if (!entries.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, entries.length);
  entries.forEach((e, i) => mesh.setMatrixAt(i, beamTransform(e[0], e[1], e[2], e[3] || e[2])));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function meshFaces(faces, material, name) {
  const positions = [], normals = [], uvs = [];
  for (const input of faces) {
    const points = input.map(p => p.clone());
    let normal = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(points[1], points[0]),
      new THREE.Vector3().subVectors(points[2], points[0])).normalize();
    const center = points.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);
    // Winding is chosen from the building center, retaining genuinely hard
    // face normals between the shaft, chamfers, and inclined crown panels.
    if (normal.x * center.x + normal.z * center.z < 0) {
      points.reverse();
      normal.negate();
    }
    let tangent = new THREE.Vector3(normal.z, 0, -normal.x).normalize();
    if (tangent.lengthSq() < .1) tangent.set(1, 0, 0);
    for (let i = 1; i < points.length - 1; i++) {
      for (const p of [points[0], points[i], points[i + 1]]) {
        positions.push(p.x, p.y, p.z);
        normals.push(normal.x, normal.y, normal.z);
        // Meter-space UVs let the main glass shader use one window pitch.
        uvs.push(p.dot(tangent), p.y);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function signedPlanArea(points) {
  return points.reduce((sum, p, i) => { const q=points[(i+1)%points.length]; return sum+p[0]*q[1]-q[0]*p[1]; },0)*.5;
}
export function profilePoint(p, height, scale=1) { return new THREE.Vector3(p[0]*scale,height,p[1]*scale); }
export function profileNormal(a,b,sign=1) { return new THREE.Vector3((b[1]-a[1])*sign,0,(a[0]-b[0])*sign).normalize(); }
export function surfaceMesh(faces,material,name) {
  const positions=[],normals=[],uvs=[];
  for(const face of faces) {
    const n=new THREE.Vector3().crossVectors(face[1].clone().sub(face[0]),face[2].clone().sub(face[0])).normalize();
    const t=new THREE.Vector3(n.z,0,-n.x).normalize();
    for(let j=1;j<face.length-1;j++)for(const p of [face[0],face[j],face[j+1]]) {
      positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);uvs.push(p.dot(t),p.y);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
// A mapped campus can contain multiple touching building parts. Assign shared
// wall area to the earlier solid volume, so transparent later parts cannot
// draw a second surface on exactly the same plane. Only the shared rectangle
// is removed; the portion above the neighbouring roof remains visible.
export function visibleWallPatches(a,b,bottom,top,owners) {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),squared=length*length;
  if(length<1e-7)return [];
  const covered=[];
  for(const owner of owners) {
    const low=Math.max(bottom,owner.bottom),high=Math.min(top,owner.top);
    if(high-low<1e-6)continue;
    const rings=[owner.polygon.outer||owner.polygon,...(owner.polygon.holes||[])];
    for(const ring of rings)for(let i=0;i<ring.length;i++) {
      const c=ring[i],d=ring[(i+1)%ring.length];
      const distance=p=>Math.abs(dx*(p[1]-a[1])-dz*(p[0]-a[0]))/length;
      if(distance(c)>.002||distance(d)>.002)continue;
      const project=p=>((p[0]-a[0])*dx+(p[1]-a[1])*dz)/squared;
      const t0=Math.max(0,Math.min(project(c),project(d))),t1=Math.min(1,Math.max(project(c),project(d)));
      if(t1-t0>1e-7)covered.push({t0,t1,low,high});
    }
  }
  const cuts=[...new Set([0,1,...covered.flatMap(r=>[r.t0,r.t1])].map(t=>Math.round(t*1e9)/1e9))].sort((a,b)=>a-b),patches=[];
  for(let i=0;i<cuts.length-1;i++) {
    const t0=cuts[i],t1=cuts[i+1],middle=(t0+t1)*.5;
    if(t1-t0<1e-7)continue;
    const intervals=covered.filter(r=>middle>r.t0-1e-8&&middle<r.t1+1e-8).sort((a,b)=>a.low-b.low);
    let y=bottom;
    for(const r of intervals) {
      if(r.low>y+1e-6)patches.push({t0,t1,bottom:y,top:r.low});
      y=Math.max(y,r.high);
    }
    if(y<top-1e-6)patches.push({t0,t1,bottom:y,top});
  }
  return patches;
}
export function addMappedVolume(group,polygon,height,wall,roof,name,bottom=.25,owners=[]) {
  const area=Math.abs(signedPlanArea(polygon.outer||polygon))-(polygon.holes||[]).reduce((sum,hole)=>sum+Math.abs(signedPlanArea(hole)),0);
  // A near-collinear map fragment is not a physical building volume. The
  // campus contains one 0.0001585 m² sliver whose two tall sides fought at depth.
  if(area<.01)return null;
  const makePath=ring=>ring.map(([x,z])=>new THREE.Vector2(x,-z));
  const shape=new THREE.Shape(makePath(polygon.outer||polygon));
  for(const hole of polygon.holes||[])shape.holes.push(new THREE.Path(makePath(hole)));
  const source=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1,curveSegments:1});source.rotateX(-Math.PI/2);source.translate(0,bottom,0);
  const sourcePosition=source.attributes.position,sourceNormal=source.attributes.normal;
  const positions=[],normals=[],uvs=[];
  // Keep the triangulated caps, then replace the full side walls with the
  // exposed patches. This preserves concave outline / hole triangulation.
  for(let i=0;i<sourcePosition.count;i++)if(Math.abs(sourceNormal.getY(i))>.5) {
    const x=sourcePosition.getX(i),y=sourcePosition.getY(i),z=sourcePosition.getZ(i);
    positions.push(x,y,z);normals.push(sourceNormal.getX(i),sourceNormal.getY(i),sourceNormal.getZ(i));uvs.push(x,z);
  }
  const capCount=positions.length/3;
  let wallArea=0,keptArea=0;
  const rings=[polygon.outer||polygon,...(polygon.holes||[])];
  rings.forEach((ring,ringIndex)=>{
    const sign=Math.sign(signedPlanArea(ring))*(ringIndex? -1:1);
    for(let i=0;i<ring.length;i++) {
      const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      wallArea+=length*height;
      const normal=profileNormal(a,b,sign);
      for(const patch of visibleWallPatches(a,b,bottom,bottom+height,owners)) {
        const start=[THREE.MathUtils.lerp(a[0],b[0],patch.t0),THREE.MathUtils.lerp(a[1],b[1],patch.t0)];
        const end=[THREE.MathUtils.lerp(a[0],b[0],patch.t1),THREE.MathUtils.lerp(a[1],b[1],patch.t1)];
        const face=[profilePoint(start,patch.bottom),profilePoint(start,patch.top),profilePoint(end,patch.top),profilePoint(end,patch.bottom)];
        if(sign<0)face.reverse();
        for(const v of [face[0],face[1],face[2],face[0],face[2],face[3]]) {
          positions.push(v.x,v.y,v.z);normals.push(normal.x,normal.y,normal.z);uvs.push(Math.abs(normal.x)>.6?v.z:v.x,v.y);
        }
        keptArea+=length*(patch.t1-patch.t0)*(patch.top-patch.bottom);
      }
    }
  });
  source.dispose();
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.addGroup(0,capCount,0);g.addGroup(capCount,positions.length/3-capCount,1);g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,[roof,wall]);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.sharedWallAreaRemoved=Math.max(0,wallArea-keptArea);group.add(mesh);return mesh;
}
export function horizontalGeometry(polygon, y) {
  const path = ring => ring.map(([x,z]) => new THREE.Vector2(x,-z));
  const shape = new THREE.Shape(path(polygon.outer || polygon));
  for (const hole of polygon.holes || []) shape.holes.push(new THREE.Path(path(hole)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0,y,0);
  return geometry;
}

export function clipFaceAbove(face,y) {
  const clipped=[];
  for(let i=0;i<face.length;i++) {
    const a=face[i],b=face[(i+1)%face.length],insideA=a.y>=y-1e-7,insideB=b.y>=y-1e-7;
    if(insideA)clipped.push(a.clone());
    if(insideA!==insideB)clipped.push(a.clone().lerp(b,(y-a.y)/(b.y-a.y)));
  }
  return clipped.filter((p,i,all)=>p.distanceToSquared(all[(i+all.length-1)%all.length])>1e-9);
}

// Facade members follow the same exposed wall patches as the glass. Using an
// unrelated complete circle for the rotunda previously put railings and beams
// through its adjoining tower and podium, and outside the mapped envelope.
export function perimeterMembers(polygon,bottom,top,owners,bands,pitch,width=.12,depth=.19) {
  const ring=polygon.outer||polygon,sign=Math.sign(signedPlanArea(ring)),entries=[];
  for(let i=0;i<ring.length;i++) {
    const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length<.05)continue;
    const normal=profileNormal(a,b,sign),point=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    for(const patch of visibleWallPatches(a,b,bottom,top,owners)) {
      const start=point(patch.t0),end=point(patch.t1);
      for(const y of bands)if(y>=patch.bottom-.001&&y<=patch.top+.001)
        entries.push([profilePoint(start,y).addScaledVector(normal,.06),profilePoint(end,y).addScaledVector(normal,.06),width,depth]);
      const count=Math.max(1,Math.ceil(length*(patch.t1-patch.t0)/pitch));
      for(let j=0;j<count;j++) {
        const q=point(patch.t0+(patch.t1-patch.t0)*(j+.5)/count);
        entries.push([profilePoint(q,patch.bottom).addScaledVector(normal,.07),profilePoint(q,patch.top).addScaledVector(normal,.07),width*.75,depth]);
      }
    }
  }
  return entries;
}
