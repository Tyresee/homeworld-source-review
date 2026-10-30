import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createRoomExpansion} from './home-room-expansion.js';
import {roomRect} from './home-layout.js';
import {createRobotAvatar,poseRobotAvatar,setRobotPalette,disposeRobotAvatar} from './robot-avatar.js';
import {getHomeTheme} from './home-theme.js';

const WALK_HEIGHT=.07;
/** The account house currently has one convex, empty room. Keep the complete
 * walking pose inside its walls, rather than allowing the robot's center to
 * reach the edge. Reject invalid/off-floor targets, including public callers. */
export function studentHomeMoveTarget(world,rect,radius=.48){
  if(!world||!rect||![world.x,world.y,world.z,rect.minX,rect.minZ,rect.width,rect.depth,radius].every(Number.isFinite)
    ||radius<0||Math.abs(world.y-WALK_HEIGHT)>.12)return null;
  const margin=Math.max(.48,radius+.18),maxX=rect.minX+rect.width,maxZ=rect.minZ+rect.depth;
  if(rect.width<=margin*2||rect.depth<=margin*2||world.x<rect.minX||world.x>maxX||world.z<rect.minZ||world.z>maxZ)return null;
  return {x:THREE.MathUtils.clamp(world.x,rect.minX+margin,maxX-margin),y:WALK_HEIGHT,z:THREE.MathUtils.clamp(world.z,rect.minZ+margin,maxZ-margin)};
}

/** A wall or window in front of the floor blocks the pick. Outdoor background
 * still opens a general menu, but never becomes a walkable virtual plane. */
export function pickStudentHomeContext(raycaster,{room,robot,rect}){
  const first=raycaster.intersectObjects([room,robot].filter(Boolean),true)[0];
  if(first){
    for(let node=first.object;node;node=node.parent)if(node===robot)return {kind:'robot',world:null};
    const part=first.object.userData.roomPart,normal=first.face?.normal.clone().transformDirection(first.object.matrixWorld);
    if((part==='floor'||part==='zones')&&normal?.y>=.8){
      const hit=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-WALK_HEIGHT),new THREE.Vector3());
      if(hit&&studentHomeMoveTarget(hit,rect,robot?.userData.radius??.48))return {kind:'floor',world:{x:hit.x,y:WALK_HEIGHT,z:hit.z}};
    }
  }
  return {kind:'background',world:null};
}

