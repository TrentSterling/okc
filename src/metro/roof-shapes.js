// Footprint-preserving roof interpretation. Building height remains the total
// envelope height; inferred roofs are visual estimates, never surveyed details.
const area = ring => Math.abs(ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length];
  return sum + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;
const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < .02;
function clip(ring, value, positive) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], av = value(a), bv = value(b);
    const insideA = positive ? av >= -1e-8 : av <= 1e-8;
    const insideB = positive ? bv >= -1e-8 : bv <= 1e-8;
    if (insideA) out.push(a);
    if (insideA !== insideB) {
      const t = av / (av - bv);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out.filter((p, i) => !i || !close(p, out[i - 1])).filter((p, i, all) => i !== all.length - 1 || !close(p, all[0]));
}

export function interpretRoof(building, footprint, height, residential) {
  const named = String(building.roof || building.roofShape || 'unknown').toLowerCase();
  const flat = {shape: 'flat', source: named === 'flat' ? building.roofSource || 'OSM roof:shape' : 'Simplified roof approximation',
    eaves: height, heightAt: () => height, boundary: footprint, pieces: [footprint]};
  if (building.holes?.length || footprint.length < 3 || named === 'flat') return flat;
  // A concave footprint can split into disconnected pieces at a ridge. Keep
  // its flat top until the offline compiler supplies a proper roof skeleton.
  let turn = 0;
  for(let i=0;i<footprint.length;i++){const a=footprint[i],b=footprint[(i+1)%footprint.length],c=footprint[(i+2)%footprint.length],cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);if(Math.abs(cross)<.01)continue;if(turn&&Math.sign(cross)!==turn)return flat;turn=Math.sign(cross);}
  let longest = 0, ux = 1, uz = 0;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > longest) { longest = length; ux = (b[0] - a[0]) / length; uz = (b[1] - a[1]) / length; }
  }
  let vx = -uz, vz = ux;
  const bounds = () => {
    const us = footprint.map(p => p[0] * ux + p[1] * uz), vs = footprint.map(p => p[0] * vx + p[1] * vz);
    return {minU: Math.min(...us), maxU: Math.max(...us), minV: Math.min(...vs), maxV: Math.max(...vs)};
  };
  let box = bounds();
  if (box.maxU - box.minU < box.maxV - box.minV) { [ux, uz, vx, vz] = [vx, vz, -ux, -uz]; box = bounds(); }
  if(building.roofOrientation==='across'){[ux,uz,vx,vz]=[vx,vz,-ux,-uz];box=bounds();}
  if(named==='skillion'&&Number.isFinite(building.roofDirection)){const radians=building.roofDirection*Math.PI/180;vx=Math.sin(radians);vz=-Math.cos(radians);ux=vz;uz=-vx;box=bounds();}
  const length = box.maxU - box.minU, width = box.maxV - box.minV, fill = area(footprint) / (length * width || 1);
  const inferred = ['unknown', 'yes', ''].includes(named);
  if (width < 3 || width > 35 || fill < .83 || (inferred && (!residential || area(footprint) > 600 || height > 15))) return flat;
  // Complex/unsupported source roof forms retain their footprint and a labeled
  // simplified top instead of creating geometry outside the mapped envelope.
  if (!inferred && !['gabled', 'gable', 'hipped', 'pyramidal', 'skillion'].includes(named)) return flat;
  const source = inferred ? 'Inferred residential pitched roof' : building.roofSource || 'OSM roof:shape';
  const rise = Math.min(height - 2.2, Math.max(.65, Math.min(Number(building.roofHeight) || width * .23, 5)));
  if (rise < .5) return flat;
  const eaves = height - rise, centerV = (box.minV + box.maxV) / 2;
  const v = p => p[0] * vx + p[1] * vz - centerV;
  const heightAt = (x, z) => eaves + rise * Math.max(0, 1 - Math.abs(x * vx + z * vz - centerV) / (width / 2));
  if (named === 'skillion') {
    const slope = (x, z) => eaves + rise * Math.max(0, Math.min(1, (box.maxV - x * vx - z * vz) / width));
    return {shape: 'skillion', source, eaves, heightAt: slope, boundary: footprint, pieces: [footprint]};
  }
  if(['hipped','pyramidal'].includes(named)) {
    const uSpan=named==='pyramidal'?length/2:Math.min(length,width)/2,vSpan=width/2;
    const facets=[p=>(p[0]*ux+p[1]*uz-box.minU)/uSpan,p=>(box.maxU-p[0]*ux-p[1]*uz)/uSpan,p=>(p[0]*vx+p[1]*vz-box.minV)/vSpan,p=>(box.maxV-p[0]*vx-p[1]*vz)/vSpan];
    const surface=(x,z)=>eaves+rise*Math.max(0,Math.min(1,...facets.map(value=>value([x,z]))));
    const pieces=facets.map((facet,index)=>facets.reduce((ring,other,j)=>j===index?ring:clip(ring,p=>other(p)-facet(p),true),footprint)).filter(ring=>ring.length>=3);
    const boundary=[];
    for(let i=0;i<footprint.length;i++){const a=footprint[i],b=footprint[(i+1)%footprint.length],cuts=[0];for(let f=0;f<facets.length;f++)for(let j=f+1;j<facets.length;j++){const av=facets[f](a)-facets[j](a),bv=facets[f](b)-facets[j](b);if(av*bv<0)cuts.push(av/(av-bv));}for(const t of cuts.sort((x,y)=>x-y))boundary.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    return {shape:named,source,eaves,heightAt:surface,boundary:boundary.filter((p,i)=>!i||!close(p,boundary[i-1])),pieces};
  }
  const boundary = [];
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length], av = v(a), bv = v(b);
    boundary.push(a);
    if (av * bv < -1e-8) {
      const t = av / (av - bv);
      boundary.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return {shape: 'gabled', source, eaves, heightAt, boundary,
    pieces: [clip(footprint, v, false), clip(footprint, v, true)].filter(ring => ring.length >= 3)};
}
