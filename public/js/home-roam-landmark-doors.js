import * as THREE from 'three';
import {getHomeRoamCopy} from './home-roam-copy.js';

const visible=node=>{for(let p=node;p;p=p.parent)if(!p.visible)return false;return true;};
const Y=new THREE.Vector3(0,1,0);

/** Visit-only door state on the actual purchased outdoor models. The builder
 * owns geometry/materials; this controller only turns its authored hinge. */
export function createHomeRoamLandmarkDoors({root,locale,onInvalidate=()=>{}}={}){
  if(!root?.isObject3D)throw new TypeError('An outdoor scene root is required');
  const copy=getHomeRoamCopy(locale),targets=[],byMesh=new WeakMap(),animations=new Set();
  let disposed=false,hovered=null,muted=false;
  root.traverse(hinge=>{
    if(hinge.userData.landmarkDoor!=='greenhouse')return;
    const meshes=[];hinge.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.landmarkDoorPart)meshes.push(mesh);});
    if(!meshes.length)return;
    const sourceId=meshes[0].userData.outdoorOwnedId??`greenhouse-${targets.length}`;
    const target={id:`outdoor:${sourceId}:door:${targets.length}`,type:'landmark-door',kind:'greenhouse',sourceId,storey:0,
      hinge,meshes,rest:hinge.quaternion.clone(),on:false,progress:0,busy:false,tween:null,
      label(){return this.on?copy.greenhouseClose:copy.greenhouseOpen;}};
    targets.push(target);for(const mesh of meshes)byMesh.set(mesh,target);
  });
  function pick(raycaster){
    if(disposed||!raycaster?.intersectObjects)return null;
    root.updateWorldMatrix(true,true);
    // Select only an actually visible door surface, never a pane behind a
    // roof/window/another outdoor object. The world also checks house occlusion.
    const first=raycaster.intersectObject(root,true).find(hit=>visible(hit.object)&&[].concat(hit.object.material??[]).some(m=>m.visible!==false&&(!m.transparent||m.opacity>0)));
    const target=first&&byMesh.get(first.object);
    return target?{target,object:first.object,point:first.point,distance:first.distance,label:target.label()}:null;
  }
  function clearHover(){if(hovered){hovered=null;onInvalidate();}}
  function hover(raycaster){const hit=pick(raycaster),next=hit?.target??null;if(next!==hovered){hovered=next;onInvalidate();}return hit;}
  function activate(value){
    const target=typeof value==='string'?targets.find(t=>t.id===value):value;
    if(disposed||!targets.includes(target))return false;
    target.on=!target.on;target.tween={from:target.progress,to:target.on?1:0,elapsed:0};animations.add(target);onInvalidate();return true;
  }
  function tick(delta){
    if(disposed)return false;
    const hadAnimation=animations.size>0,dt=Number.isFinite(delta)?Math.max(0,Math.min(.1,delta)):0;
    for(const target of animations){
      const tween=target.tween;tween.elapsed=Math.min(.55,tween.elapsed+dt);
      const u=tween.elapsed/.55,ease=u*u*(3-2*u);target.progress=tween.from+(tween.to-tween.from)*ease;
      target.hinge.quaternion.copy(target.rest).multiply(new THREE.Quaternion().setFromAxisAngle(Y,-Math.PI/2*target.progress));
      if(u===1){target.tween=null;animations.delete(target);}
    }
    return hadAnimation;
  }
  function dispose(){if(disposed)return;clearHover();disposed=true;animations.clear();for(const t of targets){t.hinge.quaternion.copy(t.rest);t.on=false;t.progress=0;t.tween=null;}}
  return {getTargets:()=>targets.slice(),pick,hover,clearHover,activate,tick,unlockAudio(){},setMuted:value=>{muted=!!value;},getMuted:()=>muted,
    getState:()=>({disposed,storey:0,hovered:hovered?.id??null,activeAnimations:animations.size,counts:targets.length?{'landmark-door':targets.length}:{},
      targets:targets.map(({id,type,kind,storey,on,progress,busy})=>({id,type,kind,storey,on,progress,busy}))}),dispose};
}
