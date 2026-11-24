import * as THREE from 'three';

// Camera-local dashboard geometry. Construction order preserves the original scene.
export function createCockpit(camera){
 let cockpit,steeringWheel;
function makeCockpit(){
 cockpit=new THREE.Group();camera.add(cockpit);cockpit.visible=false;
 const dashMat=new THREE.MeshStandardMaterial({color:0x111419,roughness:.9});
 const dash=new THREE.Mesh(new THREE.BoxGeometry(2.6,.24,.75),dashMat);dash.position.set(0,-.60,-.8);dash.rotation.x=.06;cockpit.add(dash);
 const hood=new THREE.Mesh(new THREE.BoxGeometry(2.0,.065,1.25),new THREE.MeshStandardMaterial({color:0x9b7648,metalness:.5,roughness:.3}));hood.position.set(0,-.58,-1.52);cockpit.add(hood);
 steeringWheel=new THREE.Group();steeringWheel.position.set(-.40,-.48,-.63);steeringWheel.rotation.x=-.3;
 const rim=new THREE.Mesh(new THREE.TorusGeometry(.20,.021,7,40),dashMat);steeringWheel.add(rim);
 for(let i=0;i<3;i++){const sp=new THREE.Mesh(new THREE.BoxGeometry(.16,.023,.024),new THREE.MeshStandardMaterial({color:0x333842,metalness:.5,roughness:.3}));sp.rotation.z=i*Math.PI*2/3;sp.position.set(Math.cos(sp.rotation.z)*.08,Math.sin(sp.rotation.z)*.08,0);steeringWheel.add(sp);}
 const center=new THREE.Mesh(new THREE.CylinderGeometry(.047,.047,.035,16),dashMat);center.rotation.x=Math.PI/2;steeringWheel.add(center);cockpit.add(steeringWheel);
 const gaugeCanvas=document.createElement('canvas');gaugeCanvas.width=512;gaugeCanvas.height=128;const g=gaugeCanvas.getContext('2d');g.fillStyle='#0c1015';g.fillRect(0,0,512,128);g.strokeStyle='#eab36e';g.lineWidth=4;
 for(let x=40;x<480;x+=20){g.beginPath();g.moveTo(x,92);g.lineTo(x,72-(x%40===0?16:0));g.stroke();}
 g.fillStyle='#dfc19c';g.font='22px sans-serif';g.fillText('P R A I R I E',175,35);
 const gauges=new THREE.Mesh(new THREE.PlaneGeometry(.63,.16),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(gaugeCanvas),toneMapped:false}));gauges.position.set(-.36,-.49,-.97);cockpit.add(gauges);
 for(let s of [-1,1]){const pillar=new THREE.Mesh(new THREE.BoxGeometry(.035,1.7,.035),dashMat);pillar.position.set(s*.95,.02,-1.05);pillar.rotation.z=-s*.20;cockpit.add(pillar);}
}
 makeCockpit();
 return {cockpit,steeringWheel};
}
