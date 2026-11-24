import * as THREE from 'three';

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
