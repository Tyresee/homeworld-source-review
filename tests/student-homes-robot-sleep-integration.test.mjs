import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createStudentHomesService,API_PREFIX} from '../server/student-homes/app.mjs';
import {createStudentHome} from '../server/student-homes/profile.mjs';
import {prepareCommerceCommand,houseFromCommerce} from '../server/student-homes/commerce.mjs';
import {getFloorHomes} from '../public/js/home-commerce.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const TENANT='isolated-sleep-tenant',ACTOR='isolated-sleep-teacher',PUBLIC='http://127.0.0.1:18805';

test('a real robot sleep event survives HTTP save, a fresh service and fresh controller, without crossing student accounts',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'home-sleep-http-rig-'));
  const original={document:globalThis.document,raf:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame};
  const frames=new Map(),controllers=[];let serial=0,service,origin;
  globalThis.document=new EventTarget();document.hidden=false;
  globalThis.requestAnimationFrame=callback=>{frames.set(++serial,callback);return serial;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  t.after(async()=>{controllers.forEach(c=>c.dispose());await service?.close();globalThis.document=original.document;
    globalThis.requestAnimationFrame=original.raf;globalThis.cancelAnimationFrame=original.cancel;await rm(directory,{recursive:true,force:true});});
  const platformClient={
    session:async()=>({authenticated:true,tenantId:TENANT,currency:'platform-points',actor:{id:ACTOR,role:'owner'}}),
    students:async()=>[{id:A,displayName:"DisplayText4654"},{id:B,displayName:"DisplayText4655"}],
    paymentAdapter:()=>null,
  };
  async function start(){service=await createStudentHomesService({platformClient,publicOrigin:PUBLIC,dataDir:directory});
    await new Promise(done=>service.server.listen(0,'127.0.0.1',done));origin=`http://127.0.0.1:${service.server.address().port}`;}
  async function api(student,body){const response=await fetch(`${origin}${API_PREFIX}/students/${student}/home${body?'/commands':''}`,{
    method:body?'POST':'GET',headers:{origin:PUBLIC,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;}
  await start();
  // Isolated ownership fixtures use the real catalogue and placement rules.
  // No platform wallet or real student record is involved.
  for(const student of [A,B]){
    let home=createStudentHome(student),commerce=prepareCommerceCommand(home.commerce,{type:'checkout',
      lines:[{skuId:'bedTimber-classic',quantity:1}]},`sleep-fixture-buy-${student}`).commerce;
    const bed=commerce.owned[0];commerce=prepareCommerceCommand(commerce,{type:'placeItem',id:bed.id,
      pose:{x:0,z:0,rotation:90},storey:0},`sleep-fixture-place-${student}`).commerce;
    home={...home,revision:1,commerce,house:houseFromCommerce(commerce)};await service.store.write(TENANT,student,ACTOR,home);
  }
  const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  const source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const events=[],writes=[];let current=await api(A),commandSerial=0,saveTail=Promise.resolve();
  function controller(reply,onActivityChange){const c=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},onActivityChange});controllers.push(c);
    const floor=reply.robotActivity?.storey??0,floors=getFloorHomes(reply.home.commerce);
    c.setWorld(floors[floor],floor,{floors});c.setAvatar({...reply.home.avatar,equipped:reply.home.commerce.avatar.equipped,activity:reply.robotActivity??null});return c;}
  // Like the real editor, serialize the richer movement/contact checkpoints
  // against the last acknowledged revision instead of posting them concurrently.
  const first=controller(current,activity=>{events.push(activity);const id=`sleep-integration-${++commandSerial}`;
    saveTail=saveTail.then(async()=>{current=await api(A,{expectedUserId:ACTOR,
      expectedRevision:current.home.revision,commandId:id,command:{type:'setRobotActivity',activity}});});writes.push(saveTail);});
  const bedId=current.home.commerce.owned[0].id;
  assert.equal(first.interact(`furniture:${bedId}`,'lie').ok,true);
  for(let n=0;n<650&&first.getState().action!=='lie';n++){
    const pending=[...frames.values()];frames.clear();for(const frame of pending)frame(performance.now()+50);
  }
  assert.equal(first.getState().action,'lie');await Promise.all(writes);
  const sleeping={kind:'sleep',itemId:bedId,storey:0};
  assert.ok(events.some(value=>value?.kind==='furniture'&&value.phase==='enter'),'the actual bed entrance also produces recoverable checkpoints');
  assert.deepEqual(events.at(-1),sleeping);assert.deepEqual(current.robotActivity,sleeping);
  first.dispose();await service.close();await start();
  const saved=await api(A),restoredEvents=[],restored=controller(saved,value=>restoredEvents.push(value));
  assert.deepEqual(saved.robotActivity,sleeping);assert.equal(restored.getState().action,'lie');
  assert.equal(restored.getState().inTransition,false);assert.equal(restored.getState().scheduled,false);
  assert.deepEqual(restoredEvents,[],'restoring sleep must not save another activity');
  const secondReply=await api(B),second=controller(secondReply,value=>restoredEvents.push(value));
  assert.equal(secondReply.robotActivity,null);assert.equal(second.getState().action,'idle');
  const beforeWake=restored.getState().point;restored.stand();
  assert.equal(restoredEvents.at(-1)?.phase,'exit');assert.equal(restoredEvents.at(-1)?.itemId,bedId);assert.equal(restored.getState().inTransition,true);
  assert.deepEqual(restored.getState().point,beforeWake,'the first wake frame must not teleport');
});
