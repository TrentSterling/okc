import {SHOT_BY_ID} from '../capture-presets.js';

const ink='#f8f2e7',muted='#b5c6c3',gold='#f1c986';
const box=(x,y,w,h)=>({x,y,w,h});
const presets=[['daylight','Daylight'],['golden','Golden'],['prism','Afterglow'],['blue','Blue hour'],['night','Night']];
const views=['v06-reno-street','v06-walker-corner','v06-block-massing','v05-devon-last-sun','v05-devon-afterglow','v05-reno-reflection','v02-reno-afterglow','v02-devon-daylight','v02-campus-orbit','v02-western-skyline','v02-crown-afterglow'];
const viewOptions=[{value:'',label:'Free camera'},...views.filter(id=>SHOT_BY_ID.has(id)).map(id=>({value:id,label:SHOT_BY_ID.get(id).title}))];
export const settingsBounds=(width,height,insets={})=>{
 const left=12+(insets.left||0),right=12+(insets.right||0),top=12+(insets.top||0),bottom=12+(insets.bottom||0);
 const w=Math.min(520,width-left-right),h=Math.min(760,height-top-bottom);
 return {x:left+(width-left-right-w)/2,y:top+(height-top-bottom-h)/2,w,h};
};

export function drawSettings(ctx,model,control){
 const {state,telemetry,panel}=model;if(!panel)return;
 const bounds=settingsBounds(ctx.width,ctx.height,ctx.insets),{x,y,w,h}=bounds;
 ctx.block('scene-modal-backdrop',box(0,0,ctx.width,ctx.height));
 ctx.rect(0,0,ctx.width,ctx.height,{color:'#071511b8'});
 ctx.rect(x,y,w,h,{color:'#142a2dfc',radius:16,border:'#52756a',borderWidth:1});
 ctx.text(panel==='help'?'The open road':'Scene settings',x+16,y+16,{size:22,color:ink,maxWidth:w-96});
 ctx.button('scene-panel-close','Close',box(x+w-68,y+8,52,44),control.closePanel);
 const content=box(x+12,y+64,w-24,h-76);
 if(panel==='help'){drawHelp(ctx,content,control);return;}
 const rows=[];
 const section=label=>rows.push({h:36,draw:(px,py,pw)=>ctx.text(label,px,py+9,{size:14,color:gold,maxWidth:pw})});
 const note=text=>rows.push({h:52,draw:(px,py,pw)=>ctx.text(text,px,py+6,{size:12,color:muted,maxWidth:pw})});
 const buttons=(id,items)=>rows.push({h:52,draw:(px,py,pw)=>{const gap=6,bw=(pw-gap*(items.length-1))/items.length;items.forEach(([label,run,active],i)=>ctx.button(id+'-'+i,label,box(px+i*(bw+gap),py,bw,44),run,{active}));}});
 const toggle=(key,label)=>rows.push({h:52,draw:(px,py,pw)=>ctx.toggle('setting-'+key,label,box(px,py,pw,44),{value:state[key],onChange:value=>control.setSetting(key,value)})});
 const slider=(key,label,min,max,step,format=value=>String(value))=>rows.push({h:82,draw:(px,py,pw)=>{
  ctx.text(label+'  /  '+format(state[key]),px,py+3,{size:14,color:ink,maxWidth:pw});
  ctx.slider('setting-'+key,box(px,py+26,pw,44),{value:state[key],min,max,step,onChange:value=>control.setSetting(key,value),onCommit:()=>control.setSetting(key,state[key],{commit:true})});
 }});
 const select=(id,label,value,options,onChange)=>rows.push({h:82,draw:(px,py,pw)=>{ctx.text(label,px,py+3,{size:14,color:ink,maxWidth:pw});ctx.select(id,box(px,py+26,pw,44),{value,options,onChange});}});
 section('DRIVE & CAMERA');
 buttons('setting-mode',[['Scenic',()=>control.setDriveMode('scenic'),state.driveMode==='scenic'],['Free drive',()=>control.setDriveMode('free'),state.driveMode==='free']]);
 buttons('setting-camera',['chase','driver','orbit'].map(mode=>[mode[0].toUpperCase()+mode.slice(1),()=>control.setCamera(mode),state.camera===mode]));
 select('setting-viewpoint','Viewpoint',model.studyView,viewOptions,control.selectViewpoint);
 if(state.driveMode==='scenic')slider('route','Position along Reno',.03,.97,.001,value=>Math.round(value*100)+'%');
 else note('Gas moves forward. Brake slows the car; keep holding to reverse. Recover returns to a clear road.');
 section('LIGHT & MATERIAL');
 select('setting-light-preset','Lighting preset',model.preset,[{value:'',label:state.neutral?'Neutral light':'Custom light'},...presets.map(([value,label])=>({value,label}))],control.preset);
 slider('progress',model.timeLabel,0,1,.001,value=>Math.round(value*100)+'%');
 buttons('setting-sky',[[state.sunPlaying?'Pause sky':'Play sky',control.toggleSky,state.sunPlaying]]);
 slider('style','Rendering style',0,1,.01,value=>value<.15?'Physical':value>.85?'Illustrated':'Blended');
 slider('roughness','Glass roughness',.015,.35,.005,value=>value.toFixed(3));
 slider('exposure','Exposure',.3,2.5,.01,value=>value.toFixed(2));
 toggle('neutral','Neutral light test');toggle('screen','Crown screen');toggle('legends','Legends Tower / proposed');
 if(state.legends)note('Legends Tower is a proposed skyline, not an existing building.');
 section('COMFORT & PERFORMANCE');
 toggle('traffic','Traffic motion');toggle('sound','Road ambience');
 select('setting-quality','Quality',state.quality,[{value:'high',label:'High'},{value:'balanced',label:'Balanced'},{value:'low',label:'Low'}],value=>control.setSetting('quality',value));
 note('Balanced reduces shadow and reflection detail. Low removes live shadows and local reflections.');
 note(Number.isFinite(telemetry.fps)?telemetry.fps+' FPS / '+(telemetry.drawCalls??0)+' draw calls / '+Math.round((telemetry.triangles??0)/1000)+'k triangles':'Frame rate appears after the scene begins rendering.');
 section('YOUR VIEW');
 buttons('setting-photo',[['Photo',control.photograph],['Full screen',control.fullscreen]]);
 buttons('setting-setup',[['Save setup',control.saveSetup],['Load setup',control.loadSetup]]);
 buttons('setting-tools',[['Gallery',control.gallery],['Reset view',control.reset]]);
 buttons('setting-help',[['Help',control.openHelp],['Hide HUD',control.toggleHud]]);
 const totalHeight=rows.reduce((sum,row)=>sum+row.h,0);
 ctx.scroll('scene-settings-scroll',content,totalHeight,({x:px,y:py,width:pw})=>{let cursor=py;for(const row of rows){row.draw(px,cursor,pw);cursor+=row.h;}});
}

