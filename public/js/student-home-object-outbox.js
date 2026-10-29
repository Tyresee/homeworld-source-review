import {getObjectState} from './home-object-state.js';

const namespace='homeworld:student-homes:object-outbox:v1:';
const MAX_JOBS=64,MAX_BYTES=131072,forbidden=new Set(['__proto__','prototype','constructor']);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const keys=(value,allowed)=>record(value)&&Object.keys(value).length===allowed.length&&Object.keys(value).every(key=>allowed.includes(key));
const identity=value=>typeof value==='string'&&value.length>0&&value.length<=256;
const objectId=value=>typeof value==='string'&&/^[a-z\d_.:-]{1,96}$/i.test(value)&&!forbidden.has(value);
const commandId=value=>typeof value==='string'&&/^[a-z\d_.:-]{1,128}$/i.test(value)&&!forbidden.has(value);
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const copy=value=>JSON.parse(JSON.stringify(value));
function stateType(value){
  if(keys(value,['power','brightness'])&&typeof value.power==='boolean'&&integer(value.brightness,1,3))return 'lamp';
  if(keys(value,['power','channel','volume'])&&typeof value.power==='boolean'&&integer(value.channel,0,3)&&integer(value.volume,0,2))return 'television';
  if(keys(value,['chime'])&&typeof value.chime==='boolean')return 'clock';
  return null;
}
const sameState=(a,b)=>!!stateType(a)&&stateType(a)===stateType(b)&&Object.keys(a).every(key=>a[key]===b[key]);
function validPatch(patch,base){
  return !!stateType(base)&&record(patch)&&Object.keys(patch).length>0&&Object.keys(patch).every(key=>Object.hasOwn(base,key))&&stateType({...base,...patch})===stateType(base);
}
const JOB_KEYS=['id','objectId','storey','patch','baseState','expectedRevision','attempted'];
function validJob(job){return keys(job,JOB_KEYS)&&commandId(job.id)&&objectId(job.objectId)&&integer(job.storey,0,255)&&integer(job.expectedRevision)
  &&typeof job.attempted==='boolean'&&validPatch(job.patch,job.baseState);}
function targetState(home,job){
  const owned=home?.commerce?.owned?.find(row=>row.id===job.objectId);
  if(owned?.status!=='placed'||owned.storey!==job.storey)return null;
  return getObjectState(home.commerce,job.objectId);
}

/** Student-scoped intent journal. A sent request keeps its exact id, revision
 * and patch until its outcome is known. There is no HTTP or wallet access. */
export function createStudentHomeObjectOutbox({storage,randomId=()=>crypto.randomUUID()}={}){
  if(storage===undefined)try{storage=globalThis.localStorage;}catch{storage=null;}
  const memory=new Map(),dirty=new Set();
  const key=(actorId,studentId)=>identity(actorId)&&identity(studentId)?namespace+encodeURIComponent(actorId)+':'+encodeURIComponent(studentId):null;
  function read(actorId,studentId){
    const storageKey=key(actorId,studentId);if(!storageKey)return null;
    if(dirty.has(storageKey))return memory.get(storageKey);
    const empty={schemaVersion:1,actorId,studentId,jobs:[]};let result=empty;
    try{
      const raw=storage?.getItem(storageKey);
      if(raw&&raw.length<=MAX_BYTES){const value=JSON.parse(raw);
        if(keys(value,['schemaVersion','actorId','studentId','jobs'])&&value.schemaVersion===1&&value.actorId===actorId&&value.studentId===studentId
          &&Array.isArray(value.jobs)&&value.jobs.length<=MAX_JOBS&&value.jobs.every(validJob)&&new Set(value.jobs.map(job=>job.id)).size===value.jobs.length)result=copy(value);
      }
    }catch{result=memory.get(storageKey)??empty;}
    memory.set(storageKey,result);return result;
  }
  function write(value){
    const storageKey=key(value.actorId,value.studentId);memory.set(storageKey,value);
    try{
      if(!storage)throw new Error('Storage unavailable');
      if(value.jobs.length)storage.setItem(storageKey,JSON.stringify(value));else storage.removeItem(storageKey);
      dirty.delete(storageKey);return true;
    }catch{dirty.add(storageKey);return false;}
  }
  const returned=(job,value)=>({...copy(job),durable:write(value)});
  function freshId(value){const id=randomId();return commandId(id)&&!value.jobs.some(job=>job.id===id)?id:null;}
  function enqueue(input){
    if(!keys(input,['actorId','studentId','id','storey','patch','baseState','expectedRevision'])||!objectId(input.id)
      ||!integer(input.storey,0,255)||!integer(input.expectedRevision)||!validPatch(input.patch,input.baseState))return null;
    const value=read(input.actorId,input.studentId);if(!value)return null;
    // The editor creates a serial producer for every returned id. Even an
    // unsent id is therefore stable and must remain in the FIFO journal.
    if(value.jobs.length>=MAX_JOBS)return null;
    const id=freshId(value);if(!id)return null;
    const job={id,objectId:input.id,storey:input.storey,patch:copy(input.patch),baseState:copy(input.baseState),expectedRevision:input.expectedRevision,attempted:false};
    value.jobs.push(job);
    return returned(job,value);
  }
  function markSent(actorId,studentId,id,expectedRevision){
    const value=read(actorId,studentId),job=value?.jobs.find(row=>row.id===id);if(!job||!integer(expectedRevision))return null;
    if(!job.attempted)job.expectedRevision=expectedRevision;
    job.attempted=true;return returned(job,value);
  }
  function acknowledge(actorId,studentId,id,result){
    const value=read(actorId,studentId),index=value?.jobs.findIndex(job=>job.id===id);if(index===undefined||index<0)return false;
    const job=value.jobs[index],state=targetState(result?.home,job),expected={...job.baseState,...job.patch};
    value.jobs.splice(index,1);
    // Only a full authoritative match proves that no intervening edit to the
    // same object needs protecting. Never infer a remote state from our patch.
    if(integer(result?.home?.revision)&&sameState(state,expected))for(const later of value.jobs.slice(index)){
      if(!later.attempted&&later.objectId===job.objectId&&later.storey===job.storey&&sameState(later.baseState,job.baseState)){
        later.baseState=copy(state);later.expectedRevision=result.home.revision;
      }
    }
    write(value);return true;
  }
  function reject(actorId,studentId,id){return acknowledge(actorId,studentId,id);}
  function rebase(actorId,studentId,id,{home}={}){
    const value=read(actorId,studentId),job=value?.jobs.find(row=>row.id===id);if(!job||!integer(home?.revision))return null;
    const state=targetState(home,job);if(!sameState(state,job.baseState))return null;
    const nextId=freshId(value);if(!nextId)return null;
    job.id=nextId;job.expectedRevision=home.revision;job.baseState=copy(state);job.attempted=false;return returned(job,value);
  }
  return {enqueue,markSent,acknowledge,reject,rebase,list(actorId,studentId){return copy(read(actorId,studentId)?.jobs??[]);},pending(actorId,studentId){return (read(actorId,studentId)?.jobs.length??0)>0;}};
}
