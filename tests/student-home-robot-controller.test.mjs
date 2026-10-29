import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {createHomeState,applyChange,getHomeCandidateVolume,getFurniturePose} from '../public/js/home-engine.js';
import {isAvatarPositionWalkable} from '../public/js/home-avatar-navigation.js';
import {getHomeBuildingVolumes} from '../public/js/home-building-collision.js';
import {createLuxuryItem} from '../public/js/home-luxury-models.js';

let source,oldDocument,oldRaf,oldCancel,frames,sequence=0;
before(async()=>{
  const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  oldDocument=globalThis.document;oldRaf=globalThis.requestAnimationFrame;oldCancel=globalThis.cancelAnimationFrame;
  globalThis.document=new EventTarget();document.hidden=false;frames=new Map();
  globalThis.requestAnimationFrame=callback=>{frames.set(++sequence,callback);return sequence;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
});
after(()=>{globalThis.document=oldDocument;globalThis.requestAnimationFrame=oldRaf;globalThis.cancelAnimationFrame=oldCancel;});
function actor(t,options={}){const controller=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},...options});t.after(()=>controller.dispose());return controller;}
function advance(count=80){for(let n=0;n<count&&frames.size;n++){const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(performance.now()+50);}}

test('the actual robot walks with its measured backpack/arm envelope and keeps palette edits on the same model',t=>{
  const controller=actor(t),home=createHomeState({profile:'account'});controller.setWorld(home);controller.setAvatar({colors:{shell:'#acd2cc',accent:'#e5b26a'}});
  const state=controller.getState();assert.ok(state.navigation.radius>.44&&state.navigation.radius<.5);assert.ok(state.navigation.height>1.5);
  assert.equal(isAvatarPositionWalkable(home,state.point,state.navigation),true);
  const robot=controller.group.getObjectByName('robot-avatar');assert.ok(robot.getObjectByName('RobotRoot'));
  assert.equal(controller.walk({x:0,z:.8}).ok,true);advance();assert.equal(controller.getState().action,'idle');
  assert.ok(Math.abs(controller.getState().point.z-.8)<1e-6);
  controller.setAvatar({colors:{shell:'#bbccdd',accent:'#ffcc66'}});assert.equal(controller.group.getObjectByName('robot-avatar'),robot);
});

test('robot rejects an occupied destination and relocates to real free space after furnishing changes',t=>{
  const controller=actor(t),home=createHomeState({profile:'account'});controller.setWorld(home);
  const next=applyChange(home,{type:'furniture',id:'bed-1',kind:'bed',x:0,z:0,rotation:0});assert.equal(next.ok,true,next.error);
  controller.setWorld(next.state);assert.equal(controller.walk({x:0,z:0}).ok,false);
  const state=controller.getState();assert.equal(isAvatarPositionWalkable(next.state,state.point,state.navigation),true);
  assert.equal(controller.walk({x:100,z:100}).ok,false);assert.equal(state.scheduled,false);
});

test('switching floors keeps independent positions and hiding/disposal cancels animations',t=>{
  const controller=actor(t),ground=createHomeState({profile:'account'}),upper=createHomeState({profile:'upper',slab:ground.slab});
  controller.setWorld(ground,0);assert.equal(controller.walk({x:0,z:.8}).ok,true);advance();const lowerPoint=controller.getState().point;
  controller.setWorld(upper,1);controller.setWorld(ground,0);assert.deepEqual(controller.getState().point,lowerPoint);
  assert.equal(controller.wave(),true);assert.equal(controller.getState().scheduled,true);controller.setVisible(false);assert.equal(controller.getState().scheduled,false);
  controller.setVisible(true);controller.wave();controller.dispose();assert.equal(controller.getState().scheduled,false);assert.equal(controller.group.parent,null);
});

function furnished(kind,rotation=0){const result=applyChange(createHomeState({profile:'account'}),{type:'furniture',id:'use-me',kind,x:0,z:0,rotation});assert.equal(result.ok,true,result.error);return result.state;}
function runUntil(controller,action,limit=400){for(let n=0;n<limit;n++){advance(1);if(controller.getState().action===action&&(action==='stairs'||!controller.getState().inTransition))return;}assert.fail(`Expected ${action}, saw ${JSON.stringify(controller.getState())}`);}
function meshWorldBounds(robot,name){robot.updateMatrixWorld(true);return new THREE.Box3().setFromObject(robot.getObjectByName(name));}

