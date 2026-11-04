import * as THREE from 'three';
import {getHomeRoamCopy,resolveHomeRoamLocale} from './home-roam-copy.js';

/** Accessible hit areas for the real, moving three-dimensional cabin panel.
 * These buttons have no visible labels or panel of their own: each follows
 * the projected physical button, whose material/number remains the visual UI.
 * This temporary visitor UI never owns a clock, camera or saved account. */
export function createHomeRoamCabinUI({container,document=container?.ownerDocument,locale,onChoose=()=>{},onExit=()=>{}}={}){
  if(!container||!document)throw new TypeError('A cabin panel needs a viewing container.');
  locale=resolveHomeRoamLocale(locale);const copy=getHomeRoamCopy(locale),listeners=[],buttons=new Map();
  const make=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const add=(target,type,callback,options)=>{target?.addEventListener?.(type,callback,options);listeners.push(()=>target?.removeEventListener?.(type,callback,options));};
  const root=make('section','home-roam-cabin-ui');root.hidden=true;root.setAttribute('role','group');root.setAttribute('aria-label',copy.elevatorPanelAria);root.setAttribute('lang',locale);
  const hits=make('div','home-roam-cabin-hotspots'),chip=make('div','home-roam-cabin-chip'),message=make('span','home-roam-cabin-message'),hint=make('small','home-roam-cabin-keyboard',copy.elevatorPanelKeyboard),exit=make('button','home-roam-cabin-exit',copy.elevatorPanelExit);
  message.setAttribute('role','status');message.setAttribute('aria-live','polite');exit.type='button';chip.append(message,hint,exit);root.append(hits,chip);container.append(root);
  let state=null,disposed=false;
  const format=(text,floor)=>text.replace('{floor}',String(floor+1));
  const editable=target=>target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(String(target?.tagName).toUpperCase())||target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog[open], [role="dialog"][aria-modal="true"]');
  const modalOpen=()=>[...(document.querySelectorAll?.('dialog[open], [role="dialog"][aria-modal="true"]:not([hidden]), #palette:not([hidden])')??[])].some(node=>node.getClientRects?.().length>0);
  const waiting=()=>!!state&&!state.busy&&state.phase!=='boarding';
  function choose(floor){const button=buttons.get(floor);if(disposed||root.hidden||!waiting()||!button||button.disabled)return false;return onChoose(floor);}
  add(exit,'click',event=>{event.stopPropagation?.();if(waiting())onExit();});
  // Native button gestures must never also become a scene-floor click/drag.
  for(const type of['pointerdown','pointerup','dblclick','contextmenu','wheel'])add(root,type,event=>event.stopPropagation?.(),{passive:true});
  function show(value={}){
    if(disposed)return false;
    const count=value.floorCount;
    if(!Number.isInteger(count)||count<1||!Number.isInteger(value.currentStorey)||value.currentStorey<0||value.currentStorey>=count){hide();return false;}
    state={...value,busy:value.busy===true,phase:value.phase??(value.busy?'riding':'waiting'),served:new Set(value.served??[])};root.hidden=false;root.dataset.phase=state.phase;root.dataset.busy=String(state.busy);
    if(buttons.size!==count){
      buttons.clear();hits.replaceChildren();
      for(let floor=0;floor<count;floor++){
        const button=make('button','home-roam-cabin-floor');button.type='button';button.hidden=true;button.dataset.roamElevatorFloor=String(floor);
        add(button,'click',event=>{event.stopPropagation?.();choose(floor);});buttons.set(floor,button);hits.append(button);
      }
    }
    for(const[floor,button]of buttons){
      const here=floor===state.currentStorey,served=state.served.has(floor),target=floor===state.targetStorey;
      button.disabled=!waiting()||here||!served;button.setAttribute('aria-current',here?'location':'false');button.setAttribute('aria-pressed',target?'true':'false');
      const label=format(here?copy.elevatorPanelHere:served?copy.elevatorPanelGo:copy.elevatorPanelUnavailable,floor);button.setAttribute('aria-label',label);button.title=label;button.dataset.state=target&&state.busy?'target':here?'current':served?'available':'unserved';
    }
    const label=state.busy&&Number.isInteger(state.targetStorey)?format(copy.elevatorPanelRiding,state.targetStorey):state.phase==='boarding'?copy.elevatorBoarding:copy.elevatorPanelChoose;
    if(message.textContent!==label)message.textContent=label;hint.hidden=!waiting();exit.disabled=!waiting();return true;
  }
  function project({targets=[],camera,width,height}={}){
    if(disposed||root.hidden||!state)return false;
    const valid=camera?.isCamera&&Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0;
    if(!valid){for(const button of buttons.values())button.hidden=true;return false;}
    camera.updateMatrixWorld();const forward=camera.getWorldDirection(new THREE.Vector3()),cameraPosition=camera.getWorldPosition(new THREE.Vector3()),seen=new Set(),box=new THREE.Box3(),point=new THREE.Vector3(),normal=new THREE.Vector3(),toCamera=new THREE.Vector3();
    for(const target of targets){
      const floor=target?.userData?.roamElevatorFloor,button=buttons.get(floor);if(!button||seen.has(floor))continue;seen.add(floor);
      let visible=true;for(let node=target;node;node=node.parent)if(node.visible===false){visible=false;break;}
      target.updateWorldMatrix?.(true,false);
      if(target.geometry){if(!target.geometry.boundingBox)target.geometry.computeBoundingBox?.();box.copy(target.geometry.boundingBox??new THREE.Box3()).applyMatrix4(target.matrixWorld);}else box.setFromObject(target);
      if(box.isEmpty()){button.hidden=true;continue;}
      const centre=box.getCenter(new THREE.Vector3());
      if(centre.clone().sub(cameraPosition).dot(forward)<=0)visible=false;
      const face=target.userData.roamElevatorFaceNormal;
      if(face&&[face.x,face.y,face.z].every(Number.isFinite)){normal.copy(face).transformDirection(target.matrixWorld);toCamera.copy(cameraPosition).sub(centre);if(normal.dot(toCamera)<=0)visible=false;}
      let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
      for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){
        point.set(x,y,z).project(camera);if(point.z< -1||point.z>1)visible=false;
        const px=(point.x+1)*width/2,py=(1-point.y)*height/2;left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
      }
      if(right<=0||left>=width||bottom<=0||top>=height||![left,right,top,bottom].every(Number.isFinite))visible=false;
      button.hidden=!visible;if(!visible)continue;
      left=Math.max(0,left);top=Math.max(0,top);right=Math.min(width,right);bottom=Math.min(height,bottom);
      const round=value=>Math.round(value*100)/100,signature=[left,top,right-left,bottom-top].map(round).join(',');
      if(button.dataset.projection!==signature){button.dataset.projection=signature;Object.assign(button.style,{left:round(left)+'px',top:round(top)+'px',width:round(right-left)+'px',height:round(bottom-top)+'px'});}
    }
    for(const[floor,button]of buttons)if(!seen.has(floor))button.hidden=true;
    return true;
  }
  function hide(){state=null;root.hidden=true;for(const button of buttons.values())button.hidden=true;}
  add(document,'keydown',event=>{
    if(disposed||root.hidden||!state||event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.repeat||editable(event.target)||editable(document.activeElement)||modalOpen())return;
    if(event.key==='Escape'||event.code==='Escape'){
      event.preventDefault?.();event.stopPropagation?.();event.stopImmediatePropagation?.();if(waiting())onExit();return;
    }
    if(!/^[1-9]$/.test(event.key))return;
    // The open in-car panel owns digits, including current/unserved keys, so
    // Warm's earlier global1–4 view shortcut cannot steal a destination.
    event.preventDefault?.();event.stopPropagation?.();event.stopImmediatePropagation?.();if(waiting())choose(Number(event.key)-1);
  },true);
  return {element:root,show,update:show,project,hide,get isOpen(){return !root.hidden;},dispose(){if(disposed)return;hide();disposed=true;for(const remove of listeners)remove();root.remove();buttons.clear();}};
}
