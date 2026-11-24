import * as THREE from 'three';

export function mergeGeometry(parts) {
  // Unioned street polygons can be large. Typed-array copies avoid argument
  // stack limits from spreading a complete triangulated city into push().
  const source=parts.map(g=>g.index?g.toNonIndexed():g);
  const count=source.reduce((n,g)=>n+g.attributes.position.count,0);
  const pos=new Float32Array(count*3),nor=new Float32Array(count*3),uv=new Float32Array(count*2);
  let vertex=0;
  for(const g of source){pos.set(g.attributes.position.array,vertex*3);nor.set(g.attributes.normal.array,vertex*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,vertex*2);vertex+=g.attributes.position.count;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.computeBoundingSphere();return g;
}

export function inPoly(x,z,p){let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