test('actual robot seat contact follows a rotated sofa, lower legs stay in front and stand restores a walkable point',t=>{
  const c=actor(t),robot=c.group.getObjectByName('robot-avatar');
  for(const rotation of[0,90,180,270]){
    const home=furnished('sofa',rotation);c.setWorld(home);
    const descriptor=c.interactions('furniture:use-me').find(row=>row.id==='sit');assert.ok(descriptor,`sofa ${rotation} has an accessible seat`);
    assert.equal(c.interact('furniture:use-me','sit').ok,true);runUntil(c,'sit');
    assert.equal(c.getState().scheduled,false,'a resting pose does not render forever');
    const inverse=new THREE.Matrix4().makeRotationY(-rotation*Math.PI/180);
    const robotSeat=meshWorldBounds(robot,'ThighShellL');assert.ok(robotSeat.min.y>=descriptor.pose.y-.001,'the real supporting thighs never sink below the seat');
    const shin=meshWorldBounds(robot,'ShinShellL');for(const x of[shin.min.x,shin.max.x])for(const z of[shin.min.z,shin.max.z]){const p=new THREE.Vector3(x,0,z).applyMatrix4(inverse);assert.ok(p.z>.42,'shins clear the sofa apron');}
    c.stand();runUntil(c,'idle');assert.equal(c.getState().point.y,.08);assert.ok(isAvatarPositionWalkable(home,c.getState().point,c.getState().navigation));
  }
});

test('bed and four toilet models have real contact poses; cancellation never leaves a standing robot inside furniture',t=>{
  const c=actor(t);
  for(const[kind,id,action]of[['bedTimber','lie','lie'],['compactToilet','toilet','sit'],['bdSplitToilet','toilet','sit'],['bdMonoblocToilet','toilet','sit'],['bdSmartToilet','toilet','sit']]){
    const home=furnished(kind);c.setWorld(home);const choices=c.interactions('furniture:use-me');assert.ok(choices.some(row=>row.id===id),kind);
    assert.equal(c.interact('furniture:use-me',id).ok,true);runUntil(c,action);assert.ok(c.getState().point.y>.5,'contact is on furniture, not floor');
    c.setVisible(false);assert.equal(c.getState().scheduled,false);assert.ok(isAvatarPositionWalkable(home,c.getState().point,c.getState().navigation));c.setVisible(true);
  }
});

test('reading, cooking and washing animate the real arms with visible props, then stop their frame loop',t=>{
  const c=actor(t),robot=c.group.getObjectByName('robot-avatar');
  for(const[kind,id,prop]of[['bookcase','read','robot-open-book'],['rangeCooker','cook','robot-cooking-bowl'],['kitchenSink','wash','robot-washing-water']]){
    c.setWorld(furnished(kind));assert.equal(c.interact('furniture:use-me',id).ok,true);runUntil(c,id);assert.equal(robot.getObjectByName(prop).visible,true);
    const first=meshWorldBounds(robot,'WristR').getCenter(new THREE.Vector3());advance(8);const next=meshWorldBounds(robot,'WristR').getCenter(new THREE.Vector3());
    if(id!=='read')assert.ok(first.distanceTo(next)>.005,`${id} moves the arm, not only a floating prop`);
    assert.ok(robot.getObjectByName(prop).children.length>0);advance(140);assert.equal(c.getState().action,'idle');assert.equal(c.getState().scheduled,false);assert.equal(robot.getObjectByName(prop).visible,false);
  }
});

test('clothing changes update the walk clearance and retain appearance through furniture poses',t=>{
  const c=actor(t);c.setWorld(createHomeState({profile:'account'}));const original=c.getState().navigation;
  c.setAvatar({equipped:{headwear:'wear-chef-toque',outfit:'wear-little-chef',footwear:'wear-puddle-boots'}});
  assert.ok(c.getState().navigation.height>original.height);assert.ok(c.getState().navigation.radius>=original.radius);
  assert.equal(c.group.getObjectByName('RobotRoot')!==null,true);
});

