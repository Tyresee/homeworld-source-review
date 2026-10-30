import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createHomeScene} from './home-scene.js';
import {getFloorHomes} from './home-commerce.js';
import {createStudentHomeRobotController} from './student-home-robot-controller.js';
import {createStudentHomeObjectRuntime} from './student-home-object-runtime.js';
import {createCushionPresentation} from './student-home-cushion-presentation.js';

function disposeSource(source){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  source.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of [].concat(node.material??[])){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
  geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());
}

/** A rendering adapter only. Account-owned commerce is supplied by the server;
 * this module never reads local demo saves or creates a wallet/inventory. */
export async function createStudentHomeWorld({container,warmUI=false,onRoamChange,onEntranceClick,onContextMenu,onDrag,onOutdoorMove,onPlacementPreview,onPlacementCommit,onPlacementCancel,onPlacementReject,onStatus,onPalette,onStoreyChange,onSelect,onObjectClick,onCancel,onPanStart,onObjectEdit,onAvatarClick,onViewChange,onRobotActivityChange,onObjectAction,onStageCameraChange}) {
  const source=(await new GLTFLoader().loadAsync(new URL('../assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url).href)).scene;
  let scene,objectRuntime,commerce=null,avatar=null,robotActivity=null,activeFloor=0,view='interior',disposed=false;
  let roamPreviousView='interior',roamEpoch=0;
  function roamChanged(snapshot){
    if(disposed)return;
    if(snapshot.active){if(view!=='roam')roamPreviousView=snapshot.previousView??view;view='roam';objectRuntime?.setVisible(false);}
    else if(view==='roam'){view=snapshot.previousView??roamPreviousView;objectRuntime?.setVisible(view==='interior');}
    onRoamChange?.({...snapshot,previousView:roamPreviousView});onViewChange?.(view);
  }
  const cushions=createCushionPresentation({getModels:()=>scene?.getFurnitureModels?.()??[],requestRender:()=>scene?.requestObjectRender?.()});
  try{
    scene=createHomeScene({container,onRoamChange:roamChanged,onStageCameraChange,onContextMenu,onDrag,onOutdoorMove,onPlacementPreview,onPlacementCommit,onPlacementCancel,onPlacementReject,onStoreyChange:index=>{if(view==='interior')onStoreyChange?.(index);},onSelect,onObjectClick,onCancel,onPanStart,onObjectEdit,
      avatarFactory:options=>createStudentHomeRobotController({...options,source}),onAvatarStatus:onStatus,onAvatarActivityChange:onRobotActivityChange,
      onAvatarObjectAction:request=>onObjectAction?.(request),onAvatarObjectPresentation:request=>{if(Object.hasOwn(request,'remoteHeld'))objectRuntime?.setRemoteHeld(request.id,request.remoteHeld);if(Object.hasOwn(request,'cushionTidy'))cushions.apply(request);},onBeforeModelRelease:group=>{cushions.release(group);objectRuntime?.releaseModel(group);},floorClickWalk:true,
      onAvatarClick:request=>{if(onAvatarClick)onAvatarClick(request);else if(request.data?.surfaceId==='avatar'){if(!onObjectClick)onPalette?.({x:request.clientX,y:request.clientY});}else if(request.worldPoint)scene.walkAvatar(request.worldPoint);},
      // Only a completed click on the actual Warm entrance requests a visit.
      // Roofs and outdoor double-clicks retain their existing focus behavior.
      onEntranceClick:request=>{if(warmUI&&!disposed&&commerce&&view==='estate')return onEntranceClick?.(request);},
      onEstateFocus:id=>scene.focusEstate(id),onEstateViewChange:()=>onViewChange?.(view),
    });
  }catch(error){disposeSource(source);throw error;}
  objectRuntime=createStudentHomeObjectRuntime({requestRender:()=>scene.requestObjectRender?.()});
  const canvas=container.querySelector('canvas');canvas.tabIndex=0;
  canvas.setAttribute('aria-label',"DisplayText4200: DisplayText4201, DisplayText4202, DisplayText4203, DisplayText4164, DisplayText4204.");
  function exitRoam(){roamEpoch++;scene.exitRoam?.();if(view==='roam')roamChanged({active:false,phase:'inactive',previousView:roamPreviousView});}
  async function enterRoam({enterDoor=false}={}){
    if(!warmUI||disposed||!commerce||typeof scene.enterRoam!=='function')return false;
    if(enterDoor&&view!=='estate')return false;
    if(view==='roam')return true;const epoch=++roamEpoch;roamPreviousView=view;
    const result=await scene.enterRoam({enterDoor:enterDoor===true});if(disposed||epoch!==roamEpoch)return false;
    return result!==false&&result?.ok!==false;
  }
  function setView(next){if(!['interior','estate','building'].includes(next)||disposed)return;exitRoam();view=next;scene.setView(next);objectRuntime.setVisible(next==='interior');if(commerce)objectRuntime.sync(commerce,scene.getFurnitureModels?.()??[],activeFloor);onViewChange?.(next);}
  function setObjectStates(next){if(disposed||!next)return;commerce=next;scene.setObjectContext?.(next);objectRuntime.sync(next,scene.getFurnitureModels?.()??[],activeFloor);}
  function setCommerce(next,nextAvatar=avatar,index=activeFloor,activity=null){
    if(disposed||!next?.home)throw new TypeError('A server-owned home is required.');
    exitRoam();
    const floors=getFloorHomes(next);if(!Number.isInteger(index)||!floors[index])index=0;
    commerce=next;avatar=nextAvatar;robotActivity=activity;activeFloor=index;canvas.hidden=false;
    scene.setObjectContext?.(next);scene.setState(floors[index],{floors,activeFloor:index});scene.setOutdoorState(next);scene.setAvatar({...avatar,equipped:next.avatar?.equipped??{},activity:robotActivity});
    objectRuntime.sync(next,scene.getFurnitureModels?.()??[],activeFloor);
    scene.selectSurface('floor.main');scene.setTool('move');
  }
  function setPreview(home){
    if(!commerce||disposed)return;const floors=getFloorHomes(commerce).map((floor,index)=>index===activeFloor?home:floor);
    scene.setState(home,{floors,activeFloor});objectRuntime.sync(commerce,scene.getFurnitureModels?.()??[],activeFloor);
  }
  return {...scene,getRobotSource:()=>source,setCommerce,setObjectStates,setPreview,setView,getView:()=>view,enterRoam,exitRoam,isRoaming:()=>view==='roam',
    demonstrateObject:id=>objectRuntime.demonstrate(id),unlockObjectAudio:()=>objectRuntime.unlockAudio(),getObjectStats:()=>objectRuntime.getStats(),
    captureRobotActivity(options){return scene.captureRobotActivity?.(options);},
    clearRobotAccountBinding(){scene.clearRobotAccountBinding?.();},
    setRobotActivity(activity){robotActivity=activity;scene.setAvatar({...avatar,equipped:commerce?.avatar?.equipped??{},activity:robotActivity});},
    palette(colors){if(avatar)avatar={...avatar,colors:{...colors}};scene.setAvatar({...avatar,colors,equipped:commerce?.avatar?.equipped??{},activity:robotActivity});},
    reset(){if(view!=='roam')scene.setView(view);},
    clear(){exitRoam();scene.captureRobotActivity?.({emit:true});robotActivity=null;commerce=null;cushions.clear();objectRuntime.clear();scene.cancelDrag();scene.cancelPlacement();scene.hideAvatar();canvas.hidden=true;const labels=container.querySelector('.house-floor-labels');if(labels)labels.hidden=true;},
    dispose(){if(disposed)return;exitRoam();disposed=true;cushions.clear();objectRuntime.dispose();scene.dispose();disposeSource(source);},
  };
}
