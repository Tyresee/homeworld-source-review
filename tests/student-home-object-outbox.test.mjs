import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudentHomeObjectOutbox} from '../public/js/student-home-object-outbox.js';

const storage=()=>{const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
const ids=()=>{let n=0;return()=>`object-command-${++n}`;};
const lamp={power:false,brightness:2};
const input=(overrides={})=>({actorId:'teacher-a',studentId:'student-a',id:'owned-1',storey:0,patch:{power:true},baseState:lamp,expectedRevision:3,...overrides});
const home=(state,{revision=4,kind='lamp',id='owned-1',storey=0,status='placed'}={})=>({revision,commerce:{owned:[{id,source:'purchase',status,storey,item:{id,kind}}],objectStates:{[id]:state}}});

test('enqueue immediately journals an identity-bound configuration and a fresh page can read it',()=>{
  const disk=storage(),outbox=createStudentHomeObjectOutbox({storage:disk,randomId:ids()}),job=outbox.enqueue(input());
  assert.equal(job.durable,true);assert.equal(job.objectId,'owned-1');assert.notEqual(job.id,job.objectId);assert.equal(job.attempted,false);
  assert.equal(disk.data.size,1);const saved=JSON.parse([...disk.data.values()][0]);
  assert.deepEqual(Object.keys(saved).sort(),['actorId','jobs','schemaVersion','studentId']);assert.ok(!Object.hasOwn(saved.jobs[0],'durable'));
  const restored=createStudentHomeObjectOutbox({storage:disk});assert.deepEqual(restored.list('teacher-a','student-a'),saved.jobs);
  assert.deepEqual(restored.list('teacher-a','student-b'),[]);assert.deepEqual(restored.list('teacher-b','student-a'),[]);
});

test('unknown-outcome requests retain exact id revision and patch ahead of newer intent',()=>{
  const disk=storage(),outbox=createStudentHomeObjectOutbox({storage:disk,randomId:ids()}),first=outbox.enqueue(input());
  const sent=outbox.markSent('teacher-a','student-a',first.id,4);assert.equal(sent.expectedRevision,4);assert.equal(sent.attempted,true);
  const next=outbox.enqueue(input({patch:{power:false}}));assert.notEqual(next.id,first.id);assert.equal(outbox.list('teacher-a','student-a').length,2);
  const retry=outbox.markSent('teacher-a','student-a',first.id,99);assert.equal(retry.id,first.id);assert.equal(retry.expectedRevision,4);assert.deepEqual(retry.patch,{power:true});
  const fresh=createStudentHomeObjectOutbox({storage:disk});assert.deepEqual(fresh.list('teacher-a','student-a').map(j=>[j.id,j.attempted]),[[first.id,true],[next.id,false]]);
});

test('every unsent edit retains its stable producer id in FIFO order and inputs are copied',()=>{
  const outbox=createStudentHomeObjectOutbox({storage:storage(),randomId:ids()}),base={...lamp},patch={power:true};
  const a=outbox.enqueue(input({baseState:base,patch}));const b=outbox.enqueue(input({patch:{brightness:3}}));
  assert.notEqual(a.id,b.id);assert.deepEqual(b.patch,{brightness:3});assert.equal(outbox.list('teacher-a','student-a').length,2);
  base.power=true;patch.power=false;b.patch.brightness=1;
  assert.deepEqual(outbox.list('teacher-a','student-a').map(j=>[j.id,j.patch]),[[a.id,{power:true}],[b.id,{brightness:3}]]);
  assert.ok(outbox.markSent('teacher-a','student-a',a.id,3),'the first queued producer can still mark its original id sent');
  outbox.enqueue(input({id:'owned-2'}));outbox.enqueue(input({patch:{power:false}}));assert.equal(outbox.list('teacher-a','student-a').length,4,'all edits retain FIFO order');
});

test('acknowledging a proven object edit advances the next unsent edit base without erasing either intent',()=>{
  const outbox=createStudentHomeObjectOutbox({storage:storage(),randomId:ids()}),a=outbox.enqueue(input());outbox.markSent('teacher-a','student-a',a.id,3);
  const b=outbox.enqueue(input({patch:{brightness:3}}));
  assert.equal(outbox.acknowledge('teacher-a','student-a',a.id,{home:home({power:true,brightness:2})}),true);
  const [next]=outbox.list('teacher-a','student-a');assert.equal(next.id,b.id);assert.deepEqual(next.patch,{brightness:3});assert.deepEqual(next.baseState,{power:true,brightness:2});assert.equal(next.expectedRevision,4);
  const rebased=outbox.rebase('teacher-a','student-a',b.id,{home:home({power:true,brightness:2},{revision:5})});assert.ok(rebased);assert.notEqual(rebased.id,b.id);assert.equal(rebased.expectedRevision,5);
  outbox.acknowledge('teacher-a','student-a',rebased.id,{home:home({power:true,brightness:3},{revision:6})});assert.equal(outbox.pending('teacher-a','student-a'),false);
});

test('acknowledgement never advances a later attempted operation or masks an intervening remote edit',()=>{
  const outbox=createStudentHomeObjectOutbox({storage:storage(),randomId:ids()}),a=outbox.enqueue(input());outbox.markSent('teacher-a','student-a',a.id,3);
  const b=outbox.enqueue(input({patch:{brightness:3}}));outbox.markSent('teacher-a','student-a',b.id,4);
  outbox.acknowledge('teacher-a','student-a',a.id,{home:home({power:true,brightness:2})});
  assert.deepEqual(outbox.list('teacher-a','student-a')[0].baseState,lamp);assert.equal(outbox.list('teacher-a','student-a')[0].expectedRevision,4);
  assert.equal(outbox.rebase('teacher-a','student-a',b.id,{home:home({power:true,brightness:3},{revision:8})}),null);assert.equal(outbox.pending('teacher-a','student-a'),true);
});

test('safe rebase checks placed ownership storey and exact base for both unsent and attempted operations',()=>{
  for(const attempted of[false,true]){
    const outbox=createStudentHomeObjectOutbox({storage:storage(),randomId:ids()}),job=outbox.enqueue(input());if(attempted)outbox.markSent('teacher-a','student-a',job.id,3);
    for(const snapshot of[home({power:true,brightness:2}),home(lamp,{storey:1}),home(lamp,{status:'stored'}),home(lamp,{id:'another-owned'}),home({power:false,brightness:2},{kind:'plant'})]){
      assert.equal(outbox.rebase('teacher-a','student-a',job.id,{home:snapshot}),null);assert.equal(outbox.list('teacher-a','student-a')[0].id,job.id);
    }
    const rebased=outbox.rebase('teacher-a','student-a',job.id,{home:home(lamp,{revision:22})});assert.ok(rebased);assert.equal(rebased.attempted,false);assert.equal(rebased.expectedRevision,22);assert.notEqual(rebased.id,job.id);
  }
});

test('the journal rejects malformed config prototype keys foreign payload and invalid bounds',()=>{
  const outbox=createStudentHomeObjectOutbox({storage:storage(),randomId:ids()});
  for(const override of[{id:'__proto__'},{id:'constructor'},{id:'../other'}, {storey:-1},{storey:256},{expectedRevision:NaN},{expectedRevision:-1},{patch:{}},{patch:{channel:0}},{patch:{brightness:4}},{patch:{power:'true'}},{patch:JSON.parse('{"__proto__":{"power":true}}')},{baseState:{power:false}},{baseState:{power:false,brightness:2,password:'secret'}},{actorId:''}])assert.equal(outbox.enqueue(input(override)),null,JSON.stringify(override));
  assert.equal(outbox.enqueue({...input(),wallet:150000}),null);assert.equal(outbox.list('teacher-a','student-a').length,0);
  const tv=outbox.enqueue(input({id:'tv-1',patch:{channel:3,volume:2},baseState:{power:false,channel:0,volume:1}}));assert.ok(tv);
  assert.ok(outbox.enqueue(input({id:'clock-1',patch:{chime:false},baseState:{chime:true}})));
});

test('malformed or cross-identity local records are ignored and copies cannot mutate durable jobs',()=>{
  const disk=storage(),outbox=createStudentHomeObjectOutbox({storage:disk,randomId:ids()}),job=outbox.enqueue(input()),storageKey=[...disk.data.keys()][0],original=JSON.parse(disk.data.get(storageKey));
  for(const mutate of[value=>{value.actorId='teacher-b';},value=>{value.jobs[0].patch.power='yes';},value=>{value.jobs[0].password='secret';},value=>{value.jobs.push({...value.jobs[0]});},value=>{value.cookie='secret';}]){
    const tampered=copy(original);mutate(tampered);disk.setItem(storageKey,JSON.stringify(tampered));assert.deepEqual(createStudentHomeObjectOutbox({storage:disk}).list('teacher-a','student-a'),[]);
  }
  disk.setItem(storageKey,JSON.stringify(original));const restored=createStudentHomeObjectOutbox({storage:disk});const [read]=restored.list('teacher-a','student-a');read.patch.power=false;assert.equal(restored.list('teacher-a','student-a')[0].patch.power,true);
  assert.equal(restored.reject('teacher-b','student-a',job.id),false);assert.equal(restored.reject('teacher-a','student-a',job.id),true);assert.equal(disk.data.size,0);
});

test('a full queue never discards an unknown request and unavailable storage stays explicitly nondurable',()=>{
  const disk=storage(),outbox=createStudentHomeObjectOutbox({storage:disk,randomId:ids()});
  for(let i=0;i<64;i++){const job=outbox.enqueue(input({id:`lamp-${i}`}));assert.ok(job);outbox.markSent('teacher-a','student-a',job.id,i);}
  const before=outbox.list('teacher-a','student-a');assert.equal(outbox.enqueue(input({id:'overflow'})),null);assert.deepEqual(outbox.list('teacher-a','student-a'),before);
  const blocked={getItem(){throw Error('disabled');},setItem(){throw Error('disabled');},removeItem(){throw Error('disabled');}};
  const fallback=createStudentHomeObjectOutbox({storage:blocked,randomId:ids()}),job=fallback.enqueue(input());assert.equal(job.durable,false);assert.equal(fallback.list('teacher-a','student-a').length,1);assert.equal(fallback.markSent('teacher-a','student-a',job.id,3).durable,false);
});

const copy=value=>JSON.parse(JSON.stringify(value));
