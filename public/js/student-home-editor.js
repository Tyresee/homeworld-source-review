import {getKitchenFit,areKitchenModulesCompatible,getKitchenDockPose} from './home-kitchen-fit.js';
import {createStudentHomeWorld} from './student-home-world.js';
import {createHomeShop} from './home-shop-ui.js';
import {createSceneContextMenu} from './home-context-menu.js';
import {createFloorPlanner} from './home-floor-planner.js';
import {createRoomPlanner} from './home-room-planner.js';
import {ROBOT_CLOTHING_PRODUCTS} from './robot-wardrobe-catalog.js';
import {createStudentHomeWardrobe} from './student-home-wardrobe.js';
import {createStudentHomeThumbnails} from './student-home-thumbnails.js';
import {SHOP_CATALOG,ELEVATOR_UPGRADE_PRODUCT,quoteStaircaseUpgrade,listOwnedResaleQuotes,getFloorHomes,getFloorHome,setCartQuantity,quoteFloorConstruction,quoteOwnedRoomPlacement,getStoreyRoomSlots,placeOwnedItem,placeOwnedOutdoor} from './home-commerce.js';
import {getHomeStairs} from './home-staircase-shape.js';
import {applyChange,PALETTE} from './home-engine.js';
import {getHomeSwatches} from './home-theme.js';
import {getWarmFloorMenu} from './student-home-floor-menu.js';
import {getWarmWallMenu,getWallMenuTarget} from './home-wall-menu.js';
import {roomRect} from './home-layout.js';
import {getStoredPlacementGroups} from './home-inventory-menu.js';
import {cloneRobotActivity,sameRobotActivity,isRobotActivityShape} from './student-home-robot-state.js';
import {createStudentHomeRobotOutbox} from './student-home-robot-outbox.js';
import {getHomeObjectMenu} from './student-home-object-menu.js';
import {getObjectState} from './home-object-state.js';
import {createStudentHomeObjectOutbox} from './student-home-object-outbox.js';
import {createStudentHomeQuickActions} from './student-home-quick-actions.js';
import {getObjectQuickActions,getQuickActionOwned} from './student-home-quick-action-menu.js';

/** Formal account editor. Cart and placement previews are ephemeral; every
 * owned object, payment and structural edit is acknowledged by the server. */