function stairFloors(rotation=0){
  const slab={rects:[{minX:-5,minZ:-5,width:10,depth:10}]},stairs={id:'main-stairs',x:0,z:0,rotation};
  const lower=createHomeState({profile:'upper',slab}),upper=createHomeState({profile:'upper',slab});
  lower.stairs={...stairs,direction:'up'};upper.stairs={...stairs,direction:'down'};return[lower,upper];
}
test('stairs walk to the entry, visibly gain height step by step, then change floor at the matching exit',t=>{
  const floors=stairFloors(90),changes=[],statuses=[];
  let c;c=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},onStatus:event=>statuses.push(event),onStoreyChange:event=>{changes.push(event);c.setWorld(floors[event.index],event.index,{floors,arrivalPoint:event.point});}});t.after(()=>c.dispose());
  c.setWorld(floors[0],0,{floors});assert.equal(c.useStairs('main-stairs').ok,true);assert.equal(changes.length,0);runUntil(c,'stairs');
  const heights=[];for(let n=0;n<1800&&c.getState().floor===0;n++){advance(1);if(c.getState().action==='stairs')heights.push(c.getState().point.y);}
  assert.ok(heights.some(y=>y>.5&&y<2.5),'real intermediate heights are visible before any floor callback');assert.ok(new Set(heights.map(y=>y.toFixed(2))).size>30);
  assert.equal(changes.length,1);assert.equal(statuses.at(-1).message,"DisplayText39792DisplayText0931, DisplayText0224.");assert.equal(statuses.at(-1).error,false);assert.equal(c.getState().floor,1);assert.equal(c.getState().point.y,.08);assert.ok(isAvatarPositionWalkable(floors[1],c.getState().point,c.getState().navigation));assert.equal(c.getState().scheduled,false);
  assert.equal(c.useStairs('main-stairs').ok,true);runUntil(c,'stairs');runUntil(c,'idle',1800);assert.equal(c.getState().floor,0);assert.equal(changes.length,2);assert.equal(statuses.at(-1).message,"DisplayText39791DisplayText0931, DisplayText0224.");assert.ok(changes[0].point.x<0&&changes[1].point.x>0,'rotated staircase exits match both floors');
});

test('blocked stair exits reject before walking and hiding mid-flight cancels without switching floors',t=>{
  const floors=stairFloors(),events=[],c=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},onStoreyChange:e=>events.push(e)});t.after(()=>c.dispose());
  c.setWorld(floors[0],0,{floors});assert.equal(c.useStairs('main-stairs').ok,true);runUntil(c,'stairs');for(let n=0;n<1000&&!(c.getState().stairStep?.treadIndex>=1);n++)advance(1);assert.ok(c.getState().stairStep?.treadIndex>=1);assert.ok(c.getState().point.y>.08);c.setVisible(false);advance(100);assert.equal(events.length,0);assert.equal(c.getState().point.y,.08);assert.ok(isAvatarPositionWalkable(floors[0],c.getState().point,c.getState().navigation));
  c.setVisible(true);assert.equal(c.getState().action,'stairs');c.stand();const result=applyChange(floors[1],{type:'furniture',id:'exit-blocker',kind:'cabinet',x:0,z:-2.2,rotation:0});assert.equal(result.ok,true,result.error);c.setWorld(floors[0],0,{floors:[floors[0],result.state]});assert.equal(c.useStairs('main-stairs').ok,false);assert.equal(c.getState().scheduled,false);
});

test('a blocked sofa front and a physically short toy bed do not offer clipping poses',t=>{
  const c=actor(t),base=furnished('sofa');
  const blocked=applyChange(base,{type:'furniture',id:'front-cabinet',kind:'cabinet',x:0,z:1.15,rotation:0});assert.equal(blocked.ok,true,blocked.error);c.setWorld(blocked.state);
  assert.equal(c.interactions('furniture:use-me').some(row=>row.kind==='sit'),false,'walking around to the back must not allow sitting through the backrest');
  assert.equal(c.interact('furniture:use-me','sit').ok,false);assert.equal(c.getState().scheduled,false);
  c.setWorld(furnished('bed'));assert.equal(c.interactions('furniture:use-me').some(row=>row.kind==='lie'),false,'1.46 m lying robot cannot fit a 1.15 m toy mattress');
  c.setWorld(furnished('bedTimber',90));assert.equal(c.interactions('furniture:use-me').some(row=>row.kind==='lie'),true,'an appropriately sized rotated mattress remains usable');
});


test('an unhandled floor switch restores the safe stair entry and replaces the moving status with an error',t=>{
  const floors=stairFloors(),statuses=[],c=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){},onStatus:event=>statuses.push(event),onStoreyChange(){}});t.after(()=>c.dispose());
  c.setWorld(floors[0],0,{floors});assert.equal(c.useStairs('main-stairs').ok,true);runUntil(c,'stairs');runUntil(c,'idle',1800);
  assert.equal(c.getState().floor,0);assert.equal(c.getState().action,'idle');assert.equal(c.getState().scheduled,false);
  assert.equal(c.getState().point.y,.08);assert.ok(isAvatarPositionWalkable(floors[0],c.getState().point,c.getState().navigation));
  assert.equal(statuses.at(-1).error,true);assert.match(statuses.at(-1).message,/DisplayText3977.*DisplayText4598/);
});

