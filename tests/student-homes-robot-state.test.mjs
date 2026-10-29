import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {validateStudentHome} from '../server/student-homes/profile.mjs';
import {prepareRobotActivityCommand,isRobotActivityTargetValid,reconcileRobotActivityDetail} from '../server/student-homes/robot-activity.mjs';
import {normalizeRobotActivity,isRobotActivityShape,sameRobotActivity,robotActivityKey,ROBOT_STATE_LIMITS} from '../public/js/student-home-robot-state.js';
import {findAvatarSpawn} from '../public/js/home-avatar-navigation.js';
import {findOutdoorRobotSpawn,getRobotPoolDescriptor} from '../public/js/student-home-robot-swimming.js';
import {getHomeStairs} from '../public/js/home-staircase-shape.js';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',TENANT='isolated-robot-state',ACTOR='isolated-state-owner';
const copy=value=>structuredClone(value),activity=value=>({type:'setRobotActivity',activity:value});
const nav={radius:.4485902240491439,height:1.50377153758785};
const stand=(point={x:0,z:1.5},storey=0,environment='interior')=>({kind:'stand',environment,storey,point,rotation:.71});
const furniture=(itemId,action,extra={})=>({kind:'furniture',action,itemId,storey:0,...extra});
function paymentFixture(){
  const orders=new Map(),control={balance:500000,reserves:0};
  const wallet=()=>({currency:'platform-points',balance:control.balance});
  return {control,async get(id){if(!orders.has(id))throw Object.assign(new Error('missing isolated order'),{status:404});return {order:copy(orders.get(id)),wallet:wallet()};},
    async reserve(input){control.reserves++;let order=orders.get(input.orderId);if(!order){order={...input,id:input.orderId,status:'reserved'};delete order.orderId;orders.set(order.id,order);control.balance-=order.amount;}return {order:copy(order),wallet:wallet()};},
    async commit(id){const order=orders.get(id);order.status='committed';return {order:copy(order),wallet:wallet()};}};
}
async function fixture(t){
  const directory=await fs.mkdtemp(join(tmpdir(),'robot-checkpoint-'));let store=await new StudentHomeStore({dataDir:directory}).initialize(),sequence=0;
  const bank=paymentFixture();await store.initializeHome(TENANT,A,ACTOR);await store.initializeHome(TENANT,B,ACTOR);
  t.after(async()=>{await store.close();await fs.rm(directory,{recursive:true,force:true});});
  const command=async(command,{student=A,revision,id=`isolated-state-${++sequence}`}={})=>store.executeCommand(TENANT,student,ACTOR,{command,commandId:id,expectedRevision:revision??(await store.get(TENANT,student)).revision},bank);
  return {bank,command,get store(){return store;},async restart(){await store.close();store=await new StudentHomeStore({dataDir:directory}).initialize();},
    async place(skuId,{student=A,pose={x:0,z:0,rotation:0},storey=0}={}){let result=await command({type:'checkout',lines:[{skuId,quantity:1}]},{student});const id=result.home.commerce.owned.at(-1).id;
      result=await command(skuId.startsWith('outdoor-')?{type:'placeOutdoor',id,pose}:{type:'placeItem',id,pose,storey},{student});return {id,home:result.home};}};
}

test('shared semantic shapes copy defensively, canonicalize yaw and key order, and preserve legacy sleep',()=>{
  const original={rotation:Math.PI*2+.71,point:{z:1.5,x:0},storey:0,environment:'interior',kind:'stand'},copy1=normalizeRobotActivity(original);
  assert.equal(isRobotActivityShape(original),true);assert.ok(Math.abs(copy1.rotation-.71)<1e-10);assert.equal(sameRobotActivity(original,copy1),true);
  assert.equal(robotActivityKey(null),'null');original.point.x=3;assert.equal(copy1.point.x,0);
  assert.deepEqual(normalizeRobotActivity({kind:'sleep',itemId:'owned-bed',storey:2}),{kind:'sleep',itemId:'owned-bed',storey:2});
  for(const value of [furniture('bed','lie',{phase:'enter',step:2,progress:.42,entrySide:'right',rotation:.2,originTime:1.1,exitRequested:true}),furniture('bookcase','read',{approachIndex:11}),
    {kind:'swim',itemId:'pool',storey:0,phase:'exit',step:2,progress:.5,time:12,exitFrom:{phase:'enter',step:2,progress:.3}},
    {kind:'swim',itemId:'pool',storey:0,phase:'loop',time:13,loopTime:4.5},
    {kind:'stairs',itemId:'stairs',storey:1,step:45,progress:.2,rotation:-Math.PI,time:22},
    {kind:'elevator',itemId:'elevator',storey:0,step:5,progress:.6,rotation:0},
    {...stand(),action:'wave',time:.4,remaining:1.5}])assert.equal(isRobotActivityShape(value),true,JSON.stringify(value));
});

