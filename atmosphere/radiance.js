import {solarGLSL} from './solar.js';

// One HDR radiance field supplies the camera sky and the filtered environment.
// Color bands belong to sky directions, never facade UVs or screen coordinates.
// This is a directional twilight reconstruction, not a measured weather model.
export const skyGLSL = `
${solarGLSL}
uniform float uProgress;
uniform float uSunDisk;
uniform float uStyle;
uniform float uNeutral;
uniform float uObserverHeight;
float prismSq(float x){return x*x;}
float prismHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float prismNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(prismHash(i),prismHash(i+vec2(1,0)),f.x),mix(prismHash(i+vec2(0,1)),prismHash(i+vec2(1,1)),f.x),f.y);}
float prismFbm(vec2 p){float a=.5,v=0.;for(int i=0;i<5;i++){v+=a*prismNoise(p);p=mat2(1.61,1.23,-1.23,1.61)*p+2.7;a*=.48;}return v;}
float prismTwilight(){return 1.-smoothstep(.018,.115,max(-uSolarCenterAltitude,0.));}
vec3 prismClearSky(vec3 d) {
 float h=max(d.y,0.);
 float dusk=smoothstep(.10,.65,uProgress),late=smoothstep(.68,.98,uProgress);
 float golden=smoothstep(.035,.18,uProgress),twilight=prismTwilight();
 vec3 zen=mix(vec3(.085,.215,.43),vec3(.032,.095,.245),dusk);
 zen=mix(zen,vec3(.003,.006,.017),late);
 vec3 horizon=mix(vec3(.47,.59,.72),vec3(.115,.18,.32),dusk);
 horizon=mix(horizon,vec3(.012,.019,.036),late);
 vec3 c=mix(horizon,zen,pow(h,.44));
 vec2 dh=normalize(d.xz+vec2(.00001)),sh=normalize(uSunDirection.xz);
 float facing=max(dot(dh,sh),0.),west=pow(facing,2.);
 // The lower western sky remains sunlit through twilight while the opposite
 // hemisphere darkens. Moving along Reno changes which part a pane reflects.
 float warmHeight=mix(max(uSunDirection.y,.015),.035,dusk);
 float warmWidth=mix(.065,.115,dusk);
 float warm=exp(-prismSq((h-warmHeight)/warmWidth))*west*golden*twilight;
 vec3 amber=mix(vec3(2.7,1.55,.68),vec3(3.25,1.28,.42),dusk);
 c+=amber*warm;
 float pink=exp(-prismSq((h-.15)/.12))*pow(max(dot(dh,sh)*.5+.5,0.),2.);
 c+=vec3(.31,.095,.12)*pink*sin(clamp(uProgress,0.,1.)*3.14159)*twilight;
 float east=pow(max(-dot(dh,sh),0.),2.);
 c+=vec3(.10,.035,.055)*exp(-prismSq((h-.055)/.065))*east*dusk*twilight;
 return c;
}
vec3 prismGroundRadiance(vec3 d) {
 float late=smoothstep(.68,.98,uProgress);
 // Unresolved distant terrain only. The separate local geometry cubemap
 // supplies the actual roads/buildings and is never box-projected onto sky.
 return mix(vec3(.095,.105,.11),vec3(.009,.012,.018),late)
   +prismClearSky(normalize(vec3(d.x,0.,d.z)+vec3(.00001,0.,0.)))*.035;
}
float prismHorizonCoverage(vec3 d,float height) {
 return smoothstep(-.0035,.0035,asin(clamp(d.y,-1.,1.))+prismHorizonDip(height));
}
vec3 prismAltitudeSample(vec3 d,float height) {
 float change=prismHorizonCoverage(d,height)-prismHorizonCoverage(d,0.);
 if(abs(change)<.00001)return vec3(0.);
 return (prismClearSky(d)-prismGroundRadiance(d))*change;
}
vec3 prismAltitudeCorrection(vec3 d,float height,float roughness) {
 // The PMREM already filters the entire ground-level sky. Only the narrow
 // horizon strip revealed by elevation changes with height. Filter that
 // signed radiance difference; do not multiply the facade's brightness.
 float spread=roughness*roughness*1.4;
 float dip=prismHorizonDip(height);
 if(height<=0.||uNeutral>.5||d.y>.004+spread||d.y< -dip-.004-spread)return vec3(0.);
 vec3 tangent=normalize(cross(d,abs(d.y)>.95?vec3(1,0,0):vec3(0,1,0)));
 vec3 bitangent=cross(d,tangent);
 vec3 correction=prismAltitudeSample(d,height)*.4;
 correction+=prismAltitudeSample(normalize(d+tangent*spread),height)*.15;
 correction+=prismAltitudeSample(normalize(d-tangent*spread),height)*.15;
 correction+=prismAltitudeSample(normalize(d+bitangent*spread),height)*.15;
 correction+=prismAltitudeSample(normalize(d-bitangent*spread),height)*.15;
 return correction;
}
vec3 skyRadiance(vec3 direction,float height) {
 vec3 d=normalize(direction),c=prismClearSky(d);
 float h=max(d.y,0.),dusk=smoothstep(.10,.65,uProgress),late=smoothstep(.68,.98,uProgress);
 float golden=smoothstep(.035,.18,uProgress),twilight=prismTwilight();
 vec2 dh=normalize(d.xz+vec2(.00001)),sh=normalize(uSunDirection.xz);
 float facing=max(dot(dh,sh),0.),west=pow(facing,2.);
 vec2 cp=d.xz/(h+.19)*vec2(.65,1.35)+vec2(9.3,2.4);
 float f=prismFbm(cp*1.75),feather=prismFbm(cp*vec2(.62,4.1)+5.2);
 float cloud=smoothstep(.56,.73,f*.72+feather*.28)*smoothstep(.015,.08,h)*(1.-smoothstep(.76,.98,h));
 cloud+=smoothstep(.70,.82,prismFbm(cp*vec2(.30,5.0)+18.))*smoothstep(.07,.25,h)*.3;
 cloud=clamp(cloud,0.,.74);
 vec3 cc=mix(vec3(.72,.76,.80),vec3(.17,.18,.23),dusk);
 cc+=vec3(1.5,.65,.24)*west*golden*twilight*exp(-prismSq((h-.055)/.16));
 cc=mix(cc,vec3(.009,.013,.024),late);
 c=mix(c,cc,cloud);
 float az=atan(d.z,d.x),shelfHeight=.17+.048*sin(az*2.4+.7);
 float shelf=exp(-prismSq((h-shelfHeight)/.029)),shelfEdge=exp(-prismSq((h-shelfHeight+.030)/.017));
 float shelfBreak=smoothstep(.25,.8,prismNoise(d.xz*12.+vec2(4.,h*18.+4.)));
 float western=pow(facing,1.1)*golden*twilight;
 c=mix(c,vec3(.075,.10,.17),shelf*shelfBreak*western*.32);
 c+=vec3(.65,.26,.10)*shelfEdge*shelfBreak*western;
 c=mix(prismGroundRadiance(d),c,prismHorizonCoverage(d,height));
 float disk=1.-smoothstep(.00452,.00479,acos(clamp(dot(d,uSunDirection),-1.,1.)));
 float limb=smoothstep(-.00015,.00015,asin(clamp(d.y,-1.,1.))+prismHorizonDip(height));
 c+=disk*limb*vec3(30.,22.,13.)*uSunDisk;
 vec2 starUV=vec2(atan(d.z,d.x)*210.,asin(clamp(d.y,-1.,1.))*210.);
 float star=step(.9988,prismHash(floor(starUV)))*pow(max(0.,1.-length(fract(starUV)-.5)*2.),5.);
 c+=star*late*vec3(.45,.53,.65)*smoothstep(.05,.25,h);
 c=mix(c,floor(c*14.+.5)/14.,uStyle*.34);
 return mix(c,vec3(.35),uNeutral);
}
`;
