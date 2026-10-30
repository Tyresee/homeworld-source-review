import {getObjectQuickActions,getQuickActionOwned} from '../public/js/student-home-quick-action-menu.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import * as commerce from '../public/js/home-commerce.js';
import * as activitySchema from '../public/js/student-home-robot-state.js';
import {createStudentHomeRobotOutbox} from '../public/js/student-home-robot-outbox.js';
import {getHomeObjectMenu} from '../public/js/student-home-object-menu.js';
import {getObjectState} from '../public/js/home-object-state.js';
import {createStudentHomeObjectOutbox} from '../public/js/student-home-object-outbox.js';
import {createStudentHome} from '../server/student-homes/profile.mjs';
import {prepareCommerceCommand,houseFromCommerce} from '../server/student-homes/commerce.mjs';
import {getKitchenFit,areKitchenModulesCompatible,getKitchenDockPose} from '../public/js/home-kitchen-fit.js';
import {getHomeStairs} from '../public/js/home-staircase-shape.js';
import {ROBOT_CLOTHING_PRODUCTS} from '../public/js/robot-wardrobe-catalog.js';
import {applyChange,PALETTE} from '../public/js/home-engine.js';
import {getHomeSwatches} from '../public/js/home-theme.js';
import {getWarmFloorMenu} from '../public/js/student-home-floor-menu.js';
import {roomRect} from '../public/js/home-layout.js';
import {getStoredPlacementGroups} from '../public/js/home-inventory-menu.js';

const source=await readFile(new URL('../public/js/student-home-editor.js',import.meta.url),'utf8');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',ACTOR='actor-a';
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const call=fn=>(...args)=>fn(...args.map(clone));
const stand=(x=1)=>({kind:'stand',environment:'interior',storey:0,point:{x,z:2},rotation:0.4});
const settle=()=>new Promise(done=>setImmediate(done));
function storageFixture(){const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
function fixture({storage=storageFixture()}={}){
  const requests=[],calls={world:[],activity:[],views:[],menus:[],clear:0},statuses=[],bindings={},listeners=new Map(),saved=new Map(),receipts=new Map();let serial=0,runtime,actor=ACTOR;
  const outbox=createStudentHomeRobotOutbox({storage,randomId:()=>`outbox-${++serial}`}),objectOutbox=createStudentHomeObjectOutbox({storage,randomId:()=>`object-${++serial}`});
  const ui=name=>options=>{bindings[name]=options;return {open(...args){if(name==='menu')calls.menus.push(args);},close(){},refresh(){},dispose(){}};};
  const world={setCommerce(value,avatar,floor,activity){calls.world.push(clone({value,avatar,floor,activity}));runtime=clone(activity);},
    setObjectStates(value){(calls.objectStates??=[]).push(clone(value));},unlockObjectAudio(){},
    setRobotActivity(value){calls.activity.push(clone(value));runtime=clone(value);},captureRobotActivity(){return clone(runtime);},
    clearRobotAccountBinding(){if(runtime!==undefined)bindings.world.onRobotActivityChange(clone(runtime));runtime=undefined;},
    getRobotSource:()=>({}),setView(value){calls.views.push(value);},getView:()=>calls.views.at(-1)??'interior',clear(){calls.clear++;},dispose(){},cancelDrag(){},cancelPlacement(){},
    getAvatarInteractions:()=>[],getAvatarStairs:()=>[],
  };
  const document={visibilityState:'visible',addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
  const context={getObjectQuickActions,getQuickActionOwned,createStudentHomeQuickActions:options=>{bindings.quick=options;return {show(value){calls.quick=value;},updateStatus(value){calls.quickStatus=value;},close(){calls.quick=null;},dispose(){}};},createStudentHomeObjectOutbox:()=>({...objectOutbox,enqueue:call(objectOutbox.enqueue)}),getHomeObjectMenu:(c,o,h)=>getHomeObjectMenu(clone(c),clone(o),h),getObjectState:call(getObjectState),...commerce,getKitchenFit,areKitchenModulesCompatible,getKitchenDockPose,getHomeStairs,ROBOT_CLOTHING_PRODUCTS,applyChange,PALETTE,getHomeSwatches,getWarmFloorMenu,roomRect,getStoredPlacementGroups,
    setTimeout,clearTimeout,
    ...Object.fromEntries(['cloneRobotActivity','sameRobotActivity','isRobotActivityShape'].map(name=>[name,call(activitySchema[name])])),
    createStudentHomeRobotOutbox:()=>outbox,
    createHomeShop:ui('shop'),createStudentHomeWardrobe:ui('wardrobe'),createSceneContextMenu:ui('menu'),createFloorPlanner:ui('floor'),createRoomPlanner:ui('room'),
    createStudentHomeThumbnails:()=>({image(){},setRobotSource(){},dispose(){}}),createStudentHomeWorld:async options=>{bindings.world=options;return world;},
    crypto:{randomUUID:()=>`commerce-${++serial}`},requestAnimationFrame:fn=>fn(),document,
    addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);},
  };
  runInNewContext(source.replace(/^import[^\n]+\n/gm,'').replace('export function createStudentHomeScene','function createStudentHomeScene')+'\nglobalThis.create=createStudentHomeScene;',context);
  const editor=context.create({querySelector:()=>({})},{onStatus:(message,retry)=>statuses.push({message,retry}),
    onCommand(command,id,options){const value=clone(command),scope=clone(options);return new Promise((resolve,reject)=>requests.push({command:value,id,options:scope,
      accept(){let result=receipts.get(id);if(!result){const previous=saved.get(scope.studentId)??{home:createStudentHome(scope.studentId),robotActivity:null};const prepared=value.type==='setObjectState'?prepareCommerceCommand(previous.home.commerce,value,id):null;result={home:{...previous.home,revision:previous.home.revision+1,...prepared?{commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce)}:{}},robotActivity:value.type==='setRobotActivity'?clone(value.activity):previous.robotActivity};saved.set(scope.studentId,result);receipts.set(id,result);}resolve(clone(result));},
      reject(status=503,message='Network unavailable',snapshot){reject(Object.assign(new Error(message),{status,snapshot:clone(snapshot)}));},
    }));},
  });
  return {editor,requests,calls,statuses,storage,outbox,objectOutbox,bindings,listeners,document,
    async showHome(home,activity=null){saved.set(home.studentId,{home:clone(home),robotActivity:clone(activity)});await editor.show(clone(home),{robotActivity:clone(activity),actorId:actor});},
    async show(studentId=A,activity=null,revision=0,nextActor=actor){actor=nextActor;const home={...createStudentHome(studentId),revision};saved.set(studentId,{home,robotActivity:clone(activity)});await editor.show(home,{robotActivity:clone(activity),actorId:actor});return clone(home);},
    emit(value){runtime=clone(value);bindings.world.onRobotActivityChange(clone(value));},setRuntime(value){runtime=clone(value);},
    snapshot:studentId=>clone(saved.get(studentId)),
  };
}