test('semantic shape rejects hidden transforms, nested junk, nonfinite numbers and oversized checkpoints',()=>{
  const values=[undefined,[],{kind:'dance'}, {...stand(),point:{x:0,z:0,y:1}}, {...stand(),point:{x:NaN,z:0}}, {...stand(),rotation:Infinity},
    {...stand(),point:{x:ROBOT_STATE_LIMITS.coordinate+1,z:0}}, {...stand(),environment:'building'}, {...stand(),storey:-1},
    {...stand(),environment:'estate',storey:1}, {...stand(),quaternion:[0,0,0,1]}, {...stand(),studentId:B},
    {...stand(),time:86401}, {...stand(),remaining:1},furniture('bed','lie',{phase:'enter'}),furniture('bed','lie',{phase:'enter',step:17,progress:.5}),
    furniture('bed','cook',{phase:'enter',step:0,progress:0}),furniture('bed','read',{remaining:6}),furniture('bed','lie',{entrySide:'middle'}),furniture('bookcase','read',{approachIndex:12}),
    furniture('bed','lie',{phase:'enter',step:2,progress:.42,exitRequested:false}),furniture('bed','lie',{phase:'exit',step:2,progress:.42,exitRequested:true}),
    furniture('x'.repeat(129),'lie'),{kind:'swim',itemId:'pool',storey:0,phase:'loop',step:0,progress:0},
    {kind:'swim',itemId:'pool',storey:0,phase:'exit',step:0,progress:0,exitFrom:{phase:'loop',point:{x:0,z:0}}},
    {kind:'swim',itemId:'pool',storey:0,phase:'loop',time:13,loopTime:86401},
    {kind:'stairs',itemId:'stairs',storey:0,step:256,progress:0,rotation:0}];
  for(const value of values){assert.equal(isRobotActivityShape(value),false,JSON.stringify(value));assert.equal(normalizeRobotActivity(value),null);}
});

test('normalizing an acknowledged yaw preserves its exact checkpoint key through repeated reloads',()=>{
  for(const rotation of [-Math.PI,-1.9997493877160468,-.71,-0,0,.71,Math.PI,Math.PI*2+.71,-Math.PI*4-.71]){
    const initial=normalizeRobotActivity({...stand(),rotation}),key=robotActivityKey(initial);let checkpoint=initial;
    for(let replay=0;replay<100;replay++){
      checkpoint=normalizeRobotActivity(checkpoint);assert.equal(checkpoint.rotation,initial.rotation);assert.equal(robotActivityKey(checkpoint),key);
    }
    if(rotation>=-Math.PI&&rotation<=Math.PI)assert.equal(initial.rotation,Object.is(rotation,-0)?0:rotation);
  }
});

test('standing point and yaw survive switching student, service restart, and teacher change without money movement',async t=>{
  const f=await fixture(t),before=await f.store.get(TENANT,A),checkpoint=stand(findAvatarSpawn(before.commerce.home,null,nav)),balance=f.bank.control.balance;
  const saved=await f.command(activity(checkpoint));assert.deepEqual(saved.robotActivity,checkpoint);assert.equal(saved.receipt.amount,0);assert.equal(saved.receipt.orderId,null);
  assert.deepEqual(saved.home.avatar,before.avatar);assert.deepEqual(saved.home.commerce,before.commerce);assert.equal(f.bank.control.reserves,0);assert.equal(f.bank.control.balance,balance);
  assert.equal((await f.store.getSnapshot(TENANT,B)).robotActivity,null);assert.equal((await f.store.getSnapshot('another-isolated-tenant',A)).home,null);
  await f.restart();assert.deepEqual((await f.store.getSnapshot(TENANT,A)).robotActivity,checkpoint);
  const init=await f.store.initializeHome(TENANT,A,'isolated-other-teacher');assert.deepEqual(init.robotActivity,checkpoint);assert.equal(validateStudentHome(init.home,A),true);
  const record=await f.store.readRecord(TENANT,A);assert.equal(prepareRobotActivityCommand(record,activity(checkpoint)).changed,false);
});

