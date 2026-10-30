import * as THREE from 'three';
import {createRoomExpansion} from './home-room-expansion.js';
import {createEstateManor} from './home-estate-manor.js';
import {createLuxuryItem} from './home-luxury-models.js';
import {getFurniturePose,getWallMountTargets} from './home-engine.js';
import {getFloorBounds,getFloorRects,roomRect} from './home-layout.js';
import {getHomeRoamEntrance} from './home-roam-geometry.js';
import {createHomeRoamController} from './home-roam-controller.js';
import {createHomeRoamInteractions} from './home-roam-interactions.js';
import {createHomeRoamUI} from './home-roam-ui.js';
import {getHomeRoamCopy,resolveHomeRoamLocale} from './home-roam-copy.js';
import {createHomeRoamDaylight} from './home-roam-daylight.js';

const V=(p={})=>new THREE.Vector3(p.x??0,p.y??0,p.z??0);
const visible=node=>{for(let n=node;n;n=n.parent)if(!n.visible)return false;return true;};

/** A disposable rendering of the actual first-floor data and model builders.
 * No reference scene export, placement edit, command transport or saved state. */
export function buildHomeRoamScene({home,theme,maps={},robot=null}={}){
  if(theme?.id!=='warm'||!home)throw new TypeError('The viewing scene requires an existing Warm home.');
  const scene=new THREE.Scene(),interior=new THREE.Group();interior.name='roam-interior';scene.add(interior);
  const bounds=getFloorBounds(home),rects=getFloorRects(home),entry=getHomeRoamEntrance(home,{theme});
  const architecture=createRoomExpansion({...home,stairs:[],staircases:[],theme,maps,roam:true,roamEntrance:entry,includeGrid:false});interior.add(architecture);
  const manor=createEstateManor({rooms:home.rooms,floors:[home],theme,roam:true});manor.position.set(bounds.x,0,bounds.z);scene.add(manor);
  const furniture=[],ownedGeometries=new Set(),ownedMaterials=new Set();
  function own(group){group.traverse(n=>{if(n.geometry)ownedGeometries.add(n.geometry);for(const m of[].concat(n.material??[]))ownedMaterials.add(m);});return group;}
  for(const item of home.furniture??[]){const group=own(createLuxuryItem({...item,maps})),pose=getFurniturePose(home,item);group.position.set(pose.x,pose.y,pose.z);group.rotation.y=THREE.MathUtils.degToRad(pose.rotation);group.userData.furnitureId=item.id;interior.add(group);furniture.push({itemId:item.id,group});}
  // The live companion's pose is frozen by its owner. Copy geometry/materials
  // so temporary hover, animation and teardown cannot touch the live robot.
  function copyRobot(node){let n;if(node.isMesh)n=new THREE.Mesh(node.geometry.clone(),Array.isArray(node.material)?node.material.map(m=>m.clone()):node.material.clone());else n=new THREE.Group();n.name=node.name;n.position.copy(node.position);n.quaternion.copy(node.quaternion);n.scale.copy(node.scale);n.visible=node.visible;n.castShadow=node.castShadow;n.receiveShadow=node.receiveShadow;for(const child of node.children)n.add(copyRobot(child));return n;}
  if(robot){const model=own(copyRobot(robot));model.visible=true;model.userData.avatar=true;interior.add(model);}
  const ceilingLights=[];
  for(const ceiling of architecture.getRoamCeilings()){
    const point=ceiling.userData.point??{x:bounds.x,y:2.895,z:bounds.z};
    const disc=new THREE.Mesh(new THREE.CylinderGeometry(.26,.26,.035,32),new THREE.MeshStandardMaterial({color:'#fff3dd',emissive:'#ffe1b8',emissiveIntensity:.8,roughness:.45}));
    disc.name='roam-ceiling-light';disc.position.set(point.x,point.y-.3,point.z);disc.userData.roamCeilingLight=true;interior.add(disc);own(disc);
    const light=new THREE.PointLight('#ffe1b8',0,11,2);light.position.copy(disc.position);scene.add(light);
    ceilingLights.push({id:'ceiling:'+(ceiling.userData.roomId??ceilingLights.length),roomId:ceiling.userData.roomId,disc,light,on:true,enabled:true,setEnabled(value){this.enabled=this.on=!!value;}});
  }
  const ceilings=architecture.getRoamCeilings();for(const ceiling of ceilings){ceiling.material.emissive=new THREE.Color('#efe6d8');ceiling.material.emissiveIntensity=.32;}
  scene.updateMatrixWorld(true);const entrance=manor.getRoamEntry();
  const daylight=createHomeRoamDaylight({manor,bounds,entrance});scene.add(daylight.group);
  // Keep the same modeled hinge, leaf and arch visible from inside when the
  // exterior shell is hidden. attach preserves their authoritative world pose.
  const doorway=new THREE.Group();doorway.name='roam-doorway';
  entrance?.hinge?.parent?.matrixWorld.decompose(doorway.position,doorway.quaternion,doorway.scale);scene.add(doorway);doorway.updateMatrixWorld(true);
  if(entrance?.hinge)doorway.attach(entrance.hinge);
  if(entrance?.frame)doorway.attach(entrance.frame);scene.updateMatrixWorld(true);
  const wallGroups=new Map(),wallMeshes=architecture.getRoamWalls();
  for(const mesh of wallMeshes){const info=mesh.userData.roamWall;let row=wallGroups.get(info.id);if(!row){row={info,meshes:[],caps:[],attachments:[]};wallGroups.set(info.id,row);}row.meshes.push(mesh);const plane=new THREE.Plane(new THREE.Vector3(0,-1,0),1e6);for(const material of[].concat(mesh.material)){material.clippingPlanes=[plane];material.clipShadows=true;}row.plane=plane;}
  const mountTargets=new Map(getWallMountTargets(home).map(target=>[target.wallId,target]));
  for(const row of wallGroups.values()){
    const d=row.info,door=d.doorway,intervals=door?[{from:d.from,to:door.from},{from:door.to,to:d.to}]:[{from:d.from,to:d.to}];
    for(const interval of intervals){const len=interval.to-interval.from;if(len<=1e-5)continue;const alongX=d.alongAxis==='x',cap=new THREE.Mesh(new THREE.BoxGeometry(alongX?len:d.thickness,.045,alongX?d.thickness:len),new THREE.MeshStandardMaterial({color:'#4a3f37',roughness:.86}));cap.name='roam-orbit-cut-surface';cap.position.set(alongX?(interval.from+interval.to)/2:d.centerPlane,d.minY+.5+.0225,alongX?d.centerPlane:(interval.from+interval.to)/2);cap.visible=false;cap.userData.roamCutCap=true;interior.add(cap);own(cap);row.caps.push(cap);}
    architecture.traverse(n=>{if(n.userData.roamWallId===d.id)row.attachments.push(n);});
    for(const {itemId,group}of furniture){const item=home.furniture.find(i=>i.id===itemId),mount=item?.mount?.type==='wall'?mountTargets.get(item.mount.wallId):null;if(mount&&mount.axis===d.alongAxis&&Math.abs(mount.face-d.plane)<.35){const p=group.getWorldPosition(new THREE.Vector3()),along=p[d.alongAxis];if(along>=d.from-.1&&along<=d.to+.1)row.attachments.push(group);}}
  }
  let disposed=false;
  return {scene,interior,architecture,manor,doorway,daylight,furniture,ceilingLights,ceilings,entrance,bounds,rects,
    setOrbitCut(camera,target,enabled){let changed=false;for(const row of wallGroups.values()){const d=row.info,cut=!!enabled&&(camera.position[d.axis]-d.plane)*(target[d.axis]-d.plane)<-1e-5;if(row.cut===cut)continue;row.cut=cut;changed=true;for(const mesh of row.meshes)for(const material of[].concat(mesh.material))material.clippingPlanes[0].constant=cut?d.minY+.5:1e6;for(const cap of row.caps)cap.visible=cut;for(const node of row.attachments)node.visible=!cut;}return changed;},
    getWallState:()=>[...wallGroups.values()].map(r=>({id:r.info.id,cut:!!r.cut,axis:r.info.axis,plane:r.info.plane,capHeight:.045,bodyHeight:.5})),
    dispose(){if(disposed)return;disposed=true;daylight.dispose();architecture.dispose();manor.dispose();for(const g of ownedGeometries)g.dispose();for(const m of ownedMaterials)m.dispose();scene.clear();}
  };
}

