import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {createHomeState,applyChange,getFurniturePose} from '../public/js/home-engine.js';
import {createLuxuryItem} from '../public/js/home-luxury-models.js';
import {planRobotSofaTidy,sampleRobotSofaTidy} from '../public/js/student-home-robot-interactions.js';
import {createAccountCommerce} from '../server/student-homes/commerce.mjs';
import {isOutdoorRobotPositionWalkable} from '../public/js/student-home-robot-swimming.js';
import {isRobotActivityShape} from '../public/js/student-home-robot-state.js';
import {isRobotActivityTargetValid} from '../server/student-homes/robot-activity.mjs';
let source,oldDocument,oldRaf,oldCancel,frames,serial=0;
before(async()=>{const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;oldDocument=globalThis.document;oldRaf=globalThis.requestAnimationFrame;oldCancel=globalThis.cancelAnimationFrame;globalThis.document=new EventTarget();document.hidden=false;frames=new Map();globalThis.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};globalThis.cancelAnimationFrame=id=>frames.delete(id);});
after(()=>{globalThis.document=oldDocument;globalThis.requestAnimationFrame=oldRaf;globalThis.cancelAnimationFrame=oldCancel;});
function advance(n=1){for(let i=0;i<n&&frames.size;i++){const list=[...frames.values()];frames.clear();for(const fn of list)fn(performance.now()+50);}}
function until(c,fn){for(let n=0;n<1500;n++){if(fn(c.getState()))return;advance();}assert.fail(JSON.stringify(c.getState()));}
function world(items){let home=createHomeState({profile:'account',slab:{rects:[{minX:-6,minZ:-6,width:12,depth:12}]}});for(const item of items){const next=applyChange(home,{type:'furniture',...item});assert.equal(next.ok,true,next.error);home=next.state;}return home;}
function actor(t,home,options={}){const c=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},...options});t.after(()=>c.dispose());c.setWorld(home);c.setAvatar({activity:null,equipped:{}});return c;}
function record(home){return {commerce:{home,upperFloors:[],owned:home.furniture.map(item=>({id:item.id,source:'purchase',status:'placed',storey:0,item}))}};}
function hand(c,side){return c.group.getObjectByName(`HandSocket${side}`).getWorldPosition(new THREE.Vector3());}

for(const rotation of [0,90,180,270])test(`tidying ${rotation}° sofa reaches actual cushions with both hands, keeps feet stationary and finishes`,t=>{
 const home=world([{id:'sofa',kind:'sofa',x:0,z:0,rotation}]),events=[],c=actor(t,home,{onObjectPresentation:e=>events.push(e)}),robot=c.group.getObjectByName('robot-avatar');
 const plan=c.interactions('furniture:sofa').find(r=>r.id==='tidy');assert.ok(plan);
 assert.equal(c.interact('furniture:sofa','tidy').ok,true);until(c,s=>s.action==='tidy');
 const origin={...c.getState().point};advance(24);const checkpoint=c.captureActivity({emit:false});assert.ok(checkpoint.time>1.1);const sample=sampleRobotSofaTidy(plan,checkpoint.time);
 for(const side of ['L','R'])assert.ok(hand(c,side).distanceTo(new THREE.Vector3(sample.contacts[side].x,sample.contacts[side].y,sample.contacts[side].z))<.09,`${side} hand touches the real upholstery: ${JSON.stringify({hand:hand(c,side).toArray(),target:sample.contacts[side],plan:plan.approach,time:checkpoint.time})}`);
 const model=createLuxuryItem(home.furniture[0]),placement=getFurniturePose(home,home.furniture[0]);model.position.set(placement.x,placement.y,placement.z);model.rotation.y=rotation*Math.PI/180;model.updateMatrixWorld(true);
 for(const name of ['HeadShell','TorsoShell']){const body=new THREE.Box3().setFromObject(robot.getObjectByName(name)),collisions=[];model.traverse(n=>{if(n.isMesh&&body.intersectsBox(new THREE.Box3().setFromObject(n)))collisions.push(n.userData.part);});assert.deepEqual(collisions,[],`${name} does not enter sofa geometry when leaning`);}
 model.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});
 const firstHands=['L','R'].map(s=>hand(c,s));const firstFeet=['L','R'].map(s=>robot.getObjectByName(`FootShell${s}`).getWorldPosition(new THREE.Vector3()));advance(14);
 assert.ok(firstHands.some((p,i)=>p.distanceTo(hand(c,['L','R'][i]))>.025),'alternating pats are visible hand movement');
 for(let i=0;i<2;i++)assert.ok(firstFeet[i].distanceTo(robot.getObjectByName(`FootShell${['L','R'][i]}`).getWorldPosition(new THREE.Vector3()))<1e-6,'ground contacts do not slide');
 assert.deepEqual(c.getState().point,origin,'robot reaches with torso and arms, not root translation');assert.ok(events.some(e=>e.cushionTidy?.compression>.012));
 until(c,s=>s.action==='idle'&&!s.scheduled);assert.equal(events.at(-1).cushionTidy,null);assert.equal(c.captureActivity({emit:false}).kind,'stand');
});

