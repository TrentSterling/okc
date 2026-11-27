// The geographic base is rendered only after a pan, zoom, layer or tile change.
// Car and route updates reuse this bitmap instead of rescanning metro roads.
export function drawMapBase(ctx,{width,height,dpr,view,scale,screen,roads,surfaces,buildings,districts,layers,labels,selectedBuilding}){
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle='#142326';ctx.fillRect(0,0,width,height);
 function path(points,close=false,begin=true){
  if(begin)ctx.beginPath();
  points.forEach((p,i)=>{const s=screen(...p);i?ctx.lineTo(...s):ctx.moveTo(...s);});
  if(close)ctx.closePath();
 }
 function polygon(feature){path(feature.p,true);for(const hole of feature.holes||[])path(hole,true,false);}
 const grid=scale>.15?512:2048;ctx.lineWidth=1;ctx.strokeStyle='rgba(196,215,202,.035)';ctx.beginPath();
 for(let x=Math.floor(view[0]/grid)*grid;x<view[2];x+=grid){const sx=screen(x,0)[0];ctx.moveTo(sx,0);ctx.lineTo(sx,height);}
 for(let z=Math.floor(view[1]/grid)*grid;z<view[3];z+=grid){const sy=screen(0,z)[1];ctx.moveTo(0,sy);ctx.lineTo(width,sy);}ctx.stroke();
 for(const s of surfaces){
  const water=/water|lake|river|reservoir|canal|pond/.test(s.kind||'');
  if(water&&!layers.water||!water&&!layers.parks)continue;
  polygon(s);ctx.fillStyle=water?'#24444d':/park|forest|wood|grass|nature/.test(s.kind||'')?'#203f33':'#253335';ctx.fill('evenodd');
 }
 if(layers.buildings&&scale>=.18)for(const b of buildings){
  polygon(b);ctx.fillStyle=b.id===selectedBuilding?'#d3b97999':/^#[0-9a-f]{6}$/i.test(b.color||'')?b.color+'65':'#8c99843b';ctx.fill('evenodd');
  if(scale>.3){ctx.strokeStyle=b.id===selectedBuilding?'#f2cc87':'#a0b59b66';ctx.lineWidth=b.id===selectedBuilding?2:.65;ctx.stroke();}
 }
 if(layers.roads){
  ctx.lineJoin='round';ctx.lineCap='round';
  for(const r of roads){
   const major=/motorway|trunk|primary/.test(r.kind||r.type||''),secondary=/secondary|tertiary/.test(r.kind||r.type||'');
   if(scale<.035&&!major&&!secondary)continue;
   path(r.p);ctx.lineWidth=major?Math.max(2,Math.min(7,(r.w||15)*scale)):secondary?Math.max(1.2,Math.min(5,(r.w||10)*scale)):Math.max(.65,Math.min(3,(r.w||5)*scale));ctx.strokeStyle=major?'#70817a':secondary?'#465d57':'#304440';ctx.stroke();
  }
  if(scale>.09&&labels){
   const cells=new Set();ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillStyle='#b3c1b7';
   for(const r of roads){
    if(!r.name)continue;
    const s=screen(...r.p[Math.floor(r.p.length/2)]);if(s[0]<0||s[0]>width||s[1]<0||s[1]>height)continue;
    const key=Math.floor(s[0]/170)+':'+Math.floor(s[1]/65);if(cells.has(key))continue;cells.add(key);ctx.fillText(r.name,s[0],s[1]-6);
   }
  }
 }
 if(labels&&scale<.28){ctx.textAlign='center';ctx.font='600 13px system-ui';ctx.fillStyle='rgba(212,224,211,.63)';for(const d of districts){if(d.x!=null&&d.z!=null)ctx.fillText(String(d.name).toUpperCase(),...screen(d.x,d.z));}}
}
