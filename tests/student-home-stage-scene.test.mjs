import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {createStageCamera} from '../public/js/student-home-stage-camera.js';
import {createStageFraming} from '../public/js/student-home-stage-framing.js';
import {frameHomeCamera,panHomeCamera} from '../public/js/home-scene-framing.js';

const source=await readFile(new URL('../public/js/home-scene.js',import.meta.url),'utf8');
function sceneFunction(name,next){
  const start=source.indexOf(`  function ${name}(`),end=source.indexOf(`  function ${next}(`,start);
  assert.ok(start>=0&&end>start,`live scene function ${name} must be available`);
  return source.slice(start,end);
}
function sceneMethod(name){
  const line=source.split('\n').find(value=>value.trimStart().startsWith(`${name}(`));
  assert.ok(line,`live scene method ${name} must be available`);
  return line.trim().replace(/,$/,'');
}
const clone=value=>JSON.parse(JSON.stringify(value));
const point=new THREE.Vector3(1,.63,-.5);
const projection=camera=>point.clone().project(camera);

// Execute the production scene callbacks rather than recreating their logic.
// Only the DOM/WebGL renderer boundary and unrelated model editing are mocked;
// framing, interpolation, camera matrices and manual pan use the real modules.
function fixture(){
  let now=0,draws=0,releases=0,lightingResets=0,anchor=null;
  const bounds=new THREE.Box3(new THREE.Vector3(-4,-.2,-3),new THREE.Vector3(6,3,5));
  const viewport={width:1280,height:800},camera=new THREE.OrthographicCamera();
  const pose={pan:{x:2,y:0,z:-1},zoom:.9,angle:.7},original=clone(pose),focus=createStageFraming();
  const frames=new Map();let serial=0;
  const context={
    scheduled:false,renderFrame:0,disposed:false,view:'interior',document:{hidden:false},
    stageCameraTime:0,lastStageCameraFrame:null,stageFacingBound:false,facingCalls:[],performance:{now:()=>now},
    scene:new THREE.Scene(),camera,selection:{visible:true},container:{dataset:{}},
    stage:{active:true,requested:true,point:{x:point.x,y:.08,z:point.z},time:0,storey:0},
    renderer:{render(){draws++;},domElement:{setPointerCapture(){}}},
    stageLighting:{update:()=>false,getState:()=>({amount:1}),reset(){lightingResets++;}},
    updateHouseLabels(){},
    requestAnimationFrame(callback){frames.set(++serial,callback);return serial;},
    cancelAnimationFrame(id){frames.delete(id);},
    spaceHeld:true,lastPointerEvent:null,touchPoints:new Map(),pinchDistance:null,
    onPanStart(){},beginPan(){anchor={projection:projection(camera),state:context.stageCamera.getState()};},
    releaseInput(){releases++;},pendingAvatarArrival:null,
    clearFurniturePlacement(){},cancelDrag(){},stopCameraMotion(){},clearPulse(){},
    feedback:{clear(){}},estateFocus:null,requestedFocus:null,estatePan:new THREE.Vector3(2,0,-1),
    zoom:pose.zoom,angle:pose.angle,houseMode:'exterior',
    THREE,activeFloor:0,state:{profile:'classroom'},capturingHouse:false,floorCameraPoses:new Map(),
    syncView(){},fitSunToLayout(){},markShadowsDirty(){},
    frameCamera(){pose.pan={x:context.estatePan.x,y:0,z:context.estatePan.z};pose.zoom=context.zoom;pose.angle=context.angle;reframe();},
  };
  context.cameraPan=context.estatePan;
  function reframe(){frameHomeCamera(camera,bounds,{...viewport,angle:pose.angle,zoom:pose.zoom,padding:1.15,centerOffset:new THREE.Vector3(pose.pan.x,pose.pan.y,pose.pan.z)});}
  context.avatarActor={
    getStageState:()=>context.stage,
    setDanceFacing:value=>context.facingCalls.push(value),
    clearAccountBinding(){context.stage={active:false,requested:false};},
    setVisible(value){if(!value)context.stage={active:false,requested:false};},
  };
  const callbacks=[sceneFunction('render','requestRender'),sceneFunction('requestRender','markShadowsDirty'),sceneFunction('pointerDown','pointerMove')].join('\n');
  const visibility=source.match(/  function visibilityChanged\(\)[^\n]+/)[0];
  // End this callback at the real floor-assignment boundary, before model
  // reconstruction. Its camera handoff is independent of those meshes.
  const stateStart=source.indexOf('  function setState(next, options = {}) {');
  const assignment='    activeFloor=nextFloor;';
  const floorHandoff=source.slice(stateStart,source.indexOf(assignment,stateStart)+assignment.length)+'\n}';
  runInNewContext(`${callbacks}\n${visibility}\n${floorHandoff}\nglobalThis.lifecycle={${['clearRobotAccountBinding','hideAvatar','setView'].map(sceneMethod).join(',')}};`,context,{filename:'home-scene.callbacks.js'});
  context.stageCamera=createStageCamera({
    getPose:()=>clone(pose),
    applyPose(next){Object.assign(pose,clone(next));context.cameraPan.set(next.pan.x,next.pan.y,next.pan.z);context.zoom=next.zoom;context.angle=next.angle;reframe();},
    focusPose:(target,angle)=>focus({bounds,...viewport,point:target,angle}),
    requestRender:()=>context.requestRender(),
  });
  reframe();
  function renderAt(time){now=time;frames.clear();context.render();}
  function advance(duration=5000){for(let elapsed=0;elapsed<=duration;elapsed+=16)renderAt(now+16);}
  return {context,camera,pose,original,frames,reframe,renderAt,advance,
    get now(){return now;},get draws(){return draws;},get releases(){return releases;},
    get lightingResets(){return lightingResets;},get anchor(){return anchor;}};
}