test('tidy activity restores exact time, yaw and hands; moved/removed object and foreign ID are rejected',t=>{
 const home=world([{id:'sofa',kind:'lcCloudSofa',x:0,z:0,rotation:90}]),c=actor(t,home);assert.equal(c.interact('furniture:sofa','tidy').ok,true);until(c,s=>s.action==='tidy');advance(35);
 const saved=c.captureActivity({emit:false});assert.equal(isRobotActivityShape(saved),true);assert.equal(isRobotActivityTargetValid(record(home),saved),true);const before=['L','R'].map(s=>hand(c,s));
 const fresh=actor(t,home);fresh.setAvatar({activity:saved,equipped:{}});for(let i=0;i<2;i++)assert.ok(before[i].distanceTo(hand(fresh,['L','R'][i]))<1e-6);assert.deepEqual(fresh.captureActivity({emit:false}),saved);
 c.setVisible(false);assert.equal(c.getState().scheduled,false);c.setVisible(true);assert.deepEqual(c.captureActivity({emit:false}),saved);
 assert.equal(isRobotActivityTargetValid(record(home),{...saved,itemId:'other-student-sofa'}),false);const removed=record(home);removed.commerce.owned[0].status='stored';assert.equal(isRobotActivityTargetValid(removed,saved),false);
 c.clearAccountBinding();assert.equal(c.getState().scheduled,false);assert.equal(c.getState().activity,null);
});

test('interrupting cushion work releases the hands before standing or starting the next command',t=>{
 const home=world([{id:'sofa',kind:'sofa',x:0,z:0,rotation:0}]),c=actor(t,home);
 assert.equal(c.interact('furniture:sofa','tidy').ok,true);until(c,s=>s.action==='tidy');advance(30);
 const before=hand(c,'R');c.stand();assert.equal(c.getState().action,'tidy');assert.ok(before.distanceTo(hand(c,'R'))<1e-8,'stop request preserves the contact pose');
 assert.equal(c.wave(),true);assert.equal(c.getState().action,'tidy');until(c,s=>s.action==='wave');assert.equal(c.captureActivity({emit:false}).action,'wave');
 until(c,s=>s.action==='idle'&&!s.scheduled);
});

test('watch launched from a sofa always uses that sofa, and unavailable TV gives a reason',t=>{
 const home=world([{id:'tv',kind:'ipRetroTelevision',x:0,z:-3,rotation:0},{id:'near',kind:'sofa',x:-1.7,z:1,rotation:180},{id:'selected',kind:'sofa',x:1.7,z:2,rotation:180}]),c=actor(t,home);
 const option=c.interactions('furniture:selected').find(r=>r.id==='watch');assert.ok(option);assert.equal(option.disabled,false);assert.equal(c.interact('furniture:selected','watch').ok,true);until(c,s=>s.phase==='watch');assert.equal(c.getState().television.seatId,'selected');
 c.clearAccountBinding();c.setWorld(world([{id:'alone',kind:'sofa',x:0,z:0,rotation:0}]));const unavailable=c.interactions('furniture:alone').find(r=>r.id==='watch');assert.equal(unavailable.disabled,true);assert.match(unavailable.reason,/DisplayText4631.*DisplayText1155/);assert.equal(c.interact('furniture:alone','watch').ok,false);
});