test('departure captures the full live checkpoint and persists it before starting the request',async()=>{
  const f=fixture();await f.show();const activity={kind:'furniture',action:'read',itemId:'desk-1',storey:0,time:2.75,remaining:1.25,rotation:0.3};f.setRuntime(activity);
  const leave=f.editor.prepareLeave();assert.deepEqual(f.outbox.list(ACTOR,A)[0].value,activity);await settle();
  assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].command,{type:'setRobotActivity',activity});assert.deepEqual(f.requests[0].options,{actorId:ACTOR,studentId:A,expectedRevision:0,keepalive:false});
  f.requests[0].accept();assert.deepEqual(clone(await leave),{ok:true,pending:false});assert.equal(f.outbox.pending(ACTOR,A),false);
});

test('restoring an outdoor checkpoint opens the matching estate view without saving hydration callbacks',async()=>{
  const f=fixture(),activity={...stand(2),environment:'estate'};await f.show(A,activity);assert.equal(f.editor.getView(),'estate');assert.equal(f.requests.length,0);
  await f.show(B,{kind:'swim',itemId:'pool-1',storey:0,phase:'loop',time:2});assert.equal(f.editor.getView(),'estate');assert.equal(f.requests.length,0);
});

test('prepareLeave waits for commerce then saves the latest captured pose using its new revision',async()=>{
  const f=fixture();await f.show();const purchase=f.bindings.wardrobe.onEquip('wear-ocean-overalls','outfit');f.emit(stand(2));f.setRuntime(stand(3));const leave=f.editor.prepareLeave();
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].command.type,'equipClothing');f.requests[0].accept();await purchase;await settle();
  assert.equal(f.requests.length,2);assert.deepEqual(f.requests[1].command.activity,stand(3));assert.equal(f.requests[1].options.expectedRevision,1);
  f.requests[1].accept();assert.equal((await leave).ok,true);assert.equal(f.outbox.pending(ACTOR,A),false);
});