test('scene passes the selected destination and view facing, and binds restored dance facing only once',()=>{
  const x=fixture(),requests=[];
  x.context.avatarActor.dance=value=>{requests.push(clone(value));return {ok:true};};
  const method=source.split('\n').find(line=>line.trimStart().startsWith('danceAvatar:'));
  runInNewContext(`globalThis.actions={${method}};`,x.context);
  x.context.actions.danceAvatar({point:{x:2.45,z:-1.2}});
  assert.deepEqual(requests,[{point:{x:2.45,z:-1.2},facing:.7}]);
  x.advance();assert.deepEqual(x.context.facingCalls,[.7],'orbit frames must not continually rotate the dancer');
  x.context.lifecycle.clearRobotAccountBinding();x.context.angle=1.9;
  x.context.stage={active:true,requested:true,point:{x:2,y:.08,z:1}};x.renderAt(x.now+16);
  assert.deepEqual(x.context.facingCalls,[.7,1.9],'another account binds its own view heading');
});

test('space-drag freezes the live dance camera before picking an anchor and stays in the same projection',()=>{
  const x=fixture();x.advance();const before=projection(x.camera),pose=clone(x.pose);
  x.context.pointerDown({button:0,ctrlKey:false,pointerType:'mouse',pointerId:7,clientX:400,clientY:300});
  assert.equal(x.anchor.state.active,false,'anchor must be acquired after the orbit releases control');
  assert.equal(x.anchor.state.suppressed,true);assert.ok(x.anchor.projection.distanceTo(before)<1e-12);
  assert.deepEqual(x.pose,pose,'manual takeover must not restore the pre-dance view');
  x.advance(1000);assert.deepEqual(x.pose,pose,'ongoing dance frames must not undo the manual view');
  assert.equal(x.context.stage.active,true,'camera handoff must not stop the robot');
  const delta=new THREE.Vector3(.9,0,-.4);panHomeCamera(x.camera,delta);const moved=projection(x.camera);
  x.pose.pan.x+=delta.x;x.pose.pan.z+=delta.z;x.reframe();
  assert.ok(projection(x.camera).distanceTo(moved)<1e-10,'the next refit must preserve the dragged frame');
});

