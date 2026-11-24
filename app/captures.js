import * as THREE from 'three';
import {SHOT_BY_ID} from '../capture-presets.js';

// Deterministic photographs use the same presets and render boundary as before.
export function createCaptureController({renderer,scene,camera,getState,applyCapturePreset,snapshot,updateCamera,invalidateCamera,resize}){
 let capturing=false,captureRestore=null;

function captureView(id,width=1600,height=900){
 const preset=SHOT_BY_ID.get(id);if(!preset)throw new Error('Unknown capture view');
 if(!captureRestore)captureRestore=snapshot();
 capturing=true;
 renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;
 applyCapturePreset(preset);
 // A sky update can render PMREM and six local-probe faces immediately before
 // this photograph. Establish the complete main-camera render boundary.
 renderer.resetState();renderer.setRenderTarget(null);
 renderer.setViewport(0,0,width,height);renderer.setScissorTest(false);
 invalidateCamera();updateCamera(0);camera.updateMatrixWorld(true);
 renderer.clear(true,true,true);renderer.render(scene,camera);
 const pose={position:camera.position.toArray(),direction:camera.getWorldDirection(new THREE.Vector3()).toArray(),fov:camera.fov,aspect:camera.aspect,progress:getState().progress,renderTarget:renderer.getRenderTarget()===null?'canvas':'offscreen'};
 return {id,width,height,pose,dataUrl:renderer.domElement.toDataURL('image/png')};
}

function finishCaptures(){
 if(captureRestore){const saved=captureRestore;captureRestore=null;applyCapturePreset(saved);resize();updateCamera(0);renderer.render(scene,camera);}
 capturing=false;
}

 function photograph(){
  renderer.render(scene,camera);const a=document.createElement('a');a.download='prairie-prism.png';a.href=renderer.domElement.toDataURL('image/png');a.click();
 }
 return {captureView,finishCaptures,photograph,get isCapturing(){return capturing;}};
}