test('a background activity save cannot swallow the robot arrival floor change',async()=>{
  const f=fixture();await f.show();const home=f.snapshot(A).home;home.commerce.upperFloors=[clone(home.commerce.home)];await f.editor.show(home,{actorId:ACTOR,robotActivity:null});
  f.emit(stand(1));assert.equal(f.requests.length,1);f.bindings.world.onStoreyChange(1);assert.equal(f.calls.world.at(-1).floor,1);
  f.requests[0].accept();await settle();
});

test('a background activity save keeps the context menu available and serializes a purchase behind its acknowledgement',async()=>{
  const f=fixture();await f.show();f.emit(stand(1));f.bindings.world.onContextMenu({view:'interior',data:{surfaceId:'floor.main'},clientX:12,clientY:15});
  assert.equal(f.calls.menus.length,1);assert.equal(f.calls.menus[0][0].items.some(item=>item.id==='shop'),true);
  f.editor.setView('estate');assert.equal(f.editor.getView(),'estate');f.bindings.shop.onCartChange('bed-classic',1);const purchase=f.bindings.shop.onCheckout();assert.equal(f.requests.length,1);
  f.emit(stand(2));f.requests[0].accept();await settle();assert.equal(f.requests.length,2);assert.equal(f.requests[1].command.type,'checkout');assert.equal(f.requests[1].options.expectedRevision,1);
  f.requests[1].accept();await purchase;await settle();assert.equal(f.requests.length,3);assert.equal(f.requests[2].command.type,'setRobotActivity');assert.equal(f.requests[2].options.expectedRevision,2);f.requests[2].accept();await settle();
});

test('clearing after a confirmed departure does not create an unsent checkpoint from elapsed animation time',async()=>{
  const f=fixture();await f.show();const activity={kind:'furniture',action:'read',itemId:'desk-1',storey:0,time:1,remaining:2};f.setRuntime(activity);
  const leave=f.editor.prepareLeave();f.requests[0].accept();assert.equal((await leave).ok,true);f.setRuntime({...activity,time:1.2,remaining:1.8});f.editor.clear();
  assert.equal(f.outbox.pending(ACTOR,A),false);assert.equal(f.requests.length,1);
});

test('page hiding keeps the complete swim transition in durable storage and uses keepalive',async()=>{
  const f=fixture();await f.show();const swim={kind:'swim',itemId:'pool-1',storey:0,phase:'exit',step:2,progress:0.45,time:3,rotation:-0.5,exitFrom:{phase:'loop',time:2}};f.setRuntime(swim);
  f.document.visibilityState='hidden';f.listeners.get('visibilitychange')();assert.deepEqual(f.outbox.list(ACTOR,A)[0].value,swim);await settle();
  assert.equal(f.requests[0].options.keepalive,true);f.requests[0].reject();await settle();assert.equal(f.outbox.pending(ACTOR,A),true);assert.match(f.statuses.at(-1).message,/DisplayText3810/);
});

test('pagehide sends its keepalive before immediate renderer disposal',async()=>{
  const f=fixture();await f.show();f.setRuntime(stand(7));const leave=f.editor.prepareLeave({keepalive:true});f.editor.dispose();
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.keepalive,true);assert.deepEqual(f.requests[0].command.activity,stand(7));
  f.requests[0].accept();await leave;await settle();assert.equal(f.outbox.pending(ACTOR,A),false);
});

test('a lost acknowledgement survives editor disposal and refresh, then replays its original command ID',async()=>{
  const storage=storageFixture(),first=fixture({storage});await first.show();first.emit(stand(4));const original=first.requests[0];original.reject();await settle();first.editor.dispose();
  const next=fixture({storage}),home={...createStudentHome(A),revision:0};const replay=next.editor.replayRobotActivity({actorId:ACTOR,studentId:A,home,robotActivity:null});
  assert.equal(next.requests.length,1);assert.equal(next.requests[0].id,original.id);assert.equal(next.requests[0].options.replay,true);assert.deepEqual(next.requests[0].command.activity,stand(4));
  next.requests[0].accept();const result=await replay;assert.equal(result.pending,false);assert.equal(result.home.studentId,A);assert.deepEqual(result.robotActivity,stand(4));assert.equal(storage.data.size,0);
});