const TRACKED_JOINTS=['robot-runtime-pose','HipRoot','Torso','Head','HipL','HipR','KneeL','KneeR','ShoulderL','ShoulderR'];
const TRACKED_POINTS=['Head','HipRoot','KneeL','KneeR','AnkleL','AnkleR'];
function motionSample(controller){
  const robot=controller.group.getObjectByName('robot-avatar');robot.updateWorldMatrix(true,true);
  return {...controller.getState(),root:robot.position.clone(),rotation:robot.quaternion.clone(),
    joints:Object.fromEntries(TRACKED_JOINTS.map(name=>[name,robot.getObjectByName(name).quaternion.clone()])),
    landmarks:Object.fromEntries(TRACKED_POINTS.map(name=>[name,robot.getObjectByName(name).getWorldPosition(new THREE.Vector3())])),
    feet:['FootShellL','FootShellR'].map(name=>meshWorldBounds(robot,name).min.y),
    footBounds:['FootShellL','FootShellR'].map(name=>meshWorldBounds(robot,name))};
}
function collectUntil(controller,action,{limit=650,check}={}){
  const samples=[motionSample(controller)];
  for(let n=0;n<limit;n++){
    advance(1);samples.push(motionSample(controller));check?.(samples.at(-1));const state=controller.getState();
    if(state.action===action&&!state.inTransition&&!state.scheduled)return samples;
  }
  assert.fail(`Expected resting ${action}, saw ${JSON.stringify(controller.getState())}`);
}
function phaseSequence(samples){return samples.map(sample=>sample.phase).filter((phase,index,phases)=>phase&&phase!==phases[index-1]);}
function hasOrderedPhases(samples,expected){
  const phases=phaseSequence(samples);let next=0;
  for(const phase of phases)if(phase===expected[next])next++;
  assert.equal(next,expected.length,`Expected ordered ${expected.join(' → ')}, saw ${phases.join(' → ')}`);
}
function assertContinuous(samples,label){
  let checked=0;
  for(let index=1;index<samples.length;index++){
    const a=samples[index-1],b=samples[index];if(!a.inTransition&&!b.inTransition)continue;checked++;
    assert.ok(a.root.distanceTo(b.root)<.22,`${label}: root jumped ${a.root.distanceTo(b.root).toFixed(3)} m at ${a.phase} → ${b.phase}`);
    assert.ok(a.rotation.angleTo(b.rotation)<.7,`${label}: heading snapped at ${a.phase} → ${b.phase}`);
    for(const name of TRACKED_JOINTS)assert.ok(a.joints[name].angleTo(b.joints[name])<.7,`${label}: ${name} snapped ${a.joints[name].angleTo(b.joints[name]).toFixed(3)} rad at ${a.phase} → ${b.phase}`);
    for(const name of TRACKED_POINTS)assert.ok(a.landmarks[name].distanceTo(b.landmarks[name])<.28,`${label}: ${name} teleported ${a.landmarks[name].distanceTo(b.landmarks[name]).toFixed(3)} m at ${a.phase} → ${b.phase}`);
    for(let foot=0;foot<2;foot++)for(const corner of['min','max'])assert.ok(a.footBounds[foot][corner].distanceTo(b.footBounds[foot][corner])<.3,`${label}: foot ${foot} ${corner} envelope jumped at ${a.phase} → ${b.phase}`);
    assert.ok(b.feet.every(y=>y>=.06),`${label}: feet penetrate the floor at ${b.phase}: ${b.feet}`);
    if(b.inTransition)assert.ok(Number.isFinite(b.transitionProgress)&&b.transitionProgress>=0&&b.transitionProgress<=1,`${label}: phase progress must be bounded`);
  }
  assert.ok(checked>=12,`${label}: needs visibly intermediate frames, saw ${checked}`);
}
function assertNoImmediateJump(before,after,label){
  assert.ok(before.root.distanceTo(after.root)<1e-6,`${label}: command itself must not teleport the root`);
  for(const name of TRACKED_JOINTS)assert.ok(before.joints[name].angleTo(after.joints[name])<1e-6,`${label}: command itself must not snap ${name}`);
}

