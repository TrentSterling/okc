// Compute once alongside worker geometry so mounting never scans vertex data.
// The box diagonal gives a conservative sphere containing every source vertex.
export function meshBounds(positions) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i++){
    const axis=i%3,value=positions[i];min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);
  }
  const center=min.map((value,i)=>(value+max[i])/2);
  return {min,max,center,radius:Math.hypot(...max.map((value,i)=>value-min[i]))/2};
}
