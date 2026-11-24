import * as THREE from 'three';
import { CITY_DATA } from '../city-data.js';

export function addLandmarks({group,random,addBox,mergePart,compactStaticGroup,materials}) {
  const {concrete,steel,white,roofMat,masonry,gold}=materials;
  function flatPolygon(p,y,mat,scaleUV=18){
    const outer=p.outer||p;if(outer.length<4)return;
    const path=ring=>ring.map(q=>new THREE.Vector2(q[0],-q[1]));
    const shape=new THREE.Shape(path(outer));for(const hole of p.holes||[])shape.holes.push(new THREE.Path(path(hole)));
    const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);g.translate(0,y,0);
    // Submillimeter GIS slivers can collapse after Float32 conversion. Remove
    // those zero-area triangles rather than submitting duplicate vertices.
    const position=g.attributes.position,indices=g.index?.array;
    if(indices){const keep=[];for(let i=0;i<indices.length;i+=3){const a=indices[i],b=indices[i+1],c=indices[i+2],ax=position.getX(a),az=position.getZ(a);const area=(position.getX(b)-ax)*(position.getZ(c)-az)-(position.getZ(b)-az)*(position.getX(c)-ax);if(Math.abs(area)>1e-9)keep.push(a,b,c);}g.setIndex(keep);}
    // Use the actual width-offset vertex positions, never centerline UVs.
    // Both axes now retain area, so asphalt noise does not stretch into bands.
    const uv=g.attributes.uv,pos=g.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)/scaleUV,pos.getZ(i)/scaleUV);
    mergePart(g,mat,false);
  }
  function footprint(p,height,mat,base=0,wallOverride=null){let q=p.slice();if(q[0][0]===q[q.length-1][0]&&q[0][1]===q[q.length-1][1])q.pop();if(q.length<3)return;
    let signed=0;for(let i=0;i<q.length;i++){const a=q[i],b=q[(i+1)%q.length];signed+=a[0]*b[1]-b[0]*a[1];}if(signed<0)q.reverse();
    const pos=[],normal=[],uv=[];let distance=0;
    const edges=wallOverride||q.map((a,i)=>{const b=q[(i+1)%q.length],u=distance;distance+=Math.hypot(b[0]-a[0],b[1]-a[1]);return {a,b,base:0,u};});
    for(const edge of edges){
      const {a,b}=edge,low=Math.max(base,edge.base),dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.02||low>=height-.001)continue;
      const v=[[b[0],low,b[1]],[a[0],low,a[1]],[a[0],height,a[1]],[b[0],low,b[1]],[a[0],height,a[1]],[b[0],height,b[1]]];
      const us=[edge.u+len,edge.u,edge.u,edge.u+len,edge.u,edge.u+len],vs=[low,low,height,low,height,height];
      for(let k=0;k<6;k++){pos.push(...v[k]);normal.push(dz/len,0,-dx/len);uv.push(us[k]/14.4,vs[k]/56);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));mergePart(g,mat,true);flatPolygon([...q,q[0]],height+.02,roofMat);
  }
  function center(p){let x=0,z=0;for(const q of p){x+=q[0];z+=q[1];}return[x/p.length,z/p.length];}
  // Specialized open structures and crown tips stay separate from the baked
  // generic shell. Their mapped footprints never receive a second solid box.
  for(const b of CITY_DATA.buildings){
    const c=center(b.p);
    if(b.id===257271||b.kind==='carousel'){
      const platform=new THREE.Mesh(new THREE.CylinderGeometry(10.3,10.3,.24,40),concrete);platform.position.set(c[0],.16,c[1]);platform.receiveShadow=true;group.add(platform);
      const canopy=new THREE.Mesh(new THREE.ConeGeometry(10.6,2.0,32),white);canopy.position.set(c[0],4.0,c[1]);canopy.castShadow=true;group.add(canopy);
      for(let i=0;i<12;i++){const a=i*Math.PI/6;addBox(steel,c[0]+Math.cos(a)*9.4,1.65,c[1]+Math.sin(a)*9.4,.12,3.0,.12);}
      addBox(concrete,c[0],1.9,c[1],1.1,3.4,1.1);
    }else if(b.kind==='deco'&&b.h>100){
      const tip=new THREE.Mesh(new THREE.ConeGeometry(5.2,3,4),gold);tip.rotation.y=Math.PI/4;tip.position.set(c[0],b.h-1.5,c[1]);tip.castShadow=true;group.add(tip);
    }
  }
  // Crystal Bridge is positioned and oriented from its mapped footprint.
  const bridge=CITY_DATA.features.find(f=>f.name==='Crystal Bridge Tropical Conservatory');
  if(bridge){const c=bridge.center;let max=0,aa,bb;for(const a of bridge.p)for(const b of bridge.p){const d=(a[0]-b[0])**2+(a[1]-b[1])**2;if(d>max){max=d;aa=a;bb=b;}}
    const theta=-Math.atan2(bb[1]-aa[1],bb[0]-aa[0]);const conservatory=new THREE.Group();conservatory.name='Crystal Bridge / mapped footprint';conservatory.position.set(c[0],0,c[1]);conservatory.rotation.y=theta;
    const gm=new THREE.MeshPhysicalMaterial({color:0x90aaa5,metalness:.18,roughness:.16,clearcoat:1,transparent:true,opacity:.56,depthWrite:false,side:THREE.DoubleSide});const tube=new THREE.Mesh(new THREE.CylinderGeometry(10.3,10.3,68,32,1,true),gm);tube.rotation.z=Math.PI/2;tube.position.y=11;conservatory.add(tube);
    const ring=new THREE.TorusGeometry(10.35,.13,4,40).rotateY(Math.PI/2);for(let i=0;i<=14;i++){const m=new THREE.Mesh(ring,white);m.position.set(-34+i*68/14,11,0);conservatory.add(m);}for(let i=0;i<13;i++){const a=i*Math.PI*2/13;const m=new THREE.Mesh(new THREE.BoxGeometry(68,.11,.13),steel);m.position.set(0,11+Math.cos(a)*10.35,Math.sin(a)*10.35);conservatory.add(m);}
    for(const end of [-34,34]){const cap=new THREE.Mesh(new THREE.CircleGeometry(10.3,48),gm);cap.rotation.y=Math.PI/2;cap.position.set(end,11,0);conservatory.add(cap);for(let v=-8;v<=8;v+=2.6){const reach=Math.sqrt(10.3**2-v**2)*2;const upright=new THREE.Mesh(new THREE.BoxGeometry(.18,reach,.13),steel);upright.position.set(end,11,v);conservatory.add(upright);const horizontal=new THREE.Mesh(new THREE.BoxGeometry(.18,.13,reach),steel);horizontal.position.set(end,11+v,0);conservatory.add(horizontal);}}
    const floor=new THREE.Mesh(new THREE.BoxGeometry(68,.35,7.5),concrete);floor.position.y=1.8;conservatory.add(floor);
    const interiorLeaves=new THREE.MeshStandardMaterial({color:0x486746,roughness:.9}),planterMat=new THREE.MeshStandardMaterial({color:0x6e6250,roughness:.95});
    for(let i=0;i<18;i++){const x=-28+i*3.3,z=(i%2?1:-1)*(3.2+random()*2);const planter=new THREE.Mesh(new THREE.BoxGeometry(2.5,1.1,2.2),planterMat);planter.position.set(x,2.3,z);conservatory.add(planter);for(let k=0;k<3;k++){const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),interiorLeaves);crown.scale.set(1.4,2+random()*2,1.4);crown.position.set(x+(random()-.5)*1.6,4+k*1.2,z);conservatory.add(crown);}}
    // The conservatory has more than a hundred fixed ribs, panes and plants.
    // Bake their transforms into a handful of material meshes once, instead
    // of paying a separate draw call for every small repeated piece.
    compactStaticGroup(conservatory);group.add(conservatory);
  }
  const arena=CITY_DATA.features.find(f=>f.name==='Paycom Center');
  if(arena){footprint(arena.p,23,masonry[1]);const c=arena.center,xs=arena.p.map(p=>p[0]),zs=arena.p.map(p=>p[1]);const r=new THREE.Mesh(new THREE.SphereGeometry(1,40,16,0,Math.PI*2,0,Math.PI/2),roofMat);r.scale.set((Math.max(...xs)-Math.min(...xs))*.47,10,(Math.max(...zs)-Math.min(...zs))*.47);r.position.set(c[0],23,c[1]);r.castShadow=true;group.add(r);}
}
