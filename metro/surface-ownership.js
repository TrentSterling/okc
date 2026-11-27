// The preserved downtown surface bake includes a 50 m apron around its driving
// bounds. Streamed surfaces own only the outside, including for older tile data.
export const DOWNTOWN_SURFACE_APRON = 50;
export function surfaceCoreBounds(core) {
  return {minX:core.minX-DOWNTOWN_SURFACE_APRON,maxX:core.maxX+DOWNTOWN_SURFACE_APRON,
    minZ:core.minZ-DOWNTOWN_SURFACE_APRON,maxZ:core.maxZ+DOWNTOWN_SURFACE_APRON};
}
export function boundsRelation(points,bounds,x=0,z=1) {
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const p of points){minX=Math.min(minX,p[x]);maxX=Math.max(maxX,p[x]);minZ=Math.min(minZ,p[z]);maxZ=Math.max(maxZ,p[z]);}
  if(maxX<=bounds.minX||minX>=bounds.maxX||maxZ<=bounds.minZ||minZ>=bounds.maxZ)return 'outside';
  if(minX>=bounds.minX&&maxX<=bounds.maxX&&minZ>=bounds.minZ&&maxZ<=bounds.maxZ)return 'inside';
  return 'crossing';
}
function split(polygon,axis,boundary,sign) {
  const inside=[],outside=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],da=(a[axis]-boundary)*sign,db=(b[axis]-boundary)*sign;
    (da>=0?inside:outside).push(a);
    if((da>0&&db<0)||(da<0&&db>0)){
      const t=da/(da-db),p=a.map((v,j)=>v+(b[j]-v)*t);p[axis]=boundary;inside.push(p);outside.push(p);
    }
    // A boundary vertex belongs to both pieces; adjacent pieces share an edge,
    // never area. This prevents a missing corner when exactly on a tile seam.
    if(da===0)outside.push(a);
  }
  return {inside,outside};
}
export function clipSurfaceTriangle(points,uv,bounds) {
  const relation=boundsRelation(points,bounds,0,2);
  if(relation==='outside')return [{points,uv}];
  if(relation==='inside')return [];
  let remaining=points.map((p,i)=>[...p,...uv[i]]);const pieces=[];
  // Sequentially peel off the four outside half-planes. Each emitted polygon
  // is convex, so a fan preserves the input winding and interpolated UVs.
  for(const [axis,boundary,sign] of [[0,bounds.minX,1],[0,bounds.maxX,-1],[2,bounds.minZ,1],[2,bounds.maxZ,-1]]){
    if(remaining.length<3)break;
    const {inside,outside}=split(remaining,axis,boundary,sign);
    if(outside.length>=3)pieces.push(outside);remaining=inside;
  }
  const triangles=[];
  for(const p of pieces)for(let i=1;i<p.length-1;i++){
    const triangle=[p[0],p[i],p[i+1]],a=triangle[0],b=triangle[1],c=triangle[2];
    if(Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))<1e-8)continue;
    triangles.push({points:triangle.map(v=>v.slice(0,3)),uv:triangle.map(v=>v.slice(3,5))});
  }
  return triangles;
}

// Match the offline compiler, including the rare bridge+tunnel source record.
export const roadDeckHeight = road => .14+Math.max((Number(road.layer)||0)*5,road.bridge&&!road.tunnel?5:0);
