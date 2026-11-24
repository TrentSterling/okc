// Web Audio is created only after the existing sound gesture.
export function createRoadAudio(getState){
 let audioContext=null,audioGain=null,engineOsc=null,noiseGain=null;

function enableAudio(){
 if(getState().sound&&!audioContext){
  audioContext=new(window.AudioContext||window.webkitAudioContext)();audioGain=audioContext.createGain();audioGain.gain.value=0;audioGain.connect(audioContext.destination);
  const samples=audioContext.sampleRate*2,buffer=audioContext.createBuffer(1,samples,audioContext.sampleRate),a=buffer.getChannelData(0);let smooth=0;for(let i=0;i<samples;i++){smooth=(smooth+Math.random()*.04-.02)*.985;a[i]=smooth*2;}
  const noise=audioContext.createBufferSource();noise.buffer=buffer;noise.loop=true;const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;noiseGain=audioContext.createGain();noiseGain.gain.value=.3;noise.connect(filter).connect(noiseGain).connect(audioGain);noise.start();
  engineOsc=audioContext.createOscillator();engineOsc.type='sine';engineOsc.frequency.value=45;const eGain=audioContext.createGain();eGain.gain.value=.025;engineOsc.connect(eGain).connect(audioGain);engineOsc.start();
 }
 if(audioContext?.state==='suspended')audioContext.resume();
}

function updateAudio(){if(!audioContext)return;audioGain.gain.setTargetAtTime(getState().sound?.6:0,audioContext.currentTime,.2);engineOsc.frequency.setTargetAtTime(38+getState().speed*1.6,audioContext.currentTime,.1);noiseGain.gain.setTargetAtTime(.10+getState().speed*.035,audioContext.currentTime,.2);}

 return {enable:enableAudio,update:updateAudio};
}
