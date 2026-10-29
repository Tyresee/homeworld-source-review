import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {getFloorHomes} from '../public/js/home-commerce.js';
import {getObjectState} from '../public/js/home-object-state.js';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',TENANT='isolated-tv-tenant',ACTOR='isolated-tv-teacher';
function bank(){const orders=new Map(),state={balance:500000,reserves:0,commits:0};return {state,
 async get(id){if(!orders.has(id))throw Object.assign(new Error('isolated missing order'),{status:404});return{order:structuredClone(orders.get(id)),wallet:{tenantId:TENANT,studentId:A,currency:'platform-points',balance:state.balance}};},
 async reserve(quote){if(!orders.has(quote.orderId)){state.reserves++;orders.set(quote.orderId,{...quote,id:quote.orderId,status:'reserved'});state.balance-=quote.amount;}return this.get(quote.orderId);},
 async commit(id){if(orders.get(id).status!=='committed')state.commits++;orders.get(id).status='committed';return this.get(id);},
};}

test('real v4 television commands and robot checkpoints serialize delayed store acknowledgements, survive restart, and never spend interaction points',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'home-tv-live-rig-')),original={document:globalThis.document,raf:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame},frames=new Map(),controllers=[];let sequence=0,store,serial=0,current,c,tail=Promise.resolve();const payments=bank(),commands=[],failures=[];
 globalThis.document=new EventTarget();document.hidden=false;globalThis.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 t.after(async()=>{for(const item of controllers)item.dispose();await tail.catch(()=>{});await store?.close();globalThis.document=original.document;globalThis.requestAnimationFrame=original.raf;globalThis.cancelAnimationFrame=original.cancel;await rm(directory,{recursive:true,force:true});});
 store=await new StudentHomeStore({dataDir:directory}).initialize();await store.initializeHome(TENANT,A,ACTOR);await store.initializeHome(TENANT,B,ACTOR);current=await store.getSnapshot(TENANT,A);
 async function execute(command){const id=`tv-integration-${++serial}`;const reply=await store.executeCommand(TENANT,A,ACTOR,{expectedRevision:current.home.revision,commandId:id,command},payments);current=reply;commands.push(command);return reply;}
 await execute({type:'constructFloor',selection:{storey:0,rects:[{minX:-6,minZ:-6,width:12,depth:12}]}});
 await execute({type:'checkout',lines:[{skuId:'ipRetroTelevision-classic',quantity:1},{skuId:'sofa-classic',quantity:1}]});
 const tv=current.home.commerce.owned.find(r=>r.item.kind==='ipRetroTelevision'),seat=current.home.commerce.owned.find(r=>r.item.kind==='sofa');
 await execute({type:'placeItem',id:tv.id,pose:{x:0,z:-2.5,rotation:0},storey:0});await execute({type:'placeItem',id:seat.id,pose:{x:0,z:1.8,rotation:180},storey:0});const money={...payments.state},financial=current.home.commerce.orders.map(r=>r.id);
 const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));const source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 function enqueue(command){const next=tail.then(async()=>{await new Promise(done=>setTimeout(done,2));const reply=await execute(command);c?.setObjectContext(reply.home.commerce);c?.setAvatar({activity:reply.robotActivity,equipped:reply.home.commerce.avatar.equipped});return {ok:true,...reply};});tail=next.catch(error=>{failures.push(error);});return next;}
 function make(reply){const controller=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},onActivityChange:activity=>{void enqueue({type:'setRobotActivity',activity});},onObjectAction:request=>enqueue({type:'setObjectState',...request})});controllers.push(controller);const floors=getFloorHomes(reply.home.commerce);controller.setWorld(floors[reply.robotActivity?.storey??0],reply.robotActivity?.storey??0,{floors});controller.setObjectContext(reply.home.commerce);controller.setAvatar({...reply.home.avatar,equipped:reply.home.commerce.avatar.equipped,activity:reply.robotActivity});return controller;}
 async function settle(){for(let n=0;n<200;n++){const now=tail;await now;if(now===tail)break;}assert.deepEqual(failures,[]);}
 async function until(condition){for(let n=0;n<2000;n++){if(condition(c.getState()))return;const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn(performance.now()+50);if(n%20===0)await new Promise(done=>setTimeout(done,1));}assert.fail(JSON.stringify(c.getState()));}
 c=make(current);assert.equal(c.interact(`furniture:${tv.id}`,'watch').ok,true);await until(s=>s.phase==='watch'&&!s.scheduled);await settle();assert.equal(c.getState().phase,'watch','late acknowledgements never restart or cancel sitting');assert.equal(current.robotActivity.kind,'watch');assert.equal(current.robotActivity.seatId,seat.id);assert.equal(getObjectState(current.home.commerce,tv.id).power,true);
 assert.equal(c.changeTelevisionChannel(tv.id).ok,true);await until(s=>s.phase==='watch'&&!s.scheduled);await settle();assert.equal(getObjectState(current.home.commerce,tv.id).channel,1);assert.deepEqual(payments.state,money);assert.deepEqual(current.home.commerce.orders.map(r=>r.id),financial);
 const beforeRestart=structuredClone(current.robotActivity);c.dispose();c=null;await settle();await store.close();store=await new StudentHomeStore({dataDir:directory}).initialize();current=await store.getSnapshot(TENANT,A);assert.deepEqual(current.robotActivity,beforeRestart);assert.deepEqual(getObjectState(current.home.commerce,tv.id),{power:true,channel:1,volume:1});
 const beforeRestore=commands.length;c=make(current);assert.equal(c.getState().phase,'watch');assert.equal(c.group.getObjectByName('robot-television-remote').visible,true);await settle();assert.equal(commands.length,beforeRestore,'loading saved viewing neither re-commands the television nor saves a fake pose');
 const other=await store.getSnapshot(TENANT,B);assert.equal(other.robotActivity,null);assert.equal(Object.hasOwn(other.home.commerce,'objectStates'),false);
 c.stand();await until(s=>s.action==='idle'&&!s.scheduled);await settle();assert.equal(current.robotActivity.kind,'stand');assert.equal(getObjectState(current.home.commerce,tv.id).power,false);assert.equal(getObjectState(current.home.commerce,tv.id).channel,1);assert.equal(c.group.getObjectByName('robot-television-remote').visible,false);assert.deepEqual(payments.state,money);assert.deepEqual(failures,[]);
});
