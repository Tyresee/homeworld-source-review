// QA ONLY: deterministic clock/camera cases around the actual game controller.
// No production debug global, alternate house export, account or write API.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createHomeScene} from '../../public/js/home-scene.js';
import {createStudentHomeRobotController} from '../../public/js/student-home-robot-controller.js';
import {getHomeRoamEntrance} from '../../public/js/home-roam-geometry.js';
import {getFloorBounds} from '../../public/js/home-layout.js';
import {createLookDevFixture,LOOK_DEV_SIZE} from './look-dev-fixtures.mjs';
import {resolveLookDevBuild} from './look-dev-runtime.mjs';
import {ROAM_REVIEW_CASES,parseRoamReviewPose,summarizeRoamFrames,sameRoamReviewCameraSnapshot} from './roam-review-cases.mjs';

const $=id=>document.getElementById(id),stage=$('stage'),size=LOOK_DEV_SIZE;
let world,experience,fixture,fixtureBefore,time=0,live=false,frame=0,lastWallTime=null,currentCase='01-exterior-orbit',muted=true,measurement=null,measurementResult=null,busy=false;
let cameraBeforeEnter=null,cameraAfterExit=null;
const clock=()=>time;
const setStatus=text=>{$('status').textContent=text;};
const cpuTimes=[];
function machine() {
  const gl=experience?.renderer.getContext(),extension=gl?.getExtension('WEBGL_debug_renderer_info');
  return {userAgent:navigator.userAgent,logicalProcessors:navigator.hardwareConcurrency??null,deviceMemoryGiB:navigator.deviceMemory??null,webglRenderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):'Unavailable / masked',webglVendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):'Unavailable / masked',physicalClassroomHardwareValidated:false};
}
function diagnostics() {
  return {tool:'read-only-roam-review',case:currentCase,reviewClockMs:time,clockPlaying:live,size:{...size,dpr:1},fixtureId:'house',accounts:false,wallet:false,persistence:false,fixtureDataUnchanged:fixtureBefore===JSON.stringify(fixture?.home),
    controller:experience?.controller.getState()??null,camera:experience?.controller.getCameraPose()??null,interactions:experience?.interactions.getState()??null,
    actualExperience:experience?.getDiagnostics()??null,frameRateStats:measurementResult,machine:experience?machine():null,
    cameraRestoration:{beforeEnter:cameraBeforeEnter,afterExit:cameraAfterExit,exactlyRestored:sameRoamReviewCameraSnapshot(cameraBeforeEnter,cameraAfterExit)}};
}
function refresh() {
  if(experience){const start=performance.now();experience.renderNow();cpuTimes.push(performance.now()-start);if(cpuTimes.length>2000)cpuTimes.shift();}
  const state=experience?.controller.getState();$('stage-title').hidden=!!state&&(state.phase==='free'||state.transition);
  $('diagnostics').textContent=JSON.stringify(diagnostics(),null,2);$('live').textContent=live?'Pause clock':'Play clock';
  $('pose').value=experience?JSON.stringify({position:experience.controller.camera.position.toArray(),target:experience.controller.camera.getWorldDirection(new THREE.Vector3()).add(experience.controller.camera.position).toArray()}):$('pose').value;
}
function advance(milliseconds) {
  if(!experience)return;let remaining=Math.max(0,milliseconds);
  while(remaining>0){const delta=Math.min(16,remaining);time+=delta;experience.renderNow();remaining-=delta;}
  refresh();
}
function key(code,down){window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:'Process',code,bubbles:true,cancelable:true}));}
function stopLive(){live=false;if(frame)cancelAnimationFrame(frame);frame=0;lastWallTime=null;key('KeyW',false);key('KeyS',false);measurement=null;}
function playLive() {
  if(!experience||live)return;live=true;lastWallTime=null;
  const next=wallTime=>{
    if(!live||!experience||document.hidden){stopLive();refresh();return;}
    const delta=lastWallTime===null?0:Math.max(0,wallTime-lastWallTime);lastWallTime=wallTime;
    if(measurement&&delta>0){measurement.intervals.push(delta);measurement.elapsed+=delta;const code=Math.floor(measurement.elapsed/1000)%2?'KeyS':'KeyW';if(code!==measurement.code){if(measurement.code)key(measurement.code,false);key(code,true);measurement.code=code;}}
    time+=delta;const start=performance.now();experience.renderNow();const cpu=performance.now()-start;
    const state=experience.controller.getState();$('stage-title').hidden=state.phase==='free'||state.transition;
    if(measurement){measurement.cpu.push(cpu);if(measurement.elapsed>=10000){measurementResult={...summarizeRoamFrames(measurement.intervals,measurement.cpu),case:measurement.case,mode:'free',motion:'Alternating physical KeyW / KeyS every second',interactionsAtStart:measurement.interactionsAtStart,interactionsAtEnd:experience.interactions.getState()};stopLive();setStatus('Foreground measurement complete. GPU/physical-device timing is not inferred.');refresh();return;}}
    if(!measurement||measurement.intervals.length%15===0)$('diagnostics').textContent=JSON.stringify(diagnostics(),null,2);
    frame=requestAnimationFrame(next);
  };frame=requestAnimationFrame(next);$('live').textContent='Pause clock';
}
function exitExperience() {stopLive();if(!experience)return;if(typeof world.exitRoam==='function')world.exitRoam();else experience.dispose();cameraAfterExit=world.getCameraSnapshot?.()??null;experience=null;refresh();}
async function enterExperience() {
  exitExperience();cameraBeforeEnter=world.getCameraSnapshot?.()??null;cameraAfterExit=null;time=0;experience=await world.enterRoam({clock,manualClock:true,autoRender:false});
  if(!experience||!experience.controller)throw new Error('The real game did not return its viewing experience');
  experience.renderer.setPixelRatio(1);experience.renderer.setSize(size.width,size.height,false);experience.controller.resize(size.width,size.height);experience.interactions.setMuted(muted);
  if(!experience.controller.active)experience.start();populateInteractions();refresh();return experience;
}
function populateInteractions() {
  $('interaction').replaceChildren(...experience.interactions.getTargets().map(target=>new Option(`${target.type} · ${target.kind} · ${target.sourceId}`,target.id)));
}
function moveReviewCamera(position,target) {
  const pose=parseRoamReviewPose({position,target}),controller=experience.controller,camera=controller.camera,canvas=experience.renderer.domElement;
  if(controller.getState().phase==='free') {
    const old=camera.getWorldDirection(new THREE.Vector3()),direction=new THREE.Vector3(...pose.target).sub(new THREE.Vector3(...pose.position)).normalize();
    const oldYaw=Math.atan2(-old.x,-old.z),yaw=Math.atan2(-direction.x,-direction.z),yawDelta=Math.atan2(Math.sin(oldYaw-yaw),Math.cos(oldYaw-yaw)),oldPitch=Math.asin(THREE.MathUtils.clamp(old.y,-1,1)),pitch=Math.asin(THREE.MathUtils.clamp(direction.y,-1,1));
    camera.position.set(...pose.position);const box=canvas.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2,id=991;
    canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:id,button:0,clientX:x,clientY:y,bubbles:true}));
    canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:id,button:0,clientX:x+yawDelta/.0045,clientY:y+(oldPitch-pitch)/.0035,bubbles:true}));
    // No real pointer was captured by these QA-only look events. The real
    // controller's blur path safely releases its drag without asking inactive
    // OrbitControls to release a synthetic pointer capture.
    window.dispatchEvent(new Event('blur'));
  } else {
    camera.position.set(...pose.position);controller.controls.target.set(...pose.target);camera.lookAt(controller.controls.target);controller.controls.update(0);
  }
  refresh();
}
async function ensureFree(){if(experience.controller.getState().phase==='free')return;experience.controller.setDisplayMode('exterior');experience.controller.enterDoor();advance(4800);if(experience.controller.getState().phase!=='free')throw new Error('The real door sequence did not reach free view');}
function activateWhere(predicate){for(const target of experience.interactions.getTargets().filter(predicate))experience.interactions.activate(target);}
function hoverDoor() {
  const entry=getHomeRoamEntrance(fixture.home),camera=experience.controller.camera,p=new THREE.Vector3(entry.center.x,1.2,entry.center.z).project(camera),box=experience.renderer.domElement.getBoundingClientRect();
  experience.renderer.domElement.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:box.left+(p.x+1)*box.width/2,clientY:box.top+(1-p.y)*box.height/2,bubbles:true}));refresh();
}
async function reviewCase(id) {
  stopLive();await enterExperience();currentCase=id;const index=ROAM_REVIEW_CASES.findIndex(row=>row.id===id)+1,controller=experience.controller,bounds=getFloorBounds(fixture.home),entry=getHomeRoamEntrance(fixture.home),e=entry.center,n=entry.outward;
  if(index===1){controller.setDisplayMode('exterior');controller.overview(false);}
  else if(index===2){controller.setDisplayMode('auto');moveReviewCamera([bounds.x+7.5,6.1,bounds.z+8.0],[bounds.x,.8,bounds.z]);}
  else if(index===3){controller.setDisplayMode('exterior');moveReviewCamera([e.x+n.x*3.8+n.z*.8,1.7,e.z+n.z*3.8-n.x*.8],[e.x,1.1,e.z]);hoverDoor();}
  else if(index===4){controller.setDisplayMode('exterior');controller.enterDoor();advance(2350);}
  else {
    await ensureFree();
    if(index===6)moveReviewCamera([1.2,1.45,.4],[4.3,1.1,-.3]);
    if(index===7)moveReviewCamera([e.x-n.x*2,1.45,e.z-n.z*2],[e.x+n.x,1.2,e.z+n.z]);
    if(index===8){moveReviewCamera([3.88,1.45,-.35],[3.88,.8,-1.65]);activateWhere(target=>['mkSingleSink','mkDoubleGas'].includes(target.kind));advance(850);}
    if(index===9){moveReviewCamera([4.2,1.45,5.0],[4.2,.75,3.4]);activateWhere(target=>['bathroomVanity','compactToilet'].includes(target.kind));advance(850);}
    if(index===10){moveReviewCamera([.3,1.1,4.65],[.3,.55,3.4]);activateWhere(target=>target.kind==='bedsideCabinet'&&target.type==='drawer');advance(550);}
    if(index===11){moveReviewCamera([.6,1.55,.7],[-1.8,1.3,-1.15]);activateWhere(target=>target.kind==='hhTripodLamp'&&target.type==='floor-lamp');advance(100);}
    if(index===12){moveReviewCamera([1.8,1.5,1.7],[-.4,1.25,-1.1]);activateWhere(target=>target.type==='ceiling-light'&&target.roomId===fixture.home.rooms.find(room=>room.kind==='living')?.id);advance(100);}
  }
  refresh();setStatus(`${id} · real controller phase: ${controller.getState().phase}. Actual entrance: ${entry.roomKind??'public space'}.`);
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function capturePNG(){if(!experience)return;refresh();const value=await experience.capturePNG();if(value instanceof Blob)download(value,currentCase+'.png');else if(typeof value==='string'){const response=await fetch(value);download(await response.blob(),currentCase+'.png');}else throw new Error('Experience capturePNG did not return a PNG');}
function beginMeasurement() {
  if(experience?.controller.getState().phase!=='free')throw new Error('Current-scene measurement requires free view. Open an indoor review case first.');
  stopLive();measurementResult=null;measurement={intervals:[],cpu:[],elapsed:0,code:null,case:currentCase,interactionsAtStart:experience.interactions.getState()};
  setStatus('Measuring this scene for 10 seconds without resetting its case or interactions. Keep this tab in the foreground.');playLive();
}
async function run(action){if(busy)return;busy=true;try{await action();}catch(error){setStatus(error.message);console.error(error);}finally{busy=false;}}
function bind() {
  $('enter').addEventListener('click',()=>run(enterExperience));$('leave').addEventListener('click',exitExperience);$('live').addEventListener('click',()=>{if(live){stopLive();refresh();}else playLive();});$('advance').addEventListener('click',()=>advance(100));
  $('door').addEventListener('click',()=>{experience.controller.enterDoor();playLive();});$('half-door').addEventListener('click',()=>run(()=>reviewCase('04-door-opening')));
  for(const button of document.querySelectorAll('[data-display]'))button.addEventListener('click',()=>{experience.controller.setDisplayMode(button.dataset.display);refresh();});
  $('overview').addEventListener('click',()=>{experience.controller.overview(false);refresh();});$('activate').addEventListener('click',()=>{experience.interactions.activate($('interaction').value);advance(700);});
  $('mute').addEventListener('click',()=>{muted=!muted;experience.interactions.setMuted(muted);$('mute').textContent=muted?'Unmute':'Mute';refresh();});
  $('apply-pose').addEventListener('click',()=>run(()=>moveReviewCamera(...Object.values(parseRoamReviewPose($('pose').value)))));
  $('png').addEventListener('click',()=>run(capturePNG));$('json').addEventListener('click',()=>download(new Blob([JSON.stringify(diagnostics(),null,2)],{type:'application/json'}),currentCase+'--diagnostics.json'));
  $('measure').addEventListener('click',()=>run(async()=>{await reviewCase('05-just-entered-living-room');beginMeasurement();}));
  $('measure-current').addEventListener('click',()=>run(beginMeasurement));
  $('cases').replaceChildren(...ROAM_REVIEW_CASES.map(row=>{const button=document.createElement('button');button.type='button';button.textContent=row.id.slice(0,2)+' · '+row.label;button.dataset.case=row.id;button.addEventListener('click',()=>run(()=>reviewCase(row.id)));return button;}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopLive();refresh();}});
  window.addEventListener('pagehide',()=>{stopLive();exitExperience();world?.dispose();},{once:true});
}
async function initialize() {
  const [gltf,preset]=await Promise.all([new GLTFLoader().loadAsync('/assets/asset-lab/robot-v1/models/v4/robot.glb'),fetch('/presets/warm-walls.json').then(response=>{if(!response.ok)throw new Error('Warm preset unavailable');return response.json();})]);
  fixture=createLookDevFixture('house');const theme=resolveLookDevBuild(fixture,preset);fixtureBefore=JSON.stringify(fixture.home);
  world=createHomeScene({container:stage,theme,onRenderSetup:({renderer})=>{renderer.setPixelRatio(1);renderer.setSize(size.width,size.height,false);},avatarFactory:options=>createStudentHomeRobotController({...options,source:gltf.scene})});
  world.setState(fixture.home,{floors:fixture.floors,activeFloor:0});world.setOutdoorState(fixture);world.setAvatar({...fixture.avatar,activity:{kind:'stand',environment:'interior',storey:0,point:{...fixture.robotPoint},rotation:Math.PI/4}});world.selectSurface(null);world.setTool('move');
  bind();for(const button of document.querySelectorAll('button:disabled'))button.disabled=false;await reviewCase(currentCase);
}
initialize().catch(error=>{setStatus('Review could not start: '+error.message);console.error(error);});