test('late A acknowledgement cannot alter student B and leaves the newer A checkpoint for replay',async()=>{
  const f=fixture();await f.show();f.emit(stand(1));f.setRuntime(stand(8));f.editor.clear();await f.show(B);const count=f.calls.world.length;f.requests[0].accept();await settle();
  assert.equal(f.calls.world.length,count);assert.equal(f.calls.activity.length,0);assert.equal(f.outbox.pending(ACTOR,B),false);assert.deepEqual(f.outbox.list(ACTOR,A)[0].value,stand(8));
  const replay=f.editor.replayRobotActivity({actorId:ACTOR,studentId:A,...f.snapshot(A)});assert.equal(f.requests[1].options.studentId,A);f.requests[1].accept();assert.equal((await replay).pending,false);
});

test('a hanging activity request only delays departure until its bound and its late acknowledgement stays with A',async()=>{
  const f=fixture();await f.show();f.emit(stand(1));f.setRuntime(stand(2));
  const leave=await f.editor.prepareLeave({timeoutMs:5});assert.deepEqual(clone(leave),{ok:false,pending:true});
  assert.equal(f.outbox.list(ACTOR,A).length,2);assert.deepEqual(f.outbox.list(ACTOR,A)[1].value,stand(2));
  // Rendering can advance while the bounded wait expires. Account clearing
  // uses the already captured departure snapshot, without making a third job.
  f.setRuntime(stand(3));f.editor.clear();assert.equal(f.outbox.list(ACTOR,A).length,2);assert.deepEqual(f.outbox.list(ACTOR,A)[1].value,stand(2));
  await f.show(B);const before=f.calls.world.length;f.requests[0].accept();await settle();
  assert.equal(f.requests.length,1);assert.equal(f.calls.world.length,before);assert.equal(f.calls.activity.length,0);assert.deepEqual(f.outbox.list(ACTOR,A)[0].value,stand(2));assert.equal(f.outbox.pending(ACTOR,B),false);
});

test('a hanging commerce request is retained across bounded departure without being aborted or retried against B',async()=>{
  const f=fixture();await f.show();const purchase=f.bindings.wardrobe.onEquip('wear-ocean-overalls','outfit'),id=f.requests[0].id;f.setRuntime(stand(4));
  assert.equal((await f.editor.prepareLeave({timeoutMs:5})).pending,true);f.editor.clear();await f.show(B);
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].id,id);f.requests[0].accept();await purchase;await settle();
  assert.equal(f.requests.length,1);assert.equal(f.calls.activity.length,0);assert.deepEqual(f.outbox.list(ACTOR,A)[0].value,stand(4));
});

test('a purchase queued behind student A cannot block B autosaves or execute after the account changes',async()=>{
  const f=fixture();await f.show();f.emit(stand(1));const purchase=f.bindings.wardrobe.onEquip('wear-ocean-overalls','outfit');
  await f.editor.prepareLeave({timeoutMs:5});f.editor.clear();await f.show(B);f.emit(stand(4));assert.equal(f.requests.length,2);assert.equal(f.requests[1].options.studentId,B);
  f.requests[0].accept();assert.equal((await purchase).ok,false);await settle();assert.equal(f.requests.length,2);f.requests[1].accept();await settle();assert.equal(f.outbox.pending(ACTOR,B),false);
});

test('outbox replay is isolated by both actor and student',async()=>{
  const storage=storageFixture(),first=fixture({storage});await first.show();first.emit(stand(5));first.requests[0].reject();await settle();
  const next=fixture({storage}),home=createStudentHome(A);const other=await next.editor.replayRobotActivity({actorId:'actor-b',studentId:A,home,robotActivity:null});
  assert.equal(other.pending,false);assert.equal(next.requests.length,0);assert.equal(next.outbox.pending(ACTOR,A),true);
  await next.editor.replayRobotActivity({actorId:ACTOR,studentId:B,home:createStudentHome(B),robotActivity:null});assert.equal(next.requests.length,0);
});