/** The game camera and renderer are not repurposed. This whole temporary
 * experience is destroyed on exit or identity change, including light state. */
export function createHomeRoamExperience(options={}){
  const cleanup=[];
  try{return createRoamExperience(options,release=>cleanup.push(release));}
  catch(error){for(const release of cleanup.reverse())try{release();}catch{/* Preserve the construction error. */}throw error;}
}
function createRoamExperience({container,home,theme,maps,robot,lighting={},onExit=()=>{},onStateChange=()=>{},clock=()=>performance.now(),manualClock=false,pixelRatio,locale,outdoorPresentation=true}={},allocated=()=>{}){
  locale=resolveHomeRoamLocale(locale);const copy=getHomeRoamCopy(locale);
  const model=buildHomeRoamScene({home,theme,maps,robot}),scene=model.scene,doc=container.ownerDocument;allocated(()=>model.dispose());
  const host=doc.createElement('div');host.className='home-roam-layer';Object.assign(host.style,{position:'absolute',inset:'0',zIndex:'12',background:container.style.background||'radial-gradient(ellipse at 45% 42%,#fbf9f5,#e7dfd2)'});container.append(host);allocated(()=>host.remove());
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});allocated(()=>{renderer.dispose();renderer.forceContextLoss();});renderer.setPixelRatio(pixelRatio??Math.min(globalThis.devicePixelRatio||1,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.localClippingEnabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=lighting.toneMapping??THREE.NeutralToneMapping;renderer.toneMappingExposure=lighting.exposure??1.03;renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label',copy.canvasLabel);Object.assign(renderer.domElement.style,{width:'100%',height:'100%',display:'block',touchAction:'none'});host.prepend(renderer.domElement);
  const hemisphere=new THREE.HemisphereLight(lighting.sky??'#fff6ea',lighting.ground??'#e2dbcf',lighting.hemisphere??1.7);scene.add(hemisphere);
  const sun=new THREE.DirectionalLight(lighting.sunColor??'#fff0d8',lighting.sun??3.4),fill=new THREE.DirectionalLight(lighting.fillColor??'#dde7f2',lighting.fill??.9);sun.position.set(3,8,6).add(new THREE.Vector3(model.bounds.x,0,model.bounds.z));fill.position.set(-4,5,-4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0006;sun.shadow.normalBias=.035;scene.add(sun,fill,sun.target);allocated(()=>sun.shadow.dispose());sun.target.position.set(model.bounds.x,0,model.bounds.z);const reach=Math.max(model.bounds.width,model.bounds.depth)+2;Object.assign(sun.shadow.camera,{left:-reach,right:reach,top:reach,bottom:-reach,near:.1,far:70});sun.shadow.camera.updateProjectionMatrix();
  const master=new THREE.PointLight('#ffe1b8',0,11,2);master.castShadow=true;master.shadow.mapSize.set(1024,1024);master.shadow.bias=-.002;master.shadow.normalBias=.025;master.shadow.autoUpdate=false;scene.add(master);allocated(()=>master.shadow.dispose());
  const baseline={sun:sun.intensity,fill:fill.intensity,hemi:hemisphere.intensity,exposure:renderer.toneMappingExposure};
  const bodyBox=new THREE.Box3(new THREE.Vector3(model.bounds.minX,0,model.bounds.minZ),new THREE.Vector3(model.bounds.maxX,2.91,model.bounds.maxZ));
  const overviewBox=new THREE.Box3().setFromObject(model.manor);
  let active=false,disposed=false,frame=0,previousTime=null,hoverDoor=false,lastMode='',lastLight='',renderCount=0,renderCpu=0,realPrevious=null;
  const intervals=[],listeners=[],raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const invalidate=()=>{if(active&&!disposed&&!manualClock&&!frame)frame=requestAnimationFrame(renderNow);};
  let ui,interactions,controller;
  function stateChanged(state){if(disposed)return;ui?.update(state);onStateChange(state);invalidate();}
  controller=createHomeRoamController({element:renderer.domElement,bounds:overviewBox,interiorBounds:bodyBox,wallTop:2.91,entrance:model.entrance,containsInterior:p=>model.rects.some(r=>p.x>=r.minX&&p.x<=r.maxX&&p.z>=r.minZ&&p.z<=r.maxZ),now:clock,onChange:invalidate,onMode:stateChanged,onDoorAngle:value=>{if(model.entrance?.hinge)model.entrance.hinge.rotation.y=value;renderer.shadowMap.needsUpdate=true;invalidate();},onExit});
  allocated(()=>controller.dispose());
  ui=createHomeRoamUI({container:host,locale,onDisplayMode:value=>controller.setDisplayMode(value),onAutoRotate:value=>controller.setAutoRotate(value),onOverview:()=>controller.overview(),onLeave:()=>controller.leave()});
  allocated(()=>ui.dispose());
  interactions=createHomeRoamInteractions({root:model.interior,locale,rooms:home.rooms,ceilingLights:model.ceilingLights,onInvalidate:()=>{renderer.shadowMap.needsUpdate=true;invalidate();},onCeilingLightChange:()=>{lastLight='';invalidate();}});
  allocated(()=>interactions.dispose());
  allocated(()=>{for(const remove of listeners)remove();});
  const add=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));};
  function resize(){if(disposed)return;const width=host.clientWidth||container.clientWidth||1440,height=host.clientHeight||container.clientHeight||900;renderer.setSize(width,height,false);controller.resize(width,height);invalidate();}
  const observer=new ResizeObserver(resize);allocated(()=>observer.disconnect());observer.observe(container);resize();
  function prepareRay(event){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,controller.camera);scene.updateMatrixWorld(true);}
  function firstVisibleHit(){const meshes=[];scene.traverse(n=>{if(n.isMesh&&!n.userData.roamBackdrop&&visible(n))meshes.push(n);});return raycaster.intersectObjects(meshes,false).find(hit=>[].concat(hit.object.material??[]).some(m=>m.visible!==false&&(!m.transparent||m.opacity>0)))??null;}
  function reachableInteraction(){const hit=interactions.pick(raycaster),first=firstVisibleHit();return hit&&(!first||hit.distance<=first.distance+1e-4)?hit:null;}
  function doorHit(){if(controller.getState().view!=='exterior')return false;const first=firstVisibleHit();if(!first)return false;return first.object===model.entrance?.leaf||model.entrance?.leaf?.children.includes(first.object)||model.entrance?.handles?.includes(first.object);}
  function setDoorHover(value){if(hoverDoor===value)return;hoverDoor=value;model.entrance?.leaf?.traverse(n=>{if(n.isMesh)for(const m of[].concat(n.material??[]))if(m.emissive)m.emissive.set(value?'#6b3a17':'#000000');});invalidate();}
  function hover(event){if(!active||controller.getState().transition)return;prepareRay(event);const state=controller.getState();if(state.phase==='orbit'){const hit=doorHit();setDoorHover(hit);interactions.clearHover();renderer.domElement.style.cursor=hit?'pointer':'grab';ui.setHover(hit?{text:copy.doorTip,x:event.clientX,y:event.clientY}:null);}else{setDoorHover(false);const hit=reachableInteraction();if(hit)interactions.hover(raycaster);else interactions.clearHover();renderer.domElement.style.cursor=hit?'pointer':'grab';ui.setHover(hit?{text:hit.label,x:event.clientX,y:event.clientY}:null);}}
  function click(event){if(!active||event.button!==0||!controller.isPointerClick(event)||controller.getState().transition)return;interactions.unlockAudio();prepareRay(event);const state=controller.getState();if(state.phase==='orbit'){if(doorHit()){setDoorHover(false);ui.setHover(null);controller.enterDoor();}}else if(state.phase==='free'){const target=reachableInteraction();if(target){interactions.activate(target.target);return;}const hit=firstVisibleHit();if(hit)controller.moveTo(hit.point,{floor:hit.object.userData.roomPart==='floor',direction:raycaster.ray.direction});}invalidate();}
  add(renderer.domElement,'pointermove',hover);add(renderer.domElement,'pointerup',click);add(renderer.domElement,'pointerleave',()=>{setDoorHover(false);interactions.clearHover();ui.setHover(null);});add(renderer.domElement,'contextmenu',event=>event.preventDefault());
  function applyLighting(state){const indoors=state.sceneMode==='in',peek=state.sceneMode==='ext+in',key=[indoors,peek].join(':');if(lastMode!==state.sceneMode){model.manor.visible=state.sceneMode==='ext'||peek;model.daylight.setVisible(indoors&&outdoorPresentation);model.doorway.visible=state.sceneMode!=='orbit-in';model.interior.visible=state.sceneMode!=='ext';for(const c of model.ceilings)c.visible=indoors||peek;for(const l of model.ceilingLights)l.disc.visible=indoors||peek;lastMode=state.sceneMode;renderer.shadowMap.needsUpdate=true;}
    const p=controller.camera.position,current=(indoors?model.ceilingLights.find(l=>{const room=home.rooms.find(r=>r.id===l.roomId),r=room&&roomRect(room);return r&&p.x>=r.minX&&p.x<=r.maxX&&p.z>=r.minZ&&p.z<=r.maxZ;}):model.ceilingLights.find(l=>l.roomId===model.entrance?.roomId))??model.ceilingLights[0];
    const lightKey=key+':'+current?.id+':'+model.ceilingLights.map(l=>l.enabled?'1':'0').join('');if(lightKey!==lastLight){lastLight=lightKey;sun.intensity=indoors?0:baseline.sun;fill.intensity=indoors?0:baseline.fill;hemisphere.intensity=indoors?1.05:baseline.hemi;renderer.toneMappingExposure=indoors?1.22:baseline.exposure;
      for(const l of model.ceilingLights){const enabled=l.enabled!==false;l.light.intensity=(indoors||peek)&&enabled?(l===current?(indoors?0:24*.7):24*.75*(peek ? .7 : 1)):0;l.disc.material.emissiveIntensity=enabled&&(indoors||peek) ? .8 : 0;}
      master.position.copy(current?.light.position??new THREE.Vector3());master.intensity=indoors&&current?.enabled!==false?24:0;master.shadow.autoUpdate=indoors;master.shadow.needsUpdate=indoors||!master.shadow.map;sun.shadow.autoUpdate=!indoors;sun.shadow.needsUpdate=!indoors;renderer.shadowMap.autoUpdate=indoors;renderer.shadowMap.needsUpdate=true;
    }
    if(model.setOrbitCut(controller.camera,controller.controls.target,state.sceneMode==='orbit-in'))renderer.shadowMap.needsUpdate=true;
  }
  function renderNow(){if(frame)cancelAnimationFrame(frame);frame=0;if(!active||disposed)return;const time=clock(),dt=previousTime===null?0:Math.min(.1,Math.max(0,(time-previousTime)/1000));previousTime=time;const moving=controller.tick(time),animating=interactions.tick(dt),state=controller.getState();applyLighting(state);scene.updateMatrixWorld(true);const start=performance.now();renderer.render(scene,controller.camera);renderCpu=performance.now()-start;renderCount++;const now=performance.now();if(!manualClock&&realPrevious!==null){intervals.push(now-realPrevious);if(intervals.length>300)intervals.shift();}realPrevious=now;if((moving||animating)&&!doc.hidden)invalidate();}

  function getDiagnostics(){return {active,locale,outdoorPresentation:{enabled:outdoorPresentation,visible:model.daylight.group.visible,independentOfExposure:true,additionalLights:0},phase:controller.getState(),camera:controller.getCameraPose(),entrance:{roomId:model.entrance?.roomId,center:model.entrance?.center,outward:model.entrance?.outward,width:model.entrance?.width,height:model.entrance?.height},walls:model.getWallState(),interactions:interactions.getState(),lights:{sun:sun.intensity,fill:fill.intensity,hemisphere:hemisphere.intensity,exposure:renderer.toneMappingExposure,master:master.intensity,masterRoom:model.ceilingLights.find(l=>l.light.position.distanceTo(master.position)<1e-6)?.roomId,shadowAutoUpdate:master.shadow.autoUpdate,ceilings:model.ceilingLights.map(l=>({id:l.id,on:l.enabled,intensity:l.light.intensity}))},render:{...renderer.info.render,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,frames:renderCount,lastCpuMs:renderCpu,manualClock,meanFrameIntervalMs:intervals.length?intervals.reduce((a,b)=>a+b,0)/intervals.length:null,fps:intervals.length?1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length):null,width:renderer.domElement.width,height:renderer.domElement.height,dpr:renderer.getPixelRatio()},rendererIdentity:rendererIdentity(renderer)};}
  return {scene,renderer,controller,interactions,model,renderNow,getDiagnostics,start(){if(disposed)return false;active=true;ui.setVisible(true);controller.start();renderer.shadowMap.needsUpdate=true;renderer.domElement.focus({preventScroll:true});renderNow();return true;},capturePNG(){renderNow();const canvas=doc.createElement('canvas');canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(canvas.width*.45,canvas.height*.42,0,canvas.width*.45,canvas.height*.42,Math.max(canvas.width,canvas.height)*.72);gradient.addColorStop(0,theme.backdrop?.inner??'#fbf9f5');gradient.addColorStop(1,theme.backdrop?.outer??'#e7dfd2');ctx.fillStyle=gradient;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(renderer.domElement,0,0);return canvas.toDataURL('image/png');},dispose(){if(disposed)return;disposed=true;active=false;if(frame)cancelAnimationFrame(frame);observer.disconnect();for(const remove of listeners)remove();controller.dispose();ui.dispose();interactions.dispose();model.dispose();sun.shadow.dispose();master.shadow.dispose();renderer.dispose();renderer.forceContextLoss();host.remove();}};
}
function rendererIdentity(renderer){const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');return {vendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),userAgent:globalThis.navigator?.userAgent??null};}
