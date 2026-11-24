import { BOK_FACADE } from './skyline-profiles.js';

// Office occupancy lives in metric world coordinates, not in the repeating
// 14-floor color atlas. A room spans two glazing bays on one actual floor.
// At a distance, integrate toward its mean instead of shimmering random bits.
// This is procedural occupancy, not a survey of specific offices.
const occupancyGLSL = `
varying vec3 vCityFacadePosition;
varying vec3 vCityFacadeNormal;
uniform vec4 uCityFloorLayout;
uniform float uCityBayPitch;
float cityRoomHash(vec3 p) {
 return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123);
}
vec3 cityOfficeLight() {
 vec2 n=normalize(vCityFacadeNormal.xz);
 float along=dot(vCityFacadePosition.xz,vec2(-n.y,n.x));
 float plane=floor(dot(vCityFacadePosition.xz,n)*.25+.5);
 float y=vCityFacadePosition.y;
 float floorCoordinate=y/uCityFloorLayout.x;
 float occupiedHeight=1.;
 if(uCityFloorLayout.y>.5) {
  floorCoordinate=y<uCityFloorLayout.z ? y/uCityFloorLayout.z : 1.+(y-uCityFloorLayout.z)/uCityFloorLayout.x;
  occupiedHeight=1.-step(uCityFloorLayout.w,y);
 }
 vec2 room=vec2(along/(uCityBayPitch*2.),floorCoordinate);
 vec3 id=vec3(floor(room),plane);
 float tenant=step(.62,cityRoomHash(id));
 float brightness=mix(.36,1.,cityRoomHash(id+vec3(17.,4.,9.)));
 float cool=step(.72,cityRoomHash(id+vec3(5.,19.,3.)));
 vec3 color=mix(vec3(1.,.77,.49),vec3(.74,.87,1.),cool);
 float resolved=1.-smoothstep(.55,1.6,max(fwidth(room.x),fwidth(room.y)));
 vec3 mean=vec3(.9272,.798,.6328)*(.38*.68);
 return mix(mean,color*tenant*brightness,resolved)*occupiedHeight;
}
`;

export function addFacadeOccupancy(material, style, columns) {
  const bok = style === 'bok';
  const roof = BOK_FACADE.height - BOK_FACADE.crownHeight;
  const pitch = bok ? (roof - BOK_FACADE.lobbyHeight) / (BOK_FACADE.occupiedFloors - 1) : 3.5;
  material.onBeforeCompile = shader => {
    shader.uniforms.uCityFloorLayout = { value: [pitch, bok ? 1 : 0, BOK_FACADE.lobbyHeight, roof] };
    shader.uniforms.uCityBayPitch = { value: 14.4 / columns };
    shader.vertexShader = 'varying vec3 vCityFacadePosition;varying vec3 vCityFacadeNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 cityPosition=vec4(transformed,1.);
      vec3 cityNormal=objectNormal;
      #ifdef USE_BATCHING
       cityPosition=batchingMatrix*cityPosition;
       cityNormal=mat3(batchingMatrix)*cityNormal;
      #endif
      #ifdef USE_INSTANCING
       cityPosition=instanceMatrix*cityPosition;
       cityNormal=mat3(instanceMatrix)*cityNormal;
      #endif
      vCityFacadePosition=(modelMatrix*cityPosition).xyz;
      vCityFacadeNormal=normalize(mat3(modelMatrix)*cityNormal);
    `);
    shader.fragmentShader = occupancyGLSL + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance*=cityOfficeLight();');
  };
  material.customProgramCacheKey = () => 'city-facade-rooms-v1';
  return material;
}
