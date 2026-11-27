// These warnings use the saved 2026 schedule notes. They are not live hours.
export function planningWarnings(plan){
 const warnings=[];
 if(!plan.date)return warnings;
 const date=new Date(plan.date+'T12:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==plan.date)return ['Choose a valid date for your adventure.'];
 const names=plan.stops.map(s=>s.name.toLowerCase()),day=date.getUTCDay(),year=date.getUTCFullYear();
 const holiday=names.some(name=>/holiday pop.up|devon ice rink|lights on broadway/.test(name));
 if(holiday&&year!==2026){warnings.push('These Christmas schedule notes cover the 2026 season. Recheck dates for the year you selected.');return warnings;}
 if(names.some(name=>/holiday pop.up/.test(name))&&(plan.date<'2026-11-27'||plan.date>'2026-12-20'||![0,5,6].includes(day)))warnings.push('Holiday Pop-Up Shops are listed for Friday–Sunday, November 27–December 20. Your selected date is outside that schedule.');
 if(names.some(name=>/lights on broadway/.test(name))&&!['2026-12-05','2026-12-12'].includes(plan.date))warnings.push('The saved Lights on Broadway festival dates are December 5 and 12, 4–7 PM. Other nights may offer lights without the festival.');
 const rink=plan.stops.find(s=>/devon ice rink/i.test(s.name));
 if(rink?.time&&day>=1&&day<=5&&rink.time<'15:00')warnings.push('Your weekday skating time is earlier than the saved afternoon opening. Check the rink hours before keeping this stop.');
 let previous='';
 for(const stop of plan.stops){if(!stop.time)continue;if(previous&&stop.time<previous){warnings.push('Some stop times run backward after reordering. Adjust them to match your day.');break;}previous=stop.time;}
 return warnings;
}
