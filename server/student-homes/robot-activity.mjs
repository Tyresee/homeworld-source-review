import {isRobotBedKind} from '../../public/js/home-furniture-capabilities.js';
import {getFloorHome,getFloorHomes} from '../../public/js/home-commerce.js';
import {isAvatarPositionWalkable,listAvatarInteractions} from '../../public/js/home-avatar-navigation.js';
import {isOutdoorRobotPositionWalkable,getRobotPoolDescriptor} from '../../public/js/student-home-robot-swimming.js';
import {getHomeStairs,STAIR_DEPTH} from '../../public/js/home-staircase-shape.js';
import {planRobotTelevision,sampleTelevisionRemoteReach,planRobotSofaTidy,planRobotTableWipe} from '../../public/js/student-home-robot-interactions.js';
import {isRobotActivityShape,normalizeRobotActivity,sameRobotActivity} from '../../public/js/student-home-robot-state.js';
import {getRobotFootballDescriptor} from '../../public/js/student-home-robot-football.js';
import {DANCE_CLEARANCE_RADIUS} from '../../public/js/student-home-robot-dance.js';
import {exactKeys,invalid} from './errors.mjs';

// Base v4 asset's measured walking envelope, including its backpack and 2 cm
// clearance. The renderer additionally checks the equipped outfit's envelope.
const navigation=Object.freeze({radius:.4485902240491439,height:1.50377153758785});
const toiletKinds=new Set(['compactToilet','bdSplitToilet','bdMonoblocToilet','bdSmartToilet']);
const clone=value=>structuredClone(value);

export function isRobotSleepActivity(value){
  return exactKeys(value,['kind','itemId','storey'])&&value.kind==='sleep'
    &&typeof value.itemId==='string'&&value.itemId.length>0&&value.itemId.length<=128
    &&Number.isSafeInteger(value.storey)&&value.storey>=0;
}

export function isRobotActivityTargetValid(home,activity){
  if(!isRobotActivityShape(activity))return false;
  const commerce=home?.commerce,floor=getFloorHome(commerce,activity.storey);
  if(!floor)return false;
  try{
    if(activity.kind==='dance')return isAvatarPositionWalkable(floor,activity.point,{...navigation,radius:Math.max(navigation.radius,DANCE_CLEARANCE_RADIUS)});
    if(activity.kind==='stand')return activity.environment==='estate'
      ?isOutdoorRobotPositionWalkable(commerce,activity.point,navigation)
      :isAvatarPositionWalkable(floor,activity.point,navigation);
    if(activity.kind==='watch'){
      const television=commerce.owned.find(row=>row.id===activity.itemId),seat=commerce.owned.find(row=>row.id===activity.seatId);
      if(![television,seat].every(row=>row?.source==='purchase'&&row.status==='placed'&&row.storey===activity.storey))return false;
      const plan=planRobotTelevision(floor,activity.itemId,{navigation,seatId:activity.seatId});if(!plan.ok)return false;
      if(['to-remote','to-seat','to-return'].includes(activity.phase))return isAvatarPositionWalkable(floor,activity.point,navigation);
      if(['pickup','return'].includes(activity.phase)){const target=sampleTelevisionRemoteReach(plan,activity.time).point;return Math.hypot(activity.point.x-target.x,activity.point.z-target.z)<.02;}
      return true;
    }
    if(['stairs','elevator'].includes(activity.kind)){
      const stair=getHomeStairs(floor).find(row=>row.id===activity.itemId),floors=getFloorHomes(commerce);
      if(!stair||(activity.kind==='elevator')!==(stair.type==='elevator')||activity.kind==='elevator'&&activity.step>8)return false;
      const other=floors[activity.storey+(stair.direction==='up'?1:-1)];
      const peer=getHomeStairs(other).find(row=>row.id===stair.id&&row.direction!==stair.direction);
      if(!peer||!['x','z','rotation','type'].every(key=>peer[key]===stair[key]))return false;
      const angle=stair.rotation*Math.PI/180,margin=STAIR_DEPTH/2+navigation.radius+.08;
      const at=sign=>({x:stair.x+Math.sin(angle)*margin*sign,z:stair.z+Math.cos(angle)*margin*sign});
      return isAvatarPositionWalkable(floor,at(stair.direction==='up'?1:-1),navigation)
        &&isAvatarPositionWalkable(other,at(stair.direction==='up'?-1:1),navigation);
    }
    const owned=commerce?.owned?.find(row=>row.id===activity.itemId);
    if(!owned||!['purchase','gift'].includes(owned.source)||owned.status!=='placed')return false;
    if(activity.kind==='football')return owned.storey===null&&!!getRobotFootballDescriptor(commerce,`outdoor:${owned.id}`,{navigation});
    if(activity.kind==='swim')return owned.storey===null&&!!getRobotPoolDescriptor(commerce,`outdoor:${owned.id}`,{navigation});
    if(owned.storey!==activity.storey)return false;
    if(!floor.furniture?.some(item=>item.id===activity.itemId&&item.kind===owned.item.kind))return false;
    if(activity.kind==='sleep')return owned.source==='purchase'&&isRobotBedKind(owned.item?.kind);
    if(activity.action==='wipe')return !!planRobotTableWipe(floor,`furniture:${owned.id}`,{navigation,approachIndex:activity.approachIndex});
    if(activity.action==='tidy')return !!planRobotSofaTidy(floor,`furniture:${owned.id}`,{navigation,approachIndex:activity.approachIndex});
    const choices=listAvatarInteractions(floor,`furniture:${owned.id}`,{...navigation,approachIndex:activity.approachIndex});
    return choices.some(row=>row.kind===activity.action)
      ||activity.action==='sit'&&toiletKinds.has(owned.item.kind)&&choices.some(row=>row.kind==='admire');
  }catch{return false;}
}

/** Receipts already support arbitrary typed business detail. Keeping this in
 * the existing atomic operation log leaves old profile schemas readable. */
export function storedRobotActivity(record){
  const operations=record?.operations??[];
  for(let i=operations.length-1;i>=0;i--){
    const detail=operations[i].receipt?.detail;
    if(detail&&Object.hasOwn(detail,'robotActivity'))return clone(detail.robotActivity);
  }
  return null;
}

export function robotActivityForRecord(record){
  const activity=storedRobotActivity(record);
  return isRobotActivityTargetValid(record?.home,activity)?normalizeRobotActivity(activity):null;
}

export function prepareRobotActivityCommand(record,command){
  if(!exactKeys(command,['type','activity'])||command.type!=='setRobotActivity'
    ||command.activity!==null&&!isRobotActivityShape(command.activity))throw invalid("DisplayText4545.");
  if(command.activity!==null&&!isRobotActivityTargetValid(record.home,command.activity))throw invalid("DisplayText4546, DisplayText4547, DisplayText4263.");
  const activity=normalizeRobotActivity(command.activity);
  return {commerce:clone(record.home.commerce),amount:0,detail:{robotActivity:activity},
    changed:!sameRobotActivity(storedRobotActivity(record),activity)};
}

/** Persist a clearing event when an ordinary edit invalidates the referenced
 * item, passage or standing point. Replacing it must not resurrect old intent. */
export function reconcileRobotActivityDetail(record,nextHome,detail={}){
  if(Object.hasOwn(detail,'robotActivity'))return detail;
  const activity=storedRobotActivity(record);
  if(activity!==null&&(!isRobotActivityTargetValid(record.home,activity)||!isRobotActivityTargetValid(nextHome,activity)))return {...detail,robotActivity:null};
  return detail;
}
