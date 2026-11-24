import * as THREE from 'three';

// Devon uses mapped building-part footprints and a photograph-led facade
// reconstruction. Architectural profiles and floor heights remain approximate;
// the three crown displays are separate from the reflective glazing.
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

function addBox(group, size, position, material, name = '') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function beamTransform(a, b, width, depth = width) {
  const m = new THREE.Matrix4();
  const delta = new THREE.Vector3().subVectors(b, a);
  const rotation = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, delta.clone().normalize());
  m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(.5), rotation,
    new THREE.Vector3(width, delta.length(), depth));
  return m;
}

function addBeams(group, entries, material, name) {
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

function meshFaces(faces, material, name) {
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

function makeScreenMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Devon crown programmable LED panels',
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uNight: { value: 0 }, uEnabled: { value: 0 } }
    ]),
    vertexShader: `
      varying vec2 vPanel;
      #include <fog_pars_vertex>
      void main() {
        vPanel = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uNight;
      uniform float uEnabled;
      varying vec2 vPanel;
      #include <fog_pars_fragment>
      void main() {
        if (uEnabled < .5) discard;
        vec2 p = vPanel;
        // One continuous architectural lantern. The very slow white balance
        // shift remains legible at skyline scale; no subpixel LED dots or
        // crossed color bands compete with the actual facade geometry.
        float cycle = .5 + .5 * sin(uTime * .025);
        float wash = clamp(.24 + .44 * cycle + .10 * (p.y - .5), 0., 1.);
        vec3 warmWhite = vec3(1.0, .86, .69);
        vec3 coolWhite = vec3(.78, .89, 1.0);
        vec3 color = mix(warmWhite, coolWhite, wash);
        float brightness = mix(.55, 1.35, uNight);
        color *= brightness * (.97 + .03 * smoothstep(0., 1., p.y));
        // Analytic coverage softens the triangle's silhouette without
        // introducing discontinuities inside the illuminated face.
        float edge = min(min(p.x - .5 + .5 * p.y, .5 + .5 * p.y - p.x), 1. - p.y);
        float coverage = smoothstep(0., max(fwidth(edge) * 1.15, .0005), edge);
        gl_FragColor = vec4(color, .96 * coverage);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: true,
    toneMapped: true,
    side: THREE.DoubleSide
  });
}

// Coordinates projected from OpenStreetMap building parts 156035399, 156035404,
// 537832857, and 559221713. Origin is the tower polygon centroid. Footprints are
// mapped data; facade profiles, floor heights and crown construction are a
// photograph-led reconstruction, not an as-built architectural survey.
const DEVON_CAMPUS = {"origin": [-97.51758985376695, 35.466887450817715], "tower": [[-23.169, -24.307], [-21.274, -24.641], [-20.222, -24.83], [-10.721, -26.5], [1.329, -28.626], [19.715, -24.129], [24.62, -22.926], [21.003, -17.015], [23.342, -15.935], [26.116, -10.614], [25.473, -8.21], [32.327, -7.909], [24.493, 15.234], [7.539, 32.611], [4.493, 27.056], [2.371, 28.626], [-3.857, 28.582], [-5.752, 27.112], [-9.189, 32.188], [-25.445, 12.941], [-30.839, -6.629], [-31.737, -10.169], [-25.753, -10.169], [-25.146, -10.169], [-25.68, -13.063], [-22.824, -17.961], [-20.231, -18.574], [-20.839, -19.754]], "rotunda": [[-35.164, -5.215], [-34.892, -5.304], [-30.839, -6.629], [-27.938, -8.366], [-25.753, -10.169], [-25.146, -10.169], [-25.68, -13.063], [-22.824, -17.961], [-20.231, -18.574], [-20.839, -19.754], [-20.222, -24.83], [-21.274, -24.641], [-21.999, -28.871], [-23.414, -32.166], [-25.517, -35.227], [-28.301, -37.565], [-27.358, -38.789], [-30.241, -40.548], [-33.641, -41.617], [-37.403, -42.007], [-41.102, -41.795], [-44.448, -40.938], [-47.784, -39.335], [-46.905, -37.977], [-49.824, -35.427], [-52.608, -31.954], [-53.895, -29.672], [-54.983, -26.544], [-55.183, -22.659], [-54.929, -19.776], [-55.79, -19.587], [-54.593, -16.158], [-52.952, -13.219], [-50.622, -10.481], [-47.839, -8.11], [-46.107, -6.996], [-42.127, -5.46], [-38.691, -5.338]], "podium": [{"outer": [[-68.356, -54.775], [-142.982, -56.89], [-142.946, -59.74], [-146.754, -59.84], [-150.607, -59.951], [-154.361, -60.051], [-154.461, -57.213], [-155.077, -57.235], [-155.131, -52.749], [-158.395, -52.805], [-158.803, -32.722], [-158.096, -32.711], [-158.105, -32.266], [-156.818, -31.387], [-156.99, -22.559], [-156.12, -22.559], [-156.147, -21.134], [-154.859, -21.123], [-153.119, -21.101], [-150.988, -21.078], [-151.052, -18.184], [-151.079, -16.759], [-140.117, -16.614], [-140.081, -20.544], [-132.574, -20.433], [-132.683, -16.303], [-121.767, -16.024], [-121.703, -20.088], [-114.496, -19.943], [-114.613, -15.891], [-103.534, -15.646], [-103.453, -19.542], [-96.145, -19.397], [-96.245, -15.423], [-85.184, -15.078], [-85.084, -19.13], [-78.012, -18.874], [-78.121, -14.789], [-66.652, -14.455], [-66.588, -18.329], [-61.964, -18.229], [-60.795, -14.01], [-58.8, -10.514], [-56.126, -7.119], [-52.889, -4.18], [-48.782, -1.608], [-46.107, -6.996], [-47.839, -8.11], [-50.622, -10.481], [-52.952, -13.219], [-54.593, -16.158], [-55.79, -19.587], [-54.929, -19.776], [-55.183, -22.659], [-54.983, -26.544], [-53.895, -29.672], [-52.608, -31.954], [-49.824, -35.427], [-46.905, -37.977], [-47.784, -39.335], [-44.448, -40.938], [-41.102, -41.795], [-37.403, -42.007], [-33.641, -41.617], [-30.241, -40.548], [-27.358, -38.789], [-28.301, -37.565], [-25.517, -35.227], [-23.414, -32.166], [-21.999, -28.871], [-21.274, -24.641], [-20.222, -24.83], [-10.721, -26.5], [1.329, -28.626], [19.715, -24.129], [19.761, -27.424], [24.602, -27.346], [24.865, -47.35], [23.859, -47.372], [23.877, -47.94], [23.958, -51.124], [24.638, -51.112], [24.675, -52.081], [-7.212, -52.871], [-15.354, -53.072], [-16.387, -53.105], [-19.434, -53.194], [-29.244, -53.461], [-29.797, -56.545], [-51.42, -57.135], [-51.411, -57.948], [-68.247, -58.493]], "holes": []}, {"outer": [[-42.2, -0.05], [-35.264, 0.095], [-35.164, -5.215], [-38.691, -5.338], [-42.127, -5.46]], "holes": []}, {"outer": [[-35.164, -5.215], [-30.839, -6.629], [-34.892, -5.304]], "holes": []}], "auditorium": [[-163.182, 3.98], [-156.401, 4.18], [-156.355, 1.753], [-157.262, 1.731], [-157.244, 0.941], [-155.44, 0.985], [-153.581, 1.041], [-151.877, 1.074], [-128.467, 1.675], [-128.494, 2.488], [-129.519, 2.455], [-129.6, 5.004], [-120.226, 5.271], [-120.887, 26.923], [-164.044, 30.218]], "plaza": [{"outer": [[-159.405, -30.732], [-158.839, -30.345], [-159.029, -20.559], [-158.158, -20.559], [-158.185, -19.152], [-154.881, -19.123], [-153.142, -19.101], [-153.032, -19.1], [-153.051, -18.225], [-153.117, -14.786], [-138.136, -14.588], [-138.1, -18.514], [-134.627, -18.463], [-134.735, -14.354], [-119.799, -13.974], [-119.735, -18.048], [-116.553, -17.984], [-116.671, -13.936], [-101.577, -13.602], [-101.495, -17.503], [-98.195, -17.438], [-98.294, -13.486], [-83.234, -13.016], [-83.134, -17.058], [-80.064, -16.947], [-80.173, -12.848], [-64.685, -12.397], [-64.622, -16.286], [-63.494, -16.261], [-62.656, -13.235], [-60.463, -9.393], [-57.594, -5.75], [-54.101, -2.579], [-47.972, 1.258], [-45.126, -4.474], [-44.145, -4.095], [-44.226, 1.908], [-33.302, 2.136], [-33.191, -3.756], [-32.21, -4.077], [-27.256, 13.896], [-9.013, 35.496], [-5.292, 30.0], [-4.548, 30.577], [3.024, 30.631], [3.841, 30.027], [7.084, 35.941], [26.242, 16.306], [35.075, -9.791], [28.049, -10.099], [28.25, -10.849], [24.8, -17.465], [23.882, -17.889], [27.755, -24.217], [23.05, -25.37], [26.576, -25.314], [26.891, -49.306], [26.572, -49.313], [26.749, -54.03], [-7.162, -54.871], [-15.297, -55.071], [-16.326, -55.104], [-19.377, -55.193], [-27.562, -55.416], [-28.115, -58.5], [-49.398, -59.08], [-49.389, -59.883], [-70.188, -60.557], [-70.297, -56.831], [-140.958, -58.833], [-140.921, -61.687], [-146.699, -61.839], [-150.552, -61.951], [-156.29, -62.104], [-156.389, -59.284], [-157.052, -59.308], [-157.107, -54.783], [-160.354, -54.838], [-160.844, -30.754]], "holes": []}, {"outer": [[-166.116, 32.382], [-118.943, 28.78], [-118.165, 3.329], [-126.513, 3.091], [-126.401, -0.272], [-151.831, -0.925], [-153.532, -0.958], [-155.385, -1.014], [-159.197, -1.108], [-159.271, 2.094], [-165.116, 1.922]], "holes": []}]};

function signedPlanArea(points) {
  return points.reduce((sum, p, i) => { const q=points[(i+1)%points.length]; return sum+p[0]*q[1]-q[0]*p[1]; },0)*.5;
}
function profilePoint(p, height, scale=1) { return new THREE.Vector3(p[0]*scale,height,p[1]*scale); }
function profileNormal(a,b,sign=1) { return new THREE.Vector3((b[1]-a[1])*sign,0,(a[0]-b[0])*sign).normalize(); }
function surfaceMesh(faces,material,name) {
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
function visibleWallPatches(a,b,bottom,top,owners) {
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
function addMappedVolume(group,polygon,height,wall,roof,name,bottom=.25,owners=[]) {
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
function triangleScreen(apex,topA,topB,material) {
  const normal=new THREE.Vector3().crossVectors(topA.clone().sub(apex),topB.clone().sub(apex)).normalize();
  if(normal.x*apex.x+normal.z*apex.z<0)normal.negate();
  const p=[apex,topA,topB].map(v=>v.clone().addScaledVector(normal,.08));
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p.flatMap(v=>v.toArray()),3));g.setAttribute('uv',new THREE.Float32BufferAttribute([.5,0,0,1,1,1],2));g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,material);mesh.name='Independent triangular crown display surface';mesh.userData.glassNormalOffset=.08;mesh.renderOrder=2;return mesh;
}

export function createDevon({ glassMaterial } = {}) {
  const group=new THREE.Group();group.name='Devon Energy Center';
  group.userData={height:257.2,geographicOrigin:DEVON_CAMPUS.origin,footprintSource:'OpenStreetMap way 156035399',facadeSource:'Pickard Chilton photographs; 1.524 m glass-blade module',crownSource:'Photograph-led 34 m broad-face V; Nanometer Lighting 75 ft by 85 ft nested lit area',reconstruction:true};
  const glass=glassMaterial||new THREE.MeshPhysicalMaterial({color:0xa0bbc5,metalness:.62,roughness:.075,ior:1.52});
  const silver=new THREE.MeshStandardMaterial({color:0xb7bec1,roughness:.34,metalness:.48});
  const bright=new THREE.MeshStandardMaterial({color:0xd3d7d4,roughness:.42,metalness:.22});
  const dark=new THREE.MeshStandardMaterial({color:0x323b40,roughness:.62,metalness:.25});
  const stone=new THREE.MeshStandardMaterial({color:0xb2b4af,roughness:.86});
  const plaza=new THREE.MeshStandardMaterial({color:0xbab7aa,roughness:.95});
  const roof=new THREE.MeshStandardMaterial({color:0x909997,roughness:.82});
  const plan=DEVON_CAMPUS.tower,sign=Math.sign(signedPlanArea(plan));
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

  // The architectural V is centered on the OUTWARD crease of each broad
  // elevation. It does not sit above the recessed corner feature walls. The
  // full 34 m chamfer is reconstructed from the photographs; the manufacturer
  // dimensions describe the smaller lighting installation inside that face.
  const crowns=[{a:0,m:4,b:6},{a:11,m:12,b:13},{a:18,m:19,b:21}];
  const corners=[{a:6,b:11,channel:[7,8,9,10]}, {a:13,b:18,channel:[14,15,16,17]}, {a:21,b:0,channel:[22,23,24,25,26,27]}];
  const crownBase=223.2,crownTop=257.2,crownScale=.992,topScale=.972,roofY=239;
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
  const crownFrame=addBeams(group,crownRibs,bright,'Architectural V edges and pointed crown shoulders');crownFrame.castShadow=false;
  const crownGridMesh=addBeams(group,crownGrid,frameMaterial,'Continuous crown curtain-wall grid');softenFrame(crownGridMesh);
  for(const c of corners)for(const i of [c.a,c.b])spineFrames.push([profilePoint(plan[i],4.2),profilePoint(plan[i],210),.12,.18],[profilePoint(plan[i],210),peakPoint(i),.12,.18]);
  const spineFrameCount=spineFrames.length;
  const shaftEdges=addBeams(group,spineFrames,bright,'Recessed corner edges and broad facade creases');shaftEdges.castShadow=false;
  group.add(screens);
  const roofShape=new THREE.Shape(roofBoundary.map(p=>new THREE.Vector2(p.x,-p.z)));
  const roofGeometry=new THREE.ShapeGeometry(roofShape);roofGeometry.rotateX(-Math.PI/2);roofGeometry.translate(0,roofY-.06,0);
  const roofMesh=new THREE.Mesh(roofGeometry,roof);roofMesh.name='Closed mechanical roof at base of projecting crown';roofMesh.castShadow=true;roofMesh.receiveShadow=true;group.add(roofMesh);

  // Ground-level massing now follows the actual connected campus footprints.
  // The rotunda is northwest of the shaft; the long garden wing extends west.
  for(const polygon of DEVON_CAMPUS.plaza)addMappedVolume(group,polygon,.15,plaza,plaza,'Campus paving at mapped building perimeter',.02);
  const podiumGlass=new THREE.MeshPhysicalMaterial({color:0x8eabb2,metalness:.42,roughness:.14,envMapIntensity:.85});
  const campusWallOwners=[{polygon:plan,bottom:.6,top:257.2}];
  for(const polygon of DEVON_CAMPUS.podium) {
    const volume=addMappedVolume(group,polygon,23.8,podiumGlass,roof,'Mapped five-story Devon garden wing',.25,campusWallOwners);
    if(!volume)continue;
    campusWallOwners.push({polygon,bottom:.25,top:24.05});
    const outline=polygon.outer,sgn=Math.sign(signedPlanArea(outline));
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length],n=profileNormal(a,b,sgn),len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1)continue;
      for(const y of [4.8,9.6,14.4,19.2,24.05])spineFrames.push([profilePoint(a,y).addScaledVector(n,.08),profilePoint(b,y).addScaledVector(n,.08),.20,.28]);
      const count=Math.ceil(len/3.05);for(let j=0;j<=count;j++){const u=j/count,q=[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];spineFrames.push([profilePoint(q,.3).addScaledVector(n,.10),profilePoint(q,23.9).addScaledVector(n,.10),.14,.25]);}
    }
  }
  const podiumFrame=addBeams(group,spineFrames.slice(spineFrameCount),bright,'Podium floor bands and silver curtain wall');podiumFrame.castShadow=false;

  const rotundaCenter=new THREE.Vector3(-38.194,0,-23.399),rotundaRadius=17.9,rotundaHeight=36.5;
  const rotundaGlass=new THREE.MeshPhysicalMaterial({color:0x9bb8bc,metalness:.18,roughness:.13,transparent:true,opacity:.48,side:THREE.DoubleSide,depthWrite:false,envMapIntensity:.8});
  addMappedVolume(group,DEVON_CAMPUS.rotunda,rotundaHeight,rotundaGlass,rotundaGlass,'Mapped six-story glazed entrance rotunda',.25,campusWallOwners);
  campusWallOwners.push({polygon:DEVON_CAMPUS.rotunda,bottom:.25,top:rotundaHeight+.25});
  const atriumRibs=[];
  for(let j=0;j<30;j++){const a=j*TAU/30,p=rotundaCenter.clone().add(new THREE.Vector3(Math.cos(a)*rotundaRadius,0,Math.sin(a)*rotundaRadius));atriumRibs.push([p.clone().setY(.4),p.clone().setY(rotundaHeight),.13,.15]);}
  for(const y of [1,5.6,11.2,16.8,22.4,28,33.6,36.5]) {
    const band=new THREE.Mesh(new THREE.TorusGeometry(rotundaRadius,.13,4,60),bright);band.rotation.x=Math.PI/2;band.position.copy(rotundaCenter).setY(y);group.add(band);
    if(y>1&&y<34){const balcony=new THREE.Mesh(new THREE.RingGeometry(12.6,17.7,60),stone);balcony.rotation.x=-Math.PI/2;balcony.position.copy(rotundaCenter).setY(y-.12);balcony.material.side=THREE.DoubleSide;group.add(balcony);}
  }
  const atriumFrame=addBeams(group,atriumRibs,bright,'Rotunda steel structure');atriumFrame.castShadow=false;
  addBox(group,[22,.5,5],[-38.2,4.5,-3.8],bright,'Rotunda entrance canopy');
  addMappedVolume(group,DEVON_CAMPUS.auditorium,10.5,stone,roof,'Mapped Devon auditorium',.25,campusWallOwners);

  const spineMaterial=new THREE.MeshBasicMaterial({color:0xffbd70,toneMapped:true}),lightLines=[];
  for(const c of corners){const middle=c.channel.slice(1,3).map(i=>plan[i]);const q=[(middle[0][0]+middle[1][0])*.5,(middle[0][1]+middle[1][1])*.5];lightLines.push([profilePoint(q,8.4),profilePoint(q,239,.983),.10,.10]);}
  const spineMesh=addBeams(group,lightLines,spineMaterial,'Switchable architectural spine lighting');spineMesh.visible=false;spineMesh.castShadow=false;
  const update=(simTime=0,nightAmount=0,screenEnabled=false)=>{const night=THREE.MathUtils.clamp(nightAmount,0,1);screenMaterial.uniforms.uTime.value=simTime;screenMaterial.uniforms.uNight.value=night;screenMaterial.uniforms.uEnabled.value=screenEnabled?1:0;screens.visible=!!screenEnabled;spineMesh.visible=!!screenEnabled;spineMaterial.color.setHSL(.075+Math.sin(simTime*.045)*.015,.7,.48+night*.13);};
  return {group,update,screenMaterial,screens,height:257.2};
}

export function createLegends({ glassMaterial } = {}) {
  const group = new THREE.Group();
  group.name = 'Legends Tower proposed skyline study';
  group.userData = { height: 581.3, proposed: true, conceptualGeometry: true };
  const glass = glassMaterial || new THREE.MeshPhysicalMaterial({ color: 0x314957, roughness: .09, metalness: 0, ior: 1.5 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x858d99, metalness: .68, roughness: .3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x202b37, metalness: .35, roughness: .5 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x96928c, roughness: .8 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xc1d7ec, toneMapped: true });

  addBox(group, [112, 22, 86], [0, 11, 0], stone, 'Boardwalk podium approximation');
  addBox(group, [114, 1.2, 88], [0, 22, 0], frame);
  const sections = [
    { w: 62, d: 52, bottom: 22, top: 392 },
    { w: 56, d: 46, bottom: 392, top: 468 },
    { w: 47, d: 39, bottom: 468, top: 519 },
    { w: 34, d: 29, bottom: 519, top: 548 },
    { w: 18, d: 16, bottom: 548, top: 565 }
  ];
  const ribs = [];
  for (const s of sections) {
    const y = (s.bottom + s.top) / 2;
    // Use real-world UV coordinates on the large box faces as on Devon.
    const mesh = addBox(group, [s.w, s.top - s.bottom, s.d], [0, y, 0], glass, 'Proposed tower glass tier');
    const geometry = mesh.geometry;
    const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i), p.getY(i) + y);
    }
    addBox(group, [s.w + .55, .65, s.d + .55], [0, s.top, 0], frame, 'Setback rim');
    for (const x of [-s.w / 2, s.w / 2]) for (const z of [-s.d / 2, s.d / 2]) {
      ribs.push([new THREE.Vector3(x, s.bottom, z), new THREE.Vector3(x, s.top, z), .7, .7]);
    }
    for (let x = -s.w / 2 + 6; x < s.w / 2; x += 6) {
      for (const z of [-s.d / 2 - .05, s.d / 2 + .05]) ribs.push([new THREE.Vector3(x, s.bottom, z), new THREE.Vector3(x, s.top, z), .2, .25]);
    }
  }
  addBeams(group, ribs, frame, 'Proposed tower vertical fins');
  addBox(group, [63, 7.8, 53], [0, 270, 0], dark, 'Sky amenity belt');
  addBox(group, [63, 1, 53], [0, 275, 0], frame);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(.12, 1.15, 16.3, 8), frame);
  spire.position.y = 573.15;
  group.add(spire);
  const crownLines = [];
  for (const x of [-15, 15]) for (const z of [-12, 12]) crownLines.push([new THREE.Vector3(x, 519, z), new THREE.Vector3(x * .25, 568, z * .25), .3, .3]);
  const lights = addBeams(group, crownLines, glow, 'Proposed crown illumination');
  lights.visible = false;
  return {
    group,
    height: 581.3,
    update(simTime = 0, nightAmount = 0) {
      lights.visible = nightAmount > .3;
      glow.color.setRGB(.42 + nightAmount * .5, .52 + nightAmount * .42, .68 + nightAmount * .3);
    }
  };
}