test('returning from a background tab rebinds a paused turn without choosing another point',()=>{
  const x=fixture();x.context.stage.active=false;x.renderAt(16);
  assert.deepEqual(x.context.facingCalls,[.7]);
  x.context.document.hidden=true;x.context.visibilityChanged();
  assert.equal(x.context.stageFacingBound,false);
  const destination=clone(x.context.stage.point);
  x.context.document.hidden=false;x.context.visibilityChanged();x.renderAt(32);
  assert.deepEqual(x.context.facingCalls,[.7,.7]);
  assert.deepEqual(x.context.stage.point,destination);
  x.renderAt(48);assert.equal(x.context.facingCalls.length,2,'subsequent frames must not restart the turn');
});

test('hidden renders neither advance the camera clock nor create an animation loop',()=>{
  const x=fixture();x.advance();const pose=clone(x.pose),clock=x.context.stageCameraTime;
  x.context.document.hidden=true;x.context.visibilityChanged();assert.equal(x.releases,1);
  x.renderAt(x.now+60000);
  assert.deepEqual(x.pose,pose);assert.equal(x.context.stageCameraTime,clock);assert.equal(x.frames.size,0);
  x.context.document.hidden=false;x.renderAt(x.now+16);
  assert.deepEqual(x.pose,pose,'first foreground frame resumes the previous orbit phase');
  assert.equal(x.context.stageCameraTime,clock);x.renderAt(x.now+16);
  assert.equal(x.context.stageCameraTime,clock+16);assert.equal(x.frames.size,1);
});

test('long frame gaps are bounded even if the browser suspends before rendering a hidden frame',()=>{
  const x=fixture();x.advance();const before=projection(x.camera),clock=x.context.stageCameraTime;
  x.context.document.hidden=true;x.context.visibilityChanged();
  x.context.document.hidden=false;x.renderAt(x.now+60000);
  assert.ok(x.context.stageCameraTime-clock<=64);
  assert.ok(projection(x.camera).distanceTo(before)<.01,'returning from background must not jump to a distant orbit');
});

for(const method of ['clearRobotAccountBinding','hideAvatar'])test(`${method} clears old camera ownership before another student starts`,()=>{
  const x=fixture();x.advance();x.context.lifecycle[method]();
  assert.deepEqual(x.pose,x.original);assert.equal(x.lightingResets,1);
  assert.equal(x.context.container.dataset.stageActive,'false');
  assert.deepEqual(x.context.stageCamera.getState(),{active:false,returning:false,available:false,suppressed:false});
  Object.assign(x.pose,{pan:{x:-3,y:0,z:4},zoom:1.4,angle:1.2});x.reframe();const next=clone(x.pose);
  x.renderAt(x.now+16);assert.deepEqual(x.pose,next);
  x.context.stage={active:true,requested:true,point:{x:-2,y:.08,z:3},storey:1};x.advance(2000);
  x.context.stageCamera.reset();assert.deepEqual(x.pose,next,'new student owns a fresh return pose');
});

test('changing to the exterior resets dance-camera ownership and ignores stale interior actor frames',()=>{
  const x=fixture();x.advance();x.context.lifecycle.setView('estate');const outside=clone(x.pose);
  assert.equal(x.context.view,'estate');assert.equal(x.context.stageCamera.getState().active,false);
  x.advance(1000);assert.deepEqual(x.pose,outside);
  assert.equal(x.context.stageCamera.getState().available,false);
  assert.equal(x.frames.size,0,'a stale interior actor must not drive an exterior render loop');
});

test('floor handoff saves the pre-dance view and restores the destination floor view',()=>{
  const x=fixture(),next={pan:{x:-6,y:0,z:2},zoom:1.3,angle:2.1};
  x.context.floorCameraPoses.set(1,{...next,pan:new THREE.Vector3(next.pan.x,0,next.pan.z)});
  x.advance();x.context.setState({profile:'classroom'},{activeFloor:1});
  const saved=x.context.floorCameraPoses.get(0);
  assert.deepEqual(saved.pan.toArray(),Object.values(x.original.pan));
  assert.equal(saved.zoom,x.original.zoom);assert.equal(saved.angle,x.original.angle);
  assert.equal(x.context.activeFloor,1);assert.equal(x.context.stageCamera.getState().active,false);
  x.context.frameCamera();assert.deepEqual(x.pose,next);
  x.context.stage={active:false,requested:false};x.renderAt(x.now+16);assert.deepEqual(x.pose,next);
});
