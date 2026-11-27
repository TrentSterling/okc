// Pure geometry compiler shared by the streaming worker and regression checks.
// Footprints are source geometry; facade openings and unmeasured roofs are visual estimates.
import {ShapeUtils,Vector2} from '../vendor/three.module.js';
import {interpretRoof} from './roof-shapes.js';
import {surfaceCoreBounds,boundsRelation,clipSurfaceTriangle,roadDeckHeight} from './surface-ownership.js';
import {meshBounds} from './mesh-bounds.js';
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Render precedence for nested mapped regions, not surveyed terrain elevations.
// A park may contain woodland and parking; all remain below the .14 m road deck.
const surfaceHeight={water:-.02,grass:.008,forest:.04,parking:.08};
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const clean=p=>{const a=p.filter((q,i)=>!i||Math.hypot(q[0]-p[i-1][0],q[1]-p[i-1][1])>.02);if(a.length>2&&Math.hypot(a[0][0]-a.at(-1)[0],a[0][1]-a.at(-1)[1])<.02)a.pop();return a;};
export function compileTile(tile,{detail=true,overrides={},core={minX:-1600,maxX:1600,minZ:-1140,maxZ:1120},surfaceCore=surfaceCoreBounds(core)}={}){
 const buckets=new Map(),buildings=[],lamps=[],trees=[],signs=[];let layer='roads';
 function bucket(k){const key=layer+':'+k;if(!buckets.has(key))buckets.set(key,{kind:k,layer,p:[],n:[],u:[]});return buckets.get(key);}
 function tri(k,a,b,c,uv=[[0,0],[1,0],[1,1]],excludeCore=false){if(excludeCore){for(const piece of clipSurfaceTriangle([a,b,c],uv,surfaceCore))tri(k,...piece.points,piece.uv);return;}const o=bucket(k),ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;for(let i=0;i<3;i++){o.p.push(...[a,b,c][i]);o.n.push(nx,ny,nz);o.u.push(...uv[i]);}}
 function quad(k,a,b,c,d,uv=[[0,0],[1,0],[1,1],[0,1]],excludeCore=false){tri(k,a,b,c,uv.slice(0,3),excludeCore);tri(k,a,c,d,[uv[0],uv[2],uv[3]],excludeCore);}
 function flat(k,p,y,holes=[],excludeCore=false){p=clean(p);holes=holes.map(clean).filter(r=>r.length>2);if(p.length<3)return;if(excludeCore){const relation=boundsRelation(p,surfaceCore);if(relation==='inside')return;excludeCore=relation==='crossing';}const points=p.concat(...holes);const faces=ShapeUtils.triangulateShape(p.map(a=>new Vector2(...a)),holes.map(r=>r.map(a=>new Vector2(...a))));for(const face of faces){let [a,b,c]=face.map(i=>points[i]);if(cross(a,b,c)>0)[b,c]=[c,b];const at=p=>typeof y==='function'?y(p[0],p[1]):y;tri(k,[a[0],at(a),a[1]],[b[0],at(b),b[1]],[c[0],at(c),c[1]],[[a[0]/5,a[1]/5],[b[0]/5,b[1]/5],[c[0]/5,c[1]/5]],excludeCore);}}
 function box(k,x,y,z,w,h,d,rot=0){const cs=Math.cos(rot),sn=Math.sin(rot);const v=(a,b,c)=>[x+a*cs-c*sn,y+b,z+a*sn+c*cs];const a=v(-w/2,0,-d/2),b=v(w/2,0,-d/2),c=v(w/2,0,d/2),e=v(-w/2,0,d/2),A=v(-w/2,h,-d/2),B=v(w/2,h,-d/2),C=v(w/2,h,d/2),E=v(-w/2,h,d/2);quad(k,a,A,B,b);quad(k,b,B,C,c);quad(k,c,C,E,e);quad(k,e,E,A,a);quad(k,A,E,C,B);}
 const inCore=p=>p[0]>=core.minX&&p[0]<=core.maxX&&p[1]>=core.minZ&&p[1]<=core.maxZ;
 for(const s of tile.meshes||[]){const kind=s.kind==='sidewalk'?'concrete':s.kind==='road'?'asphalt':s.kind;flat(kind,s.p,s.y??.02,s.holes||[],true);}
 for(const s of tile.surfaces||[]){if(s.skipCore)continue;const kind=/water|river|lake/.test(s.kind)?'water':/parking/.test(s.kind)?'parking':/wood|forest/.test(s.kind)?'forest':'grass';layer=kind==='water'?'water':kind==='parking'?'roads':'parks';for(const patch of s.renderPatches||[s])flat(kind,patch.p,surfaceHeight[kind],patch.holes||[],true);}
 layer='roads';
 // If a dataset has no precompiled road union, render its centerline ribbons.
 if(!tile.meshes?.some(m=>m.kind==='road'))for(const r of tile.roads||[]){const p=r.p||[],w=r.w||7,y=roadDeckHeight(r);for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i];if(inCore(a)&&inCore(b))continue;const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<.01)continue;const nx=-dz/l*w/2,nz=dx/l*w/2;flat('asphalt',[[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz]],y,[],true);}}
 layer='buildings';
 for(const raw of tile.buildings||[]){const b={...raw,...(overrides[raw.id]||{})};let p=clean(b.p||[]);if(p.length<3||b.skipCore||p.some(inCore))continue;const h=clamp(Number(b.h)||6,2,500),seed=hash(b.id),kind=b.kind||'building';let signed=0;for(let i=0;i<p.length;i++){let a=p[i],q=p[(i+1)%p.length];signed+=a[0]*q[1]-q[0]*a[1];}if(signed<0)p.reverse();const cx=p.reduce((s,q)=>s+q[0],0)/p.length,cz=p.reduce((s,q)=>s+q[1],0)/p.length;const residential=/house|residential|detached|terrace|garage/.test(kind)||h<5.5;const material=b.material==='brick'?'brick0':b.material==='stucco'?'stucco':b.material==='stone'?'stone':residential?'brick'+seed%3:/warehouse|industrial/.test(kind)?'metal':seed%4===0?'stucco':'brick'+seed%3;
  const roof=interpretRoof(b,p,h,residential),rings=[roof.boundary,...(b.holes||[]).map(r=>{const ring=clean(r);let area=0;for(let i=0;i<ring.length;i++){const a=ring[i],q=ring[(i+1)%ring.length];area+=a[0]*q[1]-q[0]*a[1];}return area>0?ring.reverse():ring;})];
  for(let ri=0;ri<rings.length;ri++){const ring=rings[ri];for(let i=0;i<ring.length;i++){const a=ring[i],q=ring[(i+1)%ring.length],dx=q[0]-a[0],dz=q[1]-a[1],l=Math.hypot(dx,dz);if(l<.1)continue;const nx=dz/l,nz=-dx/l;const ah=roof.heightAt(...a),qh=roof.heightAt(...q);quad(material,[a[0],.1,a[1]],[a[0],ah,a[1]],[q[0],qh,q[1]],[q[0],.1,q[1]],[[0,0],[0,h/3],[l/3,h/3],[l/3,0]]);
   if(detail&&l>3&&h<80){const pitch=residential?3.8:3.2,count=Math.min(40,Math.floor((l-1)/pitch)),rows=Math.min(6,Math.max(1,Math.floor(h/3.4)));for(let row=0;row<rows;row++)for(let j=0;j<count;j++){const t=(j+1)/(count+1),x=a[0]+dx*t+nx*.035,z=a[1]+dz*t+nz*.035,y=1.1+row*3.1,ww=residential?1.1:Math.min(2.1,l/(count+1)*.68),hh=residential?1.15:1.7;if(y+hh>roof.eaves-.35)continue;const ux=dx/l*ww/2,uz=dz/l*ww/2;quad((seed+j+row*3)%5===0?'warmWindow':'window',[x-ux,y,z-uz],[x-ux,y+hh,z-uz],[x+ux,y+hh,z+uz],[x+ux,y,z+uz]);}
    // One inferred entrance on a long frontage, never represented as surveyed.
    if(ri===0&&i===0&&l>5){const x=(a[0]+q[0])/2+nx*.05,z=(a[1]+q[1])/2+nz*.05,ux=dx/l*.6,uz=dz/l*.6;quad('door',[x-ux,.12,z-uz],[x-ux,2.35,z-uz],[x+ux,2.35,z+uz],[x+ux,.12,z+uz]);}
   }
  }
  }
  for(const ring of roof.pieces)flat('roof',ring,roof.heightAt,roof.shape==='flat'?b.holes||[]:[]);
  if(detail&&!residential&&h<45&&roof.shape==='flat'){const width=Math.max(...p.map(q=>q[0]))-Math.min(...p.map(q=>q[0])),depth=Math.max(...p.map(q=>q[1]))-Math.min(...p.map(q=>q[1]));if(width>12&&depth>12)box('rooftop',cx,h+.1,cz,2.3,1.1,1.5);}
  buildings.push({...b,p,h,x:cx,z:cz,residential,renderedRoof:roof.shape,renderedRoofSource:roof.source,detail:detail?'Procedural facade on mapped footprint':'Mapped footprint massing'});
  if(detail&&seed%3===0&&h<18){for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let j=0;j<l;j+=2.2)lamps.push([a[0]+(b[0]-a[0])*j/l,roof.heightAt(a[0]+(b[0]-a[0])*j/l,a[1]+(b[1]-a[1])*j/l)+.16,a[1]+(b[1]-a[1])*j/l,(seed+i+Math.floor(j))%5]);}}
 }
 layer='roads';
 for(const r of tile.roads||[]){if(!detail||/footway|path|cycleway|steps|service/.test(r.kind))continue;const p=r.p||[],w=r.w||8,y=roadDeckHeight(r)+.015;let acc=hash(r.id)%35;for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<.1)continue;const nx=-dz/l,nz=dx/l;
  if(!inCore(a)&&!inCore(b)&&w>=8)for(let d=3;d<l-3;d+=13){const len=Math.min(4,l-d),x=a[0]+dx*d/l,z=a[1]+dz*d/l;quad(r.oneway?'paint':'yellow',[x-nx*.08,y,z-nz*.08],[x+nx*.08,y,z+nz*.08],[x+dx*len/l+nx*.08,y,z+dz*len/l+nz*.08],[x+dx*len/l-nx*.08,y,z+dz*len/l-nz*.08],undefined,true);}
  acc+=l;if(acc>110&&!inCore(b)){acc=0;const x=b[0]+nx*(w/2+1.8),z=b[1]+nz*(w/2+1.8);box('pole',x,y-.015,z,.15,6,.15);box('pole',x+nx*.6,y+5.72,z+nz*.6,1.4,.12,.15,Math.atan2(nz,nx));lamps.push([x+nx*1.15,y+5.87,z+nz*1.15,5]);}
 }}
 if(detail)for(const point of tile.details||[]){if(point.kind!=='tree'||!point.p?.every(Number.isFinite)||inCore(point.p))continue;const seed=hash(point.id),h=clamp(parseFloat(point.tags?.height)||6+seed%5,2,30);trees.push({id:point.id,x:point.p[0],z:point.p[1],h,conifer:point.tags?.leaf_type==='needleleaved',source:'Mapped OSM tree; estimated canopy'});}
 const meshes=[];for(const v of buckets.values()){if(v.p.length){const positions=new Float32Array(v.p);meshes.push({kind:v.kind,layer:v.layer,positions,normals:new Float32Array(v.n),uvs:new Float32Array(v.u),bounds:meshBounds(positions)});}}
 return {id:tile.id,meshes,buildings,lamps,trees,signs};
}