test('queued checkpoints only rebase across unrelated revisions when the saved activity base still matches',async()=>{
  const f=fixture(),home=createStudentHome(A);f.outbox.enqueue({actorId:ACTOR,studentId:A,home,robotActivity:null},stand(6));
  const fresh={...home,revision:4};const replay=f.editor.replayRobotActivity({actorId:ACTOR,studentId:A,home:fresh,robotActivity:null});
  assert.equal(f.requests[0].options.expectedRevision,4);f.requests[0].accept();assert.equal((await replay).pending,false);
  const next=fixture();next.outbox.enqueue({actorId:ACTOR,studentId:A,home,robotActivity:null},stand(6));const conflict=await next.editor.replayRobotActivity({actorId:ACTOR,studentId:A,home:fresh,robotActivity:stand(99)});
  assert.equal(conflict.pending,true);assert.equal(next.requests.length,0);assert.deepEqual(next.outbox.list(ACTOR,A)[0].value,stand(6));assert.match(next.statuses.at(-1).message,/DisplayText4632/);
});

test('a stale unknown request recovers its receipt before the latest checkpoint is sent',async()=>{
  const f=fixture(),home=createStudentHome(A),base={actorId:ACTOR,studentId:A,home,robotActivity:null};
  const old=f.outbox.enqueue(base,stand(1));f.outbox.markSent(ACTOR,A,old.id,0);f.outbox.enqueue(base,stand(2));
  const replay=f.editor.replayRobotActivity({actorId:ACTOR,studentId:A,home:{...home,revision:1},robotActivity:stand(1)});
  assert.equal(f.requests[0].id,old.id);assert.equal(f.requests[0].options.expectedRevision,0);f.requests[0].accept();await settle();
  assert.equal(f.requests.length,2);assert.deepEqual(f.requests[1].command.activity,stand(2));f.requests[1].accept();assert.equal((await replay).pending,false);
});

test('concurrent hidden and departure flushes finish without disabling subsequent autosaves',async()=>{
  const f=fixture();await f.show();f.emit(stand(1));f.setRuntime(stand(2));const first=f.editor.prepareLeave(),second=f.editor.prepareLeave({keepalive:true});
  f.requests[0].accept();await settle();assert.equal(f.requests.length,2);assert.equal(f.requests[1].options.keepalive,true);f.requests[1].accept();await Promise.all([first,second]);
  f.emit(stand(3));assert.equal(f.requests.length,3);f.requests[2].accept();await settle();assert.equal(f.outbox.pending(ACTOR,A),false);
});

test('a newer confirmed checkpoint clears a retained stale conflict without replaying it later',async()=>{
  const f=fixture();await f.show();f.emit(stand(1));const old=f.requests[0].id;f.requests[0].reject(409,'Revision changed',{home:{...createStudentHome(A),revision:4},robotActivity:stand(9)});await settle();
  assert.equal(f.outbox.list(ACTOR,A)[0].id,old);f.emit(stand(4));assert.equal(f.requests.length,2);assert.equal(f.requests[1].options.expectedRevision,4);f.requests[1].accept();await settle();assert.equal(f.outbox.pending(ACTOR,A),false);
});

test('an unrelated commerce revision safely rebases a live checkpoint after a definite conflict',async()=>{
  const f=fixture();await f.show();f.emit(stand(2));const old=f.requests[0].id;f.requests[0].reject(409,'Revision changed',{home:{...createStudentHome(A),revision:3},robotActivity:null});await settle();
  assert.equal(f.requests.length,2);assert.notEqual(f.requests[1].id,old);assert.equal(f.requests[1].options.expectedRevision,3);assert.deepEqual(f.requests[1].command.activity,stand(2));f.requests[1].accept();await settle();assert.equal(f.outbox.pending(ACTOR,A),false);
});

test('unavailable local storage is explicit and does not prevent a successful server save',async()=>{
  const storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}},f=fixture({storage});await f.show();f.emit(stand(3));
  assert.ok(f.statuses.some(row=>/DisplayText4633/.test(row.message)));assert.equal(f.requests.length,1);f.requests[0].accept();await settle();assert.equal(f.outbox.pending(ACTOR,A),false);
});

test('outbox coalesces unsent movement snapshots, preserves the sent head, and ignores malformed storage',()=>{
  const storage=storageFixture(),f=fixture({storage}),home=createStudentHome(A),base={actorId:ACTOR,studentId:A,home,robotActivity:null};
  f.outbox.enqueue(base,stand(1));f.outbox.enqueue(base,stand(2));assert.equal(f.outbox.list(ACTOR,A).length,1);
  const head=f.outbox.list(ACTOR,A)[0];f.outbox.markSent(ACTOR,A,head.id,0);f.outbox.enqueue(base,stand(3));f.outbox.enqueue(base,stand(4));assert.equal(f.outbox.list(ACTOR,A).length,2);assert.equal(f.outbox.list(ACTOR,A)[0].id,head.id);assert.deepEqual(f.outbox.list(ACTOR,A)[1].value,stand(4));
  const key=[...storage.data.keys()][0];storage.data.set(key,JSON.stringify({schemaVersion:1,actorId:ACTOR,studentId:A,jobs:[{id:'tampered',expectedRevision:0,baseActivity:null,value:{kind:'stand',token:'forbidden'},attempted:false,createdAt:1}]}));
  assert.deepEqual(createStudentHomeRobotOutbox({storage}).list(ACTOR,A),[]);
});

