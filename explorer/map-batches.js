import * as THREE from 'three';
const vertex=`uniform vec2 center;uniform vec2 viewport;uniform float scale;attribute vec2 point;
#ifdef MAP_FEATURE_COLOR
attribute vec4 featureColor;varying vec4 vFeatureColor;
#endif
void main(){vec2 p=(point-center)*scale+viewport*.5;gl_Position=vec4(p/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
#ifdef MAP_FEATURE_COLOR
vFeatureColor=featureColor;
#endif
}`;
const roadVertex=`uniform vec2 center;uniform vec2 viewport;uniform float scale;uniform float kind;attribute vec4 segment;attribute float roadWidth;void main(){vec2 a=segment.xy,b=segment.zw,d=normalize(b-a),n=vec2(-d.y,d.x);float w=kind>1.5?clamp(roadWidth*scale,2.,7.):kind>.5?clamp(roadWidth*scale,1.2,5.):clamp(roadWidth*scale,.65,3.);vec2 p=(mix(a,b,position.x)-center)*scale+viewport*.5+n*position.y*w;gl_Position=vec4(p/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);}`;
const fragment=`uniform vec3 ink;uniform float opacity;
#ifdef MAP_FEATURE_COLOR
varying vec4 vFeatureColor;
#endif
void main(){
#ifdef MAP_FEATURE_COLOR
gl_FragColor=vFeatureColor;
#else
gl_FragColor=vec4(ink,opacity);
#endif
#include <colorspace_fragment>
}`;
export function createMapBatches(){
 const scene=new THREE.Scene(),camera=new THREE.Camera(),groups=new Map(),shared={center:{value:new THREE.Vector2()},viewport:{value:new THREE.Vector2(1,1)},scale:{value:1}};
 // One render queue preserves cartographic layer order. Mixing opaque roads
 // and transparent footprints would draw footprints over roads regardless of
 // renderOrder; double-sided alpha geometry also needs one explicit pass.
 function material(color,{roads=false,kind=0,opacity=1,featureColors=false}={}){return new THREE.ShaderMaterial({vertexShader:roads?roadVertex:vertex,fragmentShader:fragment,defines:featureColors?{MAP_FEATURE_COLOR:1}:{},uniforms:{...shared,ink:{value:new THREE.Color(color)},opacity:{value:opacity},kind:{value:kind}},transparent:true,forceSinglePass:true,depthWrite:false,depthTest:false,toneMapped:false,side:THREE.DoubleSide});}
 function remove(name){const old=groups.get(name);if(old){scene.remove(old);old.geometry.dispose();old.material.dispose();groups.delete(name);}}
 function polygon(name,array,color,order,opacity=1,colors){remove(name);if(!array?.length)return;const geometry=new THREE.BufferGeometry();geometry.setAttribute('point',new THREE.BufferAttribute(array,2));geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(array.length/2*3),3));const featureColors=colors?.length===array.length*2;if(featureColors)geometry.setAttribute('featureColor',new THREE.BufferAttribute(colors,4));const mesh=new THREE.Mesh(geometry,material(color,{opacity,featureColors}));mesh.name=name;mesh.frustumCulled=false;mesh.renderOrder=order;scene.add(mesh);groups.set(name,mesh);}
 function roads(kind,array){const name='road'+kind;remove(name);if(!array?.length)return;const count=array.length/5,geometry=new THREE.InstancedBufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,-.5,0,1,-.5,0,1,.5,0,0,.5,0],3));geometry.setIndex([0,1,2,0,2,3]);const ends=new Float32Array(count*4),widths=new Float32Array(count);for(let i=0;i<count;i++){ends.set(array.subarray(i*5,i*5+4),i*4);widths[i]=array[i*5+4];}geometry.setAttribute('segment',new THREE.InstancedBufferAttribute(ends,4));geometry.setAttribute('roadWidth',new THREE.InstancedBufferAttribute(widths,1));geometry.instanceCount=count;const mesh=new THREE.Mesh(geometry,material(['#304440','#465d57','#70817a'][kind],{roads:true,kind}));mesh.frustumCulled=false;mesh.renderOrder=4+kind;scene.add(mesh);groups.set(name,mesh);}
 return {setBase(packed){polygon('land',packed.land,'#253335',0);polygon('parks',packed.parks,'#203f33',1);polygon('water',packed.water,'#24444d',2);packed.roads.forEach((v,i)=>roads(i,v));},setBuildings(packed){polygon('buildings',packed.buildings,'#8c9984',3,59/255,packed.buildingColors);},
  render(renderer,{center,scale,width,height,layers}){shared.center.value.set(center.x,center.z);shared.scale.value=scale;shared.viewport.value.set(width,height);for(const [name,mesh]of groups)mesh.visible=name.startsWith('road')?layers.roads&&(name!=='road0'||scale>=.035):name==='buildings'?layers.buildings&&scale>=.18:name==='land'||name==='parks'?layers.parks:layers[name];const autoClear=renderer.autoClear;renderer.autoClear=false;try{renderer.render(scene,camera);}finally{renderer.autoClear=autoClear;}},
  dispose(){for(const name of [...groups.keys()])remove(name);},get stats(){return {batches:groups.size,bytes:[...groups.values()].reduce((sum,m)=>sum+Object.values(m.geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0),0)};},
 };
}
