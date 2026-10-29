import {cloneRobotActivity,isRobotActivityShape,sameRobotActivity} from './student-home-robot-state.js';

const namespace='homeworld:student-homes:robot-outbox:v1:';
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=256;
const validRevision=value=>Number.isSafeInteger(value)&&value>=0;
const validActivity=value=>value===null||isRobotActivityShape(value);
const copy=value=>JSON.parse(JSON.stringify(value));

/** Only semantic robot checkpoints and their idempotency metadata are stored.
 * A sent request remains in front of a newer checkpoint until its outcome is
 * known, so a lost reply cannot reverse the user's newer intention. */
export function createStudentHomeRobotOutbox({storage,randomId=()=>crypto.randomUUID(),now=()=>Date.now()}={}){
  if(storage===undefined)try{storage=globalThis.localStorage;}catch{storage=null;}
  const memory=new Map();
  function key(actorId,studentId){return validId(actorId)&&validId(studentId)?namespace+encodeURIComponent(actorId)+':'+encodeURIComponent(studentId):null;}
  function read(actorId,studentId){
    const storageKey=key(actorId,studentId);if(!storageKey)return null;
    if(memory.has(storageKey))return memory.get(storageKey);
    const empty={schemaVersion:1,actorId,studentId,jobs:[]};let result=empty;
    try{const raw=storage?.getItem(storageKey);if(raw&&raw.length<=131072){const saved=JSON.parse(raw);
      if(saved?.schemaVersion===1&&saved.actorId===actorId&&saved.studentId===studentId&&Array.isArray(saved.jobs)&&saved.jobs.length<=64
        &&saved.jobs.every(job=>job&&validId(job.id)&&validRevision(job.expectedRevision)&&validActivity(job.value)&&validActivity(job.baseActivity)&&typeof job.attempted==='boolean'&&Number.isFinite(job.createdAt)))
        result={...empty,jobs:saved.jobs.map(job=>({id:job.id,expectedRevision:job.expectedRevision,value:cloneRobotActivity(job.value),baseActivity:cloneRobotActivity(job.baseActivity),attempted:job.attempted,createdAt:job.createdAt}))};
    }}catch{/* A malformed or unavailable local cache is never an authority. */}
    memory.set(storageKey,result);return result;
  }
  function write(record){
    const storageKey=key(record.actorId,record.studentId);if(!storageKey)return false;
    memory.set(storageKey,record);
    try{if(!storage)return false;if(record.jobs.length)storage.setItem(storageKey,JSON.stringify(record));else storage.removeItem(storageKey);return true;}catch{return false;}
  }
  function enqueue({actorId,studentId,home,robotActivity},value){
    const record=read(actorId,studentId);if(!record||!home||!validRevision(home.revision)||!validActivity(value))return null;
    const last=record.jobs.at(-1);if(last&&sameRobotActivity(last.value,value))return {...copy(last),durable:write(record)};
    const job={id:randomId(),expectedRevision:home.revision,baseActivity:cloneRobotActivity(robotActivity),value:cloneRobotActivity(value),attempted:false,createdAt:now()};
    if(last&&!last.attempted)record.jobs[record.jobs.length-1]=job;else record.jobs.push(job);
    return {...copy(job),durable:write(record)};
  }
  function markSent(actorId,studentId,id,revision){
    const record=read(actorId,studentId),job=record?.jobs.find(row=>row.id===id);if(!job)return null;
    if(!job.attempted&&validRevision(revision))job.expectedRevision=revision;
    job.attempted=true;return {...copy(job),durable:write(record)};
  }
  function acknowledge(actorId,studentId,id,result,{supersede=false}={}){
    const record=read(actorId,studentId),index=record?.jobs.findIndex(job=>job.id===id);if(index===undefined||index<0)return;
    const job=record.jobs[index];if(supersede)record.jobs.splice(0,index+1);else record.jobs.splice(index,1);
    // A duplicate's response can contain a newer remote state. Do not rebase
    // our queued intention over that state merely because the old ID exists.
    if(result?.home&&sameRobotActivity(job.value,result.robotActivity??null))for(const later of record.jobs)if(!later.attempted){later.expectedRevision=result.home.revision;later.baseActivity=cloneRobotActivity(result.robotActivity??null);}
    write(record);
  }
  function reject(actorId,studentId,id){const record=read(actorId,studentId);if(!record)return;record.jobs=record.jobs.filter(job=>job.id!==id);write(record);}
  function rebase(actorId,studentId,id,snapshot){
    const record=read(actorId,studentId),job=record?.jobs.find(row=>row.id===id);
    if(!job||!snapshot?.home||!sameRobotActivity(job.baseActivity,snapshot.robotActivity??null))return null;
    job.id=randomId();job.expectedRevision=snapshot.home.revision;job.attempted=false;return {...copy(job),durable:write(record)};
  }
  return {enqueue,markSent,acknowledge,reject,rebase,
    list(actorId,studentId){return copy(read(actorId,studentId)?.jobs??[]);},
    pending(actorId,studentId){return (read(actorId,studentId)?.jobs.length??0)>0;},
  };
}
