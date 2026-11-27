const ink='#f8f2e7',muted='#b5c6c3',gold='#f1c986';
const box=(x,y,w,h)=>({x,y,w,h});

export function hudLayout(width,height,insets={}){
 const left=12+(insets.left||0),right=width-12-(insets.right||0),available=right-left;
 const w=Math.min(720,available),x=left+(available-w)/2,bottom=height-8-(insets.bottom||0);
 return {x,w,barY:bottom-44,holdY:bottom-104,holdSize:w<500?44:56,menu:box(width-64-(insets.right||0),12+(insets.top||0),52,44)};
}

export function drawHud(ctx,model,control){
 const {state,telemetry,hudVisible}=model,layout=hudLayout(ctx.width,ctx.height,ctx.insets),{x,w,barY,holdY,holdSize,menu}=layout;
 if(!hudVisible){ctx.button('scene-show-hud','Show',menu,control.toggleHud);return;}
 ctx.button('scene-settings','Menu',menu,control.openSettings);
 const free=state.driveMode==='free',gap=6,buttonWidth=(w-gap*3)/4;
 ctx.rect(x-6,barY-6,w+12,56,{color:'#14272deb',radius:12,border:'#56716d',borderWidth:1});
 const entries=[
  ['scene-drive-mode',free?'Scenic':'Drive',()=>control.setDriveMode(free?'scenic':'free'),{variant:free?'default':'primary'}],
  ['scene-pause',state.driving?'Pause':'Resume',control.toggleDrive,{active:state.driving}],
  ['scene-camera',state.camera==='driver'?'Driver':state.camera==='orbit'?'Orbit':'Chase',control.cycleCamera,{}],
  [free?'scene-recover':'scene-direction',free?'Recover':state.direction===1?'East':'West',free?control.recover:control.reverseDirection,{}],
 ];
 entries.forEach(([id,label,action,options],i)=>ctx.button(id,label,box(x+i*(buttonWidth+gap),barY,buttonWidth,44),action,options));
 if(free){
  const brakeWidth=Math.max(62,holdSize),gasWidth=Math.max(50,holdSize),leftWidth=holdSize*2+gap,rightWidth=holdSize+brakeWidth+gasWidth+gap*2,rightX=x+w-rightWidth;
  const hold=(id,label,hx,hw=holdSize)=>ctx.hold('scene-hold-'+id,label,box(hx,holdY,hw,52),{onDown:pointer=>control.beginHold(pointer,id),onUp:control.endHold,active:control.isHeld(id)});
  hold('left','←',x);hold('right','→',x+holdSize+gap);
  hold('handbrake','HB',rightX);hold('brake','Brake',rightX+holdSize+gap,brakeWidth);hold('throttle','Gas',rightX+holdSize+brakeWidth+gap*2,gasWidth);
  const infoX=x+leftWidth+4,infoW=Math.max(0,rightX-infoX-4),center=infoX+infoW/2;
  ctx.text(Math.round(state.speed*2.23694),center,holdY+4,{size:Math.min(24,infoW*.8),color:ink,align:'center',maxWidth:infoW});
  ctx.text((telemetry.gear||'D')+' mph',center,holdY+32,{size:infoW<42?8:11,color:gold,align:'center',maxWidth:infoW});
 }else{
  ctx.text((state.driving?'SCENIC CRUISE':'SCENIC READY')+'  /  '+Math.round(state.speed*2.23694)+' MPH',x,barY-30,{size:13,color:ink,maxWidth:w});
 }
 if(!ctx.compact&&ctx.height>600){
  ctx.text(free?'W / S  Gas, brake, reverse     A / D  Steer     Space  Handbrake':'Take the Reno cruise, or choose Drive to explore the city.',x,free?holdY-23:barY-53,{size:12,color:muted,maxWidth:w});
 }
}
