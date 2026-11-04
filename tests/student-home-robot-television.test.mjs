import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {createHomeState,applyChange} from '../public/js/home-engine.js';
import {planRobotTelevision,planRobotSofaTelevision,isRobotTelevisionSeatKind} from '../public/js/student-home-robot-interactions.js';
import {ROBOT_SEAT_KINDS} from '../public/js/home-furniture-capabilities.js';
import {isRobotActivityShape,normalizeRobotActivity} from '../public/js/student-home-robot-state.js';
import {createLuxuryItem} from '../public/js/home-luxury-models.js';
import {getFurniturePose} from '../public/js/home-engine.js';
import {isRobotActivityTargetValid} from '../server/student-homes/robot-activity.mjs';

let source,oldDocument,oldRaf,oldCancel,frames,serial=0;
before(async()=>{
 const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 oldDocument=globalThis.document;oldRaf=globalThis.requestAnimationFrame;oldCancel=globalThis.cancelAnimationFrame;globalThis.document=new EventTarget();document.hidden=false;frames=new Map();globalThis.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
});
after(()=>{globalThis.document=oldDocument;globalThis.requestAnimationFrame=oldRaf;globalThis.cancelAnimationFrame=oldCancel;});
function world({rotation=180,seat=true,seatKind='sofa',kind='ipRetroTelevision',wall=false}={}){
 let home=createHomeState({profile:'account',slab:{rects:[{minX:-6,minZ:-6,width:12,depth:12}]}});
 for(const item of[{id:'tv',kind,x:0,z:-2.5,rotation:0},...(seat?[{id:'seat',kind:seatKind,x:0,z:1.8,rotation}]:[]),...(wall?[{id:'obstacle',kind:'archedWardrobe',x:0,z:-.8,rotation:0}]:[])]){const result=applyChange(home,{type:'furniture',...item});assert.equal(result.ok,true,result.error);home=result.state;}return home;
}
function advance(count=1){for(let n=0;n<count&&frames.size;n++){const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(performance.now()+50);}}
function until(c,condition,limit=2200){for(let n=0;n<limit;n++){if(condition(c.getState()))return;advance();}assert.fail(JSON.stringify(c.getState()));}
function actor(t,home=world(),options={}){const c=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},...options});t.after(()=>c.dispose());c.setWorld(home);c.setAvatar({activity:null,equipped:{}});c.setObjectContext({home,objectStates:{tv:{power:false,channel:0,volume:1}}});return c;}
function record(home){return {commerce:{home,upperFloors:[],owned:home.furniture.map(item=>({id:item.id,source:'purchase',status:'placed',storey:0,item}))}};}
function pose(c){const robot=c.group.getObjectByName('robot-avatar');robot.updateMatrixWorld(true);return{point:c.getState().point,action:c.getState().action,phase:c.getState().phase,yaw:robot.rotation.y,shoulder:robot.getObjectByName('ShoulderR').quaternion.clone(),hand:robot.getObjectByName('HandSocketR').getWorldPosition(new THREE.Vector3()),remote:robot.getObjectByName('robot-television-remote').visible};}
function compare(a,b){assert.equal(a.action,b.action);assert.equal(a.phase,b.phase);assert.ok(Math.hypot(a.point.x-b.point.x,a.point.y-b.point.y,a.point.z-b.point.z)<1e-6);assert.ok(Math.abs(Math.atan2(Math.sin(a.yaw-b.yaw),Math.cos(a.yaw-b.yaw)))<1e-7);assert.ok(a.shoulder.angleTo(b.shoulder)<1e-6);assert.ok(a.hand.distanceTo(b.hand)<1e-6);assert.equal(a.remote,b.remote);}