test('standing requires a real current floor and clear footprint inside interior or outdoor land',async t=>{
  const f=await fixture(t),{id,home}=await f.place('bed-classic');
  for(const invalid of [stand({x:0,z:0}),stand({x:100,z:100}),stand({x:0,z:1.5},1),stand({x:0,z:0},0,'estate'),stand({x:100,z:0},0,'estate')])
    await assert.rejects(f.command(activity(invalid)),e=>e.status===422,JSON.stringify(invalid));
  const exterior=stand(findOutdoorRobotSpawn(home.commerce,null,nav),0,'estate');assert.deepEqual((await f.command(activity(exterior))).robotActivity,exterior);
  assert.equal((await f.store.getSnapshot(TENANT,A)).robotActivity.environment,'estate');assert.ok(id);
});

for(const time of [2.35,12.35])test(`stage dance at ${time}s persists for its own student through restart without a wallet order, and a blocked floor clears it`,async t=>{
  const f=await fixture(t),checkpoint={kind:'dance',storey:0,point:{x:0,z:0},rotation:.4,time,blend:.8},balance=f.bank.control.balance;
  const result=await f.command(activity(checkpoint));assert.deepEqual(result.robotActivity,checkpoint);assert.equal(result.receipt.amount,0);assert.equal(f.bank.control.reserves,0);assert.equal(f.bank.control.balance,balance);
  assert.equal((await f.store.getSnapshot(TENANT,B)).robotActivity,null);await f.restart();assert.deepEqual((await f.store.getSnapshot(TENANT,A)).robotActivity,checkpoint);
  const exiting={...checkpoint,exitRequested:true,blend:.3};assert.deepEqual((await f.command(activity(exiting))).robotActivity,exiting);await f.restart();assert.deepEqual((await f.store.getSnapshot(TENANT,A)).robotActivity,exiting);
  await assert.rejects(()=>f.command(activity({...checkpoint,point:{x:0,z:2.3}})),e=>e.status===422);
  const blocked=await f.place('bed-classic');assert.equal((await f.store.getSnapshot(TENANT,A)).robotActivity,null);assert.ok(blocked.id);
});

for(const [sku,action]of [['sofa-classic','sit'],['compactToilet-classic','sit'],['bdSmartToilet-classic','sit'],['bed-classic','lie'],
  ['bookcase-classic','read'],['rangeCooker-classic','cook'],['kitchenSink-classic','wash'],['mkDishwasher-classic','dishwash'],['plant-classic','admire']])
  test(`${action} on owned ${sku} saves by target reference, follows moved target, and clears permanently when stored`,async t=>{
    const f=await fixture(t),{id}=await f.place(sku),checkpoint=furniture(id,action,['read','cook','wash','dishwash'].includes(action)?{time:1.25,remaining:3.75}:{});
    const saved=await f.command(activity(checkpoint));assert.deepEqual(saved.robotActivity,checkpoint);assert.equal(saved.receipt.amount,0);
    const moved=await f.command({type:'updateItem',id,patch:{x:.2,z:.2,rotation:90},storey:0});assert.deepEqual(moved.robotActivity,checkpoint);
    await f.restart();assert.deepEqual((await f.store.getSnapshot(TENANT,A)).robotActivity,checkpoint);
    const stored=await f.command({type:'storeItem',id,storey:0});assert.equal(stored.robotActivity,null);assert.equal(stored.receipt.detail.robotActivity,null);
    const replaced=await f.command({type:'placeItem',id,pose:{x:0,z:0,rotation:0},storey:0});assert.equal(replaced.robotActivity,null);
  });

test('furniture capability and ownership cannot be forged or borrowed across students',async t=>{
  const f=await fixture(t),{id}=await f.place('bed-classic'),other=await f.place('sofa-classic',{student:B});
  const stored=await f.command({type:'checkout',lines:[{skuId:'sofa-classic',quantity:1}]}),storedId=stored.home.commerce.owned.at(-1).id;
  for(const invalid of [furniture(id,'sit'),furniture(id,'cook'),furniture(id,'read'),furniture('absent','lie'),furniture(other.id,'sit'),furniture(storedId,'sit'),furniture(id,'lie',{storey:1})])
    await assert.rejects(f.command(activity(invalid)),e=>e.status===422,JSON.stringify(invalid));
});

