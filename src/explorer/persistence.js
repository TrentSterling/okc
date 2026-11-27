import {CATEGORIES,safeUrl} from './catalog.js';
const record=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const text=(value,length)=>String(value??'').slice(0,length);
const keys=new Set(CATEGORIES.map(c=>c.id));
export function sanitizeOverrides(value){
 const result={};
 for(const [id,raw] of Object.entries(record(value)).slice(0,10000)){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!id||id.length>180)continue;
  const b={id,name:text(raw.name,100),notes:text(raw.notes,2000),reference:safeUrl(raw.reference)||'',updatedAt:text(raw.updatedAt,40)};
  if(Number.isFinite(Number(raw.h??raw.height))){b.h=Math.max(2,Math.min(500,Number(raw.h??raw.height)));b.height=b.h;}
  if(/^#[0-9a-f]{6}$/i.test(raw.color||''))b.color=raw.color;
  if(['flat','pitched','gabled'].includes(raw.roof))b.roof=raw.roof;
  Object.defineProperty(result,id,{value:b,enumerable:true,writable:true,configurable:true});
 }
 return result;
}
export function sanitizeState(value){
 const state=record(value),memories={},settings={};
 for(const [id,raw] of Object.entries(record(state.memories)).slice(0,10000)){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||id.length>180)continue;
  const memory={favorite:raw.favorite===true,status:['want','visited'].includes(raw.status)?raw.status:'',notes:text(raw.notes,2000),photo:safeUrl(raw.photo)||''};
  for(const key of ['trentRating','jennRating'])memory[key]=Math.max(0,Math.min(5,Math.round(Number(raw[key])||0)));
  Object.defineProperty(memories,id,{value:memory,enumerable:true,writable:true,configurable:true});
 }
 for(const key of ['labels','buildings','roads','water','parks','music'])if(typeof state.settings?.[key]==='boolean')settings[key]=state.settings[key];
 for(const [key,allowed] of Object.entries({season:['normal','christmas'],weather:['clear','snow','fog','wet'],quality:['low','balanced','high']}))if(allowed.includes(state.settings?.[key]))settings[key]=state.settings[key];
 return {plan:state.plan,memories,overrides:sanitizeOverrides(state.overrides),settings,categories:Array.isArray(state.categories)?state.categories.filter(c=>keys.has(c)):CATEGORIES.map(c=>c.id)};
}
export function loadState(storage){try{const s=storage??globalThis.localStorage;return sanitizeState(JSON.parse(s?.getItem('prairie-prism-discovery-v1')||'null'));}catch{return {};}}
export function saveState(value,storage){try{const s=storage??globalThis.localStorage;if(!s)return false;s.setItem('prairie-prism-discovery-v1',JSON.stringify(value));return true;}catch{return false;}}
