import * as THREE from 'three';

const authoredOffsets=new WeakMap();

// Material offsets are authored for the ordinary LESS depth comparison.
// Three r180 forwards polygonOffset unchanged even with reversed depth, so a
// negative pull-forward bias becomes a push-behind bias under GREATER.
// Apply once per distinct material, preserving the authored intent and making
// repeated binding / a later depth-mode change safe.
export function configureDepthOffsets(root,reversedDepth){
 const seen=new Set();let count=0;
 root.traverse(object=>{
  for(const material of [].concat(object.material||[])){
   if(seen.has(material)||!material.polygonOffset)continue;seen.add(material);
   if(!authoredOffsets.has(material))authoredOffsets.set(material,[material.polygonOffsetFactor,material.polygonOffsetUnits]);
   const [factor,units]=authoredOffsets.get(material),sign=reversedDepth?-1:1;
   material.polygonOffsetFactor=factor*sign;material.polygonOffsetUnits=units*sign;count++;
  }
 });
 return count;
}

// Keep the existing depth fallback and output color pipeline in one place.
export function createRenderer(canvas,exposure){
 const contextOptions={antialias:true,alpha:false,depth:true,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false};
 const context=canvas.getContext('webgl2',contextOptions);
 if(!context)throw new Error('WebGL2 is unavailable. Enable hardware acceleration in your browser, then reload.');
 const reversedDepth=!!context.getExtension('EXT_clip_control');
 const renderer=new THREE.WebGLRenderer({canvas,context,...contextOptions,reversedDepthBuffer:reversedDepth,logarithmicDepthBuffer:!reversedDepth});
 canvas.dataset.depthMode=reversedDepth?'reversed':'logarithmic';
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=exposure;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.debug.onShaderError=(gl,program,vs,fs)=>{console.error(gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs));throw new Error('This graphics driver could not compile a scene shader. Enable hardware acceleration or try another WebGL2-capable browser.');};
 renderer.setClearColor(0x192235);renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
 return {renderer,reversedDepth};
}
