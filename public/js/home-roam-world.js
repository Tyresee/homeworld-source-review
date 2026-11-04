import * as THREE from 'three';
import {roomRect} from './home-layout.js';
import {createHomeRoamOutdoor,getHomeRoamGardenEntry} from './home-roam-outdoor.js';
import {createHomeRoamModel} from './home-roam-model.js';
import {isHomeRoamInterior} from './home-roam-transport.js';
import {planHomeRoamCommandTrip} from './home-roam-trip.js';
import {createHomeRoamController} from './home-roam-controller.js';
import {createHomeRoamInteractions} from './home-roam-interactions.js';
import {createHomeRoamLandmarkDoors} from './home-roam-landmark-doors.js';
import {createViewOnlyRoamInteractions,getHomeRoamDisplayFloor} from './home-roam-view-only.js';
import {getHomeRoamInteriorEntry} from './home-roam-interior-entry.js';
import {createHomeRoamUI} from './home-roam-ui.js';
import {getHomeRoamElevatorTargets,resolveHomeRoamElevatorStorey} from './home-roam-elevator-menu.js';
import {planHomeRoamElevatorBoarding,planHomeRoamElevatorCabinTrip,planHomeRoamElevatorCabinExit} from './home-roam-elevator-cabin.js';
import {createHomeRoamCabinUI} from './home-roam-cabin-ui.js';
import {FLOOR_Y,STOREY_HEIGHT} from './home-staircase-shape.js';
import {getHomeRoamCopy,resolveHomeRoamLocale} from './home-roam-copy.js';
export {createHomeRoamModel,createHomeRoamModel as buildHomeRoamScene} from './home-roam-model.js';
const visible=node=>{for(let n=node;n;n=n.parent)if(!n.visible)return false;return true;};

/** The game camera and renderer are not repurposed. This whole temporary
 * experience is destroyed on exit or identity change, including light state. */
