import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {readAsset} from './assets.js';
const original=globalThis.fetch,originalWorker=globalThis.Worker;
try{
  const payload={places:[{id:'one',name:'A mapped place'}]},encoded=Buffer.from(JSON.stringify(payload)),gz=gzipSync(encoded),events=[];
  globalThis.fetch=async()=>new Response(gz,{headers:{'content-length':String(gz.length)}});
  assert.deepEqual(await readAsset({url:'https://example.test/pois.json.gz',gzip:true},p=>events.push(p)),payload);
  assert.equal(events.at(-1).done,true);assert.equal(events.at(-1).loaded,gz.length);
  globalThis.fetch=async()=>new Response(encoded);
  assert.deepEqual(await readAsset({url:'https://example.test/pois.json.gz',gzip:true}),payload,'HTTP-decoded bytes must not be gunzipped twice');
  const calls=[];globalThis.fetch=async url=>{calls.push(url);return String(url).endsWith('.gz')?new Response('missing',{status:404}):new Response(encoded);};
  assert.deepEqual(await readAsset({url:'https://example.test/pois.json.gz',gzip:true,fallbackURL:'https://example.test/pois.json'}),payload);assert.equal(calls.length,2);
  const binary=Uint8Array.from([0,1,3,255,0,50]);globalThis.fetch=async()=>new Response(gzipSync(binary));
  assert.deepEqual(new Uint8Array(await readAsset({url:'https://example.test/city.bin.gz',gzip:true,kind:'buffer'})),binary);
  const abort=new AbortController();abort.abort();let fallbackCalls=0;
  globalThis.fetch=async(url,{signal})=>{fallbackCalls++;signal.throwIfAborted();};
  await assert.rejects(readAsset({url:'https://example.test/city.json.gz',gzip:true,fallbackURL:'https://example.test/city.json'},()=>{},abort.signal));assert.equal(fallbackCalls,1,'Cancellation must not start a raw fallback');
  let terminated=0;globalThis.Worker=class{postMessage(){throw Error('Worker transport failed');}terminate(){terminated++;}};
  globalThis.fetch=async()=>new Response(encoded);
  const {loadAsset,disposeAssetLoader}=await import('./asset-client.js');
  assert.deepEqual(await loadAsset('https://example.test/pois.json'),payload,'A synchronous worker dispatch failure must fall back and settle');
  assert.equal(terminated,1);disposeAssetLoader();
  console.log('Asset loading: gzip, HTTP decoding, raw fallback, binary equivalence, cancellation and worker transport failure passed.');
}finally{globalThis.fetch=original;globalThis.Worker=originalWorker;}
