import * as THREE from 'three';
import {createRobotAvatar,poseRobotAvatar,poseRobotTransition,poseRobotStairStep,measureRobotStairRig,poseRobotTelevisionArms,poseRobotSurfaceHands,poseRobotDance,setRobotPalette,measureRobotAvatar,disposeRobotAvatar} from './robot-avatar.js';
import {createRobotWardrobe} from './robot-wardrobe.js';
import {findAvatarSpawn,planAvatarWalk,isAvatarPositionWalkable,getAvatarInteractionTargetLabel} from './home-avatar-navigation.js';
import {listRobotInteractions,planRobotStairs,planRobotTelevision,isRobotTelevisionKind,sampleTelevisionRemoteReach,TELEVISION_REACH_DURATION,TELEVISION_HANDOFF_TIME,isRobotSofaKind,planRobotSofaTelevision,sampleRobotSofaTidy} from './student-home-robot-interactions.js';
import {createRobotFurnitureEntry,reverseRobotFurnitureSteps,sampleRobotMotionStep} from './student-home-robot-motion.js';
import {listOutdoorRobotInteractions,planOutdoorRobotWalk,findOutdoorRobotSpawn,createRobotPoolEntry,createRobotPoolExit,sampleRobotPoolMotionStep,sampleRobotPoolLoop} from './student-home-robot-swimming.js';
import {getHomeStairs} from './home-staircase-shape.js';
import {createRobotStairMotion,sampleRobotStairMotion} from './student-home-robot-stairs.js';
import {planRobotElevator,createRobotElevatorMotion,sampleRobotElevatorMotion} from './student-home-robot-elevator.js';
import {normalizeRobotActivity,cloneRobotActivity,sameRobotActivity} from './student-home-robot-state.js';
import {getObjectState} from './home-object-state.js';
import {getRobotFootballDescriptor,sampleRobotFootballMotion,FOOTBALL_PERIOD,FOOTBALL_BALL_RADIUS} from './student-home-robot-football.js';
import {DANCE_PERIOD,DANCE_CLEARANCE_RADIUS} from './student-home-robot-dance.js';

const FLOOR_Y=.08;
// A 100 s cycle covers the 2 s swimming rig, 0.72 Hz wake and 1.25 Hz
// droplets. Lap position has its own measured pool period.
const SWIM_ANIMATION_PERIOD=100;
const cycleTime=(time,period)=>{if(time>=0&&time<period)return time;const value=time%period;return value<0?value+period:value;};
const televisionLabels={'to-remote':"DisplayText3953",'pickup':"DisplayText3954",'to-seat':"DisplayText3955",'sit':"DisplayText3956, DisplayText3957",'watch':"DisplayText3958",'rise':"DisplayText3959, DisplayText3960",'to-return':"DisplayText3961",'return':"DisplayText3962"};
/** Persist bounded semantic checkpoints; rebuild contacts and motion against
 * the active account's current world rather than storing rendered transforms. */
