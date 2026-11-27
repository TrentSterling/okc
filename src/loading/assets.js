// Shared fetch/decode implementation. The client normally runs it in asset-worker.
export async function readAsset({url,gzip=false,fallbackURL=null,kind='json',label='City data'},onProgress=()=>{},signal){
  async function read(address,compressed){
    const controller=new AbortController();
    const abort=()=>controller.abort(signal?.reason);
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(()=>controller.abort(new Error(`${label} timed out. Please retry.`)),60_000);
    try{
      const response=await fetch(address,{signal:controller.signal});
      if(!response.ok)throw Error(`${label} could not load (HTTP ${response.status}).`);
      const total=Number(response.headers.get('content-length'))||0,chunks=[];
      let loaded=0,last=0;
      if(response.body){
        const reader=response.body.getReader();
        for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.length;
          if(performance.now()-last>150){last=performance.now();onProgress({url:address,label,loaded,total,done:false});}}
      }else{const value=new Uint8Array(await response.arrayBuffer());chunks.push(value);loaded=value.length;}
      const bytes=new Uint8Array(loaded);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let buffer=bytes.buffer;
      // A Content-Encoding response has already been unpacked by Fetch.
      if(compressed&&bytes[0]===0x1f&&bytes[1]===0x8b){
        if(typeof DecompressionStream==='undefined')throw Error('Compressed city data is not supported by this browser.');
        buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      }
      const value=kind==='buffer'?buffer:JSON.parse(new TextDecoder().decode(buffer));
      onProgress({url:address,label,loaded,total:loaded,done:true});
      return value;
    }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
  }
  try{return await read(url,gzip);}
  catch(error){if(signal?.aborted||!fallbackURL)throw error;return read(fallbackURL,false);}
}
