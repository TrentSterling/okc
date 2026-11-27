// Stages are completed by their owners; concurrent downloads never fake a percent.
export function createLoadingProgress(){
  const loading=document.getElementById('loading'),status=document.getElementById('loadingStatus');
  const bar=document.getElementById('loadingProgress'),detail=document.getElementById('loadingDetail');
  const stages=['download','geometry','places','scene','lighting','ready'];
  const done=new Set(),transfers=new Map();
  const show=()=>{
    bar.value=done.size;document.getElementById('loadingStep').textContent=`${done.size} / ${stages.length}`;
    document.querySelectorAll('[data-load-stage]').forEach((el,i)=>el.classList.toggle('is-complete',done.has(stages[i])));
  };
  window.addEventListener('okc-loading',({detail:d={}})=>{
    if(d.complete)done.add(d.stage);
    if(d.stage==='ready')stages.forEach(stage=>done.add(stage));
    if(d.message)status.textContent=d.message;if(d.detail)detail.textContent=d.detail;show();
  });
  window.addEventListener('okc-asset-progress',({detail:d})=>{
    transfers.set(d.url,d);
    const active=[...transfers.values()].filter(t=>!t.done),received=[...transfers.values()].reduce((sum,t)=>sum+t.loaded,0);
    detail.textContent=`${(received/1048576).toFixed(1)} MB received${active.length?` · ${active.length} downloads in progress`:' · Preparing the city'}`;
  });
  return {loading,status,detail,complete(stage,message){done.add(stage);if(message)status.textContent=message;show();},
    error(error){loading.hidden=false;status.textContent='The city could not finish loading';detail.textContent=error.message;document.getElementById('loadingRetry').hidden=false;}};
}
