// Actual projecting trim, with no hidden back plane coplanar with a facade.
export function bakeFacadeBand(wall,band,{wallPoint,quad}){
  const {start:a,end:b,bottom:lo,top:hi}=band,front=band.projection;
  if(b-a<.002||hi-lo<.002||front<=0)return;
  const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
  const t=[(wall.b[0]-wall.a[0])/length,0,(wall.b[1]-wall.a[1])/length],n=[t[2],0,-t[0]];
  const point=(x,y,out)=>wallPoint(wall,x,y,out),material=band.material||'detail.concrete';
  quad([point(a,lo,front),point(b,lo,front),point(b,hi,front),point(a,hi,front)],n,material);
  quad([point(a,hi,0),point(a,hi,front),point(b,hi,front),point(b,hi,0)],[0,1,0],material);
  quad([point(a,lo,0),point(b,lo,0),point(b,lo,front),point(a,lo,front)],[0,-1,0],material);
  quad([point(a,lo,0),point(a,lo,front),point(a,hi,front),point(a,hi,0)],t.map(v=>-v),material);
  quad([point(b,lo,0),point(b,hi,0),point(b,hi,front),point(b,lo,front)],t,material);
}

export function bakeSimpleFrame(wall,opening,{wallPoint,quad}){
  const {start:a,end:b,bottom:lo,top:hi}=opening,trim=.055,out=-.055;
  const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
  const n=[(wall.b[1]-wall.a[1])/length,0,-(wall.b[0]-wall.a[0])/length];
  // These strips are inside the cut aperture, ahead of the inset glass. They
  // never share a plane with the original exterior wall or the glass itself.
  for(const [x0,x1,y0,y1]of[[a,a+trim,lo,hi],[b-trim,b,lo,hi],
    [a+trim,b-trim,lo,lo+trim],[a+trim,b-trim,hi-trim,hi]]){
    quad([wallPoint(wall,x0,y0,out),wallPoint(wall,x1,y0,out),wallPoint(wall,x1,y1,out),wallPoint(wall,x0,y1,out)],n,'detail.darkSteel');
  }
}

export function bakeLandmarkFins(wall,profile,emit){
  const fins=profile?.fins;if(!fins)return;
  const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
  const lo=Math.max(wall.base,fins.bottom),hi=Math.min(wall.top,fins.top);
  if(hi<=lo)return;
  const start=Math.ceil((wall.u+fins.cornerClearance+fins.width/2)/fins.pitch)*fins.pitch-wall.u;
  for(let at=start;at+fins.width/2<length-fins.cornerClearance;at+=fins.pitch){
    bakeFacadeBand(wall,{start:at-fins.width/2,end:at+fins.width/2,bottom:lo,top:hi,
      projection:fins.projection,material:fins.material},emit);
  }
}

export function bakeRoofAssembly(shell,{polygon,quad,wallPoint}){
  const assembly=shell.roofAssembly;
  if(!assembly){for(const roof of shell.roofs)polygon(roof,shell.height,'detail.roof',true,18);return;}
  for(const roof of assembly.deck)polygon(roof,assembly.deckY,'detail.roof',true,18);
  for(const cap of assembly.coping)polygon(cap,shell.height,'detail.coping',true,18);
  for(const wall of assembly.innerWalls){
    const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);if(length<.002)continue;
    const n=[(wall.b[1]-wall.a[1])/length,0,-(wall.b[0]-wall.a[0])/length];
    quad([wallPoint(wall,0,wall.base),wallPoint(wall,length,wall.base),wallPoint(wall,length,wall.top),wallPoint(wall,0,wall.top)],n,'detail.concrete');
  }
}
