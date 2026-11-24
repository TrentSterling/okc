// The time slider is an authored solar-altitude sequence, not a dated ephemeris.
// Geometry uses a spherical Earth and a level surrounding horizon. Real terrain,
// weather and atmospheric refraction vary; this is not a sunset-time predictor.
export const EARTH_RADIUS_METRES = 6371000;
export const SUN_ANGULAR_RADIUS = .2666 * Math.PI / 180;
const RAD = Math.PI / 180;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function horizonDip(heightMetres) {
  const h = Math.max(0, heightMetres);
  // atan avoids acos(1-epsilon) cancellation at driver-eye heights in float32.
  return Math.atan(Math.sqrt(h * (2 * EARTH_RADIUS_METRES + h)) / EARTH_RADIUS_METRES);
}

export function solarAltitude(progress) {
  const keys = [[0,.62],[.18,.15],[.45,.04],[.57,0],[.70,-.035],[1,-.16]];
  const p = clamp(progress, 0, 1);
  for (let i=1; i<keys.length; i++) if (p<=keys[i][0]) {
    const [pa,a]=keys[i-1], [pb,b]=keys[i];
    return a+(b-a)*(p-pa)/(pb-pa);
  }
  return keys.at(-1)[1];
}

// Near-horizon standard refraction (34 arcminutes), smoothly diminished away
// from the horizon. This explicit approximation is shared by every height.
// It is deliberately not an extra delay assigned to the tower's material.
export function atmosphericRefraction(geometricAltitude) {
  const elevation = Math.abs(geometricAltitude) / RAD;
  return (34/60) * RAD / (1 + (elevation/2.8)**2);
}

export function apparentSolarAltitude(progress) {
  const geometric = solarAltitude(progress);
  return geometric + atmosphericRefraction(geometric);
}

export function solarDiscVisibility(heightMetres, apparentAltitude) {
  const x = clamp((apparentAltitude+horizonDip(heightMetres))/SUN_ANGULAR_RADIUS, -1, 1);
  return (Math.acos(-x) + x*Math.sqrt(Math.max(0,1-x*x))) / Math.PI;
}

export function reflectedDirection(camera, point, normal) {
  const incident=point.map((x,i)=>x-camera[i]);
  const il=Math.hypot(...incident), nl=Math.hypot(...normal);
  const d=incident.map(x=>x/il), n=normal.map(x=>x/nl);
  const dot=d.reduce((v,x,i)=>v+x*n[i],0);
  return d.map((x,i)=>x-2*dot*n[i]);
}

export const solarGLSL = `
#ifndef PRISM_SOLAR_MODEL
#define PRISM_SOLAR_MODEL
uniform float uSolarCenterAltitude;
uniform vec3 uSunDirection;
float prismHorizonDip(float height) {
 float h=max(height,0.);
 return atan(sqrt(h*(12742000.+h))/6371000.);
}
float prismSolarVisibility(float height) {
 float x=clamp((uSolarCenterAltitude+prismHorizonDip(height))/.004653048,-1.,1.);
 return (acos(-x)+x*sqrt(max(0.,1.-x*x)))/3.14159265359;
}
#endif
`;
