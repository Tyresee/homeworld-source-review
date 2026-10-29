const TAU=Math.PI*2,ENTER_MS=1600,RETURN_MS=650,ORBIT_MS=20000;
const clamp=value=>Math.max(0,Math.min(1,value));
const ease=value=>{const t=clamp(value);return t*t*t*(t*(t*6-15)+10);};
const shortestAngle=(from,to)=>((to-from+Math.PI)%TAU+TAU)%TAU-Math.PI;
const clonePose=value=>({pan:{x:value.pan.x,y:value.pan.y,z:value.pan.z},zoom:value.zoom,angle:value.angle});
function checkedPose(value,angle=value?.angle){
  if(!value?.pan||![value.pan.x,value.pan.y,value.pan.z,value.zoom,angle].every(Number.isFinite)||value.zoom<=0)throw new TypeError('Stage camera requires a finite pan, positive zoom and angle.');
  return{pan:{...value.pan},zoom:value.zoom,angle};
}
function mixPose(from,to,progress){
  const t=ease(progress),lerp=(a,b)=>a+(b-a)*t;
  return{pan:{x:lerp(from.pan.x,to.pan.x),y:lerp(from.pan.y,to.pan.y),z:lerp(from.pan.z,to.pan.z)},zoom:lerp(from.zoom,to.zoom),angle:from.angle+shortestAngle(from.angle,to.angle)*t};
}

/** Camera direction for one dance session. This module does not move the
 * robot or alter the dance request; manual camera input can leave the follow
 * mode while the dance itself keeps running. All time sampling is absolute. */
export function createStageCamera({getPose,applyPose,focusPose,onChange=()=>{},reducedMotion=false,requestRender=()=>{}}){
  let disposed=false,mode='idle',suppressed=false,available=false,requested=false,point=null;
  let origin=null,from=null,transitionAt=null,orbitAt=0,baseAngle=0,lastNow=null,lastSignature=null,staticApplied=false;
  const reduced=()=>typeof reducedMotion==='function'?reducedMotion()===true:reducedMotion===true;
  const state=()=>({active:mode==='enter'||mode==='follow',returning:mode==='return',available,suppressed});
  function notify(){const value=state(),signature=JSON.stringify(value);if(signature!==lastSignature){lastSignature=signature;onChange(value);}}
  function pose(){return checkedPose(getPose());}
  function apply(value){applyPose(clonePose(value));}
  function focus(angle){return checkedPose(focusPose({...point},angle),angle);}
  function finishReturn(){if(origin)apply(origin);mode='idle';origin=from=null;transitionAt=null;staticApplied=false;}
  function beginReturn(now=null){
    if(!origin){mode='idle';return;}
    from=pose();mode='return';transitionAt=now;
    if(reduced())finishReturn();
  }
  function enter(now){
    origin=pose();from=clonePose(origin);baseAngle=origin.angle;transitionAt=now;staticApplied=false;
    if(reduced()){apply(focus(baseAngle));mode='follow';orbitAt=now;staticApplied=true;}
    else mode='enter';
  }
  function update(stage={},nowMs=globalThis.performance?.now?.()??0){
    if(disposed)return false;
    const inputNow=Number.isFinite(nowMs)?nowMs:(lastNow??0),now=lastNow===null?inputNow:Math.max(lastNow,inputNow);lastNow=now;
    requested=stage.requested===undefined?stage.active===true:stage.requested===true;
    available=stage.active===true;
    const nextPoint=stage.point;
    point=nextPoint&&Number.isFinite(nextPoint.x)&&Number.isFinite(nextPoint.z)?{x:nextPoint.x,y:Number.isFinite(nextPoint.y)?nextPoint.y:0,z:nextPoint.z}:null;
    // A return is never cancelled halfway by a new request. Once back at the
    // saved pose, a later update can enter the new performance cleanly.
    if(!requested){suppressed=false;if(mode==='enter'||mode==='follow')beginReturn(now);}
    if(mode==='idle'&&requested&&available&&point&&!suppressed)enter(now);
    let moving=false;
    if(mode==='return'){
      if(transitionAt===null)transitionAt=now;
      if(reduced()||now-transitionAt>=RETURN_MS)finishReturn();
      else{apply(mixPose(from,origin,(now-transitionAt)/RETURN_MS));moving=true;}
    }else if((mode==='enter'||mode==='follow')&&available&&point){
      if(reduced()){
        if(!staticApplied){apply(focus(baseAngle));staticApplied=true;}
        mode='follow';orbitAt=now;
      }else{
        if(mode==='enter'){
          if(transitionAt===null)transitionAt=now;
          if(now-transitionAt<ENTER_MS){apply(mixPose(from,focus(baseAngle),(now-transitionAt)/ENTER_MS));moving=true;}
          else{mode='follow';orbitAt=transitionAt+ENTER_MS;}
        }
        if(mode==='follow'){
        // Slowly ease the oscillation itself in so the end of the entrance
        // has zero velocity instead of abruptly beginning an orbit.
        if(staticApplied){staticApplied=false;orbitAt=now;}
        const elapsed=Math.max(0,now-orbitAt),ramp=ease(elapsed/ENTER_MS),phase=elapsed/ORBIT_MS*TAU;
        const angle=baseAngle+.10*Math.sin(phase)*ramp,target=focus(angle);
        // Breathe outward only: focusPose already respects the room's maximum
        // zoom, so manual takeover must not snap back from an over-limit zoom.
        target.zoom*=1-.02*(1-Math.cos(phase))*ramp;apply(target);moving=true;
        }
      }
    }
    // A new dance may have begun while the old camera was returning. Schedule
    // the next entry only after reaching the saved view, even with a passive
    // applyPose callback that does not request its own render.
    if(mode==='idle'&&requested&&available&&point&&!suppressed)moving=true;
    notify();if(moving)requestRender();return moving;
  }
  function exit({restore=true}={}){
    if(disposed)return;
    suppressed=requested;
    if(restore){if(mode!=='return')beginReturn();}
    else{mode='idle';origin=from=null;transitionAt=null;staticApplied=false;}
    notify();requestRender();
  }
  function resume(){
    if(disposed||!requested)return false;
    suppressed=false;
    if(mode==='return'){
      // Re-enter from the current interpolated view, preserving the original
      // destination for the eventual return instead of a halfway pose.
      from=pose();baseAngle=from.angle;mode='enter';transitionAt=null;staticApplied=false;
    }
    notify();requestRender();return true;
  }
  function reset({restore=true}={}){
    if(disposed)return;
    if(restore&&origin)apply(origin);
    mode='idle';origin=from=null;transitionAt=null;orbitAt=0;baseAngle=0;point=null;lastNow=null;
    requested=available=suppressed=staticApplied=false;notify();requestRender();
  }
  return{update,exit,resume,reset,getState:state,dispose(){if(disposed)return;reset();disposed=true;}};
}