test('furniture motion stores only bounded semantic phase progress and does not pin stale placement coordinates',async t=>{
  const f=await fixture(t),{id}=await f.place('bed-classic'),checkpoint=furniture(id,'lie',{phase:'enter',step:2,progress:.37,entrySide:'right',rotation:.3,time:1.8});
  assert.deepEqual((await f.command(activity(checkpoint))).robotActivity,checkpoint);
  const moved=await f.command({type:'updateItem',id,patch:{x:.2,z:0,rotation:90},storey:0});assert.deepEqual(moved.robotActivity,checkpoint);
  const record=await f.store.readRecord(TENANT,A),next=copy(record.home);next.commerce.home.furniture=[];
  assert.equal(isRobotActivityTargetValid(next,checkpoint),false);assert.deepEqual(reconcileRobotActivityDetail(record,next,{changed:true}),{changed:true,robotActivity:null});
});

test('mounted reading targets follow their actual support after its move and rotation',async t=>{
  const f=await fixture(t),desk=await f.place('writingDesk-classic'),books=await f.place('bookends-classic',{pose:{mount:{type:'table',parentId:desk.id,u:.5,v:.5}}});
  const checkpoint=furniture(books.id,'read',{time:2,remaining:3,approachIndex:0});assert.deepEqual((await f.command(activity(checkpoint))).robotActivity,checkpoint);
  const moved=await f.command({type:'updateItem',id:desk.id,patch:{x:.2,z:.2,rotation:90},storey:0});assert.deepEqual(moved.robotActivity,checkpoint);
  await f.restart();assert.deepEqual((await f.store.getSnapshot(TENANT,A)).robotActivity,checkpoint);
  assert.equal((await f.command({type:'storeItem',id:books.id,storey:0})).robotActivity,null);
});

test('placed owned pools save laps and entry/exit checkpoints; unplaced, nonpool and foreign targets fail',async t=>{
  const f=await fixture(t),{id,home}=await f.place('outdoor-pool-1',{pose:{x:10,z:5,rotation:0}});assert.ok(getRobotPoolDescriptor(home.commerce,id,{navigation:nav}));
  const checkpoints=[{kind:'swim',itemId:id,storey:0,time:12.4,phase:'loop'},
    {kind:'swim',itemId:id,storey:0,phase:'enter',step:2,progress:.42,rotation:.7,time:1.2},
    {kind:'swim',itemId:id,storey:0,phase:'exit',step:2,progress:.15,time:14.5,exitFrom:{phase:'loop',time:12.4}}];
  for(const checkpoint of checkpoints){assert.deepEqual((await f.command(activity(checkpoint))).robotActivity,checkpoint);await f.restart();assert.deepEqual((await f.store.getSnapshot(TENANT,A)).robotActivity,checkpoint);}
  await f.command({type:'checkout',lines:[{skuId:'plant-classic',quantity:1}]},{student:B});
  const other=await f.place('outdoor-pool-1',{student:B,pose:{x:10,z:5,rotation:0}});assert.notEqual(other.id,id);
  await assert.rejects(f.command(activity({...checkpoints[0],itemId:other.id})),e=>e.status===422);
  const nonpool=await f.place('bed-classic');await assert.rejects(f.command(activity({...checkpoints[0],itemId:nonpool.id})),e=>e.status===422);
  const moved=await f.command({type:'updateOutdoor',id,patch:{x:11,z:6,rotation:90}});assert.deepEqual(moved.robotActivity,checkpoints.at(-1));
  assert.equal((await f.command({type:'storeOutdoor',id})).robotActivity,null);
  await assert.rejects(f.command(activity(checkpoints[0])),e=>e.status===422);
});

