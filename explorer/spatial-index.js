// Shared atlas index. Long features stay in a small overflow list instead of
// expanding across thousands of grid cells; each viewport returns stable order.
export const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
export function boundsOf(points){
 const bounds=[Infinity,Infinity,-Infinity,-Infinity];
 for(const [x,z] of points){bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],z);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],z);}
 return bounds;
}
export function createSpatialIndex(items,{cellSize=1024,maxCells=64}={}){
 const cells=new Map(),overflow=[];
 items.forEach((item,index)=>{
  const [a,b,c,d]=item.b.map(v=>Math.floor(v/cellSize));
  if(![a,b,c,d].every(Number.isFinite))return;
  if((c-a+1)*(d-b+1)>maxCells){overflow.push(index);return;}
  for(let x=a;x<=c;x++)for(let z=b;z<=d;z++){
   const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(index);
  }
 });
 return {query(view){
  const [a,b,c,d]=view.map(v=>Math.floor(v/cellSize));
  if((c-a+1)*(d-b+1)>4096)return items.filter(item=>intersects(item.b,view));
  const found=new Set(overflow);
  for(let x=a;x<=c;x++)for(let z=b;z<=d;z++)for(const index of cells.get(x+','+z)||[])found.add(index);
  return [...found].sort((a,b)=>a-b).map(i=>items[i]).filter(item=>intersects(item.b,view));
 }};
}