function lampHome(){
  let home=createStudentHome(A);for(const[index,command]of[{type:'checkout',lines:[{skuId:'readingLamp-classic',quantity:1}]},{type:'placeItem',id:'owned-1-1',storey:0,pose:{x:1.8,z:1.4,rotation:0}}].entries()){
    const prepared=prepareCommerceCommand(home.commerce,command,`object-lifecycle-setup-${index}`);home={...home,commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:home.revision+1};
  }return home;
}
test('departure waits for a light intent queued behind a pose acknowledgement, preserving its student and final setting',async()=>{
  const f=fixture();await f.showHome(lampHome());f.emit(stand());const pose=f.requests.at(-1),change=f.bindings.world.onObjectAction({id:'owned-1-1',storey:0,patch:{power:true}});
  assert.equal(f.objectOutbox.list(ACTOR,A).length,1,'intent is durable before pose completion');assert.ok([...f.storage.data.keys()].some(key=>key.includes('object-outbox')));
  const departure=f.editor.prepareLeave();pose.accept();await settle();const setting=f.requests.find(row=>row.command.type==='setObjectState');assert.ok(setting);assert.equal(setting.options.studentId,A);setting.accept();assert.equal((await change).ok,true);
  await settle();for(const pending of f.requests.filter(row=>row.command.type==='setRobotActivity'&&row!==pose))pending.accept();assert.equal((await departure).ok,true);assert.equal(f.objectOutbox.pending(ACTOR,A),false);assert.equal(getObjectState(f.snapshot(A).home.commerce,'owned-1-1').power,true);
});
test('unknown A light request replays with the same identity after visiting B and cannot leave an acknowledged stale pending command',async()=>{
  const f=fixture();await f.showHome(lampHome());const change=f.bindings.world.onObjectAction({id:'owned-1-1',storey:0,patch:{power:true}}),first=f.requests.at(-1);first.reject(503);assert.equal((await change).ok,false);const before=f.snapshot(A);
  await f.show(B);const replay=f.editor.replayRobotActivity({actorId:ACTOR,studentId:A,...before});await settle();const retry=f.requests.at(-1);assert.equal(retry.id,first.id);assert.equal(retry.options.studentId,A);assert.equal(retry.options.expectedRevision,first.options.expectedRevision);retry.accept();const restored=await replay;assert.equal(restored.pending,false);
  await f.editor.show(restored.home,{robotActivity:restored.robotActivity,actorId:ACTOR});const next=f.bindings.world.onObjectAction({id:'owned-1-1',storey:0,patch:{brightness:3}});await settle();const last=f.requests.at(-1);assert.notEqual(last.id,first.id);assert.equal(last.command.patch.brightness,3);last.accept();assert.equal((await next).ok,true);assert.equal(getObjectState(f.snapshot(A).home.commerce,'owned-1-1').brightness,3);assert.equal(f.snapshot(B).home.commerce.objectStates,undefined);
});
test('a fresh editor replays the locally queued light intent before applying its returned home snapshot',async()=>{
  const storage=storageFixture(),old=fixture({storage});await old.showHome(lampHome());old.emit(stand());const initial=old.snapshot(A),change=old.bindings.world.onObjectAction({id:'owned-1-1',storey:0,patch:{power:true}});
  assert.equal(old.objectOutbox.pending(ACTOR,A),true);old.editor.dispose();const fresh=fixture({storage});await fresh.showHome(initial.home);const replay=fresh.editor.replayRobotActivity({actorId:ACTOR,studentId:A,...initial});await settle();assert.equal(fresh.requests[0].command.type,'setObjectState');fresh.requests[0].accept();await settle();for(const request of fresh.requests.slice(1))request.accept();const restored=await replay;assert.equal(restored.home.commerce.objectStates['owned-1-1'].power,true);assert.equal(fresh.objectOutbox.pending(ACTOR,A),false);
  old.requests[0].accept();await change;
});