test('sofa and toilet entry bend the real rig over time instead of sliding a completed seated pose',t=>{
  const c=actor(t);
  for(const[kind,id,rotation]of[['sofa','sit',0],['sofa','sit',90],['bdSmartToilet','toilet',90]]){
    const home=furnished(kind,rotation);c.setWorld(home);assert.equal(c.interact('furniture:use-me',id).ok,true);
    const samples=collectUntil(c,'sit',{check:obstacleCheck(c,home)}),first=samples.find(sample=>sample.inTransition),last=samples.at(-1);
    hasOrderedPhases(samples,['align','turn','sit-down','seated']);assertContinuous(samples,`${kind} ${rotation} entry`);
    assert.ok(first.joints.HipL.angleTo(last.joints.HipL)>.5,'initial approach must not already use the final 90 degree seated hips');
    const knees=samples.filter(sample=>sample.phase==='sit-down').map(sample=>sample.joints.KneeL.toArray().map(value=>value.toFixed(3)).join(','));
    assert.ok(new Set(knees).size>=6,'actual knee geometry must show a succession of visible bends');
    const before=motionSample(c);c.stand();assertNoImmediateJump(before,motionSample(c),'stand from seat');
    const leaving=collectUntil(c,'idle');hasOrderedPhases(leaving,['stand-up','step-away','idle']);assertContinuous(leaving,`${kind} exit`);
    const end=c.getState();assert.equal(end.scheduled,false);assert.ok(isAvatarPositionWalkable(furnished(kind,rotation),end.point,end.navigation));
  }
});

test('bed entry and exit expose seated edge, leg lift, body turn and lying stages at both 0 and 90 degrees',t=>{
  const c=actor(t);
  for(const rotation of[0,90]){
    const home=furnished('bedTimber',rotation);c.setWorld(home);const surface=c.interactions('furniture:use-me').find(row=>row.kind==='lie').pose.y;assert.equal(c.interact('furniture:use-me','lie').ok,true);
    const entering=collectUntil(c,'lie',{check:obstacleCheck(c,home)});hasOrderedPhases(entering,['align','turn','sit-down','bed-edge','leg-lift','bed-turn','lie-down','lying']);assertContinuous(entering,`bed ${rotation} entry`);
    const first=entering.find(sample=>sample.inTransition),lying=entering.at(-1);
    assert.ok(first.joints['robot-runtime-pose'].angleTo(lying.joints['robot-runtime-pose'])>1,'robot must remain upright until the lie-down phase');
    const seated=entering.filter(sample=>sample.phase==='bed-edge');assert.ok(seated.length>=2,'bed edge must be visible, not an instantaneous state label');
    assert.ok(seated.every(sample=>sample.joints.HipL.angleTo(lying.joints.HipL)>.8),'bed edge uses genuinely bent seated legs');
    const lift=entering.filter(sample=>sample.phase==='leg-lift');assert.ok(lift.length>=6);assert.ok(lift[0].joints.KneeL.angleTo(lift.at(-1).joints.KneeL)>.2,'lifting legs changes the actual knee joint');
    const turning=entering.filter(sample=>sample.phase==='bed-turn'&&sample.transitionProgress>.05);assert.ok(turning.length>=6);
    assert.ok(turning.every(sample=>sample.footBounds.every(box=>box.min.y>=surface-.012)),'both physical feet must clear the mattress before swivelling across its edge');
    const before=motionSample(c);c.stand();assertNoImmediateJump(before,motionSample(c),'stand from bed');
    const leaving=collectUntil(c,'idle',{check:obstacleCheck(c,home)});hasOrderedPhases(leaving,['lie-rise','bed-turn-out','legs-down','stand-up','step-away','idle']);assertContinuous(leaving,`bed ${rotation} exit`);
    assert.ok(isAvatarPositionWalkable(home,c.getState().point,c.getState().navigation));assert.equal(c.getState().scheduled,false);
  }
});

test('requesting a walk while resting first completes visible exit and only then travels to the clicked destination',t=>{
  const c=actor(t),home=furnished('bedTimber',90);c.setWorld(home);assert.equal(c.interact('furniture:use-me','lie').ok,true);collectUntil(c,'lie');
  const before=motionSample(c),destination={x:1.9,z:1.8};assert.ok(isAvatarPositionWalkable(home,destination,c.getState().navigation));assert.equal(c.walk(destination).ok,true);
  assertNoImmediateJump(before,motionSample(c),'walk request while lying');const leaving=collectUntil(c,'idle');assertContinuous(leaving,'leave bed to walk');
  hasOrderedPhases(leaving,['lie-rise','legs-down','stand-up','step-away']);
  const firstWalking=leaving.findIndex(sample=>sample.action==='walk'&&!sample.inTransition),lastExit=leaving.map(sample=>sample.phase).lastIndexOf('step-away');
  assert.ok(firstWalking>lastExit,'navigation starts after leaving the furniture');
  assert.ok(Math.hypot(c.getState().point.x-destination.x,c.getState().point.z-destination.z)<1e-6);
});