export function createHomeRoamExperience(options={}){
  const cleanup=[];
  try{return createRoamExperience(options,release=>cleanup.push(release));}
  catch(error){for(const release of cleanup.reverse())try{release();}catch{/* Preserve the construction error. */}throw error;}
}
function createRoamExperience({container,home,floors,outdoor,theme,maps,robot,robotStorey,robotEnvironment,lighting={},onExit=()=>{},onStateChange=()=>{},clock=()=>performance.now(),manualClock=false,pixelRatio,locale,outdoorPresentation=true,readOnly=false}={},allocated=()=>{}){
  locale=resolveHomeRoamLocale(locale);const copy=getHomeRoamCopy(locale);
  const model=createHomeRoamModel({home,floors,theme,maps,robot,robotStorey,robotEnvironment}),scene=model.scene,doc=container.ownerDocument;allocated(()=>model.dispose());
  const estate=createHomeRoamOutdoor({outdoor});if(estate){scene.add(estate.group);allocated(()=>estate.dispose());}
  const host=doc.createElement('div');host.className='home-roam-layer';Object.assign(host.style,{position:'absolute',inset:'0',zIndex:'12',background:container.style.background||'radial-gradient(ellipse at 45% 42%,#fbf9f5,#e7dfd2)'});container.append(host);allocated(()=>host.remove());
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});allocated(()=>{renderer.dispose();renderer.forceContextLoss();});renderer.setPixelRatio(pixelRatio??Math.min(globalThis.devicePixelRatio||1,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.localClippingEnabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=lighting.toneMapping??THREE.NeutralToneMapping;renderer.toneMappingExposure=lighting.exposure??1.03;renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label',readOnly?copy.showcaseLabel:copy.canvasLabel);Object.assign(renderer.domElement.style,{width:'100%',height:'100%',display:'block',touchAction:'none'});host.prepend(renderer.domElement);
  const hemisphere=new THREE.HemisphereLight(lighting.sky??'#fff6ea',lighting.ground??'#e2dbcf',lighting.hemisphere??1.7);scene.add(hemisphere);
  const sun=new THREE.DirectionalLight(lighting.sunColor??'#fff0d8',lighting.sun??3.4),fill=new THREE.DirectionalLight(lighting.fillColor??'#dde7f2',lighting.fill??.9);sun.position.set(3,8,6).add(new THREE.Vector3(model.bounds.x,0,model.bounds.z));fill.position.set(-4,5,-4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0006;sun.shadow.normalBias=.035;scene.add(sun,fill,sun.target);allocated(()=>sun.shadow.dispose());sun.target.position.set(model.bounds.x,0,model.bounds.z);const reach=Math.max(model.bounds.width,model.bounds.depth,estate?.land.width??0,estate?.land.depth??0)+2;Object.assign(sun.shadow.camera,{left:-reach,right:reach,top:reach,bottom:-reach,near:.1,far:70});sun.shadow.camera.updateProjectionMatrix();
  const master=new THREE.PointLight('#ffe1b8',0,11,2);master.castShadow=true;master.shadow.mapSize.set(1024,1024);master.shadow.bias=-.002;master.shadow.normalBias=.025;master.shadow.autoUpdate=false;scene.add(master);allocated(()=>master.shadow.dispose());
  const l1=theme.id==='toy',interiorLighting=theme.lighting?.interior??{};if(l1){sun.position.set(model.bounds.x-3,8,model.bounds.z-6);sun.shadow.normalBias=.018;sun.shadow.radius=3;master.castShadow=false;hemisphere.groundColor.set('#d9dedf');hemisphere.color.set('#f4f8ff');master.color.set('#fff5e5');}
  const baseline={sun:sun.intensity,fill:fill.intensity,hemi:hemisphere.intensity,exposure:renderer.toneMappingExposure};
  const bodyBox=model.interiorBounds;
  const overviewBox=model.buildingBounds.clone();if(estate)overviewBox.union(estate.bounds);
  const showcaseBox=model.buildingBounds.clone();if(estate)showcaseBox.union(estate.group.getPlacedBounds());
  let active=false,disposed=false,frame=0,previousTime=null,hoverDoor=false,lastMode='',lastLight='',renderCount=0,renderCpu=0,realPrevious=null;
  const intervals=[],listeners=[],raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const invalidate=()=>{if(active&&!disposed&&!manualClock&&!frame)frame=requestAnimationFrame(renderNow);};
  let ui,interactions,controller,cabinUI,elevatorSession=null,cabinGesture=null,ignoreNextCanvasClick=false,spectatorStorey=null,navigationStorey=0;
  function currentFloor(){return getHomeRoamDisplayFloor(model,{cameraY:controller?.camera.position.y??0,selectedStorey:readOnly?(controller?.getState().phase!=='free'?spectatorStorey:null):(controller?.getState().phase==='free'?navigationStorey:null)});}
  function stateChanged(state){if(disposed)return;const value={...state,readOnly,storey:currentFloor().storey,floorCount:model.floorCount};ui?.update(value);onStateChange(value);invalidate();}
  function floorLookAt(storey){const rects=model.floorModels[storey].rects;return rects.length?new THREE.Vector3(rects.reduce((sum,r)=>sum+(r.minX+r.maxX)/2,0)/rects.length,0,rects.reduce((sum,r)=>sum+(r.minZ+r.maxZ)/2,0)/rects.length):undefined;}
  function visitFloor(target,{onComplete=()=>{},fromStorey=currentFloor().storey}={}){
    if(readOnly)return controller.getState().phase==='free'?walkInterior(target):visitInterior(target);
    if(elevatorSession?.phase==='selecting')return chooseCabinFloor(target,{onComplete});
    if(!['free','orbit'].includes(controller.getState().phase)||!Number.isInteger(target)||target<0||target>=model.floorCount)return false;
    const position=controller.camera.position.clone(),lookAt=position.clone().add(controller.camera.getWorldDirection(new THREE.Vector3()));
    const plan=planHomeRoamCommandTrip({model,fromStorey,targetStorey:target,position,lookAt,arrivalLookAt:floorLookAt,forcePreparation:controller.getState().phase==='orbit'});
    if(!plan.ok){ui.setMessage(plan.reason==='destination-blocked'?copy.travelDestinationBlocked:copy.travelBlocked);return false;}
    ui.setMessage('');ui.setHover(null);interactions.clearHover();
    return controller.travel(plan.journeys,{preparation:plan.preparation,onSample(journey,pose){if(pose.elevatorFrame)model.transports.find(row=>row.id===journey.transportId)?.setElevatorFrame(pose.elevatorFrame);renderer.shadowMap.needsUpdate=true;},onComplete:()=>{navigationStorey=target;stateChanged(controller.getState());onComplete();}});
  }
  function visitInterior(storey=0){
    if(!readOnly)return controller.enterDoor();
    const row=model.floorModels[storey];if(!row?.rects.length)return false;
    const bounds=new THREE.Box3(new THREE.Vector3(Math.min(...row.rects.map(r=>r.minX)),row.baseY,Math.min(...row.rects.map(r=>r.minZ))),new THREE.Vector3(Math.max(...row.rects.map(r=>r.maxX)),row.baseY+2.91,Math.max(...row.rects.map(r=>r.maxZ))));
    return controller.frameView(bounds,{displayMode:'interior',onFocus:()=>{spectatorStorey=storey;}});
  }
  function walkInterior(storey=spectatorStorey??0){
    if(!readOnly)return controller.enterDoor();
    if(!['orbit','free'].includes(controller.getState().phase))return false;
    const entry=getHomeRoamInteriorEntry({model,storey});
    if(!entry){ui.setMessage(copy.showcaseNoWalkArea);return false;}
    ui.setMessage('');ui.setHover(null);return controller.enterInterior({...entry,onEnter:()=>{spectatorStorey=storey;}});
  }
  function viewOverview(){return readOnly?controller.frameView(showcaseBox,{displayMode:'exterior',onFocus:()=>{spectatorStorey=null;}}):controller.overview();}
  function displayView(value){if(!readOnly)return controller.setDisplayMode(value);return value==='interior'?visitInterior(spectatorStorey??0):viewOverview();}
  function leaveHome(){if(elevatorSession?.phase==='selecting')return exitElevatorCabin({onComplete:leaveHome});if(estate&&controller.getState().sceneMode==='ext+in'&&controller.leaveOutdoor())return true;return currentFloor().storey>0?visitFloor(0,{onComplete:()=>controller.leave({direct:true})}):controller.leave({direct:true});}
  function visitGarden(point){
    if(!estate||!['orbit','free'].includes(controller.getState().phase))return false;
    if(elevatorSession?.phase==='selecting')return exitElevatorCabin({onComplete:()=>visitGarden(point)});
    const garden=!point&&estate.group.getFeature?.('garden'),target=garden?new THREE.Box3().setFromObject(garden).getCenter(new THREE.Vector3()):null;
    const entry=getHomeRoamGardenEntry({estate,model,preferredPoint:point??target});
    if(!entry){ui?.setMessage(copy.gardenUnavailable);return false;}
    const away=entry.clone().sub(model.buildingBounds.getCenter(new THREE.Vector3())).setY(0);if(away.lengthSq()<1e-8)away.copy(model.entrance?.outward??new THREE.Vector3(0,0,1));away.normalize();
    const lookAt=target?target.clone().setY(THREE.MathUtils.clamp(target.y,.5,entry.y+1.45)):entry.clone().addScaledVector(away,5).setY(entry.y+1.3);
    ui?.setMessage('');ui?.setHover(null);interactions?.clearHover();setDoorHover(false);
    const entered=controller.enterOutdoor(entry,{lookAt});if(entered&&!readOnly)navigationStorey=0;return entered;
  }
  function enterHouse(){if(elevatorSession?.phase==='selecting')return exitElevatorCabin({onComplete:enterHouse});ui?.setMessage('');ui?.setHover(null);setDoorHover(false);if(readOnly)return walkInterior(spectatorStorey??0);const entered=controller.enterDoor();if(entered)navigationStorey=0;return entered;}
  controller=createHomeRoamController({element:renderer.domElement,bounds:readOnly?showcaseBox:overviewBox,displayBounds:model.buildingBounds,orbitMaxDistance:estate?Math.max(45,overviewBox.getSize(new THREE.Vector3()).length()*2):45,interiorBounds:bodyBox,wallTop:2.91,entrance:model.entrance,containsInterior:p=>isHomeRoamInterior(model,p),now:clock,exitOnEscape:!readOnly,onRequestOverview:readOnly?viewOverview:undefined,onRequestLeave:readOnly?viewOverview:leaveHome,onChange:invalidate,onMode:stateChanged,onViewOpacity:value=>{renderer.domElement.style.opacity=String(value);},onDoorAngle:value=>{if(!readOnly&&model.entrance?.hinge)model.entrance.hinge.rotation.y=value;renderer.shadowMap.needsUpdate=true;invalidate();},onExit});
  allocated(()=>controller.dispose());
  ui=createHomeRoamUI({container:host,locale,readOnly,floorCount:model.floorCount,hasOutdoor:!!estate,onWalk:()=>walkInterior(),onOutdoor:()=>visitGarden(),onHouse:enterHouse,onFloor:visitFloor,onDisplayMode:displayView,onAutoRotate:value=>controller.setAutoRotate(value),onOverview:viewOverview,onLeave:()=>controller.leave()});
  allocated(()=>ui.dispose());
  if(!readOnly){cabinUI=createHomeRoamCabinUI({container:host,locale,onChoose:target=>chooseCabinFloor(target),onExit:()=>exitElevatorCabin()});allocated(()=>cabinUI.dispose());}
  const floorInteractions=[];
  if(!readOnly)for(const row of model.floorModels){const api=createHomeRoamInteractions({root:row.group,storey:row.storey,locale,rooms:row.home.rooms,ceilingLights:row.ceilingLights,onInvalidate:()=>{renderer.shadowMap.needsUpdate=true;invalidate();},onCeilingLightChange:()=>{lastLight='';invalidate();}});floorInteractions.push(api);allocated(()=>api.dispose());}
  const outdoorDoors=!readOnly&&estate?createHomeRoamLandmarkDoors({root:estate.group,locale,onInvalidate:()=>{renderer.shadowMap.needsUpdate=true;invalidate();}}):null;
  if(outdoorDoors){floorInteractions.push(outdoorDoors);allocated(()=>outdoorDoors.dispose());}
  const owner=target=>floorInteractions.find(api=>api.getTargets().includes(target));
  interactions={getTargets:()=>floorInteractions.flatMap(api=>api.getTargets()),pick(ray){return floorInteractions.map(api=>api.pick(ray)).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0]??null;},clearHover:()=>floorInteractions.forEach(api=>api.clearHover()),hover(ray){const hit=this.pick(ray);for(const api of floorInteractions)if(api===owner(hit?.target))api.hover(ray);else api.clearHover();return hit;},activate:target=>owner(target)?.activate(target)??false,tick:dt=>floorInteractions.map(api=>api.tick(dt)).some(Boolean),unlockAudio:()=>floorInteractions.forEach(api=>api.unlockAudio()),setMuted:value=>floorInteractions.forEach(api=>api.setMuted(value)),getMuted:()=>floorInteractions.every(api=>api.getMuted()),getState(){const rows=floorInteractions.map(api=>api.getState());return {disposed:rows.every(row=>row.disposed),hovered:rows.find(row=>row.hovered)?.hovered??null,activeAnimations:rows.reduce((sum,row)=>sum+row.activeAnimations,0),counts:rows.reduce((counts,row)=>{for(const[key,value]of Object.entries(row.counts))counts[key]=(counts[key]??0)+value;return counts;},{}),targets:rows.flatMap(row=>row.targets),floors:rows};},dispose:()=>floorInteractions.forEach(api=>api.dispose())};
  if(readOnly)interactions=createViewOnlyRoamInteractions();
  allocated(()=>interactions.dispose());
  allocated(()=>{for(const remove of listeners)remove();});
  const add=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));};
  function resize(){if(disposed)return;const width=host.clientWidth||container.clientWidth||1440,height=host.clientHeight||container.clientHeight||900;renderer.setSize(width,height,false);controller.resize(width,height);invalidate();}
  const observer=new ResizeObserver(resize);allocated(()=>observer.disconnect());observer.observe(container);resize();
  function prepareRay(event){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,controller.camera);scene.updateMatrixWorld(true);}
  function firstVisibleHit(){const meshes=[];scene.traverse(n=>{if(n.isMesh&&!n.userData.roamBackdrop&&visible(n))meshes.push(n);});return raycaster.intersectObjects(meshes,false).find(hit=>[].concat(hit.object.material??[]).some(m=>m.visible!==false&&(!m.transparent||m.opacity>0)))??null;}
  function reachableInteraction(){const hit=interactions.pick(raycaster),first=firstVisibleHit();return hit&&(!first||hit.distance<=first.distance+1e-4)?hit:null;}
  function doorHit(){if(controller.getState().view!=='exterior')return false;const first=firstVisibleHit();if(!first)return false;return first.object===model.entrance?.leaf||model.entrance?.leaf?.children.includes(first.object)||model.entrance?.handles?.includes(first.object);}
  function outdoorHit(){const first=firstVisibleHit();return estate&&first?.object.userData.roamOutdoor?first:null;}
  function outdoorDoorHit(){const hit=outdoorDoors?.pick(raycaster),first=hit&&firstVisibleHit();return hit&&(!first||hit.distance<=first.distance+1e-4)?hit:null;}
  function setDoorHover(value){if(hoverDoor===value)return;hoverDoor=value;model.entrance?.leaf?.traverse(n=>{if(n.isMesh)for(const m of[].concat(n.material??[]))if(m.emissive)m.emissive.set(value?'#6b3a17':'#000000');});invalidate();}
  function transportHit(){
    const hit=firstVisibleHit(),id=hit?.object.userData.roamTransportId,transport=id&&model.transports.find(row=>row.id===id);if(!transport)return null;
    if(transport.type==='elevator'){
      const storey=resolveHomeRoamElevatorStorey({model,transport,hit,preferredStorey:controller.getState().phase==='free'?navigationStorey:undefined});
      if(storey===null)return null;
      const targets=getHomeRoamElevatorTargets({model,transport,storey});
      return targets.length?{transport,storey,targets,hit}:null;
    }
    const storey=currentFloor().storey;return [transport.from,transport.to].includes(storey)?{transport,storey,targets:[],hit}:null;
  }
  function transportLabel(value){const {transport,storey}=value;return transport.type==='elevator'?copy.elevatorEnter:storey===transport.from?copy.stairsUp:copy.stairsDown;}
  function cabinPanelFor(transport){return model.elevatorPanels?.find(entry=>entry.transportIds.includes(transport.id));}
  function paintCabinPanel(session,frame){
    const currentStorey=Number.isFinite(frame?.cabinY)?Math.max(0,Math.min(model.floorCount-1,Math.round((frame.cabinY-FLOOR_Y)/STOREY_HEIGHT))):session.storey;
    const state={floorCount:model.floorCount,currentStorey,served:session.served,targetStorey:session.targetStorey??null,busy:session.phase!=='selecting',phase:session.phase};
    if(ui?.element)ui.element.dataset.cabin=session.phase;
    session.panelEntry.panel.setState(state);
    if(session.phase==='selecting'||session.phase==='riding')cabinUI?.show(state);else cabinUI?.hide();
  }
  function sampleCabinJourney(session,journey,pose){
    if(elevatorSession!==session||disposed)return;
    if(pose.elevatorFrame)model.transports.find(row=>row.id===journey.transportId)?.setElevatorFrame(pose.elevatorFrame);
    paintCabinPanel(session,pose.elevatorFrame);renderer.shadowMap.needsUpdate=true;
  }
  function finishCabinSession(session,storey){
    if(elevatorSession!==session)return;
    navigationStorey=storey;session.storey=storey;session.phase='selecting';session.targetStorey=null;
    session.panelEntry.panel.setState({currentStorey:storey,served:session.served,targetStorey:null,busy:false});
    elevatorSession=null;cabinGesture=null;cabinUI?.hide();if(ui?.element)delete ui.element.dataset.cabin;controller.setInputPaused(false);renderer.domElement.focus?.({preventScroll:true});stateChanged(controller.getState());
  }
  function boardElevator(value){
    if(readOnly||elevatorSession||value.transport.type!=='elevator'||!['free','orbit'].includes(controller.getState().phase))return false;
    const panelEntry=cabinPanelFor(value.transport);if(!panelEntry)return false;
    const position=controller.camera.position.clone(),lookAt=position.clone().add(controller.camera.getWorldDirection(new THREE.Vector3()));
    const plan=planHomeRoamElevatorBoarding({model,transport:value.transport,storey:value.storey,position,lookAt,forcePreparation:controller.getState().phase==='orbit'});
    if(!plan.ok){ui.setMessage(copy.travelBlocked);return false;}
    const session={...plan.session,transport:value.transport,panelEntry,storey:value.storey,phase:'boarding',served:value.targets.map(row=>row.storey).concat(value.storey),targetStorey:null};elevatorSession=session;
    ui.setMessage(copy.elevatorBoarding);ui.setHover(null);interactions.clearHover();paintCabinPanel(session);
    const accepted=controller.travel(plan.journeys,{preparation:plan.preparation,onSample:(journey,pose)=>sampleCabinJourney(session,journey,pose),onComplete(){
      if(elevatorSession!==session||disposed)return;
      navigationStorey=session.storey;session.phase='selecting';paintCabinPanel(session);controller.setInputPaused(true);ui.setMessage('');stateChanged(controller.getState());
    }});
    if(!accepted)finishCabinSession(session,session.storey);return accepted;
  }
  function chooseCabinFloor(target,{onComplete=()=>{}}={}){
    const session=elevatorSession;
    if(readOnly||!session||session.phase!=='selecting'||!Number.isInteger(target)||target===session.storey||!session.served.includes(target))return false;
    const position=controller.camera.position.clone(),lookAt=position.clone().add(controller.camera.getWorldDirection(new THREE.Vector3()));
    const plan=planHomeRoamElevatorCabinTrip({model,transport:session.transport,fromStorey:session.storey,targetStorey:target,position,lookAt,arrivalLookAt:floorLookAt(target)});
    if(!plan.ok){ui.setMessage(plan.reason==='destination-blocked'?copy.travelDestinationBlocked:copy.travelBlocked);return false;}
    session.phase='riding';session.targetStorey=target;paintCabinPanel(session);controller.setInputPaused(false);ui.setMessage('');
    const accepted=controller.travel(plan.journeys,{onSample:(journey,pose)=>sampleCabinJourney(session,journey,pose),onComplete(){if(elevatorSession!==session||disposed)return;finishCabinSession(session,target);ui.setMessage(copy.elevatorArrived.replace('{floor}',String(target+1)));onComplete();}});
    if(!accepted){session.phase='selecting';session.targetStorey=null;paintCabinPanel(session);controller.setInputPaused(true);}return accepted;
  }
  function exitElevatorCabin({onComplete=()=>{}}={}){
    const session=elevatorSession;if(!session||session.phase!=='selecting'||readOnly)return false;
    const position=controller.camera.position.clone(),lookAt=position.clone().add(controller.camera.getWorldDirection(new THREE.Vector3()));
    const plan=planHomeRoamElevatorCabinExit({model,transport:session.transport,storey:session.storey,position,lookAt,arrivalLookAt:floorLookAt(session.storey)});
    if(!plan.ok){ui.setMessage(copy.travelBlocked);return false;}
    session.phase='exiting';paintCabinPanel(session);controller.setInputPaused(false);ui.setMessage('');
    const accepted=controller.travel(plan.journeys,{onSample:(journey,pose)=>sampleCabinJourney(session,journey,pose),onComplete(){if(elevatorSession!==session||disposed)return;finishCabinSession(session,session.storey);onComplete();}});
    if(!accepted){session.phase='selecting';paintCabinPanel(session);controller.setInputPaused(true);}return accepted;
  }
  function hover(event){
    if(!active||controller.getState().transition)return;
    if(elevatorSession?.phase==='selecting'){renderer.domElement.style.cursor='default';ui.setHover(null);return;}
    if(readOnly){renderer.domElement.style.cursor='grab';ui.setHover(null);return;}
    prepareRay(event);const state=controller.getState(),transport=transportHit();
    if(transport){setDoorHover(false);interactions.clearHover();renderer.domElement.style.cursor='pointer';ui.setHover({text:transportLabel(transport),x:event.clientX,y:event.clientY});return;}
    const outdoorDoor=outdoorDoorHit();if(outdoorDoor){setDoorHover(false);interactions.clearHover();outdoorDoors.hover(raycaster);renderer.domElement.style.cursor='pointer';ui.setHover({text:outdoorDoor.label,x:event.clientX,y:event.clientY});return;}
    if(state.phase==='orbit'){const hit=doorHit(),ground=outdoorHit();setDoorHover(hit);interactions.clearHover();renderer.domElement.style.cursor=hit||ground?'pointer':'grab';ui.setHover(hit||ground?{text:hit?copy.doorTip:copy.outdoorTip,x:event.clientX,y:event.clientY}:null);}
    else{const door=doorHit();setDoorHover(door);const hit=door?null:reachableInteraction();if(hit)interactions.hover(raycaster);else interactions.clearHover();renderer.domElement.style.cursor=door||hit?'pointer':'grab';ui.setHover(door?{text:copy.houseTip,x:event.clientX,y:event.clientY}:hit?{text:hit.label,x:event.clientX,y:event.clientY}:null);}
  }
  function click(event){
    if(!active||event.button!==0||controller.getState().transition)return;
    if(ignoreNextCanvasClick){ignoreNextCanvasClick=false;return;}
    if(elevatorSession?.phase==='selecting'){
      const gesture=cabinGesture;cabinGesture=null;
      if(!gesture||gesture.button!==0||gesture.id!==event.pointerId||Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>=6)return;
      prepareRay(event);const hit=firstVisibleHit(),target=hit?.object?.userData?.roamElevatorFloor;
      let owner=hit?.object;while(owner&&owner!==elevatorSession.panelEntry.panel.group)owner=owner.parent;
      if(Number.isInteger(target)&&owner===elevatorSession.panelEntry.panel.group)chooseCabinFloor(target);
      return;
    }
    if(!controller.isPointerClick(event))return;
    prepareRay(event);const state=controller.getState();
    if(readOnly){const hit=firstVisibleHit();if(state.phase==='free'&&hit&&(hit.object.userData.roomPart==='floor'||hit.object.userData.roamWalkSurface===true))controller.moveTo(hit.point,{floor:true,direction:raycaster.ray.direction});else if(state.phase==='orbit'&&hit?.object.userData.roamWalkSurface===true)visitGarden(hit.point);return;}
    const transport=transportHit();if(transport){if(transport.transport.type==='elevator')boardElevator(transport);else visitFloor(transport.storey===transport.transport.from?transport.transport.to:transport.transport.from,{fromStorey:transport.storey});return;}
    const outdoorDoor=outdoorDoorHit();if(outdoorDoor){interactions.activate(outdoorDoor.target);hover(event);return;}
    interactions.unlockAudio();
    if(state.phase==='orbit'){if(doorHit())enterHouse();else{const ground=outdoorHit();if(ground)visitGarden(ground.point);}}
    else if(state.phase==='free'){if(doorHit()){enterHouse();return;}const target=reachableInteraction();if(target){interactions.activate(target.target);hover(event);return;}const hit=firstVisibleHit();if(hit)controller.moveTo(hit.point,{floor:hit.object.userData.roomPart==='floor'||hit.object.userData.roamWalkSurface===true,direction:raycaster.ray.direction});}invalidate();
  }
  // A dismissal released outside the canvas must not consume the next gesture.
  // This listener runs before the document's bubbling menu-dismissal listener.
  function beginCanvasGesture(event={}){ignoreNextCanvasClick=false;cabinGesture=elevatorSession?.phase==='selecting'?{id:event.pointerId,x:event.clientX,y:event.clientY,button:event.button}:null;}
  add(renderer.domElement,'pointerdown',beginCanvasGesture);add(renderer.domElement,'pointermove',hover);add(renderer.domElement,'pointerup',click);add(renderer.domElement,'pointerleave',()=>{setDoorHover(false);interactions.clearHover();ui.setHover(null);});add(renderer.domElement,'contextmenu',event=>event.preventDefault());
  function applyLighting(state){const l1=model.lightingProfile?.id==='L1',interiorLighting=model.lightingProfile??{};const indoors=state.sceneMode==='in',peek=state.sceneMode==='ext+in',p=controller.camera.position;
    const floor=currentFloor(),storey=floor?.storey??0,key=[indoors,peek,storey].join(':');
    if(lastMode!==state.sceneMode){model.manor.visible=state.sceneMode==='ext'||peek;model.setFloorSlabMode(state.sceneMode);model.daylight.setVisible(indoors&&outdoorPresentation);model.doorway.visible=state.sceneMode!=='orbit-in';model.interior.visible=state.sceneMode!=='ext';for(const c of model.ceilings)c.visible=indoors||peek;for(const l of model.ceilingLights)l.disc.visible=indoors||peek;lastMode=state.sceneMode;renderer.shadowMap.needsUpdate=true;}
    for(const row of model.floorModels??[]){row.group.visible=state.sceneMode!=='orbit-in'||row.storey===storey;row.group.traverse(node=>{if(node.isLight)node.visible=row.storey===storey;});}
    const candidates=model.ceilingLights.filter(l=>(l.storey??0)===storey),rooms=floor?.home.rooms??home.rooms;
    const current=(indoors?candidates.find(l=>{const room=rooms.find(r=>r.id===l.roomId),r=room&&roomRect(room);return r&&p.x>=r.minX&&p.x<=r.maxX&&p.z>=r.minZ&&p.z<=r.maxZ;}):candidates.find(l=>l.roomId===model.entrance?.roomId))??candidates[0];
    const lightKey=key+':'+current?.id+':'+model.ceilingLights.map(l=>l.enabled?'1':'0').join('');if(lightKey!==lastLight){lastLight=lightKey;sun.intensity=indoors?(l1?interiorLighting.sun:0):baseline.sun;fill.intensity=indoors?0:baseline.fill;hemisphere.intensity=indoors?(l1?interiorLighting.hemisphere:1.05):baseline.hemi;renderer.toneMappingExposure=indoors?(l1?interiorLighting.exposure:1.22):baseline.exposure;
      for(const l of model.ceilingLights){const enabled=l.enabled!==false,same=(l.storey??0)===storey;l.light.intensity=(indoors||peek)&&enabled&&same?(l===current?(indoors?0:24*.7):(l1?0:24*.75)*(peek?.7:1)):0;l.disc.material.emissiveIntensity=enabled&&(indoors||peek)? .8:0;}
      if(current)current.light.getWorldPosition(master.position);else master.position.set(0,0,0);if(l1)master.position.y-=.6;master.intensity=indoors&&current?.enabled!==false?(l1?interiorLighting.master:24):0;master.shadow.autoUpdate=indoors&&!l1;master.shadow.needsUpdate=indoors&&!l1||!master.shadow.map;sun.shadow.autoUpdate=!indoors&&!l1;sun.shadow.needsUpdate=l1||!indoors;renderer.shadowMap.autoUpdate=indoors&&!l1;renderer.shadowMap.needsUpdate=true;
    }
    if(model.setOrbitCut(controller.camera,controller.controls.target,state.sceneMode==='orbit-in'))renderer.shadowMap.needsUpdate=true;
  }

  function renderNow(){if(frame)cancelAnimationFrame(frame);frame=0;if(!active||disposed)return;const time=clock(),dt=previousTime===null?0:Math.min(.1,Math.max(0,(time-previousTime)/1000));previousTime=time;const moving=controller.tick(time),animating=interactions.tick(dt),state=controller.getState();ui?.update({...state,storey:currentFloor().storey,floorCount:model.floorCount});applyLighting(state);scene.updateMatrixWorld(true);if(elevatorSession)cabinUI?.project({targets:elevatorSession.panelEntry.panel.getTargets(),camera:controller.camera,width:host.clientWidth||1440,height:host.clientHeight||900});const start=performance.now();renderer.render(scene,controller.camera);renderCpu=performance.now()-start;renderCount++;const now=performance.now();if(!manualClock&&realPrevious!==null){intervals.push(now-realPrevious);if(intervals.length>300)intervals.shift();}realPrevious=now;if((moving||animating)&&!doc.hidden)invalidate();}

  function getDiagnostics(){return {active,locale,readOnly,elevatorCabin:elevatorSession?{phase:elevatorSession.phase,storey:elevatorSession.storey,targetStorey:elevatorSession.targetStorey,served:[...elevatorSession.served],panel:elevatorSession.panelEntry.panel.getState()}:null,outdoor:{enabled:!!estate,placedIds:estate?.placedIds??[],unchanged:estate?.getUnchanged()??true},floorCount:model.floorCount,storey:currentFloor().storey,transports:model.transports.map(row=>({id:row.id,type:row.type,from:row.from,to:row.to,frame:row.getElevatorFrame?.()})),outdoorPresentation:{enabled:outdoorPresentation,visible:model.daylight.group.visible,independentOfExposure:true,additionalLights:0},phase:controller.getState(),camera:controller.getCameraPose(),entrance:{roomId:model.entrance?.roomId,center:model.entrance?.center,outward:model.entrance?.outward,width:model.entrance?.width,height:model.entrance?.height},walls:model.getWallState(),interactions:interactions.getState(),lights:{sun:sun.intensity,fill:fill.intensity,hemisphere:hemisphere.intensity,exposure:renderer.toneMappingExposure,master:master.intensity,masterRoom:model.ceilingLights.find(l=>l.light.getWorldPosition(new THREE.Vector3()).distanceTo(master.position)<1e-6)?.roomId,shadowAutoUpdate:master.shadow.autoUpdate,ceilings:model.ceilingLights.map(l=>({id:l.id,on:l.enabled,intensity:l.light.intensity}))},render:{...renderer.info.render,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,frames:renderCount,lastCpuMs:renderCpu,manualClock,meanFrameIntervalMs:intervals.length?intervals.reduce((a,b)=>a+b,0)/intervals.length:null,fps:intervals.length?1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length):null,width:renderer.domElement.width,height:renderer.domElement.height,dpr:renderer.getPixelRatio()},rendererIdentity:rendererIdentity(renderer)};}
  return {scene,renderer,controller,interactions,model,estate,visitFloor,visitGarden,visitInterior,walkInterior,viewOverview,renderNow,getDiagnostics,start(){if(disposed)return false;elevatorSession=null;cabinGesture=null;cabinUI?.hide();if(ui?.element)delete ui.element.dataset.cabin;navigationStorey=0;active=true;ui.setVisible(true);controller.start();renderer.shadowMap.needsUpdate=true;renderer.domElement.focus({preventScroll:true});renderNow();return true;},capturePNG(){renderNow();const canvas=doc.createElement('canvas');canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(canvas.width*.45,canvas.height*.42,0,canvas.width*.45,canvas.height*.42,Math.max(canvas.width,canvas.height)*.72);gradient.addColorStop(0,theme.backdrop?.inner??'#fbf9f5');gradient.addColorStop(1,theme.backdrop?.outer??'#e7dfd2');ctx.fillStyle=gradient;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(renderer.domElement,0,0);return canvas.toDataURL('image/png');},dispose(){if(disposed)return;disposed=true;active=false;elevatorSession=null;cabinGesture=null;if(frame)cancelAnimationFrame(frame);observer.disconnect();for(const remove of listeners)remove();cabinUI?.dispose();controller.dispose();ui.dispose();interactions.dispose();estate?.dispose();model.dispose();sun.shadow.dispose();master.shadow.dispose();renderer.dispose();renderer.forceContextLoss();host.remove();}};
}
function rendererIdentity(renderer){const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');return {vendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),userAgent:globalThis.navigator?.userAgent??null};}