test('a real robot fetches a single remote, walks to a forward-facing sofa, sits, presses power, switches channel and physically returns it',t=>{
 const phases=new Set(),commands=[],presentation=[],home=world(),c=actor(t,home,{onObjectAction:request=>{commands.push(request);return{ok:true};},onObjectPresentation:e=>presentation.push(e),onActivityChange:a=>{if(a?.kind==='watch')phases.add(a.phase);}});
 assert.ok(c.interactions('furniture:tv').some(row=>row.id==='watch'));assert.equal(c.interact('furniture:tv','watch').ok,true);
 until(c,s=>s.phase==='pickup'&&s.transitionProgress>.05);const handBefore=pose(c).hand;until(c,s=>s.phase==='pickup'&&s.transitionProgress>.45);assert.ok(pose(c).hand.distanceTo(handBefore)>.05,'the actual shoulder/elbow chain reaches for the cabinet');const dock=planRobotTelevision(home,'tv',{navigation:c.getState().navigation}).remoteDock;until(c,s=>s.phase==='pickup'&&s.transitionProgress>.54);assert.ok(pose(c).hand.distanceTo(new THREE.Vector3(dock.x,dock.y,dock.z))<.10,'the gripping hand meets the end of the 23 cm remote');assert.ok(c.group.getObjectByName('robot-television-remote').getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(dock.x,dock.y,dock.z))<.02,'the held remote replaces the cabinet remote at the same dock');{const model=createLuxuryItem(home.furniture.find(r=>r.id==='tv')),tvPose=getFurniturePose(home,home.furniture.find(r=>r.id==='tv'));model.position.set(tvPose.x,tvPose.y,tvPose.z);model.updateMatrixWorld(true);const robot=c.group.getObjectByName('robot-avatar');for(const name of['HeadShell','TorsoShell']){const part=robot.getObjectByName(name);if(!part)continue;const body=new THREE.Box3().setFromObject(part);let collisions=[];model.traverse(n=>{if(n.isMesh&&n.userData.part!=='remote-control'&&body.intersectsBox(new THREE.Box3().setFromObject(n)))collisions.push({part:n.userData.part,box:new THREE.Box3().setFromObject(n)});});assert.deepEqual(collisions,[],`${name} stays clear of every actual television/cabinet part during pickup`);}model.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});}
 until(c,s=>s.phase==='to-seat');advance(3);{const r=c.group.getObjectByName('robot-avatar'),m=r.getObjectByName('robot-television-remote');r.updateWorldMatrix(true,true);const v=new THREE.Vector3(),inv=r.matrixWorld.clone().invert();let max=0;m.traverse(n=>{if(!n.isMesh)return;const pos=n.geometry.getAttribute('position'),mat=inv.clone().multiply(n.matrixWorld);for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(mat);max=Math.max(max,Math.hypot(v.x,v.z));}});assert.ok(max<c.getState().navigation.radius,'carried remote stays inside the actual walking collision clearance');}until(c,s=>s.phase==='watch'&&!s.scheduled);assert.deepEqual(commands.map(r=>r.patch),[{power:true}]);assert.equal(pose(c).remote,true);assert.equal(c.getState().action,'watch');assert.equal(c.group.getObjectByName('robot-avatar').rotation.y,Math.PI);
 assert.equal(c.changeTelevisionChannel('tv').ok,true);advance(5);assert.ok(commands.some(r=>r.patch.channel===1));assert.equal(c.getState().television.remoteHeld,true);
 c.stand();until(c,s=>s.action==='idle'&&!s.scheduled);assert.equal(pose(c).remote,false);assert.ok(commands.some(r=>r.patch.power===false));assert.deepEqual([...phases].sort(),['pickup','return','rise','sit','to-remote','to-return','to-seat','watch'].sort());assert.equal(presentation.at(-1).remoteHeld,false);
});

for(const phase of ['to-remote','pickup','to-seat','sit','watch','rise','to-return','return'])test(`television ${phase} saves real contact, hand ownership and exact transition on reload`,t=>{
 const home=world(),c=actor(t,home);c.interact('furniture:tv','watch');
 if(['rise','to-return','return'].includes(phase)){until(c,s=>s.phase==='watch'&&!s.scheduled);c.stand();}
 until(c,s=>s.phase===phase&&(phase==='watch'||s.transitionProgress>.2));advance(2);const saved=c.captureActivity({emit:false}),before=pose(c);
 assert.equal(saved.kind,'watch');assert.equal(isRobotActivityShape(saved),true);assert.equal(isRobotActivityTargetValid(record(home),saved),true);assert.deepEqual(normalizeRobotActivity(normalizeRobotActivity(saved)),saved);
 const commands=[],fresh=actor(t,home,{onObjectAction:e=>commands.push(e)});fresh.setAvatar({activity:saved,equipped:{}});compare(before,pose(fresh));assert.equal(commands.length,0,'restoration does not itself send TV state commands');
 if(['rise','to-return','return'].includes(phase))until(fresh,s=>s.action==='idle'&&!s.scheduled);else until(fresh,s=>s.phase==='watch'&&!s.scheduled);
});

