import {readAsset} from './assets.js';
let worker=null,unavailable=false,serial=0,idleTimer;
const jobs=new Map();
function progress(detail){globalThis.dispatchEvent?.(new CustomEvent('okc-asset-progress',{detail}));}
function release(){clearTimeout(idleTimer);if(!jobs.size)idleTimer=setTimeout(()=>{worker?.terminate();worker=null;},30_000);}
function failWorker(){
  unavailable=true;worker?.terminate();worker=null;
  for(const job of jobs.values()){job.cleanup();readAsset(job.asset,progress,job.signal).then(job.resolve,job.reject);}
  jobs.clear();
}
function getWorker(){
  if(unavailable||typeof Worker==='undefined')return null;
  if(!worker){
    try{worker=new Worker(new URL('./asset-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{const job=jobs.get(data.id);if(!job)return;
        if(data.progress){progress(data.progress);return;}
        jobs.delete(data.id);job.cleanup();data.error?job.reject(Error(data.error)):job.resolve(data.value);release();};
      worker.onerror=failWorker;
    }catch{unavailable=true;return null;}
  }
  return worker;
}
export function loadAsset(url,{signal,...options}={}){
  const asset={...options,url:String(url),fallbackURL:options.fallbackURL?String(options.fallbackURL):null};
  if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('Cancelled','AbortError'));
  clearTimeout(idleTimer);const target=getWorker();
  if(!target)return readAsset(asset,progress,signal);
  return new Promise((resolve,reject)=>{
    const id=++serial;
    const abort=()=>{jobs.delete(id);try{target.postMessage({id,cancel:true});}catch{}cleanup();reject(signal.reason||new DOMException('Cancelled','AbortError'));release();};
    const cleanup=()=>signal?.removeEventListener('abort',abort);
    jobs.set(id,{resolve,reject,asset,signal,cleanup});signal?.addEventListener('abort',abort,{once:true});
    // A blocked/terminated worker can throw before dispatching. Resolve all
    // pending jobs through the same bounded fetch fallback as an async crash.
    try{target.postMessage({id,asset});}catch{failWorker();}
  });
}
export function loadMetroAsset(name,options={}){
  const plain=new URL(`../geo/metro/${name}.json`,import.meta.url);
  return loadAsset(new URL(`../geo/metro/${name}.json.gz`,import.meta.url),{gzip:true,fallbackURL:plain,label:`Loading ${name}`,...options});
}
export function disposeAssetLoader(){
  clearTimeout(idleTimer);worker?.terminate();worker=null;
  for(const job of jobs.values()){job.cleanup();job.reject(new DOMException('Page closed','AbortError'));}jobs.clear();
}