test('stair and elevator checkpoints require the connected real transport and clear landings',async t=>{
  const f=await fixture(t),rect={minX:-2.8,minZ:-3.8,width:5.6,depth:7.8};
  for(const storey of [0,1])await f.command({type:'constructFloor',selection:{storey,rects:[rect]}});
  let home=await f.store.get(TENANT,A);const id=getHomeStairs(home.commerce.home)[0].id;
  const upstairs=stand(findAvatarSpawn(home.commerce.upperFloors[0],null,nav),1);assert.deepEqual((await f.command(activity(upstairs))).robotActivity,upstairs);
  await f.restart();assert.deepEqual((await f.store.getSnapshot(TENANT,A)).robotActivity,upstairs);
  const checkpoint={kind:'stairs',itemId:id,storey:0,step:12,progress:.38,rotation:.3,time:5};
  assert.deepEqual((await f.command(activity(checkpoint))).robotActivity,checkpoint);await f.restart();assert.deepEqual((await f.store.getSnapshot(TENANT,A)).robotActivity,checkpoint);
  await assert.rejects(f.command(activity({...checkpoint,itemId:'foreign-connection'})),e=>e.status===422);
  await assert.rejects(f.command(activity({...checkpoint,kind:'elevator',step:5})),e=>e.status===422);
  home=(await f.command({type:'upgradeStaircase',id,storey:0})).home;assert.equal((await f.store.getSnapshot(TENANT,A)).robotActivity,null);
  const lift={...checkpoint,kind:'elevator',step:5};assert.deepEqual((await f.command(activity(lift))).robotActivity,lift);
  await assert.rejects(f.command(activity({...lift,step:9})),e=>e.status===422);
  const record=await f.store.readRecord(TENANT,A),broken=copy(home);broken.commerce.upperFloors[0].stairs.x+=.2;
  assert.equal(isRobotActivityTargetValid(broken,lift),false);assert.equal(reconcileRobotActivityDetail(record,broken).robotActivity,null);
});

test('an edit which builds onto the standing footprint clears that checkpoint and cannot revive it',async t=>{
  const f=await fixture(t),checkpoint=stand({x:0,z:0});await f.command(activity(checkpoint));
  const purchased=await f.command({type:'checkout',lines:[{skuId:'bed-classic',quantity:1}]}),id=purchased.home.commerce.owned.at(-1).id;
  assert.deepEqual(purchased.robotActivity,checkpoint);
  const blocked=await f.command({type:'placeItem',id,pose:{x:0,z:0,rotation:0},storey:0});assert.equal(blocked.robotActivity,null);assert.equal(blocked.receipt.detail.robotActivity,null);
  await f.command({type:'storeItem',id,storey:0});await f.restart();assert.equal((await f.store.getSnapshot(TENANT,A)).robotActivity,null);
});

test('new sofa/tabledesk work stays account-owned, persists through restart and does not spend points',async t=>{
  const f=await fixture(t);
  for(const [skuId,action] of [['sofa-classic','tidy'],['studyDesk-classic','wipe']]){
    const placed=await f.place(skuId),a=furniture(placed.id,action,{time:1.6,remaining:3.4,originRotation:.73,approachIndex:0});
    const balance=f.bank.control.balance,reserves=f.bank.control.reserves;
    assert.equal(isRobotActivityTargetValid(placed.home,a),true);const result=await f.command(activity(a));assert.deepEqual(result.robotActivity,a);assert.equal(result.receipt.amount,0);assert.equal(f.bank.control.balance,balance);assert.equal(f.bank.control.reserves,reserves);
    await f.restart();assert.deepEqual((await f.store.getSnapshot(TENANT,A)).robotActivity,a);assert.equal((await f.store.getSnapshot(TENANT,B)).robotActivity,null);
    await assert.rejects(()=>f.command(activity(a),{student:B}),/DisplayText4656|DisplayText4657/);
    const stored=await f.command({type:'storeItem',id:placed.id,storey:0});assert.equal(stored.robotActivity,null);
  }
});

test('football target and period survive service restart and invalid ownership never grants play',async t=>{
  const f=await fixture(t),placed=await f.place('outdoor-football-1',{pose:{x:10,z:10,rotation:0}}),a={kind:'football',itemId:placed.id,storey:0,time:4.2,originRotation:.3,exitRequested:true};
  const balance=f.bank.control.balance,reserves=f.bank.control.reserves;assert.equal(isRobotActivityTargetValid(placed.home,a),true);
  const result=await f.command(activity(a));assert.deepEqual(result.robotActivity,a);assert.equal(result.receipt.amount,0);assert.equal(f.bank.control.balance,balance);assert.equal(f.bank.control.reserves,reserves);
  await f.restart();assert.deepEqual((await f.store.getSnapshot(TENANT,A)).robotActivity,a);await assert.rejects(()=>f.command(activity(a),{student:B}),/DisplayText4656|DisplayText4657/);
  assert.equal(isRobotActivityShape({...a,time:15.01}),false);assert.equal(isRobotActivityShape({...a,storey:1}),false);assert.equal(isRobotActivityShape({...a,exitRequested:false}),false);
  const stored=await f.command({type:'storeOutdoor',id:placed.id});assert.equal(stored.robotActivity,null);
});