test('the watch choice explains absent, backwards or blocked seating and never places a robot through the television',t=>{
 for(const [options,reason,message] of[[{seat:false},'missing-seat',/DisplayText5048.*DisplayText5049/],[{rotation:0},'seat-facing',/DisplayText5049.*DisplayText5050/],[{wall:true},'view-blocked',/DisplayText5051.*DisplayText5052/]]){const home=world(options),c=actor(t,home),before=c.getState().point,result=c.interact('furniture:tv','watch');assert.equal(result.ok,false);assert.match(result.error,message);const plan=planRobotTelevision(home,'tv',{navigation:c.getState().navigation});assert.equal(plan.reason,reason);assert.deepEqual(c.getState().point,before);}
});

test('sold or removed TV/seat and opposite-facing replacement invalidate watch saves; A/B clearing releases the remote without commanding B',t=>{
 const home=world(),commands=[],presentation=[],c=actor(t,home,{onObjectAction:r=>commands.push(r),onObjectPresentation:r=>presentation.push(r)});c.interact('furniture:tv','watch');until(c,s=>s.phase==='watch'&&!s.scheduled);const saved=c.captureActivity({emit:false});
 for(const id of['tv','seat']){const copy=record(home);copy.commerce.owned.find(r=>r.id===id).status='sold';assert.equal(isRobotActivityTargetValid(copy,saved),false);}
 assert.equal(isRobotActivityTargetValid(record(world({rotation:0})),saved),false);c.clearAccountBinding();const count=commands.length;assert.equal(presentation.at(-1).remoteHeld,false);advance(200);assert.equal(commands.length,count);assert.equal(c.getState().television,null);
 c.setWorld(world({seat:false}));c.setAvatar({activity:saved,equipped:{}});assert.equal(c.getState().action,'idle');assert.equal(pose(c).remote,false);
});

test('leaving during pickup and cancelling while sitting retain a single remote and finish a safe return after restore',t=>{
 const home=world(),c=actor(t,home);c.interact('furniture:tv','watch');until(c,s=>s.phase==='pickup'&&s.transitionProgress>.65);const saved=c.captureActivity({emit:false});c.setVisible(false);assert.equal(c.getState().scheduled,false);c.setVisible(true);assert.deepEqual(c.captureActivity({emit:false}),saved);
 until(c,s=>s.phase==='sit'&&s.transitionProgress>.2);c.stand();const cancelled=c.captureActivity({emit:false});assert.equal(cancelled.exitRequested,true);const fresh=actor(t,home);fresh.setAvatar({activity:cancelled,equipped:{}});until(fresh,s=>s.action==='idle'&&!s.scheduled);assert.equal(pose(fresh).remote,false);
});

for(const kind of['ipRetroTelevision','ipWideTelevision','ipCinemaTelevision'])test(`${kind} keeps its correctly facing seat and semantic watch checkpoint after a rotated room layout`,t=>{
 for(const rotation of[90,180,270]){const base=world({kind}),a=rotation*Math.PI/180,home={...base,furniture:base.furniture.map(item=>({...item,x:item.x*Math.cos(a)+item.z*Math.sin(a),z:-item.x*Math.sin(a)+item.z*Math.cos(a),rotation:(item.rotation+rotation)%360}))};
  const c=actor(t,home);assert.equal(c.interact('furniture:tv','watch').ok,true);until(c,s=>s.phase==='watch'&&!s.scheduled);const saved=c.captureActivity({emit:false});assert.equal(isRobotActivityTargetValid(record(home),saved),true);const fresh=actor(t,home);fresh.setAvatar({activity:saved,equipped:{}});compare(pose(c),pose(fresh));c.setVisible(false);fresh.setVisible(false);
 }
});

test('the real held remote reaches the new aquarium channel after Music and wraps channel twelve to one',t=>{
  const home=world(),requests=[],c=actor(t,home,{onObjectAction:request=>{requests.push(request);return{ok:true};}});
  assert.equal(c.interact('furniture:tv','watch').ok,true);until(c,state=>state.phase==='watch'&&!state.scheduled);
  for(const[from,to]of [[3,4],[11,0]]){
    const commerce=record(home).commerce;commerce.version=6;commerce.objectStates={tv:{power:true,channel:from,volume:1}};c.setObjectContext(commerce);
    assert.equal(c.changeTelevisionChannel('tv').ok,true);until(c,state=>state.phase==='watch'&&!state.scheduled);
    assert.equal(requests.at(-1).patch.channel,to);assert.equal(c.getState().television.remoteHeld,true);assert.equal(c.group.getObjectByName('robot-television-remote').visible,true);
  }
});