export function createStudentHomeScene(container,{onRobot,onCommand,onStatus=()=>{},onViewChange=()=>{},onStageChange=()=>{},onStageCameraChange=()=>{}}={}){
  let world,home,wallet=null,cart=[],floor=0,placing=null,busy=false,pending=null,disposed=false,opening;
  let robotActivity=null,activityIntent=null,activitySerial=0,identityEpoch=0,desiredActivity=null,activityRetry=null,activitySaving=null;
  let actorId=null,binding=null,commandInFlight=null,leaving=false,leaveCount=0,suppressActivity=false,savedDeparture=null;
  const bindings=new Map(),commerceWaiters=new Map(),outbox=createStudentHomeRobotOutbox();
  const objectOutbox=createStudentHomeObjectOutbox(),objectFlights=new Set();
  let resaleSource=null,resaleBalance=null,resaleQuotes=new Map();
  const copyActivity=cloneRobotActivity,sameActivity=sameRobotActivity;
  const bindingKey=(actor,student)=>JSON.stringify([actor,student]);
  function checkpoint(value){return outbox&&actorId&&home?outbox.enqueue({actorId,studentId:home.studentId,home,robotActivity},value):null;}
  function captureRobotActivity(){if(!home||!world)return;const activity=world.captureRobotActivity?.({emit:false});if(activity!==undefined)queueRobotActivity(activity);}
  const catalog=[...SHOP_CATALOG.filter(p=>!['clothing','storey'].includes(p.productType)),...ROBOT_CLOTHING_PRODUCTS],products=new Map(catalog.map(p=>[p.skuId,p]));
  const thumbnails=createStudentHomeThumbnails(),menu=createSceneContextMenu();
  let quickSelection=null;
  const quickActions=createStudentHomeQuickActions({onAction:runQuickAction,onStop:()=>{if(!home||isCommerceBusy())return {ok:false,error:"DisplayText3716, DisplayText3345."};world?.standAvatar();return {ok:true};},onClose:()=>{quickSelection=null;}});
  function closeQuickActions(){quickSelection=null;quickActions.close();}
  function quickActivityStatus(model){
    const activity=activityIntent;if(!activity||activity.storey!==floor)return null;
    if(model.targetId==='avatar'&&activity.kind==='dance'){
      if(activity.exitRequested)return "DisplayText3717, DisplayText3718.";
      const stage=world?.getStageState?.();
      return stage?.requested&&stage.active===false?"DisplayText3719, DisplayText3720.":"DisplayText3721, DisplayText3722.";
    }
    const id=model.owned?.id??model.targetId?.replace(/^stair:/,'');
    if(activity.itemId!==id&&!(activity.kind==='watch'&&activity.seatId===id))return null;
    if(activity.kind==='watch')return ({'to-remote':"DisplayText3723.",pickup:"DisplayText3724.",'to-seat':"DisplayText3725.",sit:"DisplayText3726.",watch:"DisplayText3727.",rise:"DisplayText3728.",'to-return':"DisplayText3729.",return:"DisplayText3730."})[activity.phase]??"DisplayText3731.";
    if(activity.kind==='sleep')return "DisplayText3732.";
    if(activity.kind==='swim')return activity.phase==='exit'?"DisplayText3733.":activity.phase==='enter'?"DisplayText3734.":"DisplayText3735.";
    if(activity.kind==='football')return activity.exitRequested?"DisplayText3736, DisplayText3737.":"DisplayText3738.";
    if(activity.kind==='stairs')return "DisplayText3739.";
    if(activity.kind==='elevator')return "DisplayText3740.";
    if(activity.kind==='furniture'){
      if(activity.phase==='exit')return "DisplayText3741.";
      if(activity.phase==='enter')return activity.action==='lie'?"DisplayText3742, DisplayText3743.":"DisplayText3744.";
      return ({sit:"DisplayText3745.",lie:"DisplayText3746.",read:"DisplayText3747.",cook:"DisplayText3748.",wash:"DisplayText3749.",dishwash:"DisplayText3750.",tidy:"DisplayText3751.",wipe:"DisplayText3752.",admire:"DisplayText3753."})[activity.action]??null;
    }
    return null;
  }
  const quickActivityKey=value=>JSON.stringify(value?[value.kind,value.action,value.itemId,value.seatId,value.storey,value.phase,value.exitRequested]:null);
  const emptyStageCamera=()=>({active:false,returning:false,available:false,suppressed:false});
  function stageCameraChanged(value){onStageCameraChange(value);refreshQuickActions({keepStatus:true});}
  function quickModel(){
    if(!quickSelection||!world||!home||quickSelection.epoch!==identityEpoch||quickSelection.floor!==floor||quickSelection.view!==world.getView())return null;
    const {data,view}=quickSelection;
    if(data.surfaceId==='avatar'){const camera=world.getStageCameraState?.()??emptyStageCamera();return {targetId:'avatar',title:"DisplayText3715",actions:[
      {id:'stage:dance',label:"DisplayText3754",icon:'dance',detail:view==='interior'?"DisplayText3755 · DisplayText3756 · DisplayText3757":"DisplayText3758",disabled:view!=='interior',reason:"DisplayText3759",command:{type:'dance'}},
      ...(view==='interior'&&(camera.available||camera.active||camera.returning)?[{id:'stage:camera',label:camera.returning?"DisplayText3760…":camera.active?"DisplayText3761":"DisplayText3762",icon:'admire',detail:camera.active||camera.returning?"DisplayText3763, DisplayText3764":"DisplayText3765, DisplayText3766",disabled:camera.returning,reason:"DisplayText3767, DisplayText3345",command:{type:'stage-camera'}}]:[]),
      {id:'avatar:wave',label:"DisplayText3711",icon:'stand',command:{type:'wave'}},
      {id:'avatar:wardrobe',label:"DisplayText3768",icon:'wardrobe',command:{type:'wardrobe'}},
    ]};}
    if(data.stairId){const stair=world.getAvatarStairs().find(row=>row.id===data.stairId);return stair?{targetId:`stair:${stair.id}`,title:"DisplayText3769",actions:[{id:`stairs:${stair.id}`,label:stair.label,icon:'stairs',disabled:stair.disabled,reason:stair.reason??stair.error,command:{type:'stairs',id:stair.id}}]}:null;}
    const owned=getQuickActionOwned(home.commerce,data,view,floor);if(!owned)return null;
    const product=products.get(owned.skuId),targetId=`${view==='estate'?'outdoor':'furniture'}:${owned.id}`;
    // The record and the view must agree; never offer a hidden floor's item.
    if((product?.productType==='outdoor')!==(view==='estate'))return null;
    const actions=getObjectQuickActions({robotActions:world.getAvatarInteractions(targetId),kind:owned.item.kind,objectState:getObjectState(home.commerce,owned.id),watching:activityIntent?.kind==='watch'&&activityIntent.itemId===owned.id&&activityIntent.phase==='watch'});
    return {targetId,owned,title:product?.name??world.getAvatarTargetLabel(targetId)??"DisplayText3770",actions,image:product?thumbnails.image({...product,item:owned.item}):null};
  }
  function refreshQuickActions({keepStatus=false}={}){
    if(!quickSelection)return;const model=quickModel();if(!model){closeQuickActions();return;}
    // Object-setting acknowledgements can rebuild these buttons after the
    // robot has already reached its seat. The current semantic checkpoint,
    // never the generic selection prompt, owns an active object's status.
    const activityStatus=quickActivityStatus(model);
    const stopLabel=activityIntent?.kind==='dance'?"DisplayText3771 · DisplayText3772":activityIntent?.kind==='swim'?"DisplayText3773":activityIntent?.kind==='football'?"DisplayText3774":"DisplayText3775";
    quickActions.show({...model,busy:isCommerceBusy(),stopLabel,...activityStatus?{status:activityStatus}:keepStatus?{}:{status:model.actions.length?"DisplayText3776, DisplayText3777.":"DisplayText3778; DisplayText3779."}});
    if(quickSelection.view==='interior'&&model.owned)world.selectSurface(model.targetId);
  }
  function openQuickActions(request){
    menu.close({restoreFocus:false});
    if(!home||isCommerceBusy()||placing||!request.data){closeQuickActions();return;}
    quickSelection={data:{...request.data},view:request.view,floor,epoch:identityEpoch};refreshQuickActions();
  }
  async function runQuickAction(id,targetId){
    if(isCommerceBusy())return {ok:false,error:"DisplayText3716, DisplayText3345."};
    const model=quickModel(),action=model?.actions.find(row=>row.id===id);
    if(!model||model.targetId!==targetId||!action)return {ok:false,error:"DisplayText3780, DisplayText3781."};
    if(action.disabled)return {ok:false,error:action.reason||"DisplayText3782."};
    const epoch=identityEpoch,c=action.command;void world.unlockObjectAudio();
    let result;
    if(c.type==='robot')result=world.interactAvatar(targetId,c.actionId);
    else if(c.type==='stairs')result=world.useAvatarStairs(c.id);
    else if(c.type==='patch')result=await changeObjectState(model.owned.id,c.patch,floor);
    else if(c.type==='demonstrate'){world.demonstrateObject(model.owned.id);result={ok:true};}
    else if(c.type==='robot-channel')result=world.changeAvatarTelevisionChannel(model.owned.id);
    else if(c.type==='dance')result=world.danceAvatar();
    else if(c.type==='stage-camera')result=toggleStageCamera();
    else if(c.type==='wave')result={ok:world.waveAvatar()!==false};
    else if(c.type==='wardrobe'){openWardrobe();result={ok:true};}
    if(epoch!==identityEpoch)return {ok:false,error:"DisplayText3783."};
    if(result?.error)onStatus(result.error);return result??{ok:true};
  }
  function state(){if(!home?.commerce)return null;const copy={...home.commerce,cart};const balance=wallet?.balance??0;copy.wallet={balance,initialBalance:home.commerce.wallet.initialBalance+balance};return copy;}
  function sync(){if(world&&home?.commerce){floor=Math.min(floor,getFloorHomes(home.commerce).length-1);world.setCommerce(home.commerce,home.avatar,floor,activityIntent);refreshQuickActions();}}
  function isCommerceBusy(){return busy&&pending?.value?.type!=='setRobotActivity';}
  function toggleStage(){
    if(!world||!home||isCommerceBusy())return {ok:false,error:"DisplayText3716, DisplayText3345."};
    if(world.getStageState?.().requested){world.stopAvatarDance();return {ok:true};}
    if(world.getView()!=='interior'){const error="DisplayText3758, DisplayText3784.";onStatus(error);return {ok:false,error};}
    menu.close({restoreFocus:false});quickSelection={data:{surfaceId:'avatar'},view:'interior',floor,epoch:identityEpoch};refreshQuickActions();
    const result=world.danceAvatar();if(result?.error)onStatus(result.error);return result;
  }
  function isCurrentFloorSurface(surfaceId){
    if(surfaceId==='floor.main')return true;
    const match=typeof surfaceId==='string'&&/^room:([a-z\d_.:-]+)\.floor$/i.exec(surfaceId);
    return !!match&&getFloorHome(home.commerce,floor).rooms.some(room=>room.id===match[1]);
  }
  function floorDanceSelection(request){
    const data=request.data??{},point=request.worldPoint,hit=request.placementAnchor?.hit;
    if(request.view!=='interior'||world.getView()!=='interior'||!isCurrentFloorSurface(data.surfaceId)
      ||data.furnitureId||data.outdoorOwnedId||data.stairId||data.propId||data.dynamicId
      ||!point||![point.x,point.z].every(Number.isFinite))return null;
    // A floor-plane projection also exists under a wall or a piece of
    // furniture. When the raycast snapshot is present, the actual top surface
    // must agree; never turn that projection into a dance destination.
    if(request.placementAnchor&&(!hit||hit.surfaceId!==data.surfaceId||!Number.isFinite(hit.normal?.y)||hit.normal.y<.85||hit.furnitureId||hit.propId||hit.dynamicId))return null;
    return Object.freeze({surfaceId:data.surfaceId,point:Object.freeze({x:point.x,z:point.z}),epoch:identityEpoch,floor});
  }
  function danceAtSelection(selection){
    if(disposed||!home||selection.epoch!==identityEpoch||selection.floor!==floor||world.getView()!=='interior')return {ok:false,error:"DisplayText3785, DisplayText3786, DisplayText3787."};
    if(isCommerceBusy())return {ok:false,error:"DisplayText3716, DisplayText3345."};
    if(placing)return {ok:false,error:"DisplayText3788."};
    if(!isCurrentFloorSurface(selection.surfaceId))return {ok:false,error:"DisplayText3789, DisplayText3790."};
    menu.close({restoreFocus:false});quickSelection={data:{surfaceId:'avatar'},view:'interior',floor,epoch:identityEpoch};refreshQuickActions();
    const result=world.danceAvatar({point:{...selection.point}});
    if(result?.ok===false){const error=result.error??"DisplayText3791, DisplayText3792.";onStatus(error);quickActions.updateStatus(error,{error:true});}
    else{const model=quickModel();quickActions.updateStatus(result?.message??(model?quickActivityStatus(model):null)??(world.getStageState?.().active?"DisplayText3721, DisplayText3722.":"DisplayText3793, DisplayText3794."));}
    return result??{ok:true};
  }
  function toggleStageCamera(){
    if(!world||!home)return {ok:false,error:"DisplayText3795."};
    if(isCommerceBusy())return {ok:false,error:"DisplayText3716, DisplayText3345."};
    if(world.getView()!=='interior'){const error="DisplayText3758, DisplayText3796.";onStatus(error);return {ok:false,error};}
    const camera=world.getStageCameraState?.()??emptyStageCamera();
    const result=camera.active||camera.returning?world.exitStageCamera():camera.available?world.resumeStageCamera():{ok:false,error:"DisplayText3797."};
    if(result?.error)onStatus(result.error);return result??{ok:true};
  }
  function switchFloor(index){if(isCommerceBusy())return;closeQuickActions();floor=index;world.setView('interior');sync();onStageChange(world.getStageState?.().requested===true);}
  function setView(view){if(!world||!home||isCommerceBusy()||!['interior','estate','building'].includes(view))return;menu.close({restoreFocus:false});closeQuickActions();world.cancelDrag();world.cancelPlacement();placing=null;world.setView(view);onStageChange(world.getStageState?.().requested===true);}
  async function command(value,{activity=false,intentSerial=activitySerial,job=null,keepalive=false}={}){
    if(!home||disposed)return {ok:false,error:"DisplayText3795."};
    if(!activity&&busy&&pending?.value.type==='setRobotActivity'&&commandInFlight){
      const queuedEpoch=identityEpoch,flight=commandInFlight;commerceWaiters.set(queuedEpoch,(commerceWaiters.get(queuedEpoch)??0)+1);
      try{await flight.promise;}finally{const remaining=(commerceWaiters.get(queuedEpoch)??1)-1;if(remaining)commerceWaiters.set(queuedEpoch,remaining);else commerceWaiters.delete(queuedEpoch);}
      if(disposed||queuedEpoch!==identityEpoch)return {ok:false,error:"DisplayText3783."};
    }
    if(busy)return {ok:false,error:"DisplayText3716, DisplayText3345."};
    const epoch=identityEpoch,owner=binding,boundActor=actorId,boundStudent=home.studentId;
    const signature=JSON.stringify(value);
    if(pending&&pending.signature!==signature)return {ok:false,error:"DisplayText3798, DisplayText3799."};
    pending??={signature,id:job?.id??crypto.randomUUID(),value};busy=true;if(owner)owner.pending=pending;
    const request=pending,storedJob=activity?outbox?.markSent(boundActor,boundStudent,request.id,home.revision):value.type==='setObjectState'?objectOutbox.markSent(boundActor,boundStudent,request.id,home.revision):null;
    let complete;const flight={promise:new Promise(done=>{complete=done;})};commandInFlight=flight;if(owner)owner.flight=flight;
    onStatus(activity?"DisplayText3800…":value.type==='setObjectState'?"DisplayText3801…":value.type==='setFloorFinish'?"DisplayText4716 · DisplayText4714":value.type==='setWallFinish'?"DisplayText4717 · DisplayText4714":"DisplayText3802…");
    try{const result=await onCommand(value,request.id,{actorId:boundActor,studentId:boundStudent,expectedRevision:storedJob?.expectedRevision??home.revision,keepalive});
      if(activity)outbox?.acknowledge(boundActor,boundStudent,request.id,result,{supersede:true});
      if(value.type==='setObjectState')objectOutbox.acknowledge(boundActor,boundStudent,request.id,result);
      if(owner){owner.pending=null;owner.home=result.home;owner.robotActivity=copyActivity(result.robotActivity??null);}
      if(disposed||epoch!==identityEpoch)return {ok:true,...result,detached:true};home=result.home;if(result.wallet)wallet=result.wallet;pending=null;
      if(Object.hasOwn(result,'robotActivity'))robotActivity=copyActivity(result.robotActivity);
      if(intentSerial===activitySerial){activityIntent=copyActivity(robotActivity);if(activity)world?.setRobotActivity?.(activityIntent);}
      if(!activity){if(value.type==='setObjectState'){world?.setObjectStates?.(home.commerce);refreshQuickActions();}else sync();shop.refresh();onStatus(value.type==='setObjectState'?"DisplayText3803.":"DisplayText3804.");}
      return {ok:true,...result,order:result.receipt?.detail?.order,quote:result.receipt?.detail?.quote};}
    catch(error){if(error.status&&error.status<500){if(activity&&error.status!==409)outbox?.reject(boundActor,boundStudent,request.id);if(value.type==='setObjectState'&&error.status!==409)objectOutbox.reject(boundActor,boundStudent,request.id);if(owner)owner.pending=null;}
      if(disposed||epoch!==identityEpoch)return {ok:false,error:error.message,status:error.status};if(error.status&&error.status<500){pending=null;}if(!activity){if(value.type==='setObjectState')world?.setObjectStates?.(home.commerce);else sync();onStatus(error.message,error.code==='catalog_changed'?()=>location.reload():()=>{if(epoch===identityEpoch)void command(value);},error.code==='catalog_changed'?"DisplayText3805":"DisplayText3806");}return {ok:false,error:error.message,status:error.status,snapshot:error.snapshot};}
    finally{if(owner)owner.flight=null;complete();if(commandInFlight===flight)commandInFlight=null;if(epoch===identityEpoch){busy=false;if(!activity)refreshQuickActions();if(!activity&&!leaving)void flushActivityQueue();}}
  }
  function queueRobotActivity(value){
    if(disposed||!home||suppressActivity)return;
    if(value!==null&&!isRobotActivityShape(value))return;
    savedDeparture=null;
    const previousQuickActivity=quickActivityKey(activityIntent);
    activityIntent=copyActivity(value);onStageChange(world?.getStageState?.().requested===true);const stored=checkpoint(activityIntent);desiredActivity={value:copyActivity(value),serial:++activitySerial,...stored?{id:stored.id,durable:stored.durable}:{}};
    // Completion callbacks can report their final message before publishing
    // the standing checkpoint. Do not preserve the old "finishing" activity
    // text once that checkpoint (or an explicit clear) actually arrives.
    if(previousQuickActivity!==quickActivityKey(activityIntent))refreshQuickActions({keepStatus:activityIntent!==null&&activityIntent.kind!=='stand'});
    if(stored&&!stored.durable)onStatus("DisplayText3807; DisplayText3808, DisplayText3809.");
    if(!pending)activityRetry=null;
    if(!leaving)void flushActivityQueue();
  }
  async function flushActivityQueue(retry=null,{keepalive=false}={}){
    if(disposed||!home||busy||activitySaving||activityRetry||!retry&&!desiredActivity||pending&&pending.value?.type!=='setRobotActivity')return;
    let complete;const token={epoch:identityEpoch,keepalive,promise:new Promise(done=>{complete=done;})};activitySaving=token;
    let priority=retry;
    try{while(!disposed&&home&&token.epoch===identityEpoch&&!busy&&!commerceWaiters.has(token.epoch)&&(priority||desiredActivity)){
      const job=priority??desiredActivity;priority=null;if(desiredActivity===job)desiredActivity=null;
      if(!pending&&sameActivity(job.value,robotActivity)){if(job.id)outbox?.acknowledge(actorId,home.studentId,job.id,{home,robotActivity});continue;}
      const result=await command({type:'setRobotActivity',activity:job.value},{activity:true,intentSerial:job.serial,job,keepalive:token.keepalive});
      if(disposed||token.epoch!==identityEpoch)return;
      if(!result.ok&&result.status===409&&result.snapshot?.home){
        home=result.snapshot.home;robotActivity=copyActivity(result.snapshot.robotActivity??null);
        const rebased=job.id&&outbox.rebase(actorId,home.studentId,job.id,{home,robotActivity});
        if(rebased){job.id=rebased.id;priority=job;continue;}
      }
      if(!result.ok){if(result.status&&result.status<500&&!pending&&desiredActivity)continue;activityRetry=job;onStatus(`DisplayText3810: ${result.error}${job.durable===false?" DisplayText3808, DisplayText3811.":''}`,()=>{
        if(disposed||token.epoch!==identityEpoch)return;const failed=activityRetry;activityRetry=null;if(!pending&&failed.id&&!outbox?.list(actorId,home.studentId).some(row=>row.id===failed.id)){const fresh=checkpoint(failed.value);if(fresh)failed.id=fresh.id;}void flushActivityQueue(failed);
      });return;}
    }
    if(token.epoch===identityEpoch&&!desiredActivity&&!busy)onStatus("DisplayText3812, DisplayText3813.");
    }finally{complete();if(activitySaving===token)activitySaving=null;}
  }
  async function flushBeforeLeave({capture=true,keepalive=false,timeoutMs=1500}={}){
    if(!home||disposed)return {ok:true,pending:false};
    const epoch=identityEpoch;leaveCount++;leaving=true;if(activitySaving)activitySaving.keepalive ||=keepalive;if(capture)captureRobotActivity();
    // Once captured, clear() can use this exact departure checkpoint even if
    // the network never replies. New semantic events invalidate this marker.
    savedDeparture={epoch,serial:activitySerial};
    // pagehide callers dispose the renderer immediately after this call. Start
    // an idle keepalive request before the first await yields to that caller.
    let eagerSave=null;
    if(!commandInFlight&&!activitySaving&&(!pending||pending.value.type==='setRobotActivity')){
      const retry=activityRetry;activityRetry=null;eagerSave=flushActivityQueue(retry,{keepalive});
    }
    const initialFlight=commandInFlight,initialSaving=activitySaving,initialObjects=[...objectFlights].filter(token=>token.epoch===epoch);
    for(const token of initialObjects)token.keepalive ||=keepalive;
    const attempt=async()=>{
      await eagerSave;if(epoch!==identityEpoch)return {ok:false,pending:true};
      await initialFlight?.promise;if(epoch!==identityEpoch)return {ok:false,pending:true};
      await initialSaving?.promise;if(epoch!==identityEpoch)return {ok:false,pending:true};
      await Promise.all(initialObjects.map(token=>token.promise));if(epoch!==identityEpoch)return {ok:false,pending:true};
      // A commerce timeout must keep its original ID and precede any pose.
      if(pending&&pending.value.type!=='setRobotActivity'){
        const result=await command(pending.value,{keepalive});if(epoch!==identityEpoch||!result.ok)return {ok:false,pending:true};
      }
      if(!eagerSave){const retry=activityRetry;activityRetry=null;await flushActivityQueue(retry,{keepalive});}
      if(epoch!==identityEpoch)return {ok:false,pending:true};
      await activitySaving?.promise;if(epoch!==identityEpoch)return {ok:false,pending:true};
      const remaining=!!(pending||desiredActivity||activityRetry||outbox?.pending(actorId,home.studentId)||objectOutbox.list(actorId,home.studentId).length);
      if(!remaining)savedDeparture={epoch:identityEpoch,serial:activitySerial};
      return {ok:!remaining,pending:remaining};
    };
    let timer;
    try{return await Promise.race([attempt(),new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,pending:true}),Number.isFinite(timeoutMs)?Math.max(0,timeoutMs):1500);})]);}
    finally{clearTimeout(timer);leaveCount--;leaving=leaveCount>0;}
  }
  async function replayRobotActivity({actorId:actor,studentId,home:serverHome,robotActivity:serverActivity=null}){
    let snapshot={home:serverHome,robotActivity:copyActivity(serverActivity)},failure=null;
    if(!outbox||!actor||!serverHome)return {...snapshot,pending:false};
    for(let count=0;count<64;count++){
      let job=objectOutbox.list(actor,studentId)[0];if(!job)break;
      const unit=snapshot.home.commerce.owned.find(row=>row.id===job.objectId),current=getObjectState(snapshot.home.commerce,job.objectId);
      if(!current||unit?.storey!==job.storey){objectOutbox.reject(actor,studentId,job.id);continue;}
      if(Object.keys(job.patch).every(key=>current[key]===job.patch[key])){objectOutbox.acknowledge(actor,studentId,job.id,snapshot);continue;}
      if(!job.attempted&&job.expectedRevision!==snapshot.home.revision){job=objectOutbox.rebase(actor,studentId,job.id,snapshot);if(!job){failure="DisplayText3814, DisplayText3815.";break;}}
      job=objectOutbox.markSent(actor,studentId,job.id,snapshot.home.revision);if(!job)break;
      try{const result=await onCommand({type:'setObjectState',id:job.objectId,storey:job.storey,patch:job.patch},job.id,{actorId:actor,studentId,expectedRevision:job.expectedRevision,replay:true});objectOutbox.acknowledge(actor,studentId,job.id,result);snapshot={home:result.home,robotActivity:copyActivity(result.robotActivity??null)};}
      catch(error){if(error.snapshot?.home)snapshot={home:error.snapshot.home,robotActivity:copyActivity(error.snapshot.robotActivity??null)};
        if(error.status===409&&objectOutbox.rebase(actor,studentId,job.id,snapshot))continue;
        if(error.status&&error.status<500&&error.status!==409)objectOutbox.reject(actor,studentId,job.id);
        failure=error.message;break;}
    }
    for(let count=0;count<64;count++){
      let job=outbox.list(actor,studentId)[0];if(!job)break;
      if(!job.attempted&&sameActivity(job.value,snapshot.robotActivity)){outbox.acknowledge(actor,studentId,job.id,snapshot);continue;}
      if(!job.attempted&&job.expectedRevision!==snapshot.home.revision){job=outbox.rebase(actor,studentId,job.id,snapshot);if(!job){failure="DisplayText3816, DisplayText3817.";break;}}
      job=outbox.markSent(actor,studentId,job.id,snapshot.home.revision);
      try{const result=await onCommand({type:'setRobotActivity',activity:job.value},job.id,{actorId:actor,studentId,expectedRevision:job.expectedRevision,replay:true});outbox.acknowledge(actor,studentId,job.id,result,{supersede:true});snapshot={home:result.home,robotActivity:copyActivity(result.robotActivity??null)};}
      catch(error){if(error.snapshot?.home)snapshot={home:error.snapshot.home,robotActivity:copyActivity(error.snapshot.robotActivity??null)};
        if(error.status===409&&outbox.rebase(actor,studentId,job.id,snapshot))continue;
        if(error.status&&error.status<500&&error.status!==409)outbox.reject(actor,studentId,job.id);
        failure=error.message;break;}
    }
    const owner=bindings.get(bindingKey(actor,studentId));if(owner?.pending?.value.type==='setRobotActivity'&&!outbox.list(actor,studentId).some(job=>job.id===owner.pending.id))owner.pending=null;
    if(owner?.pending?.value.type==='setObjectState'&&!objectOutbox.list(actor,studentId).some(job=>job.id===owner.pending.id))owner.pending=null;
    const remains=outbox.pending(actor,studentId)||objectOutbox.list(actor,studentId).length>0;if(remains)onStatus(`DisplayText3818: ${failure??"DisplayText3819."}`);
    return {...snapshot,pending:remains};
  }
  function openShop(tab='shop',options){menu.close({restoreFocus:false});wardrobe.close();if(options)shop.open(tab,undefined,options);else shop.open(tab);}
  function openWardrobe(options){if(!home||isCommerceBusy())return;menu.close({restoreFocus:false});shop.close();wardrobe.open(options);}
  function addToCart(skuId,quantity=1){const result=setCartQuantity(state(),skuId,quantity);if(result.ok)cart=result.state.cart;return result;}
  function openFloor(index=floor){menu.close({restoreFocus:false});floorPlanner.open(index);}
  function openRooms(index=floor,kitId){menu.close({restoreFocus:false});roomPlanner.open(index,{kitId});}
  function resaleQuote(id){
    if(!home?.commerce)return {ok:false,error:"DisplayText3795."};
    if(resaleSource!==home.commerce||resaleBalance!==(wallet?.balance??0)){
      resaleSource=home.commerce;resaleBalance=wallet?.balance??0;resaleQuotes=new Map();
      const result=listOwnedResaleQuotes(state());
      if(result.ok){
        for(const quote of result.quotes)resaleQuotes.set(quote.ownedId,{ok:true,quote});
        for(const row of result.unavailable)resaleQuotes.set(row.ownedId,{ok:false,error:row.error});
      }
    }
    return resaleQuotes.get(id)??{ok:false,error:"DisplayText3820."};
  }
  async function sell(id){
    const result=await command({type:'sellItem',id});
    if(result.ok)onStatus(`DisplayText3370, ${(result.receipt?.creditAmount??0).toLocaleString('en')} DisplayText3821.`);
    return result;
  }
  function elevatorOptions(){
    return getFloorHomes(home.commerce).flatMap((level,index)=>getHomeStairs(level).filter(row=>row.direction==='up').map(row=>{
      const quote=quoteStaircaseUpgrade(state(),row.id,{storey:index}),installed=row.type==='elevator';
      return {id:`elevator-${index}-${row.id}`,label:`${index+1} ↔ ${index+2} DisplayText0931 · ${installed?"DisplayText3822":`${ELEVATOR_UPGRADE_PRODUCT.price.toLocaleString('en')} DisplayText3823`}`,
        detail:installed?"DisplayText3824":quote.ok?"DisplayText3825, DisplayText3826":quote.error,disabled:installed||!quote.ok,
        action:()=>command({type:'upgradeStaircase',id:row.id,storey:index}),stairId:row.id,storey:index};
    }));
  }
  function openElevators(){
    if(!home||isCommerceBusy())return;
    const bounds=container.getBoundingClientRect?.()??{left:0,top:0,width:600,height:400},items=elevatorOptions();
    menu.open({x:bounds.left+bounds.width/2,y:bounds.top+Math.min(180,bounds.height/3),title:"DisplayText0747",
      subtitle:`DisplayText3292 ${ELEVATOR_UPGRADE_PRODUCT.price.toLocaleString('en')} DisplayText0920 · DisplayText3827`,
      items:items.length?items:[{id:'elevator-no-stairs',label:"DisplayText3828",detail:"DisplayText3829, DisplayText3830",action:()=>openFloor(getFloorHomes(home.commerce).length)}],returnFocus:container.querySelector('canvas')});
  }
  async function place(id,pose){const owned=home.commerce.owned.find(r=>r.id===id),outdoor=products.get(owned?.skuId)?.productType==='outdoor';const result=await command(outdoor?{type:'placeOutdoor',id,pose}:{type:'placeItem',id,pose,storey:floor});if(result.ok){placing=null;world.cancelPlacement();world.selectSurface(`furniture:${id}`);}return result;}
  function beginPlacement(id){const owned=home.commerce.owned.find(r=>r.id===id),product=products.get(owned?.skuId);if(product?.productType==='clothing')return command({type:'equipClothing',skuId:product.skuId,slot:product.slot});if(!owned||owned.status!=='stored')return {ok:false,error:"DisplayText3831."};
    requestAnimationFrame(()=>{if(product.productType==='room'){openRooms(floor,id);return;}if(product.productType==='storey'){openFloor(getFloorHomes(home.commerce).length);return;}placing=id;world.setView(product.productType==='outdoor'?'estate':'interior');if(product.productType==='outdoor')world.beginOutdoorPlacement(owned.item);else world.beginFurniturePlacement(owned.item);onStatus(product.placement==='wall'?"DisplayText3832, DisplayText3833.":"DisplayText3834, DisplayText3835; Esc Cancel.");});return {ok:true};}
  async function placeAt(id,request){const owned=home.commerce.owned.find(r=>r.id===id);if(!owned)return {ok:false,error:"DisplayText3836."};const product=products.get(owned.skuId);if(product.productType==='outdoor'){if(request.view!=='estate'||!request.worldPoint)return {ok:false,error:"DisplayText3837."};return place(id,{x:request.worldPoint.x,z:request.worldPoint.z,rotation:owned.item.rotation??0});}const location=world.getFurniturePlacementAtContext(owned.item,request);if(!location.ok)return location;return place(id,location.pose);}
  async function changeObjectState(id,patch,storey=floor){
    if(!home||disposed||isCommerceBusy())return {ok:false,error:"DisplayText3716, DisplayText3345."};
    const current=getObjectState(home.commerce,id),owned=home.commerce.owned.find(row=>row.id===id);
    if(!current||owned?.status!=='placed'||owned.storey!==storey)return {ok:false,error:"DisplayText3838."};
    const actor=actorId,student=home.studentId,epoch=identityEpoch;
    let job=objectOutbox.enqueue({actorId:actor,studentId:student,id,storey,patch,baseState:current,expectedRevision:home.revision});
    // Storage-disabled sessions can still save online; a private ephemeral owner
    // keeps request IDs stable without attaching this intent to another account.
    if(!job)return {ok:false,error:"DisplayText3839, DisplayText3840."};
    void world?.unlockObjectAudio?.();
    world?.setObjectStates?.({...home.commerce,objectStates:{...home.commerce.objectStates,[id]:{...current,...patch}}});
    const previous=[...objectFlights].filter(token=>token.epoch===epoch).at(-1)?.promise,token={epoch,keepalive:false,promise:null};objectFlights.add(token);
    token.promise=(async()=>{
      if(previous)await previous;if(disposed||epoch!==identityEpoch)return {ok:false,pending:true,error:job.durable?"DisplayText3841.":"DisplayText3808, DisplayText3842, DisplayText3843."};
      let result;
      for(let attempt=0;attempt<2;attempt++){
        result=await command({type:'setObjectState',id,storey,patch},{job,keepalive:token.keepalive});
        if(result.ok||epoch!==identityEpoch||result.status!==409||!result.snapshot?.home)break;
        home=result.snapshot.home;const rebased=objectOutbox.rebase(actor,student,job.id,result.snapshot);if(!rebased)break;job=rebased;
      }
      if(!result.ok&&epoch===identityEpoch){if(result.snapshot?.home)home=result.snapshot.home;world?.setObjectStates?.(home.commerce);if(job.durable===false)onStatus(`${result.error} DisplayText3808, DisplayText3844.`);}
      return result;
    })();
    try{return await token.promise;}finally{objectFlights.delete(token);}
  }
  function openContext(request){closeQuickActions();if(!home?.commerce||isCommerceBusy())return;const data=request.data??{},id=data.furnitureId??(data.surfaceId?.startsWith('furniture:')?data.surfaceId.slice(10):null),outdoorId=data.outdoorOwnedId,owned=home.commerce.owned.find(r=>r.id===(id??outdoorId)),product=products.get(owned?.skuId);
    const items=getHomeObjectMenu(home.commerce,owned,{change:changeObjectState,
      demonstrate:ownedId=>{void world?.unlockObjectAudio?.();world?.demonstrateObject?.(ownedId);},
      robotChannel:ownedId=>{void world?.unlockObjectAudio?.();const result=world?.changeAvatarTelevisionChannel?.(ownedId);if(result?.error)onStatus(result.error);return result;}});
    const targetId=request.view==='estate'&&outdoorId?`outdoor:${outdoorId}`:id?`furniture:${id}`:data.surfaceId;
    const actions=request.view==='interior'||request.view==='estate'&&outdoorId&&owned?.status==='placed'?world.getAvatarInteractions(targetId):[];
    const stairs=request.view==='interior'?world.getAvatarStairs?.()??[]:[];
    if(request.view==='interior'){
      const upgrades=elevatorOptions(),selected=upgrades.find(row=>row.stairId===data.stairId&&(row.storey===floor||row.storey===floor-1));
      if(selected)items.push({...selected,label:selected.disabled&&selected.detail==="DisplayText3824"?"DisplayText3845":selected.label});
      else if(upgrades.length)items.push({id:'elevator-upgrades',label:"DisplayText3846",detail:`DisplayText3847 ${ELEVATOR_UPGRADE_PRODUCT.price.toLocaleString('en')} DisplayText0920`,children:upgrades});
    }
    if(stairs.length)items.push({id:'robot-stairs',label:"DisplayText3848",children:stairs.map(stair=>({id:stair.id,label:stair.label,action:()=>world.useAvatarStairs(stair.id)}))});
    if(actions.length)items.push({id:'robot-use',label:"DisplayText3849",detail:"DisplayText3850, DisplayText3851",children:actions.map(action=>({id:action.id,label:action.label,disabled:action.disabled===true,action:()=>world.interactAvatar(targetId,action.id)}))});
    if(owned){const outdoor=product?.productType==='outdoor';const update=patch=>command({type:outdoor?'updateOutdoor':'updateItem',id:owned.id,patch,...outdoor?{}:{storey:floor}});
      items.push({id:'rotate',label:"Rotate 90°",action:()=>update({rotation:((owned.item.rotation??0)+90)%360})},{id:'colors',label:"DisplayText3852",children:getHomeSwatches(PALETTE).map(color=>({id:color.id??color.value,label:color.label??color.name??color.color,action:()=>update({color:color.color??color.value})}))},{id:'move',label:"DisplayText3853",detail:"DisplayText3854, DisplayText3855",action:()=>{world.selectSurface(`furniture:${owned.id}`);world.setTool('move');onStatus("DisplayText3854, DisplayText3856.");}},{id:'store',label:"DisplayText3857",action:()=>command({type:outdoor?'storeOutdoor':'storeItem',id:owned.id,...outdoor?{}:{storey:floor}})});
      if(['furniture','outdoor'].includes(product?.productType)){
        const resale=resaleQuote(owned.id);
        items.push({id:'sell-item',label:resale.ok?`DisplayText3469 · +${resale.quote.amount.toLocaleString('en')} DisplayText0920`:"DisplayText3858",
          detail:resale.ok?`DisplayText3471 ${resale.quote.paidUnitPrice.toLocaleString('en')} · DisplayText3403 50% · DisplayText3859`:resale.error,disabled:!resale.ok,action:()=>sell(owned.id)});
      }
    }
    const groups=getStoredPlacementGroups(home.commerce.owned,catalog.filter(p=>p.productType!=='clothing')).filter(g=>request.view==='estate'?g.product.productType==='outdoor':g.product.productType!=='outdoor');
    const fit=getKitchenFit(owned?.item?.kind);
    if(fit&&request.view==='interior'){
      items.unshift({id:'kitchen-shop',label:"DisplayText3860",detail:`${fit.seriesLabel} · DisplayText3135, DisplayText1865, DisplayText3861`,action:()=>openShop('shop',{room:'kitchen',query:fit.seriesLabel})});
      if(fit.canDock){
        const compatible=groups.filter(g=>areKitchenModulesCompatible(owned.item,g.item));
        for(const [side,label] of [['left',"DisplayText3862"],['right',"DisplayText3863"]])items.push({id:`kitchen-dock-${side}`,label,
          detail:compatible.length?"DisplayText1422, DisplayText1421, DisplayText3864":"DisplayText3865, DisplayText3866",disabled:!compatible.length,
          children:compatible.map(g=>({id:g.id,label:g.product.name,detail:`${g.quantity} DisplayText3319 · DisplayText0649 ${g.product.width} · DisplayText3200 ${fit.worktopHeight}`,
            image:()=>thumbnails.image({...g.product,item:g.item}),action:()=>{const result=getKitchenDockPose(getFloorHome(home.commerce,floor),owned.id,g.item,side);if(!result.ok){onStatus(result.error);return result;}return place(g.id,result.pose);}}))});
      }
    }
    items.push({id:'shop',label:"DisplayText3867",detail:"Furniture, DisplayText3868, DisplayText3342, DisplayText2770",action:()=>openShop(request.view==='estate'?'outdoor':'shop')},{id:'place-owned',label:"DisplayText3869",detail:groups.length?"DisplayText3870":"DisplayText3871",disabled:!groups.length,children:()=>groups.map(g=>({id:g.id,label:g.product.name,detail:`${g.quantity} DisplayText3319 · ${g.product.placement==='wall'?"DisplayText3163":g.product.placement==='table'?"DisplayText3162":"DisplayText3872"}`,image:()=>thumbnails.image({...g.product,item:g.item}),action:()=>placeAt(g.id,request)}))},{id:'inventory',label:"Inventory",action:()=>openShop('inventory')},{id:'build-room',label:"DisplayText3873 / DisplayText3874",detail:"DisplayText3875, DisplayText3876",action:()=>openRooms()},{id:'expand',label:"DisplayText0879",detail:"DisplayText3877, DisplayText3878",action:()=>openFloor()},{id:'new-floor',label:"DisplayText3879",detail:"DisplayText3880, DisplayText3881",action:()=>openFloor(getFloorHomes(home.commerce).length)});
    items.push({id:'views',label:"DisplayText3882 / DisplayText0540",children:[{id:'interior',label:"DisplayText3883",action:()=>world.setView('interior')},{id:'estate',label:"DisplayText3884",action:()=>world.setView('estate')},{id:'building',label:"DisplayText3885",action:()=>world.setView('building')},...getFloorHomes(home.commerce).map((_,i)=>({id:`floor-${i}`,label:`DisplayText2744 ${i+1} DisplayText0931`,action:()=>switchFloor(i)}))]});
    items.push({id:'resale-shop',label:"DisplayText3886",detail:"DisplayText3887 · DisplayText3888 50% DisplayText3889",action:()=>openShop('resale')},{id:'wardrobe',label:"DisplayText3890",detail:"DisplayText3891, DisplayText3892, DisplayText0184 · DisplayText3893",action:()=>openWardrobe()},{id:'robot-stand',label:"DisplayText3894",action:()=>world.standAvatar()});
    if(data.surfaceId==='avatar')items.unshift({id:'robot',label:"DisplayText3710",action:()=>onRobot?.({x:request.clientX,y:request.clientY})});
    const danceSelection=floorDanceSelection(request);
    if(danceSelection)items.unshift({id:'stage-dance-here',label:"DisplayText3895",detail:"DisplayText3896, DisplayText3897",action:()=>danceAtSelection(danceSelection)});
    const editEpoch=identityEpoch,editFloor=floor,surfaceId=data.surfaceId;
    const floorMenu=request.view==='interior'&&!owned?getWarmFloorMenu({homeFloor:getFloorHome(home.commerce,floor),surfaceId,async onSelect(finish){
      if(disposed||!home||editEpoch!==identityEpoch||editFloor!==floor||world.getView()!=='interior'||!isCurrentFloorSurface(surfaceId))return {ok:false,error:"DisplayText3785, DisplayText4718, DisplayText4719."};
      const current=getFloorHome(home.commerce,floor),match=/^room:([a-z\d_.:-]+)\.floor$/i.exec(surfaceId);
      const appearance=surfaceId==='floor.main'?current.surfaces['floor.main']:current.rooms.find(room=>room.id===match?.[1])?.floor;
      if(appearance?.finishId===finish.id){onStatus("DisplayText4720"+finish.label+" · DisplayText4721.");return {ok:true,unchanged:true};}
      const result=await command({type:'setFloorFinish',surfaceId,finishId:finish.id,storey:editFloor});
      if(result.ok&&!result.detached&&editEpoch===identityEpoch)onStatus("DisplayText4722"+finish.label+" · DisplayText4723.");
      return result;
    }}):null;
    if(floorMenu)items.unshift(floorMenu);
    const wallMenu=request.view==='interior'&&!owned?getWarmWallMenu({homeFloor:getFloorHome(home.commerce,floor),surfaceId,async onSelect(patch,choice){
      const current=home?.commerce&&getFloorHome(home.commerce,floor),target=getWallMenuTarget(current,surfaceId);
      if(disposed||!home||editEpoch!==identityEpoch||editFloor!==floor||world.getView()!=='interior'||!target)return {ok:false,error:"DisplayText3785, DisplayText4718, DisplayText4724."};
      const key=Object.hasOwn(patch,'styleId')?'styleId':'colorId',skins=surfaceId.startsWith('wall.')?['wall.inner','wall.outer','wall.side'].map(id=>current.surfaces[id]):[target.appearance];
      if(skins.every(skin=>skin?.[key]===patch[key])){onStatus("DisplayText4720"+choice.label+" · DisplayText4721.");return {ok:true,unchanged:true};}
      const result=await command({type:'setWallFinish',surfaceId,...patch,storey:editFloor});
      if(result.ok&&!result.detached&&editEpoch===identityEpoch)onStatus("DisplayText4725"+choice.label+" · DisplayText4723.");
      return result;
    }}):null;
    if(wallMenu)items.unshift(wallMenu);
    menu.open({x:request.clientX,y:request.clientY,title:product?.name??(request.view==='estate'?"DisplayText3898":`${floor+1} DisplayText0931 · DisplayText3899`),subtitle:wallMenu?"DisplayText4726 · DisplayText4727, DisplayText4728":floorMenu?"DisplayText4729 · DisplayText4713":"DisplayText3900",items,returnFocus:container.querySelector('canvas')});
  }
  const shop=createHomeShop({catalog,accountMode:true,getState:state,getThumbnail:thumbnails.image,onCartChange:addToCart,getResaleQuote:resaleQuote,onSell:sell,onTryClothing:skuId=>openWardrobe({previewSku:skuId}),async onCheckout(){const result=await command({type:'checkout',lines:cart.map(row=>({...row}))});if(result.ok){cart=[];result.order=home.commerce.orders.at(-1);}return result;},onPlace:beginPlacement,onPlanConstruction:()=>{shop.close();openFloor();},onChooseElevator:()=>{shop.close();openElevators();}});
  const wardrobe=createStudentHomeWardrobe({getState:state,getColors:()=>home?.avatar.colors,getThumbnail:thumbnails.image,onEquip:(skuId,slot)=>command({type:'equipClothing',skuId,slot}),onAddToCart:addToCart,onShop:()=>openShop('clothing')});
  const floorPlanner=createFloorPlanner({getFloors:()=>getFloorHomes(home.commerce),getBalance:()=>wallet?.balance??0,quote:s=>quoteFloorConstruction(state(),s),purchase:s=>command({type:'constructFloor',selection:s}),onBuilt:index=>switchFloor(index),onRoomPlanning:index=>openRooms(index)});
  const roomPlanner=createRoomPlanner({getFloors:()=>getFloorHomes(home.commerce),getBalance:()=>wallet?.balance??0,getStock:()=>home.commerce.owned.filter(row=>row.status==='stored'&&products.get(row.skuId)?.productType==='room').map(row=>({...row,label:products.get(row.skuId).name})),getSlots:(id,index)=>{const row=home.commerce.owned.find(r=>r.id===id);if(!row)return[];const r=roomRect(row.item)??products.get(row.skuId);return getStoreyRoomSlots(state(),row.item.kind,index,{width:r.width,depth:r.depth});},quote:(id,pose,index)=>quoteOwnedRoomPlacement(state(),id,pose,{storey:index}),place:(id,pose,index)=>command({type:'placeRoom',id,pose,storey:index}),onBuilt:index=>switchFloor(index),onShop:index=>{switchFloor(index);openShop('rooms');},onFloorExpansion:openFloor});
  async function init(){world=await createStudentHomeWorld({container,onObjectClick:openQuickActions,onPanStart:closeQuickActions,onStageCameraChange:stageCameraChanged,onViewChange:view=>{closeQuickActions();onViewChange(view);},onRobotActivityChange:queueRobotActivity,onObjectAction:({id,storey,patch})=>changeObjectState(id,patch,storey),onCancel:()=>sync(),onContextMenu:openContext,onPalette:onRobot,onStatus:result=>{onStageChange(world?.getStageState?.().requested===true);const message=result.message??result;onStatus(message);const model=quickModel(),currentStatus=model?quickActivityStatus(model):null;quickActions.updateStatus(result.error?message:currentStatus??(typeof message==='string'?message.split(" · DisplayText3901")[0]:message),{error:result.error===true});},onStoreyChange:switchFloor,onObjectEdit:request=>openContext({...request,data:{surfaceId:request.surfaceId},view:'interior'}),onOutdoorMove:(id,patch)=>command({type:'updateOutdoor',id,patch}),onDrag(change,commit){if(isCommerceBusy())return;if(change.type!=='furniture'){sync();return;}if(!commit){const probe=applyChange(getFloorHome(home.commerce,floor),change);if(probe.ok)world.setPreview(probe.state);return;}const patch=Object.fromEntries(['x','z','rotation','mount'].filter(k=>change[k]!==undefined).map(k=>[k,change[k]]));void command({type:'updateItem',id:change.id,patch,storey:floor});},onPlacementPreview(pose){if(!placing||isCommerceBusy())return {ok:false,error:"DisplayText3902."};const row=home.commerce.owned.find(r=>r.id===placing);const result=products.get(row.skuId)?.productType==='outdoor'?placeOwnedOutdoor(state(),placing,pose):placeOwnedItem(state(),placing,pose,{storey:floor});onStatus(result.ok?"DisplayText3903, DisplayText3835.":result.error);return {ok:result.ok,error:result.error};},onPlacementCommit:pose=>place(placing,pose),onPlacementCancel(){placing=null;},onPlacementReject:result=>onStatus(result?.error??"DisplayText3904, DisplayText0615.")});if(disposed){world.dispose();return;}thumbnails.setRobotSource(world.getRobotSource());}
  function clear(){
    closeQuickActions();
    // Capture while the old account still owns the controller. clear() is also
    // safe for callers that cannot await navigation; the checkpoint is durable.
    const wasLeaving=leaving;leaving=true;
    if(savedDeparture?.epoch!==identityEpoch||savedDeparture?.serial!==activitySerial)captureRobotActivity();
    if(binding){binding.pending=pending;binding.home=home;binding.robotActivity=robotActivity;binding.flight=commandInFlight;}
    suppressActivity=true;world?.clearRobotAccountBinding?.();identityEpoch++;binding=null;actorId=null;home=null;wallet=null;robotActivity=null;activityIntent=null;desiredActivity=null;activityRetry=null;activitySaving=null;commandInFlight=null;objectFlights.clear();savedDeparture=null;busy=false;cart=[];pending=null;placing=null;floor=0;menu.close();shop.close();wardrobe.close();floorPlanner.close();roomPlanner.close();world?.clear();onStageChange(false);onStageCameraChange(emptyStageCamera());suppressActivity=false;leaving=wasLeaving;
  }
  const lifecycle=()=>{void flushBeforeLeave({keepalive:true});};
  const hidden=()=>{if(globalThis.document?.visibilityState==='hidden')lifecycle();};
  const quickEscape=event=>{
    if(event.key!=='Escape'||event.defaultPrevented||!quickSelection||placing)return;
    const doc=globalThis.document,target=event.target;
    if(target?.isContentEditable||target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"][aria-modal="true"]')
      ||doc?.querySelector?.('dialog[open], [role="dialog"][aria-modal="true"]:not([hidden]), #palette:not([hidden])'))return;
    event.preventDefault();event.stopPropagation();closeQuickActions();
  };
  globalThis.addEventListener?.('pagehide',lifecycle);
  globalThis.document?.addEventListener?.('visibilitychange',hidden);
  globalThis.document?.addEventListener?.('keydown',quickEscape);
  return {async show(value,{robotActivity:activity=null,actorId:actor=actorId}={}){
      const changed=home?.studentId!==value.studentId||actorId!==actor;
      if(changed&&home)clear();
      home=value;actorId=actor;robotActivity=copyActivity(activity);activityIntent=copyActivity(activity);activitySerial++;
      if(changed){identityEpoch++;floor=activity?.storey??0;cart=[];binding=bindings.get(bindingKey(actor,value.studentId))??{};bindings.set(bindingKey(actor,value.studentId),binding);binding.home=value;binding.robotActivity=robotActivity;pending=binding.pending??null;commandInFlight=binding.flight??null;desiredActivity=null;activityRetry=null;activitySaving=null;busy=!!commandInFlight;}
      if(!opening)opening=init().catch(error=>{opening=null;throw error;});await opening;if(disposed||home!==value)return;
      suppressActivity=true;
      try{if(changed)world.setView(['swim','football'].includes(activity?.kind)||activity?.kind==='stand'&&activity.environment==='estate'?'estate':'interior');sync();}
      finally{suppressActivity=false;onStageChange(world?.getStageState?.().requested===true);stageCameraChanged(world?.getStageCameraState?.()??emptyStageCamera());}
    },prepareLeave:flushBeforeLeave,flushRobotActivity:flushBeforeLeave,replayRobotActivity,
    openWardrobe,toggleStage,toggleStageCamera,setWallet(value){wallet=value;shop.refresh();},palette:colors=>world?.palette(colors),wave:()=>world?.waveAvatar?.(),moveTo:point=>world?.walkAvatar(point),reset:()=>world?.reset(),setView,getView:()=>world?.getView()??'interior',clear,
    dispose(){if(disposed)return;const wasLeaving=leaving;leaving=true;captureRobotActivity();leaving=wasLeaving;globalThis.removeEventListener?.('pagehide',lifecycle);globalThis.document?.removeEventListener?.('visibilitychange',hidden);globalThis.document?.removeEventListener?.('keydown',quickEscape);disposed=true;identityEpoch++;desiredActivity=null;activityRetry=null;quickActions.dispose();menu.dispose();shop.dispose();wardrobe.dispose();floorPlanner.dispose();roomPlanner.dispose();thumbnails.dispose();world?.dispose();}};
}
