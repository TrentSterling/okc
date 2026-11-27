import {getUI} from '../ui/runtime.js';

// Asset owners report completed stages. Unknown-length downloads never fake a percent.
export function createLoadingProgress({openMap=()=>{}}={}){
 const ui=getUI(),stages=['download','geometry','places','scene','lighting','ready'],done=new Set(),transfers=new Map();
 const state={visible:true,message:'Opening Oklahoma City',detail:'Loading your city atlas',coverage:'Yukon · Bethany · West OKC · Downtown',error:false};
 const remove=ui.addView('loading',ctx=>{
  if(!state.visible||ui.mode==='map')return;
  ctx.rect(0,0,ctx.width,ctx.height,{color:'#101c29'});ctx.block('loading-block',{x:0,y:0,w:ctx.width,h:ctx.height});
  const w=Math.min(520,ctx.width-48-ctx.insets.left-ctx.insets.right),x=(ctx.width-w)/2,y=Math.max(ctx.insets.top+20,(ctx.height-300)/2),size=ctx.height<500?26:38;
  ctx.text('PRAIRIE PRISM',x,y,{size:13,color:'#7fddd1',maxWidth:w});ctx.text('Oklahoma City',x,y+30,{size,color:'#eff6f5',maxWidth:w,maxLines:1});
  ctx.text(state.message,x,y+87,{size:17,maxWidth:w,maxLines:2});ctx.rect(x,y+137,w,5,{color:'#284350',radius:2});ctx.rect(x,y+137,w*done.size/stages.length,5,{color:'#edc583',radius:2});
  ctx.text(state.detail,x,y+157,{size:14,color:'#9db4b8',maxWidth:w,maxLines:2});ctx.text(state.coverage,x,y+208,{size:12,color:'#9db4b8',maxWidth:w,maxLines:1});
  ctx.button('loading-map','Open atlas while 3D loads',{x,y:y+242,w:state.error?w*.62:w,h:44},()=>openMap(),{variant:'primary'});
  if(state.error)ctx.button('loading-retry','Retry',{x:x+w*.65,y:y+242,w:w*.35,h:44},()=>location.reload());
 },100);
 const invalidate=()=>ui.invalidate();
 const update=({detail:d={}})=>{if(d.complete)done.add(d.stage);if(d.stage==='ready'){stages.forEach(stage=>done.add(stage));state.visible=false;}if(d.message)state.message=d.message;if(d.detail)state.detail=d.detail;invalidate();};
 const asset=({detail:d})=>{transfers.set(d.url,d);const list=[...transfers.values()],active=list.filter(t=>!t.done),received=list.reduce((sum,t)=>sum+t.loaded,0);state.detail=`${(received/1048576).toFixed(1)} MB received${active.length?` · ${active.length} downloads active`:' · Preparing the city'}`;invalidate();};
 window.addEventListener('okc-loading',update);window.addEventListener('okc-asset-progress',asset);
 return {state,hide(){state.visible=false;invalidate();},coverage(value){state.coverage=value;invalidate();},complete(stage,message){done.add(stage);if(stage==='ready')state.visible=false;if(message)state.message=message;invalidate();},error(error){state.visible=true;state.error=true;state.message='The city could not finish loading';state.detail=error?.message||String(error);invalidate();},dispose(){remove();window.removeEventListener('okc-loading',update);window.removeEventListener('okc-asset-progress',asset);}};
}