test('hiding or switching the student home during entry or exit immediately cancels motion at a safe floor point',t=>{
  const c=actor(t),bed=furnished('bedTimber',90),empty=createHomeState({profile:'account'});
  for(const stage of['sit-down','leg-lift','lie-rise']){
    c.setVisible(true);c.setWorld(bed);assert.equal(c.interact('furniture:use-me','lie').ok,true);
    if(stage==='lie-rise'){collectUntil(c,'lie');c.stand();}
    for(let n=0;n<650&&c.getState().phase!==stage;n++)advance(1);
    assert.equal(c.getState().phase,stage);advance(3);c.setVisible(false);
    const stopped=c.getState();assert.equal(stopped.inTransition,false);assert.equal(stopped.scheduled,false);assert.equal(stopped.action,'idle');assert.equal(stopped.point.y,.08);
    assert.ok(isAvatarPositionWalkable(bed,stopped.point,stopped.navigation));advance(100);assert.deepEqual(c.getState().point,stopped.point);
    c.setVisible(true);assert.equal(c.interact('furniture:use-me','lie').ok,true);
    for(let n=0;n<650&&c.getState().phase!=='leg-lift';n++)advance(1);
    assert.equal(c.getState().phase,'leg-lift');c.setWorld(empty,0,{floors:[empty]});
    assert.equal(c.getState().scheduled,false);assert.equal(c.getState().inTransition,false);assert.equal(c.getState().action,'idle');assert.ok(isAvatarPositionWalkable(empty,c.getState().point,c.getState().navigation));advance(100);assert.equal(c.getState().phase,'idle');
  }
});

test('backgrounding a seated transition pauses safely and restores the saved entrance when returning',t=>{
  t.after(()=>{document.hidden=false;});
  const c=actor(t),home=furnished('sofa');c.setWorld(home);assert.equal(c.interact('furniture:use-me','sit').ok,true);
  for(let n=0;n<650&&c.getState().phase!=='sit-down';n++)advance(1);assert.equal(c.getState().phase,'sit-down');
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(c.getState().scheduled,false);assert.equal(c.getState().inTransition,false);assert.equal(c.getState().action,'idle');assert.ok(isAvatarPositionWalkable(home,c.getState().point,c.getState().navigation));
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(c.getState().phase,'sit-down');advance(100);assert.equal(c.getState().scheduled,false);assert.equal(c.getState().action,'sit');
});

test('user cancellation in the middle of sitting or climbing onto bed exits continuously rather than snapping to the safe point',t=>{
  const c=actor(t);
  for(const stopAt of['sit-down','leg-lift','bed-turn','lie-down']){
    const home=furnished('bedTimber',90);c.setWorld(home);assert.equal(c.interact('furniture:use-me','lie').ok,true);
    for(let n=0;n<650&&c.getState().phase!==stopAt;n++)advance(1);assert.equal(c.getState().phase,stopAt);advance(3);
    const before=motionSample(c);c.stand();assertNoImmediateJump(before,motionSample(c),`cancel ${stopAt}`);
    const samples=collectUntil(c,'idle');assertContinuous(samples,`cancel ${stopAt}`);
    assert.ok(isAvatarPositionWalkable(home,c.getState().point,c.getState().navigation));assert.equal(c.getState().scheduled,false);
  }
});