for(const kind of ['studyDesk','rfWideDesk','rfWideCoffee'])test(`${kind} wiping uses a cloth at real tabletop height and resumes after refresh`,t=>{
 const home=world([{id:'table',kind,x:0,z:0,rotation:90}]),c=actor(t,home),plan=c.interactions('furniture:table').find(r=>r.id==='wipe');assert.ok(plan,kind);
 assert.equal(c.interact('furniture:table','wipe').ok,true);until(c,s=>s.action==='wipe');advance(30);
 const saved=c.captureActivity({emit:false}),sample=sampleRobotSofaTidy(plan,saved.time),robot=c.group.getObjectByName('robot-avatar'),cloth=robot.getObjectByName('robot-cleaning-cloth');
 assert.equal(isRobotActivityShape(saved),true);assert.equal(isRobotActivityTargetValid(record(home),saved),true);assert.equal(cloth.visible,true);
 assert.ok(hand(c,'R').distanceTo(new THREE.Vector3(sample.contacts.R.x,sample.contacts.R.y,sample.contacts.R.z))<.10,`${kind} hand reaches tabletop: ${JSON.stringify({hand:hand(c,'R').toArray(),target:sample.contacts.R})}`);
 const model=createLuxuryItem(home.furniture[0]),placement=getFurniturePose(home,home.furniture[0]);model.position.set(placement.x,placement.y,placement.z);model.rotation.y=Math.PI/2;model.updateMatrixWorld(true);
 for(const name of ['HeadShell','TorsoShell']){const body=new THREE.Box3().setFromObject(robot.getObjectByName(name)),collisions=[];model.traverse(n=>{if(n.isMesh&&body.intersectsBox(new THREE.Box3().setFromObject(n)))collisions.push(n.userData.part);});assert.deepEqual(collisions,[],`${name} clears ${kind}`);}
 model.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});
 const fresh=actor(t,home);fresh.setAvatar({activity:saved,equipped:{}});assert.ok(hand(c,'R').distanceTo(hand(fresh,'R'))<1e-6,JSON.stringify({saved,fresh:fresh.captureActivity({emit:false}),hand:hand(c,'R').toArray(),restored:hand(fresh,'R').toArray()}));assert.deepEqual(fresh.captureActivity({emit:false}),saved);until(c,s=>s.action==='idle'&&!s.scheduled);assert.equal(cloth.visible,false);
});

test('an out-of-reach high bar never advertises fake wiping',t=>{const c=actor(t,world([{id:'bar',kind:'rfBreakfastBar',x:0,z:0,rotation:0}]));assert.equal(c.interactions('furniture:bar').some(r=>r.id==='wipe'),false);});

function fieldWorld(){const state=createAccountCommerce();state.owned=[{id:'field',source:'purchase',status:'placed',storey:null,item:{kind:'outdoor-football-1',x:10,z:10,rotation:0}}];return state;}
function outdoorActor(t,state){const c=actor(t,state.home);c.setOutdoorWorld(state);c.setEnvironment('estate');return c;}
test('football moves actual leg/foot before ball contact, restores exact loop and exits to walkable grass',t=>{
 const state=fieldWorld(),c=outdoorActor(t,state);assert.ok(c.interactions('outdoor:field').some(r=>r.id==='football'));assert.equal(c.interact('outdoor:field','football').ok,true);until(c,s=>s.football?.frame.kick>.98);
 const robot=c.group.getObjectByName('robot-avatar'),foot=new THREE.Box3().setFromObject(robot.getObjectByName('FootShellR')),ball=c.getState().football.frame.ball;
 assert.ok(foot.distanceToPoint(new THREE.Vector3(ball.x,ball.y,ball.z))<.155,JSON.stringify({foot:foot.toArray?.()??{min:foot.min,max:foot.max},ball}));
 const saved=c.captureActivity({emit:false});assert.equal(saved.kind,'football');assert.equal(isRobotActivityShape(saved),true);assert.equal(isRobotActivityTargetValid({commerce:state},saved),true);
 const before={point:c.getState().point,ball:c.getState().football.frame.ball,foot:robot.getObjectByName('FootShellR').getWorldPosition(new THREE.Vector3())};
 const fresh=outdoorActor(t,state);fresh.setAvatar({activity:saved,equipped:{}});assert.deepEqual(fresh.getState().point,before.point);assert.deepEqual(fresh.getState().football.frame.ball,before.ball);assert.ok(fresh.group.getObjectByName('FootShellR').getWorldPosition(new THREE.Vector3()).distanceTo(before.foot)<1e-6);
 c.stand();assert.equal(c.captureActivity({emit:false}).exitRequested,true);until(c,s=>s.action==='idle'&&!s.scheduled);assert.equal(c.group.getObjectByName('robot-practice-football').visible,false);assert.equal(isOutdoorRobotPositionWalkable(state,c.getState().point,c.getState().navigation),true);
 fresh.clearAccountBinding();assert.equal(fresh.getState().scheduled,false);assert.equal(fresh.group.getObjectByName('robot-practice-football').visible,false);
});
