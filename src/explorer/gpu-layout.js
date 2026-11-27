export const COLORS={panel:'#101c2b',raised:'#18293b',line:'#30465c',text:'#edf5fa',muted:'#a7b9cb',faint:'#7e94aa',accent:'#6bdcd3',gold:'#f1c986',warning:'#efb68b',danger:'#f59a94'};
export const rect=(x,y,w,h)=>({x,y,w,h});
export const action=(dispatch,type,payload={})=>()=>dispatch({type,...payload});

// A deterministic layout estimate keeps scrolling stable without asking a
// browser to lay out hidden HTML. The glyph runtime wraps inside this width.
export function wrapLines(value,width,size=16){
 const limit=Math.max(3,Math.floor(width/(size*.62))),lines=[];
 for(const paragraph of String(value??'').split('\n')){
  let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){
   let rest=word;if(line&&line.length+rest.length+1>limit){lines.push(line);line='';}
   while(rest.length>limit){if(line){lines.push(line);line='';}lines.push(rest.slice(0,limit));rest=rest.slice(limit);}
   line+=`${line?' ':''}${rest}`;
  }lines.push(line);
 }return lines;
}
export function textBlockHeight(value,width,size=16){return wrapLines(value,width,size).length*Math.ceil(size*1.35);}

export function createFlow(ctx,{x,y,width,viewport,measureOnly=false},dispatch){
 let cursor=y;const gap=9,h=44,shown=(top,height)=>!measureOnly&&(!viewport||top+height>=viewport.y&&top<=viewport.y+viewport.h);
 const flow={
  get y(){return cursor;},set y(value){cursor=value;},get width(){return width;},get x(){return x;},
  gap(value=12){cursor+=value;},
  line(){if(shown(cursor,1))ctx.rect(x,cursor,width,1,{color:COLORS.line});cursor+=14;},
  text(value,{size=16,color=COLORS.text,space=9}={}){
   const lines=wrapLines(value,width,size),lineHeight=Math.ceil(size*1.35);
   for(const line of lines){if(shown(cursor,lineHeight))ctx.text(line,x,cursor,{size,color,maxWidth:width});cursor+=lineHeight;}cursor+=space;
  },
  title(value){flow.text(value,{size:19,color:COLORS.text,space:12});},
  label(value){flow.text(value,{size:13,color:COLORS.muted,space:5});},
  button(id,label,type,payload={},options={}){const r=rect(x,cursor,width,h);if(shown(cursor,h))ctx.button(id,label,r,typeof type==='function'?type:action(dispatch,type,payload),options);cursor+=h+gap;},
  buttons(items){
   const w=(width-gap*(items.length-1))/items.length;
   for(let i=0;i<items.length;i++){const item=items[i];if(shown(cursor,h))ctx.button(item.id,item.label,rect(x+i*(w+gap),cursor,w,h),item.onClick||action(dispatch,item.type,item.payload),item.options||{});}cursor+=h+gap;
  },
  input(id,label,value,onChange,{type='text',multiline=false,maxLength,placeholder='',onCommit}={}){
   if(label)flow.label(label);const height=multiline?96:h;if(shown(cursor,height))ctx.input(id,rect(x,cursor,width,height),{value:String(value??''),placeholder,label,onChange,onCommit,type,multiline,maxLength});cursor+=height+gap;
  },
  select(id,label,value,options,onChange){if(label)flow.label(label);if(shown(cursor,h))ctx.select(id,rect(x,cursor,width,h),{value:String(value??''),options,onChange});cursor+=h+gap;},
  toggle(id,label,value,onChange){if(shown(cursor,h))ctx.toggle(id,label,rect(x,cursor,width,h),{value:!!value,onChange});cursor+=h+4;},
  fields(items){
   const w=(width-gap*(items.length-1))/items.length,labelHeight=23;
   for(let i=0;i<items.length;i++){const item=items[i],left=x+i*(w+gap);if(shown(cursor,labelHeight))ctx.text(item.label,left,cursor,{size:13,color:COLORS.muted,maxWidth:w});if(shown(cursor+labelHeight,h))ctx.input(item.id,rect(left,cursor+labelHeight,w,h),{value:String(item.value??''),type:item.type||'text',onChange:item.onChange,onCommit:item.onCommit,label:item.label,placeholder:item.placeholder||'',maxLength:item.maxLength});}cursor+=labelHeight+h+gap;
  },
 };
 return flow;
}

export function panelLayout(ctx,state){
 const inset=ctx.insets||{},left=inset.left||0,right=inset.right||0,top=inset.top||0,bottom=inset.bottom||0;
 const compact=ctx.compact??ctx.width<760,landscape=ctx.landscape??ctx.width>ctx.height;
 const short=landscape&&ctx.height<600,margin=compact?8:14,toolbarY=top+10;
 const driveReserve=state.mode==='3d'?(short?120+bottom:Math.max(140,120+bottom)):bottom+8;
 const availableW=ctx.width-left-right-2*margin,availableH=ctx.height-top-driveReserve-72;
 let w=Math.min(compact&&!short?availableW:410,availableW),x=left+margin,y=top+70,h=Math.max(80,availableH);
 if(compact&&!short){
  h=Math.min(availableH,state.expanded?availableH:Math.max(250,ctx.height*.52));y=ctx.height-driveReserve-h;
 }else if(short){w=Math.min(340,Math.max(250,availableW*.49));}
 const panel=rect(x,y,w,Math.max(80,h));
 return {panel,toolbar:rect(left+margin,toolbarY,Math.max(180,availableW-60),44),compact,short,
  mapInsets:state.open?(compact&&!short?{left:left+8,right:right+8,top:top+126,bottom:ctx.height-y+8}:{left:x+w+12,right:right+64,top:top+70,bottom:bottom+30}):{left:left+8,right:right+64,top:top+70,bottom:bottom+30}};
}