function withSideCabinet(home,x,id){const result=applyChange(home,{type:'furniture',id,kind:'cabinet',x,z:0,rotation:90});assert.equal(result.ok,true,result.error);return result.state;}
function boxesOverlap(a,b){return a.min.x<b.maxX-.012&&a.max.x>b.minX+.012&&a.min.y<b.maxY-.012&&a.max.y>b.minY+.012&&a.min.z<b.maxZ-.012&&a.max.z>b.minZ+.012;}
function obstacleCheck(controller,home){
  const obstacles=[...getHomeBuildingVolumes(home),...home.furniture.filter(item=>item.id!=='use-me').map(item=>getHomeCandidateVolume(home,{id:`furniture:${item.id}`,item}))];
  // The mattress/seat is intended contact; the actual headboard and toilet lid
  // remain solid throughout entry and exit, not merely in the final pose.
  const target=home.furniture.find(item=>item.id==='use-me');
  if(target&&['bedTimber','bdSmartToilet'].includes(target.kind)){
    const model=createLuxuryItem(target),pose=getFurniturePose(home,target),matrix=new THREE.Matrix4().makeRotationY((pose.rotation??0)*Math.PI/180);matrix.setPosition(pose.x,pose.y,pose.z);model.updateMatrixWorld(true);
    model.traverse(mesh=>{if(!mesh.isMesh)return;const local=new THREE.Box3().setFromObject(mesh);
      if(target.kind==='bedTimber'?local.min.z<-.84&&local.max.y>.8:mesh.userData.part==='toilet-open-lid'){
        const b=local.applyMatrix4(matrix);obstacles.push({id:`target-solid:${mesh.userData.part??mesh.name}`,minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z});
      }
    });
    const geometries=new Set(),materials=new Set();model.traverse(mesh=>{if(mesh.geometry)geometries.add(mesh.geometry);for(const material of[].concat(mesh.material??[]))materials.add(material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
  const robot=controller.group.getObjectByName('robot-avatar');
  return state=>{if(!state.inTransition)return;robot.updateWorldMatrix(true,true);robot.traverseVisible(mesh=>{
    if(!mesh.isMesh||mesh.userData.robotActionProp)return;const box=new THREE.Box3().setFromObject(mesh);
    for(const obstacle of obstacles)assert.equal(boxesOverlap(box,obstacle),false,`${state.phase}: ${mesh.name} intersects ${obstacle.id}`);
  });};
}
test('a blocked bed side selects the open side, all blocked sides disable lying, and intermediate poses avoid nearby furniture and walls',t=>{
  const c=actor(t),base=furnished('bedTimber'),blockedLeft=withSideCabinet(base,-1.2,'left-blocker');
  c.setWorld(blockedLeft);const descriptor=c.interactions('furniture:use-me').find(row=>row.kind==='lie');assert.ok(descriptor,'right side remains usable');
  assert.ok(descriptor.approach.x>.5,'enter from the clear right side, not the bed head or foot');
  assert.equal(c.interact('furniture:use-me','lie').ok,true);const entering=collectUntil(c,'lie',{check:obstacleCheck(c,blockedLeft)});assertContinuous(entering,'one clear bedside entry');
  c.stand();collectUntil(c,'idle',{check:obstacleCheck(c,blockedLeft)});
  const blockedBoth=withSideCabinet(blockedLeft,1.2,'right-blocker');c.setWorld(blockedBoth);
  assert.equal(c.interactions('furniture:use-me').some(row=>row.kind==='lie'),false,'no route through the headboard or footboard when both bed sides are blocked');
  assert.equal(c.interact('furniture:use-me','lie').ok,false);assert.equal(c.getState().scheduled,false);
});

test('a completed sleep announces once, and hide, backgrounding, account switching and fresh loading restore only that account bed',t=>{
  const events=[],c=actor(t,{onActivityChange:value=>events.push(value)}),home=furnished('bedTimber');
  const activity={kind:'sleep',itemId:'use-me',storey:0};
  c.setWorld(home);c.setAvatar({activity:null,equipped:{}});
  assert.equal(c.interact('furniture:use-me','lie').ok,true);
  for(let n=0;n<300&&c.getState().action!=='entering';n++)advance(1);
  assert.equal(c.getState().action,'entering');assert.equal(events.some(value=>value?.kind==='sleep'),false,'entrance checkpoints must not claim completed sleep');
  runUntil(c,'lie');assert.equal(events.filter(value=>value?.kind==='sleep').length,1);assert.deepEqual(events.at(-1),activity);const settledEventCount=events.length;
  const resting=c.getState();c.setAvatar({activity,equipped:{}});
  assert.equal(c.getState().action,'lie');assert.deepEqual(c.getState().point,resting.point);assert.equal(c.getState().scheduled,false);
  c.setVisible(false);assert.equal(c.getState().action,'idle');assert.equal(c.getState().scheduled,false);
  c.setVisible(true);assert.equal(c.getState().action,'lie');assert.deepEqual(c.getState().point,resting.point);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(c.getState().action,'idle');
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(c.getState().action,'lie');
  assert.equal(events.length,settledEventCount,'visibility changes do not persist a fake wake-up or duplicate sleep');
  // Deliberately reuse the test bed id: identity clearing cannot rely on UUID luck.
  c.setWorld(furnished('bedTimber'));c.setAvatar({activity:null});assert.equal(c.getState().action,'idle');
  c.setWorld(home);c.setAvatar({activity});assert.equal(c.getState().action,'lie');assert.equal(events.filter(value=>value?.kind==='sleep').length,1);
  const fresh=actor(t,{onActivityChange:value=>events.push(value)});fresh.setWorld(home);fresh.setAvatar({activity,equipped:{}});
  assert.equal(fresh.getState().action,'lie');assert.deepEqual(fresh.getState().point,resting.point);
  assert.equal(fresh.getState().scheduled,false);assert.equal(events.filter(value=>value?.kind==='sleep').length,1,'a reload restores final contact without replaying or saving sleep twice');
});

test('restored sleep follows the current moved and rotated bed, and its reverse exit stays continuous through acknowledgement',t=>{
  const events=[],c=actor(t,{onActivityChange:value=>events.push(value)}),activity={kind:'sleep',itemId:'use-me',storey:0};
  const initial=furnished('bedTimber');c.setWorld(initial);c.setAvatar({activity,equipped:{}});const original=c.getState().point;
  const moved=applyChange(createHomeState({profile:'account'}),{type:'furniture',id:'use-me',kind:'bedTimber',x:.4,z:.2,rotation:90});assert.equal(moved.ok,true,moved.error);
  c.setWorld(moved.state);const descriptor=c.interactions('furniture:use-me').find(row=>row.kind==='lie');assert.ok(descriptor);
  c.setAvatar({activity,equipped:{}});const restored=c.getState();
  assert.equal(restored.action,'lie');assert.ok(Math.hypot(restored.point.x-original.x,restored.point.z-original.z)>.25);
  for(const key of['x','y','z'])assert.ok(Math.abs(restored.point[key]-descriptor.pose[key])<1e-6,`fresh ${key} contact`);
  assert.ok(Math.abs(c.group.getObjectByName('robot-avatar').rotation.y-Math.PI/2)<1e-6);
  const before=motionSample(c);c.stand();assertNoImmediateJump(before,motionSample(c),'restored bed exit');
  assert.equal(events.at(-1)?.phase,'exit');const departure=events.at(-1);advance(3);const phase=c.getState().phase;
  c.setAvatar({activity:departure,equipped:{}});assert.equal(c.getState().phase,phase,'save acknowledgement must not interrupt getting out of bed');
  const exit=collectUntil(c,'idle');assertContinuous(exit,'restored bed exit');
  assert.ok(isAvatarPositionWalkable(moved.state,c.getState().point,c.getState().navigation));assert.equal(events.at(-1)?.kind,'stand');
});

test('an invalid sleep target or mismatched floor fails safely without claiming another sleep',t=>{
  const events=[],c=actor(t,{onActivityChange:value=>events.push(value)}),home=furnished('bedTimber');
  c.setWorld(home);c.setAvatar({activity:{kind:'sleep',itemId:'missing-bed',storey:0},equipped:{}});
  assert.equal(c.getState().action,'idle');assert.ok(isAvatarPositionWalkable(home,c.getState().point,c.getState().navigation));
  c.setAvatar({activity:{kind:'sleep',itemId:'use-me',storey:1}});assert.equal(c.getState().action,'idle');
  c.setWorld(furnished('sofa'));c.setAvatar({activity:{kind:'sleep',itemId:'use-me',storey:0}});assert.equal(c.getState().action,'idle');
  assert.equal(c.getState().scheduled,false);assert.ok(events.every(value=>value?.kind==='stand'));
});

test('rejected commands keep sleep, while a valid walk saves the reverse exit and final floor point',t=>{
  const events=[],c=actor(t,{onActivityChange:value=>events.push(value)}),activity={kind:'sleep',itemId:'use-me',storey:0};
  c.setWorld(furnished('bedTimber'));c.setAvatar({activity,equipped:{}});
  assert.equal(c.walk({x:100,z:100}).ok,false);assert.equal(c.interact('furniture:missing','lie').ok,false);
  assert.equal(c.getState().action,'lie');assert.deepEqual(events,[]);
  const destination=c.getState().safePoint;assert.equal(c.walk(destination).ok,true);assert.equal(events.at(-1)?.phase,'exit');
  c.setAvatar({activity:events.at(-1),equipped:{}});runUntil(c,'idle');assert.equal(events.at(-1)?.kind,'stand');
});

test('changing clothes or repainting a sleeping robot recalibrates contact without waking or saving again',t=>{
  const events=[],c=actor(t,{onActivityChange:value=>events.push(value)}),activity={kind:'sleep',itemId:'use-me',storey:0};
  c.setWorld(furnished('bedTimber'));c.setAvatar({activity,equipped:{}});
  c.setAvatar({activity,equipped:{outfit:'wear-cozy-pajamas',headwear:'wear-pom-beanie',footwear:'wear-bear-slippers'},colors:{shell:'#aabbcc',accent:'#ddaabb'}});
  assert.equal(c.getState().action,'lie');assert.equal(c.getState().scheduled,false);assert.deepEqual(events,[]);
  c.setAvatar({colors:{shell:'#bbccdd',accent:'#ccbbaa'}});assert.equal(c.getState().action,'lie');assert.deepEqual(events,[]);
});
