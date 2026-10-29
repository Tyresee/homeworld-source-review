import * as THREE from 'three';
import { createHomeAvatar, poseHomeAvatar, disposeHomeAvatar } from './home-avatar-model.js';
import { findAvatarSpawn, planAvatarWalk, listAvatarInteractions, getAvatarInteractionTargetLabel } from './home-avatar-navigation.js';

/** A single actor, with animation only while moving or performing an action.
 * Coordinates and animation are transient; clothing ownership lives in commerce. */
export function createAvatarController({ parent, requestRender, onStatus }) {
  const group = new THREE.Group(); group.name = 'home-player'; parent.add(group);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.24, 24), new THREE.MeshBasicMaterial({ color:'#64846e',transparent:true,opacity:.19,depthWrite:false }));
  shadow.rotation.x=-Math.PI/2; shadow.position.y=.086; group.add(shadow);
  const marker = new THREE.Mesh(new THREE.RingGeometry(.12,.18,24),new THREE.MeshBasicMaterial({color:'#4b997f',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
  marker.rotation.x=-Math.PI/2;marker.position.y=.09;marker.visible=false;parent.add(marker);
  let avatar=null, home=null, floor=0, appearanceKey='', visible=true, disposed=false, frame=0;
  let point=null, safePoint=null, rotation=0, action='idle', route=null, pendingAction=null, actionUntil=0, lastTime=0, elapsed=0;
  const floorPositions=new Map();
  const status=(message,error=false)=>onStatus?.({message,error,action});
  function present() {
    if(!avatar||!point)return;
    avatar.position.set(point.x,point.y??.08,point.z);avatar.rotation.y=rotation;
    poseHomeAvatar(avatar,{action,time:elapsed});
    shadow.position.x=point.x;shadow.position.z=point.z;shadow.visible=!['sit','lie'].includes(action);
    requestRender();
  }
  function cancelAnimation(){if(frame)cancelAnimationFrame(frame);frame=0;route=null;pendingAction=null;actionUntil=0;marker.visible=false;}
  function stand() {
    cancelAnimation();
    if(safePoint)point={...safePoint,y:.08};
    action='idle';elapsed=0;present();if(point)status("DisplayText0219, DisplayText0220.");
  }
  function finishAction(descriptor) {
    action=descriptor.kind;elapsed=0;
    if(descriptor.pose){point={...descriptor.pose};rotation=(descriptor.pose.rotation??0)*Math.PI/180;}
    status(descriptor.label);
    if(!['sit','lie'].includes(action)){actionUntil=performance.now()+2400;schedule();}
    present();
  }
  function tick(now) {
    frame=0;if(disposed||!visible||document.hidden)return;
    const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;elapsed+=dt;
    if(route?.length) {
      let distance=dt*1.7;
      while(route.length&&distance>0){
        const target=route[0],dx=target.x-point.x,dz=target.z-point.z,length=Math.hypot(dx,dz);
        if(length<1e-6){route.shift();continue;}
        rotation=Math.atan2(dx,dz);
        const step=Math.min(distance,length);point.x+=dx/length*step;point.z+=dz/length*step;distance-=step;
        safePoint={x:point.x,z:point.z};
        if(step>=length-1e-6)route.shift();
      }
      if(!route.length){
        route=null;marker.visible=false;floorPositions.set(floor,{...safePoint});
        const next=pendingAction;pendingAction=null;
        if(next)finishAction(next);else{action='idle';status("DisplayText0221, DisplayText0222.");}
      }
    } else if(actionUntil&&now>=actionUntil){actionUntil=0;action='idle';point={...safePoint,y:.08};status("DisplayText0223, DisplayText0224.");}
    present();if(route||actionUntil)schedule();
  }
  function schedule(){if(!frame&&visible&&!document.hidden){lastTime=performance.now();frame=requestAnimationFrame(tick);}}
  function travel(to,descriptor=null) {
    if(!home||!point||!visible)return {ok:false,error:"DisplayText0225."};
    // Leaving a seat starts at its last reachable approach position.
    const from=safePoint??point,result=planAvatarWalk(home,from,to);
    if(!result.ok){status(result.error,true);return result;}
    stand();action='walk';route=result.path.map(p=>({...p}));pendingAction=descriptor;
    marker.position.set(to.x,.09,to.z);marker.visible=true;
    status(descriptor?`DisplayText0226 · ${descriptor.label}`:"DisplayText0226…");schedule();return {ok:true};
  }
  function setWorld(next,index=0) {
    if(home===next&&floor===index)return;
    if(safePoint)floorPositions.set(floor,{...safePoint});
    cancelAnimation();home=next;floor=index;action='idle';elapsed=0;
    safePoint=findAvatarSpawn(home,floorPositions.get(floor));point=safePoint?{...safePoint,y:.08}:null;
    group.visible=visible&&!!point;
    if(!point)status("DisplayText0227, DisplayText0228.",true);
    else present();
  }
  function setAvatar(value) {
    const key=JSON.stringify(value);if(!value||key===appearanceKey)return;
    appearanceKey=key;
    if(avatar){group.remove(avatar);disposeHomeAvatar(avatar);}
    avatar=createHomeAvatar(value);avatar.name='my-avatar';
    avatar.traverse(node=>{if(node.isMesh){node.castShadow=false;node.userData.avatar=true;node.userData.surfaceId='avatar';}});
    group.add(avatar);present();
  }
  function visibilityChanged(){if(document.hidden)stand();}
  document.addEventListener('visibilitychange',visibilityChanged);
  return {
    group,setWorld,setAvatar,stand,
    setVisible(value){visible=Boolean(value);if(!visible)stand();group.visible=visible&&!!point;marker.visible=false;requestRender();},
    hit(raycaster){if(!group.visible||!avatar)return null;const meshes=[];avatar.traverseVisible(node=>{if(node.isMesh)meshes.push(node);});return raycaster.intersectObjects(meshes,false)[0]??null;},
    walk:to=>travel(to),
    targetLabel:targetId=>home?getAvatarInteractionTargetLabel(home,targetId):null,
    interactions(targetId){return home?listAvatarInteractions(home,targetId,{from:safePoint}):[];},
    interact(targetId,id){
      const descriptor=home&&listAvatarInteractions(home,targetId,{from:safePoint}).find(value=>value.id===id);
      if(!descriptor)return {ok:false,error:"DisplayText0229, DisplayText0230."};
      return travel(descriptor.approach,descriptor);
    },
    wave(){if(!point)return;stand();action='wave';actionUntil=performance.now()+1800;elapsed=0;status("DisplayText0231, DisplayText0232!");schedule();},
    getAnchor(){return point?{x:point.x,y:(point.y??.08)+.8,z:point.z}:null;},
    dispose(){disposed=true;cancelAnimation();document.removeEventListener('visibilitychange',visibilityChanged);if(avatar)disposeHomeAvatar(avatar);shadow.geometry.dispose();shadow.material.dispose();marker.geometry.dispose();marker.material.dispose();group.removeFromParent();marker.removeFromParent();},
  };
}