function drawHelp(ctx,content,control){
 const rows=[
  ['Drive yourself','Hold Gas to accelerate. Brake slows the car; keep holding to reverse. Hold a steering arrow while using a pedal. HB is the handbrake.'],
  ['Look around','Drag the open scene with another finger to look. In Orbit, pinch with two scene fingers to zoom. Controls never drag the camera.'],
  ['Keyboard','W / S: gas, brake, reverse\nA / D: steer or change scenic lane\nSpace: handbrake or scenic pause\nF: driving mode / C: camera\nR: recover / H: hide controls'],
  ['Find your way','Open Discover to search places, plan a date or use the map. Switch back to 3D to take the wheel. Manual driving pauses a guided tour.'],
  ['Make it yours','Menu opens lighting, material and quality settings. Buildings and map edges are solid. Traffic is scenic. Photo saves the scene without the controls.'],
 ];
 const rowHeight=content.w<360?154:132,totalHeight=rows.length*rowHeight+60;
 ctx.scroll('scene-help-scroll',content,totalHeight,({x,y,width})=>{
  rows.forEach(([title,text],i)=>{const py=y+i*rowHeight;ctx.text(title,x,py+4,{size:16,color:gold,maxWidth:width});ctx.text(text,x,py+32,{size:14,color:ink,maxWidth:width});});
  ctx.button('help-to-settings','Scene settings',box(x,y+rows.length*rowHeight,width,44),control.openSettings);
 });
}