// Only server-owned starter geometry and avatar colors enter this view. Legacy demo
// wallet, save, furniture and construction state are deliberately not dependencies.
export function createStudentHomeScene(stage,{onRobot=()=>{},onContextMenu}={}) {
  const lighting=getHomeTheme().lighting.student??{};
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=lighting.toneMapping==='neutral'?THREE.NeutralToneMapping:THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=lighting.exposure??1.12;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label',"DisplayText4161: DisplayText4162, DisplayText4163, DisplayText4164, DisplayText4165.");stage.prepend(canvas);
  const scene=new THREE.Scene(),display=new THREE.Group();scene.add(display);
  const roomEnvironment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(roomEnvironment,.04);
  scene.environment=environment.texture;scene.environmentIntensity=.55;roomEnvironment.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(lighting.hemisphere?.sky??'#fff8e9',lighting.hemisphere?.ground??'#a4b899',lighting.hemisphere?.intensity??1.6));
  const sun=new THREE.DirectionalLight(lighting.sun?.color??'#fff2d6',lighting.sun?.intensity??2.5);sun.position.set(-4,8,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  if(lighting.shadowRadius!==undefined)sun.shadow.radius=lighting.shadowRadius;
  Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:35});sun.shadow.normalBias=.02;sun.shadow.bias=-.00015;scene.add(sun);
  const fill=new THREE.DirectionalLight(lighting.fill?.color??'#d9eaf5',lighting.fill?.intensity??.8);fill.position.set(4,4,-5);scene.add(fill);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.ShadowMaterial({color:lighting.contactShadow??'#64744b',opacity:.15}));ground.rotation.x=-Math.PI/2;ground.position.y=-.25;ground.receiveShadow=true;scene.add(ground);
  const camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,100);
  const controls=new OrbitControls(camera,canvas);controls.enableRotate=false;controls.enableDamping=false;controls.screenSpacePanning=true;
  controls.minZoom=.55;controls.maxZoom=2.5;controls.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:null};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  let room,robot,source,sourcePromise,rect,frame=0,last=0,motion=null,token=0,space=false,down=null,dead=false;
  function requestRender(){if(!dead&&!frame&&!document.hidden)frame=requestAnimationFrame(render);}
  function render(now){
    frame=0;if(dead||document.hidden)return;const dt=last?Math.min((now-last)/1000,.05):0;last=now;
    if(robot&&motion){
      motion.time+=dt;
      if(motion.kind==='walk'){
        const delta=motion.target.clone().sub(robot.position),distance=delta.length();
        if(distance<.025){robot.position.copy(motion.target);motion=null;poseRobotAvatar(robot,{action:'idle',time:0});}
        else{robot.rotation.y=Math.atan2(delta.x,delta.z);robot.position.addScaledVector(delta.normalize(),Math.min(distance,dt*1.7));poseRobotAvatar(robot,{action:'walk',time:motion.time});}
      }else if(motion.time>2){motion=null;poseRobotAvatar(robot,{action:'idle',time:0});}
      else poseRobotAvatar(robot,{action:'wave',time:motion.time});
      renderer.shadowMap.needsUpdate=true;
    }
    renderer.render(scene,camera);if(motion)requestRender();
  }
  function resize(){const {width,height}=stage.getBoundingClientRect(),aspect=width/Math.max(1,height),half=Math.max(4.6,5.1/aspect);renderer.setSize(width,height,false);camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();requestRender();}
  function reset(){camera.zoom=1;controls.target.set(0,.7,0);camera.position.set(9,8.6,11).add(controls.target);controls.update();resize();}
  function clear(){++token;motion=null;rect=null;if(robot){disposeRobotAvatar(robot);robot=null;}if(room){room.removeFromParent();room.dispose();room=null;}renderer.shadowMap.needsUpdate=true;requestRender();}
  async function show(home){
    clear();const own=token,floor=theme.id==='warm'&&home.commerce?.home?home.commerce.home:home.house.floors[0];rect=theme.id==='warm'?roomRect(floor.rooms[0]):{...floor.rooms[0].bounds};
    room=createRoomExpansion({rooms:floor.rooms,slab:floor.slab,profile:theme.id==='warm'?(floor.profile??'upper'):'upper',includeGrid:false,theme,surfaces:floor.surfaces});display.add(room);reset();
    sourcePromise??=new GLTFLoader().loadAsync(new URL('../assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url).href).then(gltf=>source=gltf.scene).catch(error=>{sourcePromise=null;throw error;});
    const model=await sourcePromise;if(dead||own!==token)return;
    robot=createRobotAvatar(model);robot.position.set(0,.07,.45);robot.rotation.y=.25;robot.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});display.add(robot);
    setRobotPalette(robot,home.avatar.colors);poseRobotAvatar(robot,{action:'idle',time:0});renderer.shadowMap.needsUpdate=true;requestRender();
  }
  function palette(colors){if(robot){setRobotPalette(robot,colors);requestRender();}}
  function ray(event){const b=canvas.getBoundingClientRect();pointer.set((event.clientX-b.left)/b.width*2-1,-(event.clientY-b.top)/b.height*2+1);raycaster.setFromCamera(pointer,camera);}
  function contextMenu(event){
    event.preventDefault();down=null;ray(event);
    const context={...pickStudentHomeContext(raycaster,{room,robot,rect}),screen:{x:event.clientX,y:event.clientY}};
    if(onContextMenu)onContextMenu(context);else if(context.kind==='robot')onRobot(context.screen);
  }
  function pointerDown(event){
    // Capture before OrbitControls: macOS Control-click must not start a pan,
    // even when Space is held. A normal right/two-finger click never pans.
    if(event.button===2||(event.button===0&&event.ctrlKey)){down=null;event.stopImmediatePropagation();return;}
    if(event.button!==0||space){down=null;return;}down={x:event.clientX,y:event.clientY};
  }
  function moveTo(world){
    if(!robot||!rect||dead)return false;
    const target=studentHomeMoveTarget(world,rect,robot.userData.radius);if(!target)return false;
    motion={kind:'walk',target:new THREE.Vector3(target.x,target.y,target.z),time:0};last=0;requestRender();return true;
  }
  function pointerUp(event){
    const start=down;down=null;if(!start||event.button!==0||space||!robot||!rect||Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)return;
    ray(event);const context=pickStudentHomeContext(raycaster,{room,robot,rect});if(context.kind==='floor')moveTo(context.world);
  }
  function releaseSpace(){space=false;controls.mouseButtons.LEFT=null;canvas.style.cursor='';down=null;}
  function keyDown(event){if(event.target.closest?.('input,textarea,button,a,[contenteditable=true]'))return;
    if(event.target===canvas&&(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))){const b=canvas.getBoundingClientRect();contextMenu({clientX:b.left+b.width/2,clientY:b.top+b.height/2,preventDefault:()=>event.preventDefault()});return;}
    if(event.code==='Space'){event.preventDefault();space=true;controls.mouseButtons.LEFT=THREE.MOUSE.PAN;canvas.style.cursor='grab';}
    if(event.target===canvas&&['+','=','-','_'].includes(event.key)){event.preventDefault();camera.zoom=THREE.MathUtils.clamp(camera.zoom*(['+','='].includes(event.key)?1.15:1/1.15),.55,2.5);camera.updateProjectionMatrix();requestRender();}}
  function keyUp(event){if(event.code==='Space')releaseSpace();}
  function visibility(){last=0;if(document.hidden){cancelAnimationFrame(frame);frame=0;releaseSpace();}else requestRender();}
  controls.addEventListener('change',requestRender);canvas.addEventListener('contextmenu',contextMenu);canvas.addEventListener('pointerdown',pointerDown,true);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',releaseSpace);
  addEventListener('keydown',keyDown);addEventListener('keyup',keyUp);addEventListener('blur',releaseSpace);document.addEventListener('visibilitychange',visibility);
  const observer=new ResizeObserver(resize);observer.observe(stage);reset();
  function dispose(){if(dead)return;clear();dead=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();removeEventListener('keydown',keyDown);removeEventListener('keyup',keyUp);removeEventListener('blur',releaseSpace);document.removeEventListener('visibilitychange',visibility);ground.geometry.dispose();ground.material.dispose();environment.dispose();sun.shadow.dispose();
    sourcePromise?.then(()=>{const geometries=new Set(),materials=new Set();source?.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const mat of(Array.isArray(node.material)?node.material:[node.material]).filter(Boolean))materials.add(mat);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}).catch(()=>{});renderer.dispose();canvas.remove();}
  return{show,clear,palette,reset,moveTo,dispose,wave(){if(robot){motion={kind:'wave',time:0};last=0;requestRender();}}};
}
