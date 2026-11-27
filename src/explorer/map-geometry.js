export const pointsOf=item=>(item.p||item.points||[]).map(p=>Array.isArray(p)?p:[p.x,p.z]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
export const waterKind=item=>/water|lake|river|reservoir|canal|pond/.test(item.kind||'');
export const parkKind=item=>/park|forest|wood|grass|nature/.test(item.kind||'');
export function buildingStyle(item){const supplied=/^#[0-9a-f]{6}$/i.test(item.color||'');return supplied?{color:item.color,opacity:101/255,fill:item.color+'65'}:{color:'#8c9984',opacity:59/255,fill:'#8c99843b'};}
const linearChannel=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
function buildingTint(item){const style=buildingStyle(item),hex=parseInt(style.color.slice(1),16);return [linearChannel(((hex>>16)&255)/255),linearChannel(((hex>>8)&255)/255),linearChannel((hex&255)/255),style.opacity];}
export function roadClass(item){return /motorway|trunk|primary/.test(item.kind||item.type||'')?2:/secondary|tertiary/.test(item.kind||item.type||'')?1:0;}
export function roadWidth(kind,width,scale){return kind===2?Math.max(2,Math.min(7,width*scale)):kind===1?Math.max(1.2,Math.min(5,width*scale)):Math.max(.65,Math.min(3,width*scale));}
export function triangulateFeatures(items,triangulate,colorOutput){
 const vertices=[];
 for(const item of items){
  const outer=pointsOf(item),holes=(item.holes||[]).map(p=>pointsOf({p})).filter(p=>p.length>2);
  if(outer.length<3)continue;
  const contour=outer.map(([x,y])=>({x,y,equals(p){return p.x===x&&p.y===y;}})),inner=holes.map(h=>h.map(([x,y])=>({x,y,equals(p){return p.x===x&&p.y===y;}})));
  // ShapeUtils removes duplicate closing vertices. Use exactly the resulting
  // contour order for the returned triangle indices, including courtyard holes.
  const faces=triangulate(contour,inner),all=[...contour,...inner.flat()],tint=colorOutput?buildingTint(item):null;
  for(const face of faces)for(const index of face){const p=all[index];if(p){vertices.push(p.x,p.y);if(tint)colorOutput.push(...tint);}}
 }
 return new Float32Array(vertices);
}
export function packMapGeometry({roads=[],surfaces=[],buildings=[]}={},triangulate){
 const roadGroups=[[],[],[]];
 for(const road of roads){const p=pointsOf(road),kind=roadClass(road),out=roadGroups[kind],width=road.w||(kind===2?15:kind===1?10:5);for(let i=1;i<p.length;i++)if(p[i][0]!==p[i-1][0]||p[i][1]!==p[i-1][1])out.push(...p[i-1],...p[i],width);}
 const buildingColors=[],footprints=triangulateFeatures(buildings,triangulate,buildingColors);
 return {roads:roadGroups.map(v=>new Float32Array(v)),land:triangulateFeatures(surfaces.filter(v=>!waterKind(v)&&!parkKind(v)),triangulate),parks:triangulateFeatures(surfaces.filter(v=>!waterKind(v)&&parkKind(v)),triangulate),water:triangulateFeatures(surfaces.filter(waterKind),triangulate),buildings:footprints,buildingColors:new Float32Array(buildingColors)};
}