const rotateHome=(home,degrees)=>{const a=degrees*Math.PI/180;return{...home,furniture:home.furniture.map(item=>({...item,x:item.x*Math.cos(a)+item.z*Math.sin(a),z:-item.x*Math.sin(a)+item.z*Math.cos(a),rotation:(item.rotation+degrees)%360}))};};
for(const televisionKind of['ipRetroTelevision','ipWideTelevision','ipCinemaTelevision'])test(`${televisionKind} recognizes every shared seated catalogue capability at all four rotations`,()=>{
  for(const seatKind of ROBOT_SEAT_KINDS)for(const rotation of[0,90,180,270]){
    const home=rotateHome(world({kind:televisionKind,seatKind}),rotation),navigation={radius:.65,height:1.6},plan=planRobotTelevision(home,'tv',{navigation});
    assert.equal(isRobotTelevisionSeatKind(seatKind),true);assert.equal(plan.ok,true,`${televisionKind} / ${seatKind} / ${rotation}: ${plan.error}`);assert.equal(plan.seatId,'seat');
    const launchedFromSeat=planRobotSofaTelevision(home,'seat',{navigation});assert.equal(launchedFromSeat.ok,true);assert.equal(launchedFromSeat.seatId,'seat');
  }
  for(const invalid of['compactToilet','bdSmartToilet','bed','kitchenSink','ipWideTelevision'])assert.equal(isRobotTelevisionSeatKind(invalid),false);
});

for(const kind of['ipRetroTelevision','ipWideTelevision','ipCinemaTelevision'])test(`${kind} and the reported curved sofa fetch, sit, face the screen and restore using the real v4 robot in every orientation`,t=>{
  for(const rotation of[0,90,180,270]){
    const home=rotateHome(world({kind,seatKind:'lcCurvedSofa'}),rotation),before=JSON.stringify(home),commands=[],c=actor(t,home,{onObjectAction:request=>{commands.push(request);return{ok:true};}});
    const choice=c.interactions('furniture:tv').find(row=>row.id==='watch');assert.ok(choice);assert.notEqual(choice.disabled,true,`${kind}/${rotation}: ${choice.reason}`);
    assert.equal(c.interact('furniture:tv','watch').ok,true);until(c,state=>state.phase==='watch'&&!state.scheduled);
    const saved=c.captureActivity({emit:false});assert.equal(saved.kind,'watch');assert.equal(saved.seatId,'seat');assert.equal(isRobotActivityShape(saved),true);assert.equal(isRobotActivityTargetValid(record(home),saved),true,'the same seat is accepted by authoritative save validation');
    const sofa=home.furniture.find(row=>row.id==='seat'),tv=home.furniture.find(row=>row.id==='tv'),robot=c.group.getObjectByName('robot-avatar'),forward=new THREE.Vector3(0,0,1).applyQuaternion(robot.quaternion),toScreen=new THREE.Vector3(tv.x-sofa.x,0,tv.z-sofa.z).normalize();
    assert.ok(forward.dot(toScreen)>.99,'settled robot faces the screen, never the sofa back');assert.deepEqual(commands.map(request=>request.patch),[{power:true}]);assert.equal(pose(c).remote,true);
    const restoreCommands=[],fresh=actor(t,home,{onObjectAction:request=>restoreCommands.push(request)});fresh.setAvatar({activity:saved,equipped:{}});compare(pose(c),pose(fresh));assert.deepEqual(restoreCommands,[],'restoring a seated viewer does not switch/re-command the television');assert.equal(JSON.stringify(home),before,'planning, movement and restore never move furniture or alter the owned layout');c.setVisible(false);fresh.setVisible(false);
  }
});

test('a selected seat preserves the exact actionable TV failure instead of asking for another sofa',()=>{
  const navigation={radius:.65,height:1.6};
  for(const [home,reason,message]of[[world({rotation:0}),'seat-facing',/DisplayText5050/],[world({wall:true}),'remote-access',/DisplayText3986.*DisplayText4634/]]){
    const direct=planRobotTelevision(home,'tv',{navigation,seatId:'seat'}),fromSeat=planRobotSofaTelevision(home,'seat',{navigation});assert.equal(direct.reason,reason);assert.deepEqual(fromSeat,direct);assert.match(fromSeat.error,message);
  }
});