export function createStudentHomeRobotController({source,parent,requestRender,onStatus,onStoreyChange,onActivityChange,onElevatorFrame,onObjectAction,onObjectPresentation}) {
  const group=new THREE.Group();group.name='student-home-robot';parent.add(group);
  const robot=createRobotAvatar(source),baseNavigation=measureRobotAvatar(robot).navigation;
  let navigation={...baseNavigation};group.add(robot);
  const wardrobe=createRobotWardrobe(robot),poses={};
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(navigation.radius*.7,24),new THREE.MeshBasicMaterial({color:'#617851',opacity:.17,transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.082;group.add(shadow);
  const props=createActionProps(robot);
  let objectContext=null,television=null,presentedRemote=null;
  const remoteTarget=new THREE.Vector3(),surfaceContacts={L:new THREE.Vector3(),R:new THREE.Vector3()};
  let surfaceOriginRotation=0,presentedCushion=null,afterSurface=null,football=null,footballFrame=null;
  let dancing=null,danceRequested=false,danceRequestSerial=0,danceStartCallback=null,danceTarget=null,danceFacing=null;
  const footballBall=createFootballBall(group);
  let home=null,floors=null,floor=0,point=null,safePoint=null,route=null,pendingAction=null,stairJourney=null;
  let action='idle',angle=.25,elapsed=0,remaining=0,lastTime=0,frame=0,visible=true,disposed=false,equipmentKey='',presentationPaused=false;
  let sequence=null,visual=null,activeFurniture=null,exitRequested=false,afterExit=null,stairMotion=null,stairFrame=null,stairRig=null;
  let elevatorJourney=null,elevatorMotion=null,elevatorFrame=null;
  let savedActivity=null,activityKnown=false,suspended=false,restoring=false,lastActivityAt=0,lastActivityPhase='',activeAction=null;
  const emittedActivities=new Set();
  let environment='interior',outdoor=null,outdoorKey='',outdoorPoint=null,swimming=null,swimFrame=null;
  const waterEffects=createSwimEffects(group);
  const stairWorldFeet={L:new THREE.Vector3(),R:new THREE.Vector3()},stairPose={feet:stairWorldFeet};
  const floorPositions=new Map(),status=(message,error=false)=>onStatus?.({message,error,action});
  function calibrate(){
    props.update('idle',0);robot.position.set(0,0,0);robot.rotation.set(0,0,0);
    for(const kind of['idle','sit','tuck','lie']){
      poseRobotAvatar(robot,{action:kind==='tuck'?'sit':kind,tuck:kind==='tuck'?1:0});robot.updateMatrixWorld(true);
      const measure=measureRobotAvatar(robot),box=new THREE.Box3();robot.traverseVisible(n=>{if(n.isMesh)box.union(new THREE.Box3().setFromObject(n));});
      const shin=new THREE.Box3(),feet=new THREE.Box3();for(const name of['ShinShellL','ShinShellR','FootShellL','FootShellR'])shin.union(new THREE.Box3().setFromObject(robot.getObjectByName(name)));
      for(const name of['AnkleL','AnkleR'])feet.union(new THREE.Box3().setFromObject(robot.getObjectByName(name)));
      poses[kind]={...measure,bounds:{min:box.min.toArray(),max:box.max.toArray()},shinMinZ:shin.min.z,foot:{x:(feet.min.x+feet.max.x)/2,y:feet.min.y,z:(feet.min.z+feet.max.z)/2}};
    }
    navigation={...baseNavigation};
    for(let sample=0;sample<12;sample++){
      poseRobotAvatar(robot,{action:'walk',time:sample/12*Math.PI*2/6.8});robot.updateMatrixWorld(true);
      robot.traverseVisible(n=>{if(!n.isMesh||n.userData.robotAvatar||n.userData.robotActionProp)return;
        const b=new THREE.Box3().setFromObject(n);navigation.height=Math.max(navigation.height,b.max.y+.02);
        for(const x of[b.min.x,b.max.x])for(const z of[b.min.z,b.max.z])navigation.radius=Math.max(navigation.radius,Math.hypot(x,z)+.02);
      });
    }
    stairRig=measureRobotStairRig(robot);poseRobotAvatar(robot);robot.traverse(n=>{if(n.isMesh){n.castShadow=false;n.receiveShadow=true;Object.assign(n.userData,{avatar:true,surfaceId:'avatar'});}});
  }
  calibrate();
  function present(){
    group.visible=visible&&!!point&&!disposed;if(presentationPaused||!point||disposed)return;
    robot.position.set(point.x,point.y??FLOOR_Y,point.z);robot.rotation.y=angle;
    if(dancing){
      if(dancing.turn&&dancing.blend===0){const progress=dancing.turn.elapsed/dancing.turn.duration;poseRobotTransition(robot,{from:{action:'idle'},to:{action:'walk',time:elapsed},progress:Math.sin(Math.PI*progress)*.3,time:elapsed});}
      else poseRobotDance(robot,{time:dancing.time,blend:dancing.blend});
    }
    else if(footballFrame){
      poseRobotTransition(robot,{from:{action:'idle'},to:{action:'walk',time:football.time*1.35},progress:footballFrame.gait,time:football.time});
      if(footballFrame.kick>0){
        group.updateWorldMatrix(true,false);const k=footballFrame.kick;
        for(const side of ['L','R']){const p=stairRig.footCentre[side],x=p.x*(side==='R'?1-k*.8:1),y=p.y+(side==='R'?.19*k:0),z=p.z+(side==='R'?.34*k:0);stairWorldFeet[side].set(point.x+x*Math.cos(angle)+z*Math.sin(angle),point.y+y,point.z-x*Math.sin(angle)+z*Math.cos(angle)).applyMatrix4(group.matrixWorld);}
        poseRobotStairStep(robot,{feet:stairWorldFeet,bodyLean:-.06*k,armSwing:.16*k,intensity:.6*k});
      }
    }else if(swimFrame){
      if(swimFrame.gait>0&&swimFrame.swimBlend<.001)poseRobotTransition(robot,{from:{action:'idle'},to:{action:'walk',time:elapsed},progress:swimFrame.gait,time:elapsed});
      else poseRobotAvatar(robot,{action:'swim',time:elapsed,swimBlend:swimFrame.swimBlend});
    }
    else if(stairFrame?.feet){
      // The planner works in the current floor's local coordinates. A rendered
      // multi-floor overview may translate/rotate its parent group; IK needs
      // actual world contacts, otherwise the legs reach toward another floor.
      group.updateWorldMatrix(true,false);for(const side of['L','R']){const foot=stairFrame.feet[side];stairWorldFeet[side].set(foot.x,foot.y,foot.z).applyMatrix4(group.matrixWorld);}
      stairPose.bodyLean=stairFrame.bodyLean;stairPose.armSwing=stairFrame.armSwing;stairPose.intensity=stairFrame.intensity??1;poseRobotStairStep(robot,stairPose);
    }else if(television&&['pickup','return'].includes(television.phase)){const sample=sampleTelevisionRemoteReach(television.plan,television.elapsed);poseRobotTransition(robot,{from:{action:'idle'},to:{action:'walk',time:television.elapsed*1.6},progress:sample.gait,time:television.elapsed});}
    else if(visual)poseRobotTransition(robot,visual);else poseRobotAvatar(robot,{action:television?(['to-remote','to-seat','to-return'].includes(television.phase)?'walk':television.phase==='watch'?'sit':'idle'):['admire','tidy','wipe'].includes(action)?'idle':action,time:elapsed});
    if(television){
      const phase=television.phase,t=television.elapsed,reach=['pickup','return'].includes(phase)?sampleTelevisionRemoteReach(television.plan,t).reach:0;
      const motion=television.motion,motionProgress=motion?(motion.index+motion.elapsed/motion.steps[motion.index].duration)/motion.steps.length:0;
      const carrying=phase==='watch'?0:phase==='sit'?1-motionProgress:phase==='rise'?motionProgress:1;
      group.updateWorldMatrix(true,false);remoteTarget.set(television.plan.remoteDock.x,television.plan.remoteDock.y,television.plan.remoteDock.z).applyMatrix4(group.matrixWorld);
      poseRobotTelevisionArms(robot,{holding:remoteHeld(),carrying,press:television.pressRemaining?Math.sin((1.2-television.pressRemaining)/1.2*Math.PI):0,reach:Math.max(0,reach),target:remoteTarget});
    }
    if(['tidy','wipe'].includes(action)&&activeAction?.tidy){
      const sample=sampleRobotSofaTidy(activeAction,elapsed);group.updateWorldMatrix(true,false);
      for(const side of ['L','R']){const p=sample.contacts[side];surfaceContacts[side].set(p.x,p.y,p.z).applyMatrix4(group.matrixWorld);}
      poseRobotSurfaceHands(robot,{reach:sample.reach,contacts:surfaceContacts,lean:activeAction.tidy.lean??1.05});
      if(action==='tidy'){const id=activeAction.targetId.slice(10);presentedCushion=id;onObjectPresentation?.({id,cushionTidy:{partIndex:activeAction.tidy.cushionIndex,compression:sample.compression}});}else clearCushionPresentation();
    }else clearCushionPresentation();
    presentRemote();props.update(action,elapsed,{remoteHeld:remoteHeld(),remoteGrip:television?.plan.grip});shadow.position.x=point.x;shadow.position.z=point.z;shadow.position.y=footballFrame?point.y+.002:.082;
    shadow.visible=!swimFrame&&!['sit','lie','stairs','elevator','entering','exiting','watch'].includes(action);
    footballBall.update(footballFrame,football?.descriptor.field.rotation??0);waterEffects.update(swimFrame,swimming?.descriptor,elapsed);requestRender();
  }
  function clearElevatorFrame(){
    if(elevatorFrame)onElevatorFrame?.({stairId:elevatorFrame.stairId,reset:true});
    elevatorFrame=null;
  }
  function clearCushionPresentation(){if(presentedCushion){onObjectPresentation?.({id:presentedCushion,cushionTidy:null});presentedCushion=null;}}
  function cancel(){dancing=null;danceRequested=false;danceRequestSerial++;danceStartCallback=null;danceTarget=null;danceFacing=null;afterSurface=null;football=null;footballFrame=null;footballBall.update(null);clearCushionPresentation();clearTelevision();if(frame)cancelAnimationFrame(frame);frame=0;route=null;pendingAction=null;sequence=null;stairJourney=null;stairMotion=null;stairFrame=null;elevatorJourney=null;elevatorMotion=null;clearElevatorFrame();swimming=null;swimFrame=null;remaining=0;}
  function resetToSafePoint(){cancel();activeFurniture=null;activeAction=null;visual=null;exitRequested=false;afterExit=null;if(safePoint)point={...safePoint,y:FLOOR_Y};action='idle';elapsed=0;present();}
  function resetBeforeContinuation(next){
    // Finishing a five-second task or an unstarted TV route resets its old
    // animation state. Carry only the explicitly captured stage continuation
    // across that synchronous reset; cancelled/account-switched callbacks do
    // not get this exception and can never resurrect an old stage request.
    const queued=danceRequested&&next&&next===danceStartCallback?{serial:danceRequestSerial,callback:next,target:danceTarget,facing:danceFacing}:null;
    resetToSafePoint();if(queued){danceRequested=true;danceRequestSerial=queued.serial;danceStartCallback=queued.callback;danceTarget=queued.target;danceFacing=queued.facing;}
  }
  const checkpoint=(motion)=>({step:motion.index,progress:Math.max(0,Math.min(1,motion.elapsed/motion.steps[motion.index].duration))});
  const activityKey=value=>JSON.stringify(value);
  function announceActivity(value){
    const next=normalizeRobotActivity(value),changed=!sameRobotActivity(next,savedActivity);
    savedActivity=next;activityKnown=true;
    if(changed){
      const key=activityKey(next);emittedActivities.add(key);if(emittedActivities.size>80)emittedActivities.delete(emittedActivities.values().next().value);
      onActivityChange?.(cloneRobotActivity(next));
    }
    return cloneRobotActivity(next);
  }
  function currentActivity(){
    if(suspended)return cloneRobotActivity(savedActivity);
    if(!point||!home||disposed)return null;
    if(dancing)return {kind:'dance',storey:floor,point:{x:point.x,z:point.z},rotation:angle,time:dancing.time,blend:dancing.blend,...dancing.exitRequested?{exitRequested:true}:{}};
    if(football)return {kind:'football',itemId:football.descriptor.targetId.slice(8),storey:0,time:football.time,originRotation:football.originRotation,...football.exitRequested?{exitRequested:true}:{}};
    if(television){
      const value={kind:'watch',itemId:television.plan.tvId,seatId:television.plan.seatId,storey:floor,phase:television.phase,point:{x:point.x,z:point.z},rotation:angle,originRotation:television.originRotation,time:television.elapsed};
      if(television.motion)Object.assign(value,checkpoint(television.motion));
      if(television.exitRequested)value.exitRequested=true;
      if(television.phase==='watch'&&television.pressRemaining)value.pressRemaining=television.pressRemaining;
      return value;
    }
    if(elevatorMotion||stairMotion){
      const motion=elevatorMotion??stairMotion,journey=elevatorJourney??stairJourney;
      return {kind:elevatorMotion?'elevator':'stairs',itemId:journey.stairId,storey:floor,...checkpoint(motion),rotation:motion.startRotation??0,time:elapsed,originTime:motion.startTime??0};
    }
    if(swimming){
      const value={kind:'swim',itemId:swimming.descriptor.targetId.slice(8),storey:0,phase:swimming.mode,time:swimming.mode==='loop'?cycleTime(elapsed,SWIM_ANIMATION_PERIOD):elapsed,loopTime:cycleTime(swimming.time,swimming.descriptor.pool.loop.duration),rotation:swimming.startRotation??0};
      if(swimming.mode!=='loop')Object.assign(value,checkpoint(swimming));
      if(swimming.mode==='exit')value.exitFrom=structuredClone(swimming.exitFrom);
      return value;
    }
    const descriptor=sequence?.descriptor??activeFurniture?.descriptor??activeAction;
    if(descriptor){
      const itemId=descriptor.targetId?.startsWith('furniture:')?descriptor.targetId.slice(10):descriptor.targetId;
      if(!itemId)return null;
      if(action==='lie'&&!sequence)return {kind:'sleep',itemId,storey:floor};
      const value={kind:'furniture',action:descriptor.kind,itemId,storey:floor};
      if(!descriptor.motion&&Number.isSafeInteger(descriptor.approachIndex))value.approachIndex=descriptor.approachIndex;
      if(sequence){Object.assign(value,{phase:sequence.mode,...checkpoint(sequence),rotation:sequence.startRotation??angle,time:elapsed,originTime:sequence.startTime??0});if(descriptor.entrySide)value.entrySide=descriptor.entrySide;if(sequence.mode==='enter'&&exitRequested)value.exitRequested=true;}
      else if(remaining)Object.assign(value,{time:elapsed,remaining});
      if(['tidy','wipe'].includes(descriptor.kind))value.originRotation=surfaceOriginRotation;
      return value;
    }
    const value={kind:'stand',environment,storey:environment==='estate'?0:floor,point:{x:point.x,z:point.z},rotation:angle};
    if(action==='wave')Object.assign(value,{action:'wave',time:elapsed,remaining});
    return value;
  }
  function captureActivity({emit=true}={}){
    const value=normalizeRobotActivity(currentActivity());
    return emit&&!restoring?announceActivity(value):cloneRobotActivity(value);
  }
  function publishActivity(force=false){
    if(suspended||restoring||!point)return;
    const phase=[environment,floor,action,sequence?.mode,sequence?.index,swimming?.mode,swimming?.index,stairMotion?.index,elevatorMotion?.index,television?.phase,television?.motion?.index,television?.pressRemaining>0?'press':'rest',footballFrame?.phase,football?.exitRequested?'return':'',dancing?.exitRequested?'dance-out':''].join(':');
    const now=performance.now();
    if(force||phase!==lastActivityPhase||now-lastActivityAt>=1200){lastActivityPhase=phase;lastActivityAt=now;captureActivity();}
  }
  function setCheckpoint(motion,value){
    motion.index=Math.min(value.step??0,motion.steps.length-1);motion.elapsed=motion.steps[motion.index].duration*(value.progress??0);
  }
  function restoreSavedActivity(){
    if(restoring||!visible||document.hidden||disposed||!home||!point||!savedActivity)return false;
    const value=cloneRobotActivity(savedActivity),wantedEnvironment=['swim','football'].includes(value.kind)||value.kind==='stand'&&value.environment==='estate'?'estate':'interior';
    if(value.storey!==(wantedEnvironment==='estate'?0:floor))return false;
    restoring=true;
    try{
      cancel();activeFurniture=null;activeAction=null;visual=null;exitRequested=false;afterExit=null;suspended=false;
      environment=wantedEnvironment;action='idle';elapsed=value.time??0;
      if(value.kind==='dance'){
        if(!isAvatarPositionWalkable(home,value.point,danceNavigation()))return restoreFallback();
        point={...value.point,y:FLOOR_Y};safePoint={...value.point};angle=value.rotation;
        dancing={time:cycleTime(value.time,DANCE_PERIOD),blend:value.blend,exitRequested:value.exitRequested===true,after:null};danceRequested=true;danceTarget={...value.point};danceFacing=angle;action='dance';elapsed=0;
      }else if(value.kind==='football'){
        const descriptor=getRobotFootballDescriptor(outdoor,`outdoor:${value.itemId}`,{navigation});if(!descriptor)return restoreFallback();
        football={descriptor,time:value.time,originRotation:value.originRotation,exitRequested:value.exitRequested===true,after:null};safePoint={...descriptor.approach};outdoorPoint={...safePoint};action='football';advanceFootball(0);
      }else if(value.kind==='watch'){
        const plan=planRobotTelevision(home,value.itemId,{navigation,poses,seatId:value.seatId});
        if(!plan.ok)return restoreFallback();
        plan.grip=televisionGrip(plan);
        television={plan,phase:value.phase,elapsed:value.time,originRotation:value.originRotation,pressRemaining:value.pressRemaining??0,exitRequested:value.exitRequested===true,after:null};
        point={...value.point,y:FLOOR_Y};safePoint={...value.point};angle=value.rotation;
        if(!restoreTelevisionPhase(value))return restoreFallback();
      }else if(value.kind==='stand'){
        safePoint=environment==='estate'?findOutdoorRobotSpawn(outdoor,value.point,navigation):findAvatarSpawn(home,value.point,navigation);
        point=safePoint?{...safePoint,y:FLOOR_Y}:null;angle=value.rotation;
        if(value.action==='wave'){action='wave';remaining=value.remaining??Math.max(0,1.9-elapsed);}
      }else if(value.kind==='stairs'||value.kind==='elevator'){
        const planner=value.kind==='elevator'?planRobotElevator:planRobotStairs;
        const journey=planner(home,floors,floor,value.itemId,safePoint,navigation);
        if(!journey.ok)return restoreFallback();
        safePoint={x:journey.approach.x,z:journey.approach.z};point={...journey.approach};
        const motion={...(value.kind==='elevator'?createRobotElevatorMotion(journey,{point,rotation:value.rotation,time:value.originTime??0}):createRobotStairMotion(journey,stairRig,{point,rotation:value.rotation,time:value.originTime??0})),startRotation:value.rotation,startTime:value.originTime??0};
        setCheckpoint(motion,value);action=value.kind;elapsed=value.time??0;
        if(value.kind==='elevator'){elevatorJourney=journey;elevatorMotion=motion;advanceElevator(0);}else{stairJourney=journey;stairMotion=motion;advanceStairs(0);}
      }else if(value.kind==='swim'){
        const descriptor=listOutdoorRobotInteractions(outdoor,`outdoor:${value.itemId}`,{navigation}).find(row=>row.kind==='swim');
        if(!descriptor)return restoreFallback();
        safePoint={...descriptor.approach};outdoorPoint={...safePoint};
        const entry=createRobotPoolEntry(descriptor,{point:descriptor.approach,rotation:(value.rotation??0)*180/Math.PI});
        const sampleSource=origin=>{
          if(origin.phase==='loop')return sampleRobotPoolLoop(descriptor,origin.time??0);
          const step=entry[Math.min(origin.step??0,entry.length-1)];return sampleRobotPoolMotionStep(step,origin.progress??0,origin.time??0);
        };
        const mode=value.phase??'loop';let steps=entry;
        if(mode==='exit'){
          const origin=value.exitFrom??{phase:'loop',time:value.time??0},sample=sampleSource(origin);
          steps=createRobotPoolExit(descriptor,{point:sample.point,rotation:sample.rotation,swimBlend:sample.swimBlend});
        }
        swimming={descriptor,steps,index:0,elapsed:0,mode,time:value.loopTime??value.time??0,startRotation:value.rotation??0,exitFrom:value.exitFrom};
        if(mode!=='loop')setCheckpoint(swimming,value);
        action=mode==='loop'?'swim':`swim-${mode}`;if(mode==='loop')elapsed=cycleTime(elapsed,SWIM_ANIMATION_PERIOD);advanceSwimming(0);
      }else{
        const targetId=home.furniture?.some(row=>row.id===value.itemId)?`furniture:${value.itemId}`:value.itemId.startsWith('placement:')||value.itemId==='table'?value.itemId:`furniture:${value.itemId}`;
        const kind=value.kind==='sleep'?'lie':value.action;
        const descriptor=listRobotInteractions(home,targetId,{navigation,poses,entrySide:value.entrySide,approachIndex:value.approachIndex}).find(row=>row.kind===kind);
        if(!descriptor)return restoreFallback();
        safePoint={...descriptor.approach};floorPositions.set(floor,{...safePoint});
        if(['sit','lie'].includes(kind)){
          const entry=createRobotFurnitureEntry(descriptor,poses,{point:descriptor.approach,rotation:(value.rotation??descriptor.motion.alignment.rotation*Math.PI/180)*180/Math.PI,time:value.originTime??0});
          if(value.phase){
            const steps=value.phase==='exit'?reverseRobotFurnitureSteps(entry):entry;
            activeFurniture=value.phase==='exit'?{descriptor,steps:entry}:null;
            sequence={steps,index:0,elapsed:0,mode:value.phase,descriptor,startRotation:value.rotation??0,startTime:value.originTime??0};setCheckpoint(sequence,value);action=value.phase==='enter'?'entering':'exiting';exitRequested=value.exitRequested===true;advanceSequence(0);
          }else{activeFurniture={descriptor,steps:entry};visual=sampleRobotMotionStep(entry.at(-1),1);point={...visual.point};angle=visual.rotation*Math.PI/180;action=kind;}
        }else{activeAction=descriptor;point={...descriptor.pose};angle=(descriptor.pose.rotation??0)*Math.PI/180;action=kind;remaining=['read','cook','wash','dishwash','tidy','wipe'].includes(kind)?value.remaining??Math.max(0,5-elapsed):0;if(['tidy','wipe'].includes(kind)){surfaceOriginRotation=value.originRotation??angle;updateSurfaceTurn();}}
      }
      updateSurfaceTurn();present();publishActivity();if(route||sequence||stairMotion||elevatorMotion||swimming||football||dancing||remaining||televisionNeedsFrame())schedule();return true;
    }finally{restoring=false;}
  }
  function restoreFallback(){
    cancel();activeFurniture=null;activeAction=null;visual=null;action='idle';elapsed=0;
    safePoint=environment==='estate'?findOutdoorRobotSpawn(outdoor,safePoint,navigation):findAvatarSpawn(home,safePoint,navigation);point=safePoint?{...safePoint,y:FLOOR_Y}:null;present();
    return false;
  }
  function pauseActivity(){
    if(presentationPaused||suspended||disposed)return;
    if(point&&activityKnown)captureActivity();
    resetToSafePoint();suspended=true;
  }
  function resumeActivity(){
    if(presentationPaused||!suspended)return;
    suspended=false;if(!restoreSavedActivity()){present();publishActivity(true);}
  }
  const hasFrameWork=()=>route||sequence||stairMotion||elevatorMotion||swimming||football||dancing||remaining||televisionNeedsFrame();
  function schedule(){if(!frame&&visible&&!disposed&&!presentationPaused&&!document.hidden){lastTime=performance.now();frame=requestAnimationFrame(tick);}}
  // A scene presentation borrows the exact rendered rig. Unlike the account
  // lifecycle pause, it must not checkpoint, cancel motion or rebuild a pose.
  function setPresentationPaused(value){
    if(disposed)return presentationPaused;
    const next=Boolean(value);if(next===presentationPaused)return presentationPaused;
    presentationPaused=next;
    if(next){if(frame)cancelAnimationFrame(frame);frame=0;}
    else{lastTime=performance.now();if(hasFrameWork())schedule();}
    return presentationPaused;
  }
  function startSequence(steps,mode,descriptor){
    sequence={steps,index:0,elapsed:0,mode,descriptor,startRotation:angle,startTime:elapsed};action=mode==='enter'?'entering':'exiting';
    visual=sampleRobotMotionStep(steps[0],0,0);status(steps[0].label);publishActivity(true);schedule();
  }
  function startExit(){
    if(!activeFurniture)return;
    exitRequested=false;const {steps,descriptor}=activeFurniture;
    startSequence(reverseRobotFurnitureSteps(steps),'exit',descriptor);
  }
  function stand(){
    if(finishDance())return;
    if(danceRequested)stopDance();
    if(finishSurface())return;
    if(football){endFootball();return;}
    if(television){endTelevision();return;}
    if(elevatorMotion)return elevatorBusy();
    if(swimming){startSwimExit();return;}
    if(sequence){exitRequested=sequence.mode==='enter';afterExit=null;publishActivity(true);return;}
    if(activeFurniture){afterExit=null;startExit();return;}
    resetToSafePoint();publishActivity(true);
  }
  // A five-second surface task already ends with hand release and torso rise.
  // Keep that authored release before switching commands rather than snapping
  // hands away from the cushion/table or teleporting the cloth to the waist.
  function finishSurface(after=null){if(!['tidy','wipe'].includes(action)||!remaining)return false;afterSurface=after;status("DisplayText3963, DisplayText3964.");schedule();return true;}
  function beginAction(descriptor){
    if(descriptor.kind==='dance'){startDance(descriptor.facing);return;}
    if(descriptor.kind==='football'){football={descriptor,time:0,originRotation:angle,exitRequested:false,after:null};action='football';elapsed=0;advanceFootball(0);publishActivity(true);schedule();return;}
    if(descriptor.kind==='swim'){
      swimming={descriptor,steps:createRobotPoolEntry(descriptor,{point,rotation:angle*180/Math.PI}),index:0,elapsed:0,mode:'enter',time:0,startRotation:angle};
      action='swim-enter';elapsed=0;advanceSwimming(0);publishActivity(true);schedule();return;
    }
    if(descriptor.kind==='stairs'){
      stairJourney=descriptor.journey;stairMotion={...createRobotStairMotion(stairJourney,stairRig,{point,rotation:angle,time:elapsed}),index:0,elapsed:0,startRotation:angle,startTime:elapsed};action='stairs';elapsed=0;advanceStairs(0);publishActivity(true);return;
    }
    if(descriptor.kind==='elevator'){
      elevatorJourney=descriptor.journey;elevatorMotion={...createRobotElevatorMotion(elevatorJourney,{point,rotation:angle,time:elapsed}),index:0,elapsed:0,startRotation:angle,startTime:elapsed};action='elevator';elapsed=0;advanceElevator(0);publishActivity(true);return;
    }
    if(['sit','lie'].includes(descriptor.kind)){
      const steps=createRobotFurnitureEntry(descriptor,poses,{point,rotation:angle*180/Math.PI,time:elapsed});
      startSequence(steps,'enter',descriptor);return;
    }
    surfaceOriginRotation=angle;activeAction=descriptor;if(!['tidy','wipe'].includes(descriptor.kind))angle=(descriptor.pose.rotation??0)*Math.PI/180;action=descriptor.kind;elapsed=0;point={...descriptor.pose};remaining=['read','cook','wash','dishwash','tidy','wipe'].includes(action)?5:0;status(descriptor.label);publishActivity(true);
  }
  function updateSurfaceTurn(){if(!['tidy','wipe'].includes(action)||!activeAction)return;const target=activeAction.pose.rotation*Math.PI/180,delta=Math.atan2(Math.sin(target-surfaceOriginRotation),Math.cos(target-surfaceOriginRotation));angle=surfaceOriginRotation+delta*sampleRobotSofaTidy(activeAction,elapsed).turn;}
  function advanceSequence(dt){
    let left=dt;
    while(sequence&&left>=0){
      const current=sequence,step=current.steps[current.index],take=Math.min(left,step.duration-current.elapsed);current.elapsed+=take;left-=take;
      const progress=Math.min(1,current.elapsed/step.duration);visual=sampleRobotMotionStep(step,progress,current.elapsed);
      point={...visual.point};angle=visual.rotation*Math.PI/180;
      if(progress<1)break;
      if(current.index<current.steps.length-1){current.index++;current.elapsed=0;status(current.steps[current.index].label);if(left<=0)break;continue;}
      sequence=null;
      if(current.mode==='enter'){
        activeFurniture={descriptor:current.descriptor,steps:current.steps};action=current.descriptor.kind;elapsed=0;status(action==='lie'?"DisplayText3965, DisplayText3966.":"DisplayText3967.");
        if(exitRequested)startExit();
        else publishActivity(true);
      }else{
        activeFurniture=null;visual=null;action='idle';elapsed=0;point={...safePoint,y:FLOOR_Y};floorPositions.set(floor,{...safePoint});status("DisplayText3968, DisplayText3969.");
        const next=afterExit;afterExit=null;exitRequested=false;if(next)next();
      }
      break;
    }
  }
  function startSwimExit(next=null){
    if(!swimming)return;
    if(swimming.mode==='exit'){afterExit=next;return;}
    afterExit=next;
    const exitFrom=swimming.mode==='loop'?{phase:'loop',time:swimming.time}:{phase:'enter',...checkpoint(swimming),time:elapsed};
    swimming={...swimming,exitFrom,steps:createRobotPoolExit(swimming.descriptor,{point,rotation:angle*180/Math.PI,swimBlend:swimFrame?.swimBlend??0}),index:0,elapsed:0,mode:'exit'};
    action='swim-exit';advanceSwimming(0);publishActivity(true);schedule();
  }
  function advanceSwimming(dt){
    if(swimming.mode==='loop'){
      swimming.time=cycleTime(swimming.time+dt,swimming.descriptor.pool.loop.duration);swimFrame=sampleRobotPoolLoop(swimming.descriptor,swimming.time);
      point={...swimFrame.point};angle=swimFrame.rotation*Math.PI/180;return;
    }
    let left=dt;
    while(swimming&&left>=0){
      const current=swimming,step=current.steps[current.index],take=Math.min(left,step.duration-current.elapsed);
      current.elapsed+=take;left-=take;
      const progress=Math.min(1,current.elapsed/step.duration),oldPhase=swimFrame?.phase;
      swimFrame=sampleRobotPoolMotionStep(step,progress,elapsed);point={...swimFrame.point};angle=swimFrame.rotation*Math.PI/180;
      if(oldPhase!==swimFrame.phase)status(step.label??(current.mode==='enter'?"DisplayText3970…":"DisplayText3971…"));
      if(progress<1)break;
      if(current.index<current.steps.length-1){current.index++;current.elapsed=0;if(left<=0)break;continue;}
      if(current.mode==='enter'){
        current.mode='loop';current.time=0;action='swim';status("DisplayText3972 · DisplayText3973\"DisplayText3894\"DisplayText3974.");
      }else{
        const approach=current.descriptor.approach;swimming=null;swimFrame=null;action='idle';elapsed=0;
        safePoint={...approach};outdoorPoint={...safePoint};point={...safePoint,y:FLOOR_Y};status("DisplayText3975, DisplayText3976.");
        const next=afterExit;afterExit=null;if(next)next();
      }
      break;
    }
  }
  function advanceStairs(dt){
    let left=dt;
    while(stairMotion&&left>=0){
      const motion=stairMotion,step=motion.steps[motion.index],take=Math.min(left,step.duration-motion.elapsed);motion.elapsed+=take;left-=take;
      const progress=Math.min(1,motion.elapsed/step.duration),previousPhase=stairFrame?.phase;
      stairFrame=sampleRobotStairMotion(motion,motion.index,progress);point={...stairFrame.point};angle=stairFrame.rotation;visual=stairFrame.visual??null;
      if(previousPhase!==stairFrame.phase)status(stairFrame.phaseLabel);
      if(progress<1)break;
      if(motion.index<motion.steps.length-1){motion.index++;motion.elapsed=0;if(left<=0)break;continue;}
      const finished=stairJourney;stairJourney=null;stairMotion=null;stairFrame=null;visual=null;action='idle';elapsed=0;floorPositions.set(finished.target,{...finished.arrival});
      present();onStoreyChange?.({index:finished.target,point:{...finished.arrival},stairId:finished.stairId,direction:finished.direction});
      if(floor!==finished.target){resetToSafePoint();status("DisplayText3977, DisplayText3978, DisplayText0974.",true);}else status(`DisplayText3979${floor+1}DisplayText0931, DisplayText0224.`);return;
    }
  }
  function advanceElevator(dt){
    let left=dt;
    while(elevatorMotion&&left>=0){
      const motion=elevatorMotion,step=motion.steps[motion.index],take=Math.min(left,step.duration-motion.elapsed);motion.elapsed+=take;left-=take;
      const progress=Math.min(1,motion.elapsed/step.duration),previousPhase=elevatorFrame?.phase;
      elevatorFrame=sampleRobotElevatorMotion(motion,motion.index,progress);point={...elevatorFrame.point};angle=elevatorFrame.rotation;visual=elevatorFrame.visual;
      onElevatorFrame?.({stairId:elevatorFrame.stairId,cabinY:elevatorFrame.cabinY,doors:{...elevatorFrame.doors},phase:elevatorFrame.phase,direction:elevatorFrame.direction});
      if(previousPhase!==elevatorFrame.phase)status(elevatorFrame.phaseLabel);
      if(progress<1)break;
      if(motion.index<motion.steps.length-1){motion.index++;motion.elapsed=0;if(left<=0)break;continue;}
      const finished=elevatorJourney;elevatorJourney=null;elevatorMotion=null;clearElevatorFrame();visual=null;action='idle';elapsed=0;floorPositions.set(finished.target,{...finished.arrival});
      // Keep the old floor model closed before its scene is replaced. The
      // synchronous storey callback rebases this same doorway onto the next
      // floor, so the robot never appears on the new floor inside the shaft.
      present();onStoreyChange?.({index:finished.target,point:{...finished.arrival},stairId:finished.stairId,direction:finished.direction});
      if(floor!==finished.target){resetToSafePoint();status("DisplayText3977, DisplayText3980, DisplayText0974.",true);}else status(`DisplayText3979${floor+1}DisplayText0931, DisplayText0224.`);return;
    }
  }
  function tick(now){
    frame=0;if(disposed||presentationPaused||!visible||document.hidden)return;
    const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;elapsed+=dt;if(swimming?.mode==='loop')elapsed=cycleTime(elapsed,SWIM_ANIMATION_PERIOD);
    if(dancing)advanceDance(dt);
    else if(football)advanceFootball(dt);
    else if(television)advanceTelevision(dt);
    else if(swimming)advanceSwimming(dt);
    else if(elevatorMotion)advanceElevator(dt);
    else if(stairMotion)advanceStairs(dt);
    else if(sequence)advanceSequence(dt);
    else if(route?.length){
      let distance=dt*1.7;
      while(route.length&&distance>0){
        const target=route[0],dx=target.x-point.x,dz=target.z-point.z,dy=(target.y??FLOOR_Y)-(point.y??FLOOR_Y),length=Math.hypot(dx,dy,dz);
        if(length<1e-7){route.shift();continue;}
        angle=Math.atan2(dx,dz);const step=Math.min(distance,length),ratio=step/length;
        point.x+=dx*ratio;point.z+=dz*ratio;point.y=(point.y??FLOOR_Y)+dy*ratio;distance-=step;if(!stairJourney)safePoint={x:point.x,z:point.z};
        if(step>=length-1e-7)route.shift();
      }
      if(!route.length){
        route=null;
        if(environment==='estate')outdoorPoint={...safePoint};else floorPositions.set(floor,{...safePoint});const next=pendingAction;pendingAction=null;
        if(next)beginAction(next);else{action='idle';elapsed=0;status("DisplayText0221, DisplayText3981.");}
      }
    }else if(remaining){remaining=Math.max(0,remaining-dt);if(!remaining){const next=afterSurface;resetBeforeContinuation(next);status("DisplayText0223, DisplayText0224.");next?.();}}
    updateSurfaceTurn();present();publishActivity();if(route||sequence||stairMotion||elevatorMotion||swimming||football||dancing||remaining||televisionNeedsFrame())schedule();
  }
  const planWalk=(from,to)=>environment==='estate'?planOutdoorRobotWalk(outdoor,from,to,navigation):planAvatarWalk(home,from,to,navigation);
  function travelNow(to,descriptor=null){
    const result=planWalk(safePoint,to);if(!result.ok){status(result.error,true);return result;}
    resetToSafePoint();route=result.path.map(value=>({...value,y:FLOOR_Y}));action='walk';pendingAction=descriptor;danceRequested=descriptor?.kind==='dance';if(danceRequested){danceTarget={x:to.x,z:to.z};danceFacing=descriptor.facing;}elapsed=0;
    status(descriptor?`DisplayText3982 · ${descriptor.label}`:"DisplayText3983…");publishActivity(true);schedule();return {ok:true};
  }
  function travel(to,descriptor=null){
    if(disposed||!home||!safePoint||!visible)return {ok:false,error:"DisplayText3984."};
    if(elevatorMotion)return elevatorBusy();
    if(danceRequested&&!dancing)stopDance();
    if(dancing){const check=planWalk(safePoint,to);if(!check.ok){status(check.error,true);return check;}finishDance(()=>travelNow(to,descriptor));return {ok:true,deferred:true};}
    if(['tidy','wipe'].includes(action)&&remaining){const check=planWalk(safePoint,to);if(!check.ok){status(check.error,true);return check;}finishSurface(()=>travelNow(to,descriptor));return{ok:true,deferred:true};}
    if(football){const check=planWalk(football.descriptor.approach,to);if(!check.ok){status(check.error,true);return check;}endFootball(()=>travelNow(to,descriptor));return {ok:true,deferred:true};}
    if(television){endTelevision(()=>travelNow(to,descriptor));return {ok:true,deferred:true};}
    if(swimming){const check=planWalk(swimming.descriptor.approach,to);if(!check.ok){status(check.error,true);return check;}startSwimExit(()=>travelNow(to,descriptor));return{ok:true,deferred:true};}
    if(activeFurniture||sequence){
      const check=planWalk(safePoint,to);if(!check.ok){status(check.error,true);return check;}
      afterExit=()=>travelNow(to,descriptor);if(sequence)exitRequested=sequence.mode==='enter';else startExit();return{ok:true,deferred:true};
    }
    return travelNow(to,descriptor);
  }
  function setWorld(next,index=0,options={}){
    if(options.floors)floors=options.floors;if(home===next&&floor===index&&!options.arrivalPoint)return;
    const previous=activityKnown&&!options.arrivalPoint?(point?captureActivity():cloneRobotActivity(savedActivity)):null,previousFloor=floor;
    if(safePoint&&environment==='interior')floorPositions.set(floor,{...safePoint});
    cancel();activeFurniture=null;activeAction=null;visual=null;exitRequested=false;afterExit=null;home=next;floor=index;action='idle';elapsed=0;
    safePoint=home?(environment==='estate'?findOutdoorRobotSpawn(outdoor,outdoorPoint,navigation):findAvatarSpawn(home,options.arrivalPoint??floorPositions.get(floor),navigation)):null;point=safePoint?{...safePoint,y:FLOOR_Y}:null;
    // A changed target is rebuilt from the current world, while a deliberate
    // floor transition owns its arrival and must not replay the old journey.
    if(!options.arrivalPoint&&previous&&previousFloor===floor&&home){savedActivity=previous;if(!suspended)restoreSavedActivity();}
    if(home&&!point)status("DisplayText3985, DisplayText0228.",true);present();
  }
  function setAvatar(value){
    if(!value||disposed)return;const colors=value.colors??value;if(colors.shell||colors.accent)setRobotPalette(robot,colors);
    let recalibrated=false,prior=activityKnown?captureActivity({emit:false}):null;
    if(Object.hasOwn(value,'equipped')){
      const key=JSON.stringify(value.equipped??{});
      if(key!==equipmentKey){resetToSafePoint();wardrobe.setEquipment(value.equipped??{});equipmentKey=key;calibrate();recalibrated=true;if(home){safePoint=environment==='estate'?findOutdoorRobotSpawn(outdoor,safePoint,navigation):findAvatarSpawn(home,safePoint,navigation);point=safePoint?{...safePoint,y:FLOOR_Y}:null;}}
    }
    if(Object.hasOwn(value,'activity')){
      const next=normalizeRobotActivity(value.activity),known=activityKnown,unchanged=sameRobotActivity(next,savedActivity),acknowledged=!!next&&known&&emittedActivities.has(activityKey(next));
      if(!known||!unchanged&&!acknowledged){
        savedActivity=next;activityKnown=true;
        if(next){
          // An initial server checkpoint is also an acknowledged baseline. A
          // delayed object-state reply can echo that baseline after the robot
          // has started rising; it must not replay the old seated activity.
          emittedActivities.add(activityKey(next));if(emittedActivities.size>80)emittedActivities.delete(emittedActivities.values().next().value);
          if(!suspended)restoreSavedActivity();
        }
        else{emittedActivities.clear();if(activeFurniture||activeAction||sequence||swimming||football||dancing||stairMotion||elevatorMotion)resetToSafePoint();}
      }else if(recalibrated&&prior){savedActivity=prior;if(!suspended)restoreSavedActivity();}
    }else if(recalibrated&&prior){savedActivity=prior;if(!suspended)restoreSavedActivity();}
    present();
  }
  function clearAccountBinding(){
    if(activityKnown&&home&&point)captureActivity();
    cancel();floorPositions.clear();outdoorPoint=null;outdoor=null;outdoorKey='';floors=null;home=null;floor=0;point=null;safePoint=null;
    savedActivity=null;activityKnown=false;suspended=false;environment='interior';activeFurniture=null;activeAction=null;visual=null;exitRequested=false;afterExit=null;action='idle';elapsed=0;angle=.25;
    objectContext=null;emittedActivities.clear();lastActivityAt=0;lastActivityPhase='';present();
  }
  function interactions(targetId){
    if(!home||!point)return [];
    if(environment==='interior'&&targetId.startsWith('furniture:')&&isRobotTelevisionKind(home.furniture.find(item=>item.id===targetId.slice(10))?.kind)){
      return [{id:'watch',kind:'watch',label:"DisplayText3986, DisplayText3987",targetId},...listRobotInteractions(home,targetId,{navigation,from:safePoint,poses})];
    }
    const choices=environment==='estate'?listOutdoorRobotInteractions(outdoor,targetId,{navigation,from:swimming?.descriptor.approach??safePoint}):listRobotInteractions(home,targetId,{navigation,from:safePoint,poses});
    if(environment==='estate'){const practice=getRobotFootballDescriptor(outdoor,targetId,{navigation,from:safePoint});if(practice)choices.unshift(practice);}
    if(environment==='interior'&&targetId.startsWith('furniture:')&&isRobotSofaKind(home.furniture.find(item=>item.id===targetId.slice(10))?.kind)){
      const plan=planRobotSofaTelevision(home,targetId.slice(10),{navigation,from:safePoint,poses});
      choices.splice(choices.findIndex(row=>row.id==='sit')+1,0,{id:'watch',kind:'watch',label:"DisplayText3931",targetId,disabled:!plan.ok,reason:plan.error??null});
    }
    return choices;
  }
  function setOutdoorWorld(next){
    const key=JSON.stringify([next?.home?.slab,next?.home?.rooms,(next?.owned??[]).filter(row=>row.status==='placed').map(row=>[row.id,row.item])]);
    outdoor=next;if(key===outdoorKey)return;outdoorKey=key;
    if(environment==='estate'){const previous=activityKnown?(captureActivity({emit:false})??cloneRobotActivity(savedActivity)):null;resetToSafePoint();safePoint=findOutdoorRobotSpawn(outdoor,outdoorPoint,navigation);point=safePoint?{...safePoint,y:FLOOR_Y}:null;if(previous){savedActivity=previous;if(!suspended)restoreSavedActivity();}present();}
  }
  function setEnvironment(value){
    const next=value==='estate'?'estate':'interior';if(next===environment)return;
    if(safePoint){if(environment==='estate')outdoorPoint={...safePoint};else floorPositions.set(floor,{...safePoint});}
    cancel();activeFurniture=null;activeAction=null;visual=null;afterExit=null;exitRequested=false;environment=next;action='idle';elapsed=0;
    safePoint=next==='estate'?findOutdoorRobotSpawn(outdoor,outdoorPoint,navigation):home?findAvatarSpawn(home,floorPositions.get(floor),navigation):null;
    point=safePoint?{...safePoint,y:FLOOR_Y}:null;publishActivity(true);present();
  }
  function useStairs(stairId){
    if(environment!=='interior'||!home||!safePoint||!visible||disposed)return{ok:false,error:"DisplayText3988."};
    if(elevatorMotion)return elevatorBusy();
    const elevator=getHomeStairs(home).find(row=>row.id===stairId)?.type==='elevator';
    const journey=(elevator?planRobotElevator:planRobotStairs)(home,floors,floor,stairId,safePoint,navigation);if(!journey.ok){status(journey.error,true);return journey;}
    return travel(journey.approach,{kind:elevator?'elevator':'stairs',label:elevator?(journey.direction==='up'?"DisplayText3989":"DisplayText3990"):(journey.direction==='up'?"DisplayText3991":"DisplayText3992"),journey});
  }
  function elevatorBusy(){const error="DisplayText3993, DisplayText3994.";status(error);return{ok:false,error};}
  const danceNavigation=()=>({...navigation,radius:Math.max(navigation.radius,DANCE_CLEARANCE_RADIUS)});
  function startDance(facing=danceFacing){
    if(!home||!safePoint||environment!=='interior'||!isAvatarPositionWalkable(home,safePoint,danceNavigation())){danceRequested=false;danceRequestSerial++;danceStartCallback=null;status("DisplayText3995, DisplayText3996.",true);return false;}
    resetToSafePoint();dancing={time:0,blend:0,exitRequested:false,after:null};danceRequested=true;danceTarget={x:point.x,z:point.z};danceFacing=Number.isFinite(facing)?facing:angle;action='dance';elapsed=0;
    setDanceFacing(danceFacing);
    status(dancing.turn?"DisplayText3997, DisplayText3998, DisplayText3999.":"DisplayText4000, DisplayText4001!");present();publishActivity(true);schedule();return true;
  }
  function dance({point:requestedPoint,facing}={}){
    if(environment!=='interior'||!home||!point||!safePoint||!visible||disposed)return{ok:false,error:"DisplayText3988, DisplayText4002."};
    if(elevatorMotion)return elevatorBusy();
    if(stairMotion)return{ok:false,error:"DisplayText4003, DisplayText3999."};
    // A dance belongs to the exact place the teacher chose. Ordinary walking
    // keeps its clicked destination; seated/idle robots use their current
    // ground projection. Never search the house for a replacement stage.
    const candidate=requestedPoint??(danceRequested?danceTarget:null)??(!pendingAction&&route?.length?route.at(-1):point);
    if(!candidate||!Number.isFinite(candidate.x)||!Number.isFinite(candidate.z)||facing!==undefined&&!Number.isFinite(facing)){const error="DisplayText4004.";status(error,true);return{ok:false,error};}
    const target={x:candidate.x,z:candidate.z},targetFacing=facing??danceFacing??angle;
    if(!isAvatarPositionWalkable(home,target,danceNavigation())){const error="DisplayText4005, DisplayText4006; DisplayText4007.";status(error,true);return{ok:false,error};}
    const check=planWalk(safePoint,target);if(!check.ok){status(check.error,true);return check;}
    if(dancing){
      if(Math.hypot(target.x-point.x,target.z-point.z)>.001){finishDance(()=>dance({point:target,facing:targetFacing}));return{ok:true,deferred:true};}
      dancing.exitRequested=false;dancing.after=null;danceRequested=true;setDanceFacing(targetFacing);publishActivity(true);schedule();return{ok:true};
    }
    if(danceRequested&&danceTarget&&Math.hypot(target.x-danceTarget.x,target.z-danceTarget.z)<.001){setDanceFacing(targetFacing);return{ok:true,deferred:true};}
    if(danceRequested)stopDance();
    const request=++danceRequestSerial;danceRequested=true;danceTarget=target;danceFacing=targetFacing;
    const start=()=>{if(!danceRequested||request!==danceRequestSerial)return;danceStartCallback=null;return Math.hypot(target.x-safePoint.x,target.z-safePoint.z)<.001?startDance(danceFacing):travelNow(target,{kind:'dance',facing:danceFacing,label:"DisplayText4008, DisplayText4009"});};
    danceStartCallback=start;
    if(finishSurface(start))return{ok:true,deferred:true};
    if(television){endTelevision(start);return{ok:true,deferred:true};}
    if(activeFurniture||sequence){afterExit=start;if(sequence)exitRequested=sequence.mode==='enter';else startExit();return{ok:true,deferred:true};}
    start();return{ok:true};
  }
  function setDanceFacing(facing){
    if(!Number.isFinite(facing)||!danceRequested||disposed||dancing?.exitRequested)return false;
    const target=Math.atan2(Math.sin(facing),Math.cos(facing));danceFacing=target;
    if(pendingAction?.kind==='dance')pendingAction.facing=target;
    if(!dancing)return true;
    if(dancing.turn&&Math.abs(Math.atan2(Math.sin(target-dancing.turn.target),Math.cos(target-dancing.turn.target)))<.0001)return true;
    const delta=Math.atan2(Math.sin(target-angle),Math.cos(target-angle));
    if(Math.abs(delta)<.0001){if(dancing.turn){dancing.turn=null;action='dance';present();publishActivity(true);schedule();}return true;}
    // A first entrance waits for the performer to face the audience. Later
    // camera changes only steer the ongoing performance: never extinguish
    // its light or pause its animation clock during that correction.
    const waitForStart=dancing.blend===0;
    dancing.turn={from:angle,target,delta,elapsed:0,duration:.55+.35*Math.abs(delta)/Math.PI,waitForStart};action=waitForStart?'dance-turn':'dance';
    present();publishActivity(true);schedule();return true;
  }
  function finishDance(after=null){
    if(!dancing)return false;dancing.exitRequested=true;dancing.after=after;status("DisplayText4010, DisplayText4011.");publishActivity(true);schedule();return true;
  }
  function stopDance(){
    if(dancing){finishDance();return{ok:true};}
    if(!danceRequested)return{ok:true};
    danceRequested=false;danceRequestSerial++;danceTarget=null;danceFacing=null;
    if(afterExit===danceStartCallback)afterExit=null;
    if(afterSurface===danceStartCallback)afterSurface=null;
    if(television?.after===danceStartCallback)television.after=null;
    danceStartCallback=null;
    // Only a walk whose destination belongs to this stage request is stopped.
    // Existing sofa exits, cushion work, or a TV remote return keep their own
    // authored completion and simply lose the deferred dance callback.
    if(pendingAction?.kind==='dance'){resetToSafePoint();publishActivity(true);}
    status("DisplayText4012.");present();return{ok:true};
  }
  function advanceDance(dt){
    const current=dancing;
    if(current.turn&&!current.exitRequested){
      const turn=current.turn;turn.elapsed=Math.min(turn.duration,turn.elapsed+dt);const u=turn.elapsed/turn.duration,s=u*u*(3-2*u);angle=turn.from+turn.delta*s;
      if(u>=1){angle=turn.target;current.turn=null;action='dance';if(turn.waitForStart){elapsed=0;status("DisplayText4000, DisplayText4001!");}publishActivity(true);}
      if(turn.waitForStart)return;
    }
    // Blend a fixed pose at either end. Advancing a full-turn phrase while
    // its shortest-path rotation is only partly blended can cross the pi
    // boundary and reverse the body. Resume the clock only at full weight.
    if(!current.exitRequested&&current.blend===1)current.time=cycleTime(current.time+dt,DANCE_PERIOD);
    current.blend=Math.max(0,Math.min(1,current.blend+(current.exitRequested?-1:1)*dt/.65));
    if(current.exitRequested&&current.blend===0){const next=current.after;resetToSafePoint();status("DisplayText4013, DisplayText4014.");publishActivity(true);next?.();}
  }
  function getStageState(){const eligible=visible&&!disposed&&!suspended&&!document.hidden&&environment==='interior',active=!!dancing&&!dancing.turn?.waitForStart&&eligible;return{active,requested:danceRequested&&eligible,point:active&&point?{...point}:null,time:active?dancing.time:0,intensity:active?dancing.blend:0,storey:floor};}
  function wave(){
    if(!point||!visible||disposed)return false;
    if(elevatorMotion){elevatorBusy();return false;}
    if(danceRequested&&!dancing)stopDance();
    const start=()=>{resetToSafePoint();action='wave';remaining=1.9;status("DisplayText0231, DisplayText0232!");publishActivity(true);schedule();};
    if(finishDance(start))return true;
    if(finishSurface(start))return true;
    if(football){endFootball(start);return true;}
    if(television){endTelevision(start);return true;}
    if(swimming){startSwimExit(start);return true;}
    if(activeFurniture||sequence){afterExit=start;if(sequence)exitRequested=sequence.mode==='enter';else startExit();}else start();return true;
  }
  function remoteHeld(){return !!television&&(['to-seat','sit','watch','rise','to-return'].includes(television.phase)||television.phase==='pickup'&&television.elapsed>=TELEVISION_HANDOFF_TIME||television.phase==='return'&&television.elapsed<TELEVISION_HANDOFF_TIME);}
  function presentRemote(){
    const next=television?{id:television.plan.tvId,remoteHeld:remoteHeld()}:null;
    if(presentedRemote&&(!next||next.id!==presentedRemote.id))onObjectPresentation?.({id:presentedRemote.id,remoteHeld:false});
    if(next&&(!presentedRemote||next.id!==presentedRemote.id||next.remoteHeld!==presentedRemote.remoteHeld))onObjectPresentation?.(next);
    presentedRemote=next;
  }
  function clearTelevision(){television=null;presentRemote();}
  function televisionNeedsFrame(){return !!television&&(television.phase!=='watch'||television.pressRemaining>0);}
  function televisionCommand(patch){
    if(!television)return;const owner=television,payload={id:owner.plan.tvId,storey:floor,patch};
    try{Promise.resolve(onObjectAction?.(payload)).then(result=>{if(television===owner&&result?.ok===false)status(result.error??"DisplayText4015, DisplayText4016.",true);},()=>{if(television===owner)status("DisplayText4015, DisplayText4016.",true);});}catch{if(television===owner)status("DisplayText4015, DisplayText4016.",true);}
  }
  function televisionEntry(){const plan=television.plan;return createRobotFurnitureEntry(plan.seat,poses,{point:plan.seat.approach,rotation:television.originRotation*180/Math.PI,time:0});}
  function televisionGrip(plan){
    const previousPosition=robot.position.clone(),previousQuaternion=robot.quaternion.clone();
    const contact=sampleTelevisionRemoteReach(plan,TELEVISION_HANDOFF_TIME).point;robot.position.set(contact.x,FLOOR_Y,contact.z);robot.rotation.set(0,plan.pickupRotation*Math.PI/180,0);poseRobotAvatar(robot);
    group.updateWorldMatrix(true,false);const target=new THREE.Vector3(plan.remoteDock.x,plan.remoteDock.y,plan.remoteDock.z).applyMatrix4(group.matrixWorld);
    poseRobotTelevisionArms(robot,{reach:1,target});const socket=robot.getObjectByName('HandSocketR');socket.updateWorldMatrix(true,false);
    const position=socket.worldToLocal(target.clone()),world=group.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),plan.tvRotation*Math.PI/180));
    const quaternion=socket.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world);
    robot.position.copy(previousPosition);robot.quaternion.copy(previousQuaternion);return {position,quaternion};
  }
  function setTelevisionPhase(phase){
    const current=television;if(!current)return;
    current.phase=phase;current.elapsed=0;current.originRotation=angle;current.route=null;current.motion=null;elapsed=0;visual=null;
    if(['to-remote','to-seat','to-return'].includes(phase)){
      const target=phase==='to-seat'?current.plan.seat.approach:current.plan.approach,result=planAvatarWalk(home,point,target,navigation);
      if(!result.ok){status(result.error,true);clearTelevision();resetToSafePoint();publishActivity(true);return false;}
      current.route=result.path.map(value=>({...value,y:FLOOR_Y}));action='walk';
    }else if(phase==='sit'||phase==='rise'){
      const entry=televisionEntry();current.entry=entry;
      current.motion={steps:phase==='rise'?reverseRobotFurnitureSteps(entry):entry,index:0,elapsed:0};action=phase==='rise'?'exiting':'entering';
      visual=sampleRobotMotionStep(current.motion.steps[0],0,0);point={...visual.point};angle=visual.rotation*Math.PI/180;
    }else if(phase==='watch'){
      const entry=current.entry??televisionEntry();visual=sampleRobotMotionStep(entry.at(-1),1);point={...visual.point};angle=visual.rotation*Math.PI/180;action='watch';current.pressRemaining=1.2;
      televisionCommand({power:true});
    }else action=phase==='pickup'?'remote-pickup':'remote-return';
    status(televisionLabels[phase]);present();publishActivity(true);schedule();return true;
  }
  function restoreTelevisionPhase(value){
    const current=television,phase=current.phase;
    if(['to-remote','to-seat','to-return'].includes(phase)){
      const target=phase==='to-seat'?current.plan.seat.approach:current.plan.approach,result=planAvatarWalk(home,point,target,navigation);if(!result.ok)return false;
      current.route=result.path.map(p=>({...p,y:FLOOR_Y}));action='walk';
    }else if(phase==='sit'||phase==='rise'){
      const entry=televisionEntry();current.entry=entry;current.motion={steps:phase==='rise'?reverseRobotFurnitureSteps(entry):entry,index:0,elapsed:0};setCheckpoint(current.motion,value);
      const step=current.motion.steps[current.motion.index];visual=sampleRobotMotionStep(step,value.progress,current.motion.elapsed);point={...visual.point};angle=visual.rotation*Math.PI/180;safePoint={...current.plan.seat.approach};action=phase==='rise'?'exiting':'entering';
    }else if(phase==='watch'){
      current.entry=televisionEntry();visual=sampleRobotMotionStep(current.entry.at(-1),1);point={...visual.point};angle=visual.rotation*Math.PI/180;safePoint={...current.plan.seat.approach};action='watch';
    }else {point=sampleTelevisionRemoteReach(current.plan,value.time).point;safePoint={...current.plan.approach};action=phase==='pickup'?'remote-pickup':'remote-return';}
    return true;
  }
  function startTelevision(targetId){
    if(environment!=='interior'||!home||!point||!visible||disposed)return {ok:false,error:"DisplayText3988."};
    if(elevatorMotion)return elevatorBusy();
    if(danceRequested&&!dancing)stopDance();
    const selectedId=targetId.replace(/^furniture:/,''),selected=home.furniture.find(row=>row.id===selectedId),plan=isRobotSofaKind(selected?.kind)?planRobotSofaTelevision(home,selectedId,{navigation,from:safePoint,poses}):planRobotTelevision(home,selectedId,{navigation,from:safePoint,poses});const tvId=plan.tvId;
    if(!plan.ok){status(plan.error,true);return plan;}
    const start=()=>{resetToSafePoint();plan.grip=televisionGrip(plan);television={plan,phase:'to-remote',elapsed:0,originRotation:angle,pressRemaining:0,exitRequested:false,after:null};setTelevisionPhase('to-remote');};
    if(finishDance(start))return {ok:true,deferred:true};
    if(finishSurface(start))return {ok:true,deferred:true};
    if(television){if(television.plan.tvId===tvId&&television.plan.seatId===plan.seatId&&television.phase==='watch')return {ok:true};endTelevision(start);return {ok:true,deferred:true};}
    if(activeFurniture||sequence){afterExit=start;if(sequence)exitRequested=sequence.mode==='enter';else startExit();return {ok:true,deferred:true};}
    if(swimming)return {ok:false,error:"DisplayText4017."};
    start();return {ok:true};
  }
  function endTelevision(after=null){
    if(!television)return;const current=television;current.after=after;current.exitRequested=true;
    if(current.phase==='watch'){televisionCommand({power:false});setTelevisionPhase('rise');}
    else if(current.phase==='to-seat')setTelevisionPhase('to-return');
    else if(current.phase==='to-remote'){
      const next=current.after;clearTelevision();resetBeforeContinuation(next);publishActivity(true);next?.();
    }else publishActivity(true);
  }
  function changeTelevisionChannel(tvId){
    tvId=tvId?.replace(/^furniture:/,'');
    if(!television||television.phase!=='watch'||television.plan.tvId!==tvId){const error="DisplayText4018, DisplayText4019.";status(error,true);return {ok:false,error};}
    const state=getObjectState(objectContext,tvId),channel=((state?.channel??0)+1)%4;
    television.pressRemaining=1.2;televisionCommand({power:true,channel});status("DisplayText4020, DisplayText4021.");publishActivity(true);schedule();return {ok:true};
  }
  function advanceTelevision(dt){
    const current=television;if(!current)return;current.elapsed+=dt;
    if(current.route){
      let distance=dt*1.7;
      while(current.route.length&&distance>0){const target=current.route[0],dx=target.x-point.x,dz=target.z-point.z,length=Math.hypot(dx,dz);if(length<1e-7){current.route.shift();continue;}const take=Math.min(distance,length);angle=Math.atan2(dx,dz);point.x+=dx*take/length;point.z+=dz*take/length;point.y=FLOOR_Y;safePoint={x:point.x,z:point.z};distance-=take;if(take>=length-1e-7)current.route.shift();}
      if(!current.route.length)setTelevisionPhase(current.phase==='to-seat'?'sit':current.phase==='to-return'?'return':'pickup');
    }else if(current.motion){
      let left=dt;
      while(television===current&&current.motion&&left>=0){const motion=current.motion,step=motion.steps[motion.index],take=Math.min(left,step.duration-motion.elapsed);motion.elapsed+=take;left-=take;const progress=Math.min(1,motion.elapsed/step.duration);visual=sampleRobotMotionStep(step,progress,motion.elapsed);point={...visual.point};angle=visual.rotation*Math.PI/180;if(progress<1)break;if(motion.index<motion.steps.length-1){motion.index++;motion.elapsed=0;if(left<=0)break;continue;}
        if(current.phase==='sit'){setTelevisionPhase('watch');if(current.exitRequested){televisionCommand({power:false});setTelevisionPhase('rise');}}
        else{point={...current.plan.seat.approach,y:FLOOR_Y};safePoint={...current.plan.seat.approach};setTelevisionPhase('to-return');}break;}
    }else if(current.phase==='watch'){
      current.elapsed=cycleTime(current.elapsed,100);current.pressRemaining=Math.max(0,current.pressRemaining-dt);
    }else{
      point=sampleTelevisionRemoteReach(current.plan,current.elapsed).point;const turn=Math.min(1,current.elapsed/.35),target=current.plan.pickupRotation*Math.PI/180,delta=Math.atan2(Math.sin(target-current.originRotation),Math.cos(target-current.originRotation));angle=current.originRotation+delta*(turn*turn*(3-2*turn));
      if(current.elapsed>=TELEVISION_REACH_DURATION){if(current.phase==='pickup')setTelevisionPhase(current.exitRequested?'to-return':'to-seat');else{const next=current.after;clearTelevision();action='idle';elapsed=0;visual=null;safePoint={x:point.x,z:point.z};floorPositions.set(floor,{...safePoint});publishActivity(true);status("DisplayText4022, DisplayText0224.");next?.();}}
    }
  }
  function endFootball(after=null){if(!football)return;football.exitRequested=true;football.after=after;status("DisplayText4023, DisplayText4024.");publishActivity(true);schedule();}
  function advanceFootball(dt){
    if(!football)return;const current=football,next=current.time+dt;
    if(current.exitRequested&&next>=FOOTBALL_PERIOD){const after=current.after,approach=current.descriptor.approach;football=null;footballFrame=null;point={...approach};safePoint={x:approach.x,z:approach.z};outdoorPoint={...safePoint};action='idle';elapsed=0;status("DisplayText4025, DisplayText3969.");publishActivity(true);after?.();return;}
    if(next>=FOOTBALL_PERIOD)current.originRotation=current.descriptor.field.rotation*Math.PI/180;
    current.time=cycleTime(next,FOOTBALL_PERIOD);footballFrame=sampleRobotFootballMotion(current.descriptor,current.time);point={...footballFrame.point};const target=footballFrame.rotation*Math.PI/180;
    if(current.time<.35){const u=current.time/.35,s=u*u*(3-2*u),delta=Math.atan2(Math.sin(target-current.originRotation),Math.cos(target-current.originRotation));angle=current.originRotation+delta*s;}else angle=target;
  }
  function visibilityChanged(){if(presentationPaused)return;if(document.hidden)pauseActivity();else if(visible){resumeActivity();if(!suspended&&hasFrameWork())schedule();}}document.addEventListener('visibilitychange',visibilityChanged);
  return {group,supportsOutdoor:true,setWorld,setOutdoorWorld,setEnvironment,setAvatar,setObjectContext:value=>{objectContext=value;},changeTelevisionChannel,captureActivity,clearAccountBinding,stand,walk:to=>travel(to),interactions,useStairs,wave,dance,stopDance,setDanceFacing,getStageState,setPresentationPaused,
    listStairs:()=>(environment==='interior'?getHomeStairs(home):[]).map(row=>({id:row.id,type:row.type??'stairs',direction:row.direction,label:row.type==='elevator'?(row.direction==='up'?"DisplayText4026":"DisplayText4027"):(row.direction==='up'?"DisplayText4028":"DisplayText4029")})),
    targetLabel:id=>environment==='estate'?interactions(id)[0]?.label??null:home?getAvatarInteractionTargetLabel(home,id):null,
    interact(targetId,id){if(id==='watch')return startTelevision(targetId);if(elevatorMotion)return elevatorBusy();const descriptor=interactions(targetId).find(item=>item.id===id);return descriptor?travel(descriptor.approach,descriptor):{ok:false,error:"DisplayText4030, DisplayText4031."};},
    setVisible(value){const becameVisible=!visible&&Boolean(value);if(!value)pauseActivity();visible=Boolean(value);if(becameVisible&&!document.hidden){resumeActivity();if(!suspended&&hasFrameWork())schedule();}present();},
    hit(raycaster){if(!group.visible)return null;const meshes=[];robot.traverseVisible(n=>{if(n.isMesh)meshes.push(n);});return raycaster.intersectObjects(meshes,false)[0]??null;},
    getAnchor:()=>point?{x:point.x,y:(point.y??FLOOR_Y)+navigation.height*.65,z:point.z}:null,
    getState:()=>({point:point?{...point}:null,safePoint:safePoint?{...safePoint}:null,floor,action,visible,disposed,presentationPaused,navigation:{...navigation},scheduled:!!frame,dance:dancing?{time:dancing.time,blend:dancing.blend,exitRequested:dancing.exitRequested}:null,
      inTransition:!!television&&television.phase!=='watch'||!!elevatorMotion||!!sequence||!!swimming&&swimming.mode!=='loop',phase:footballFrame?.phase??television?.phase??elevatorFrame?.phase??swimFrame?.phase??stairFrame?.phase??sequence?.steps[sequence.index].phase??(action==='sit'?'seated':action==='lie'?'lying':action),phaseLabel:footballFrame?footballFrame.label:television?televisionLabels[television.phase]:elevatorFrame?.phaseLabel??swimFrame?.phaseLabel??stairFrame?.phaseLabel??sequence?.steps[sequence.index].label??'',transitionProgress:television?(television.motion?television.motion.elapsed/television.motion.steps[television.motion.index].duration:Math.min(1,television.elapsed/TELEVISION_REACH_DURATION)):elevatorMotion?elevatorMotion.elapsed/elevatorMotion.steps[elevatorMotion.index].duration:stairMotion?stairMotion.elapsed/stairMotion.steps[stairMotion.index].duration:sequence?sequence.elapsed/sequence.steps[sequence.index].duration:1,
      stairStep:stairFrame?.stairStep?structuredClone(stairFrame.stairStep):null,
      elevatorFrame:elevatorFrame?structuredClone(elevatorFrame):null,elevatorDirection:elevatorJourney?.direction??null,
      stairDirection:stairJourney?.direction??null,football:football?{itemId:football.descriptor.targetId.slice(8),time:football.time,exitRequested:football.exitRequested,frame:structuredClone(footballFrame)}:null,television:television?{tvId:television.plan.tvId,seatId:television.plan.seatId,remoteHeld:remoteHeld()}:null,environment,swimPool:swimming?.descriptor.targetId??null,swimBlend:swimFrame?.swimBlend??0,activity:cloneRobotActivity(savedActivity)}),
    dispose(){if(disposed)return;if(activityKnown)captureActivity();disposed=true;cancel();document.removeEventListener('visibilitychange',visibilityChanged);footballBall.dispose();waterEffects.dispose();props.dispose();wardrobe.dispose();disposeRobotAvatar(robot);shadow.geometry.dispose();shadow.material.dispose();group.removeFromParent();},
  };
}

