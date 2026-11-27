import {readAsset} from './assets.js';
const controllers=new Map();
self.onmessage=async({data})=>{
  if(data.cancel){controllers.get(data.id)?.abort();return;}
  const controller=new AbortController();controllers.set(data.id,controller);
  try{
    const value=await readAsset(data.asset,progress=>self.postMessage({id:data.id,progress}),controller.signal);
    if(!controller.signal.aborted)self.postMessage({id:data.id,value},value instanceof ArrayBuffer?[value]:[]);
  }catch(error){self.postMessage({id:data.id,error:error.message});}
  finally{controllers.delete(data.id);}
};
