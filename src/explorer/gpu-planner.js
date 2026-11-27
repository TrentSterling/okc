import {money} from './planner.js';
import {COLORS} from './gpu-layout.js';

const presets=[{value:'',label:'Choose an adventure…'},...Object.entries({christmas:'Christmas super date',arcade:'Arcade night',cold:'Too cold outside',west:'West-side bargain hunt',free:'Fresh air & free stops',empty:'Start empty'}).map(([value,label])=>({value,label}))];

export function drawPlanner(flow,state,dispatch){
 const p=state.plan,t=state.totals,patch=value=>dispatch({type:'plan.patch',patch:value});
 flow.text(`${money(t.total)} planned · ${money(Math.abs(t.remaining))} ${t.remaining<0?'over budget':'left'}`,{size:20,color:t.remaining<0?COLORS.danger:COLORS.gold});
 flow.text(`${p.stops.length} stops · ${money(t.reserve)} reserved for extras · Two people`,{size:13,color:COLORS.muted});
 flow.input('ex-plan-name','Adventure name',p.name,value=>patch({name:value}),{maxLength:100});
 flow.fields([{id:'ex-plan-budget',label:'Budget ($)',value:p.budget,type:'number',onChange:value=>patch({budget:value})},{id:'ex-plan-reserve',label:'Reserve ($)',value:p.reserve,type:'number',onChange:value=>patch({reserve:value})}]);
 flow.input('ex-plan-date','Date (YYYY-MM-DD)',p.date,value=>patch({date:value}),{type:'date',maxLength:10});
 if(state.warnings.length){flow.text('Check this plan',{color:COLORS.warning});for(const warning of state.warnings)flow.text(`• ${warning}`,{size:14,color:COLORS.warning});}
 flow.text('Amounts are planning allowances for two, unless a source says otherwise. Taxes, tips, parking, fuel and booking fees are not added automatically. Reserve what you need.',{size:13,color:COLORS.muted});
 if(p.planningNote){flow.label('Saved seasonal schedule');flow.text(p.planningNote,{size:13,color:COLORS.muted});}
 flow.select('ex-plan-preset','Adventure preset','',presets,value=>{if(value)dispatch({type:'plan.preset',preset:value});});
 flow.line();flow.title('Your stops');
 if(!p.stops.length)flow.text('Add a place from Explore, choose a preset, or add your own allowance below.',{color:COLORS.muted});
 p.stops.forEach((stop,index)=>{
  const current=index===state.tourIndex;
  flow.text(`${index+1}. ${stop.name}${current?' · Current stop':''}`,{size:17,color:current?COLORS.gold:COLORS.text});
  if(stop.address)flow.text(stop.address,{size:13,color:COLORS.muted});
  if(stop.note)flow.text(stop.note,{size:13,color:COLORS.muted});
  flow.fields([{id:`ex-stop-time-${stop.id}`,label:'Time (HH:MM)',value:stop.time,type:'time',maxLength:5,onChange:value=>dispatch({type:'plan.stop.patch',stopId:stop.id,patch:{time:value}}),onCommit:value=>dispatch({type:'plan.stop.patch',stopId:stop.id,patch:{time:value},commit:true})},{id:`ex-stop-cost-${stop.id}`,label:'Allowance ($)',value:stop.cost,type:'number',onChange:value=>dispatch({type:'plan.stop.patch',stopId:stop.id,patch:{cost:value}})}]);
  flow.buttons([{id:`ex-stop-open-${stop.id}`,label:stop.placeId?'Open place':'Allowance',type:'plan.stop.open',payload:{stopId:stop.id}},{id:`ex-stop-remove-${stop.id}`,label:'Remove',type:'plan.stop.remove',payload:{stopId:stop.id}}]);
  flow.buttons([{id:`ex-stop-up-${stop.id}`,label:'Move up',type:'plan.stop.move',payload:{stopId:stop.id,direction:-1},options:{disabled:index===0}},{id:`ex-stop-down-${stop.id}`,label:'Move down',type:'plan.stop.move',payload:{stopId:stop.id,direction:1},options:{disabled:index===p.stops.length-1}}]);
  flow.line();
 });
 flow.title('Add an allowance');
 flow.input('ex-custom-name','Name',state.custom.name,value=>dispatch({type:'plan.custom.patch',patch:{name:value}}),{maxLength:160,placeholder:'Parking, snacks, a surprise…'});
 flow.input('ex-custom-cost','Cost ($)',state.custom.cost,value=>dispatch({type:'plan.custom.patch',patch:{cost:value}}),{type:'number'});
 flow.button('ex-custom-add','Add allowance','plan.custom.add',{}, {disabled:!state.custom.name.trim()});
 flow.line();flow.title('Tour this itinerary');
 if(state.tourFinished)flow.text('You reached the final stop.',{color:COLORS.accent});
 flow.button('ex-tour-play',state.touring?'Pause tour':state.tourIndex>=0&&!state.tourFinished?'Resume tour':'Start tour','tour.command',{command:state.touring?'pause':state.tourIndex>=0&&!state.tourFinished?'resume':'start'},{disabled:!state.mappedStops.length});
 flow.buttons([{id:'ex-tour-prev',label:'Previous stop',type:'tour.command',payload:{command:'previous'},options:{disabled:!state.mappedStops.length}},{id:'ex-tour-next',label:'Next stop',type:'tour.command',payload:{command:'next'},options:{disabled:!state.mappedStops.length}}]);
 flow.text('Custom allowances stay in your budget. Tours visit stops with mapped coordinates.',{size:13,color:COLORS.muted});
 flow.line();flow.title('Surprise us');
 flow.toggle('ex-surprise-indoor','Indoor stops',state.surprise.indoor,value=>dispatch({type:'plan.surprise.patch',patch:{indoor:value}}));
 flow.select('ex-surprise-hours','Time available',state.surprise.hours,[2,4,6,8].map(value=>({value:String(value),label:`${value} hours`})),value=>dispatch({type:'plan.surprise.patch',patch:{hours:Number(value)}}));
 flow.button('ex-surprise','Build a new adventure','plan.surprise');
 flow.text('Uses your budget and enabled interests. Places marked visited are skipped.',{size:13,color:COLORS.muted});
 flow.line();flow.title('Keep your plan');
 flow.buttons([{id:'ex-plan-export',label:'Export JSON',type:'file.export',payload:{kind:'plan'}},{id:'ex-plan-import',label:'Import JSON',type:'file.import',payload:{kind:'plan'}}]);
 flow.button('ex-plan-copy','Copy itinerary','file.copy');
 if(state.message)flow.text(state.message,{size:14,color:COLORS.accent});
}