/** Small shared geometries; a single controller clock drives wake and droplets.
 * No textures, emitters, or independent RAF survive leaving the pool. */
function createSwimEffects(parent){
  const root=new THREE.Group();root.name='robot-swim-water';parent.add(root);
  const ringGeometry=new THREE.RingGeometry(.16,.18,28),dropGeometry=new THREE.SphereGeometry(.025,6,4);
  const rings=[0,1].map(()=>{const material=new THREE.MeshBasicMaterial({color:'#d8fbff',transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(ringGeometry,material);mesh.rotation.x=-Math.PI/2;root.add(mesh);return mesh;});
  const material=new THREE.MeshBasicMaterial({color:'#b9f5ff',transparent:true,opacity:.8,depthWrite:false});
  const drops=Array.from({length:8},()=>{const mesh=new THREE.Mesh(dropGeometry,material);root.add(mesh);return mesh;});
  root.visible=false;
  return {update(frame,descriptor,time){
    root.visible=!!frame&&frame.swimBlend>.55;
    if(!root.visible)return;
    const y=descriptor?.pool?.waterY??frame.point.y;
    root.position.set(frame.point.x,y+.018,frame.point.z);root.rotation.y=frame.rotation*Math.PI/180;
    rings.forEach((mesh,i)=>{const t=(time*.72+i*.5)%1;mesh.scale.set(1+t*1.7,.7+t,1);mesh.position.z=-.25;mesh.material.opacity=(1-t)*.42*frame.swimBlend;});
    drops.forEach((mesh,i)=>{const t=(time*1.25+i/8)%1;mesh.position.set((i%2?1:-1)*(.24+t*.20),Math.sin(t*Math.PI)*.14,.35-(i>>1)*.20);mesh.scale.setScalar(.5+Math.sin(t*Math.PI)*.6);});
  },dispose(){root.removeFromParent();ringGeometry.dispose();dropGeometry.dispose();rings.forEach(mesh=>mesh.material.dispose());material.dispose();}};
}

/** Readable action props are local runtime objects, never hidden inventory grants. */
function createActionProps(robot){
  const root=new THREE.Group();root.name='robot-daily-action-props';robot.add(root);
  const book=new THREE.Group(),cook=new THREE.Group(),wash=new THREE.Group();book.name='robot-open-book';cook.name='robot-cooking-bowl';wash.name='robot-washing-water';root.add(book,cook,wash);
  const geometries=new Set(),materials=new Set();
  function mesh(parent,g,color,p){const m=new THREE.MeshStandardMaterial({color,roughness:.65}),n=new THREE.Mesh(g,m);n.position.set(...p);n.userData.robotActionProp=true;parent.add(n);geometries.add(g);materials.add(m);return n;}
  const box=(p,s,c,at)=>mesh(p,new THREE.BoxGeometry(...s),c,at);
  const remote=new THREE.Group();remote.name='robot-television-remote';remote.userData.robotActionProp=true;
  robot.getObjectByName('HandSocketR').add(remote);remote.position.set(0,-.015,.045);remote.rotation.x=-.10;
  box(remote,[.10,.026,.22],'#304849',[0,0,0]);box(remote,[.075,.006,.065],'#b9ddd3',[0,.017,-.055]);
  for(let row=0;row<3;row++)for(const side of[-1,1])box(remote,[.023,.009,.023],row===0&&side===-1?'#e7896b':'#e9dfc9',[side*.024,.02,.01+row*.04]);
  for(const side of[-1,1]){const page=new THREE.Group();page.rotation.z=side*-.12;book.add(page);box(page,[.21,.024,.29],'#518e96',[side*.108,0,0]);box(page,[.20,.018,.27],'#fff5db',[side*.108,.022,0]);for(let n=0;n<5;n++)box(page,[.15,.003,.005],'#8d9b95',[side*.108,.033,-.09+n*.04]);}
  mesh(cook,new THREE.SphereGeometry(.16,20,10,0,Math.PI*2,Math.PI/2,Math.PI/2),'#d79263',[0,0,0]);mesh(cook,new THREE.CylinderGeometry(.15,.15,.012,20),'#d3b765',[0,0,0]);
  const spoon=new THREE.Group();spoon.name='robot-stirring-spoon';root.add(spoon);mesh(spoon,new THREE.CylinderGeometry(.012,.012,.30,8),'#937553',[0,0,0]);mesh(spoon,new THREE.SphereGeometry(.035,10,8),'#937553',[0,-.15,0]);
  for(let n=0;n<7;n++)mesh(wash,new THREE.SphereGeometry(.018,8,6),'#99d9e7',[0,0,0]);
  const cloth=box(root,[.20,.012,.16],'#55b9b1',[0,0,0]);cloth.name='robot-cleaning-cloth';
  const a=new THREE.Vector3(),b=new THREE.Vector3(),tip=new THREE.Vector3(),shaft=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),inverse=new THREE.Matrix4();
  return {update(action,time,{remoteHeld=false,remoteGrip=null}={}){
    remote.visible=remoteHeld;if(remoteHeld&&remoteGrip){remote.position.copy(remoteGrip.position);remote.quaternion.copy(remoteGrip.quaternion);}
    cloth.visible=action==='wipe';if(cloth.visible){robot.updateWorldMatrix(true,true);inverse.copy(robot.matrixWorld).invert();robot.getObjectByName('HandSocketR').getWorldPosition(b).applyMatrix4(inverse);cloth.position.copy(b);cloth.position.y-=.025;}
    book.visible=action==='read';cook.visible=spoon.visible=action==='cook';wash.visible=action==='wash';if(!['read','cook','wash'].includes(action))return;
    robot.updateWorldMatrix(true,true);inverse.copy(robot.matrixWorld).invert();
    robot.getObjectByName('HandSocketL').getWorldPosition(a).applyMatrix4(inverse);robot.getObjectByName('HandSocketR').getWorldPosition(b).applyMatrix4(inverse);
    book.position.copy(a).add(b).multiplyScalar(.5);book.position.y-=.035;book.rotation.x=.32;
    cook.position.copy(a);cook.position.x-=.11;cook.position.y-=.06;
    tip.set(Math.sin(time*3.6)*.055,-.10,Math.cos(time*3.6)*.055).add(cook.position);
    shaft.copy(b).sub(tip);spoon.position.copy(b).add(tip).multiplyScalar(.5);spoon.scale.y=shaft.length()/.30;spoon.quaternion.setFromUnitVectors(up,shaft.normalize());
    wash.position.copy(a).add(b).multiplyScalar(.5);wash.children.forEach((drop,n)=>drop.position.set(Math.sin(n*2.3)*.065,-((time*.6+n*.027)%.23),Math.cos(n*2.3)*.06));
  },dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();remote.removeFromParent();}};
}

