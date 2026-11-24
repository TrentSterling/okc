// Finish the compiler-owned curb risers and physically sloped crossings.
export function bakeStreetDetails(source,{quad,triangle},stats){
  stats.curbEdges=0;stats.curbRampTriangles=0;stats.curbRampFaceTriangles=0;
  for(const edge of source.streetEdges||[]){
    const {a,b,bottom,top,normal}=edge,length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    quad([[a[0],bottom,a[1]],[b[0],bottom,b[1]],[b[0],top,b[1]],[a[0],top,a[1]]],normal,
      'ground.curb',[[0,bottom/4],[length/4,bottom/4],[length/4,top/4],[0,top/4]],true);
    stats.curbEdges++;
  }
  function mesh(record,counter){
    for(const indices of record.triangles){
      let [a,b,c]=indices.map(i=>record.vertices[i]);
      const u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]);
      let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const length=Math.hypot(...n);if(length<1e-9)continue;n=n.map(value=>value/length);
      const target=record.normal||(counter==='curbRampTriangles'?[0,1,0]:null);
      if(target&&n.reduce((sum,x,k)=>sum+x*target[k],0)<0){[b,c]=[c,b];n=n.map(x=>-x);}
      const scale=record.uvScale||4;
      triangle(...[a,b,c].map(p=>[...p,...n,p[0]/scale,p[2]/scale]),record.material,true);
      stats[counter]++;
    }
  }
  for(const ramp of source.streetRamps||[])mesh(ramp,'curbRampTriangles');
  for(const face of source.streetRampFaces||[])mesh(face,'curbRampFaceTriangles');
}
