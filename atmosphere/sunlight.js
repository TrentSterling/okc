import * as THREE from 'three';
import {solarGLSL} from './solar.js';

// The same Earth-horizon test gates direct sun on each surface. A single global
// light fade cannot keep the upper floors sunlit after the street has set.
export function createSunlightBinding(uniforms) {
  const bound = new WeakSet();
  const lightChunk = THREE.ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    `getDirectionalLightInfo( directionalLight, directLight );
    directLight.color *= mix(1.,prismSolarVisibility(vPrismSolarHeight),
      step(.9999,dot(inverseTransformDirection(directLight.direction,viewMatrix),uSunDirection)));`
  );
  return function bindSunlight(scene) {
    let count=0;
    scene.traverse(object=>{
      for(const material of (Array.isArray(object.material)?object.material:[object.material])) {
        if(!material?.isMeshStandardMaterial || bound.has(material))continue;
        bound.add(material); count++;
        const previous=material.onBeforeCompile;
        const previousKey=material.customProgramCacheKey.bind(material);
        material.onBeforeCompile=function(shader,renderer) {
          previous.call(this,shader,renderer);
          shader.uniforms.uSolarCenterAltitude=uniforms.uSolarCenterAltitude;
          shader.uniforms.uSunDirection=uniforms.uSunDirection;
          shader.vertexShader='varying float vPrismSolarHeight;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
            vec4 prismSolarPosition=vec4(transformed,1.);
            #ifdef USE_BATCHING
              prismSolarPosition=batchingMatrix*prismSolarPosition;
            #endif
            #ifdef USE_INSTANCING
              prismSolarPosition=instanceMatrix*prismSolarPosition;
            #endif
            vPrismSolarHeight=(modelMatrix*prismSolarPosition).y;`);
          shader.fragmentShader='varying float vPrismSolarHeight;\n'+solarGLSL+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',lightChunk);
        };
        material.customProgramCacheKey=()=>previousKey()+'|prism-height-sun-v1';
        material.needsUpdate=true;
      }
    });
    return count;
  };
}