function createFootballBall(parent){
  const group=new THREE.Group();group.name='robot-practice-football';parent.add(group);
  const geometry=new THREE.SphereGeometry(FOOTBALL_BALL_RADIUS,16,10),material=new THREE.MeshStandardMaterial({color:'#fff6dc',roughness:.78}),ball=new THREE.Mesh(geometry,material);group.add(ball);
  const patchGeometry=new THREE.CircleGeometry(FOOTBALL_BALL_RADIUS*.33,5),patchMaterial=new THREE.MeshStandardMaterial({color:'#274a45',roughness:.8,side:THREE.DoubleSide});
  for(const normal of [[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){const n=new THREE.Vector3(...normal),patch=new THREE.Mesh(patchGeometry,patchMaterial);patch.position.copy(n).multiplyScalar(FOOTBALL_BALL_RADIUS+.001);patch.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);ball.add(patch);}
  group.visible=false;return {update(frame,fieldRotation=0){group.visible=!!frame;if(!frame)return;group.position.set(frame.ball.x,frame.ball.y,frame.ball.z);group.rotation.y=fieldRotation*Math.PI/180;ball.rotation.set(0,0,-frame.ballRoll);},dispose(){group.removeFromParent();geometry.dispose();material.dispose();patchGeometry.dispose();patchMaterial.dispose();}};
}
