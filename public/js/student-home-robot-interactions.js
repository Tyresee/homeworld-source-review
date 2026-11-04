import * as THREE from 'three';
import {robotStandingAlignment,createRobotFurnitureEntry,sampleRobotMotionStep} from './student-home-robot-motion.js';
import {listAvatarInteractions,planAvatarWalk,isAvatarPositionWalkable} from './home-avatar-navigation.js';
import {getFurniturePose,getHomeCandidateVolume,FURNITURE_ITEMS} from './home-engine.js';
import {getHomeBuildingVolumes} from './home-building-collision.js';
import {createLuxuryItem} from './home-luxury-models.js';
import {ROBOT_SEAT_KINDS} from './home-furniture-capabilities.js';
import {getCookingStation,getHomeCookingStation} from './home-cooking-stations.js';
import {getHomeStairs,getStaircaseEntrances,STAIR_DEPTH,STAIR_FLIGHT_START,STAIR_FLIGHT_END,STAIR_STEP_COUNT,STOREY_HEIGHT,FLOOR_Y} from './home-staircase-shape.js';

const toiletKinds=new Set(['compactToilet','bdSplitToilet','bdMonoblocToilet','bdSmartToilet']);
const washKinds=new Set(['kitchenSink','bathroomVanity','hhPedestalSink','hhDoubleVanity','bdCompactVanity']);
const geometryCache=new Map();
const rotate=(x,z,degrees)=>{const a=degrees*Math.PI/180;return {x:x*Math.cos(a)+z*Math.sin(a),z:-x*Math.sin(a)+z*Math.cos(a)};};
const overlap=(a,b)=>a.minX<b.maxX-.012&&a.maxX>b.minX+.012&&a.minY<b.maxY-.012&&a.maxY>b.minY+.012&&a.minZ<b.maxZ-.012&&a.maxZ>b.minZ+.012;
function furnitureGeometry(item){
  const key=JSON.stringify([item.kind,item.level,item.material,item.plans]);if(geometryCache.has(key))return geometryCache.get(key);
  const model=createLuxuryItem(item),parts=[],geometries=new Set(),materials=new Set();model.updateMatrixWorld(true);
  model.traverse(node=>{if(!node.isMesh)return;parts.push({part:node.userData.part??'',seatCushion:node.userData.seatCushion===true,supportTop:node.userData.supportTop===true,box:new THREE.Box3().setFromObject(node)});geometries.add(node.geometry);for(const m of [].concat(node.material))materials.add(m);});
  const result={parts,bounds:new THREE.Box3().setFromObject(model),remoteDock:model.userData.remoteDock?{...model.userData.remoteDock}:null};geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  if(geometryCache.size>80)geometryCache.delete(geometryCache.keys().next().value);geometryCache.set(key,result);return result;
}

export const ROBOT_COOKING_DURATION=5;
const smoothCooking=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
/** Reach a real pot from the appliance's front, keeping the normal walking
 * approach. The small final step uses the measured standing body, not the
 * wider animated walking cylinder. No geometry or station is persisted. */
export function planRobotCooking(home,targetId,{navigation,from,poses,approachIndex}={}){
  const item=home?.furniture?.find(row=>`furniture:${row.id}`===targetId),local=item&&getCookingStation(item.kind),station=item&&getHomeCookingStation(home,item);
  if(!local||!station||!navigation)return null;
  const shape=furnitureGeometry(item),itemPose=getFurniturePose(home,item),obstacles=occupiedVolumes(home,targetId);
  const tops=shape.parts.filter(({box})=>box.max.y<=local.baseY+.003&&box.max.y>=local.baseY-.20&&box.max.y-box.min.y<.13&&box.max.x-box.min.x>.30&&box.min.x<=local.center.x&&box.max.x>=local.center.x&&box.max.z>shape.bounds.max.z-.17);
  const top=tops.sort((a,b)=>b.box.max.y-a.box.max.y)[0]?.box;if(!top)return null;
  const front=station.front,right=rotate(1,0,itemPose.rotation),standingFront=Math.max(.23,(poses?.idle?.bounds.max[2]??.22)+.035);
  const project=p=>{const r=rotate(p.x,p.z,itemPose.rotation);return{x:itemPose.x+r.x,y:itemPose.y+p.y,z:itemPose.z+r.z};};
  const handL=project({x:Math.max(top.min.x+.06,Math.min(top.max.x-.06,local.center.x-.15)),y:top.max.y+.025,z:top.max.z-.018});
  // A long spoon reaches the pot while its actual grip stays within the small
  // robot's arm span. Its bent neck crosses above the rim, never through it.
  const handR=project({x:local.center.x+.18,y:local.rimY+.025,z:top.max.z+.12});
  const candidates=[0,-.12,.12].map((offset,index)=>{
    const a=rotate(local.center.x+offset,shape.bounds.max.z+navigation.radius+.10,itemPose.rotation),w=rotate(local.center.x,shape.bounds.max.z+standingFront,itemPose.rotation);
    const approach={x:itemPose.x+a.x,z:itemPose.z+a.z},pose={x:itemPose.x+w.x,y:FLOOR_Y,z:itemPose.z+w.z,rotation:itemPose.rotation+180};
    return{id:'cook',kind:'cook',label:"DisplayText4775",targetId,approachIndex:index,approach,pose,cooking:{station,contacts:{L:handL,R:handR},right,front,lean:0}};
  });
  if(from)candidates.sort((a,b)=>Math.hypot(a.approach.x-from.x,a.approach.z-from.z)-Math.hypot(b.approach.x-from.x,b.approach.z-from.z));
  if(Number.isSafeInteger(approachIndex))candidates.sort((a,b)=>Number(b.approachIndex===approachIndex)-Number(a.approachIndex===approachIndex));
  return candidates.find(candidate=>{
    if(!isAvatarPositionWalkable(home,candidate.approach,navigation)||from&&!planAvatarWalk(home,from,candidate.approach,navigation).ok)return false;
    // The whole standing rig stays outside the target cabinet's front plane.
    // Neighbours are still checked component by component on the short step.
    for(let i=0;i<=4;i++){
      const p={x:candidate.approach.x+(candidate.pose.x-candidate.approach.x)*i/4,y:FLOOR_Y,z:candidate.approach.z+(candidate.pose.z-candidate.approach.z)*i/4,rotation:candidate.pose.rotation};
      for(const part of poses?.idle?.parts??[])if(obstacles.some(box=>overlap(poseVolume(part,p),box)))return false;
    }
    const points=[handL,handR,station.stirTarget],reach={minX:Math.min(...points.map(p=>p.x))-.05,maxX:Math.max(...points.map(p=>p.x))+.05,minY:Math.min(...points.map(p=>p.y))-.035,maxY:station.rimY+.10,minZ:Math.min(...points.map(p=>p.z))-.05,maxZ:Math.max(...points.map(p=>p.z))+.05};
    return !obstacles.some(box=>overlap(reach,box));
  })??null;
}

/** A deterministic five-second turn, short step, stir, release and retreat.
 * Sampling the same elapsed time reconstructs contacts after hide/reload. */
export function sampleRobotCooking(descriptor,time){
  const t=Math.max(0,Math.min(ROBOT_COOKING_DURATION,time)),station=descriptor.cooking.station;
  const step=smoothCooking((t-.35)/.55)*(1-smoothCooking((t-4.4)/.55)),reach=smoothCooking((t-.65)/.45)*(1-smoothCooking((t-4.05)/.40));
  const handLift=smoothCooking((t-.65)/.25)*(1-smoothCooking((t-4.25)/.20)),handAcross=smoothCooking((t-.90)/.20)*(1-smoothCooking((t-4.05)/.20));
  const phase=Math.max(0,t-1.5)*3.4,radius=.028,dx=Math.sin(phase)*radius,dz=Math.cos(phase)*radius;
  const {front,right}=descriptor.cooking,food={x:station.stirTarget.x+right.x*dx+front.x*dz,y:station.stirTarget.y,z:station.stirTarget.z+right.z*dx+front.z*dz};
  const outside={...descriptor.cooking.contacts.R,y:station.rimY+.12},above={...food,y:station.rimY+.12};
  const between=(a,b,u)=>({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u});
  // Lift outside the pot, cross above the rim, then lower vertically into the
  // food. Releasing reverses that path before lowering the tool by the hand.
  // A direct hand-to-food interpolation would cut through the solid pot wall.
  let tip=food,tipBlend=1;
  if(t<1.15){tip=outside;tipBlend=smoothCooking((t-.85)/.30);}
  else if(t<1.35)tip=between(outside,above,smoothCooking((t-1.15)/.20));
  else if(t<1.50)tip=between(above,food,smoothCooking((t-1.35)/.15));
  else if(t>3.95){tip=outside;tipBlend=1-smoothCooking((t-3.95)/.30);}
  else if(t>3.70)tip=between(above,outside,smoothCooking((t-3.70)/.25));
  else if(t>3.55)tip=between(food,above,smoothCooking((t-3.55)/.15));
  return{point:{x:descriptor.approach.x+(descriptor.pose.x-descriptor.approach.x)*step,y:FLOOR_Y,z:descriptor.approach.z+(descriptor.pose.z-descriptor.approach.z)*step},turn:smoothCooking(t/.45),reach,handLift,handAcross,contacts:descriptor.cooking.contacts,tip,
    neck:{x:tip.x+front.x*.025,y:Math.max(station.rimY+.07,tip.y+.035),z:tip.z+front.z*.025},tipBlend,station,heat:smoothCooking((t-.65)/.45)*(1-smoothCooking((t-4.05)/.40)),time:t};
}

export const isRobotTelevisionKind=kind=>['ipRetroTelevision','ipWideTelevision','ipCinemaTelevision'].includes(kind);
export const TELEVISION_REACH_DURATION=1.72,TELEVISION_HANDOFF_TIME=.86;
/** A short forward/back step uses the standing rig's real depth rather than
 * pretending the larger walking-radius envelope is a hand-reach distance. */
export function sampleTelevisionRemoteReach(plan,time){
  const t=Math.max(0,Math.min(TELEVISION_REACH_DURATION,time)),smooth=u=>u*u*(3-2*u);
  let offset=.14,gait=0,reach=0;
  if(t<.36){const u=t/.36;offset=.14*smooth(u);gait=Math.sin(Math.PI*u);}
  else if(t>1.36){const u=(t-1.36)/.36;offset=.14*(1-smooth(u));gait=Math.sin(Math.PI*u);}
  else{const u=t-.36;reach=Math.max(0,Math.min(1,u/.30,(1-u)/.30));}
  const dx=plan.remoteDock.x-plan.approach.x,dz=plan.remoteDock.z-plan.approach.z,length=Math.hypot(dx,dz)||1;
  return {point:{x:plan.approach.x+dx/length*offset,y:FLOOR_Y,z:plan.approach.z+dz/length*offset},gait,reach};
}
// Watching uses the same seated capabilities as navigation and persisted
// activities. A catalogue sofa must not silently disappear from the TV planner.
const televisionSeatKinds=new Set(ROBOT_SEAT_KINDS);
export const isRobotTelevisionSeatKind=kind=>televisionSeatKinds.has(kind);
export const isRobotSofaKind=kind=>['sofa','daybedSofa','lcCloudSofa','lcSpindleSofa','lcCurvedSofa','lcChaise','lcWingChair','lcBarrelChair','lcRecliner','lcOttoman'].includes(kind);
export const SOFA_TIDY_DURATION=5;
const tableKinds=new Set(FURNITURE_ITEMS.filter(item=>/table|desk|console/i.test(`${item.id} ${item.family??''}`)).map(item=>item.id));
export function planRobotTableWipe(home,targetId,{navigation,from,approachIndex}={}){
  const item=home?.furniture?.find(row=>`furniture:${row.id}`===targetId&&tableKinds.has(row.kind));if(!item)return null;
  const shape=furnitureGeometry(item),pose=getFurniturePose(home,item),obstacles=occupiedVolumes(home,targetId);
  const top=shape.parts.filter(row=>row.supportTop&&row.box.max.y>.35&&row.box.max.y<1.12).sort((a,b)=>b.box.max.y-a.box.max.y)[0]?.box;if(!top)return null;
  const centre=top.getCenter(new THREE.Vector3()),width=top.max.x-top.min.x;
  const candidates=[0,-Math.min(.42,width*.25),Math.min(.42,width*.25)].map((offset,index)=>{
    const local=rotate(centre.x+offset,shape.bounds.max.z+navigation.radius+.08,pose.rotation??0),approach={x:pose.x+local.x,z:pose.z+local.z},contacts={};
    for(const[side,sign]of[['L',-1],['R',1]]){const p=rotate(centre.x+offset+sign*.15,top.max.z-.10,pose.rotation??0);contacts[side]={x:pose.x+p.x,y:pose.y+top.max.y+.045,z:pose.z+p.z};}
    const points=[approach,...Object.values(contacts)],reach={minX:Math.min(...points.map(p=>p.x))-.16,maxX:Math.max(...points.map(p=>p.x))+.16,minZ:Math.min(...points.map(p=>p.z))-.16,maxZ:Math.max(...points.map(p=>p.z))+.16,minY:pose.y+top.max.y,maxY:pose.y+1.6};
    return{id:'wipe',kind:'wipe',label:"DisplayText3933",targetId,approach,approachIndex:index,pose:{...approach,y:FLOOR_Y,rotation:(pose.rotation??0)+180},tidy:{contacts,rotation:pose.rotation??0,lean:Math.max(.24,Math.min(1.05,1.58-contacts.R.y))},blocked:obstacles.some(box=>overlap(reach,box))};
  });
  candidates.sort((a,b)=>Number(a.footEntry===true)-Number(b.footEntry===true));
  if(Number.isSafeInteger(approachIndex))candidates.sort((a,b)=>Number(b.approachIndex===approachIndex)-Number(a.approachIndex===approachIndex));
  return candidates.find(row=>!row.blocked&&isAvatarPositionWalkable(home,row.approach,navigation)&&(!from||planAvatarWalk(home,from,row.approach,navigation).ok))??null;
}
/** The target is a real, horizontal upholstered seat surface. The robot stands
 * in front of that cushion, rather than reaching through a backrest or arm. */
export function planRobotSofaTidy(home,targetId,{navigation,from,approachIndex}={}){
  const item=home?.furniture?.find(row=>`furniture:${row.id}`===targetId&&isRobotSofaKind(row.kind));
  if(!item)return null;
  const shape=furnitureGeometry(item),pose=getFurniturePose(home,item),obstacles=occupiedVolumes(home,targetId);
  const seats=shape.parts.map((part,index)=>({...part,index})).filter(({part,seatCushion,box})=>{
    const size=box.getSize(new THREE.Vector3());
    return (seatCushion||part.includes('seat')&&!part.includes('base'))&&size.x>.32&&size.z>.30&&size.y<.36&&box.max.y>.25&&box.max.y<.90;
  }).sort((a,b)=>Math.abs(a.box.getCenter(new THREE.Vector3()).x)-Math.abs(b.box.getCenter(new THREE.Vector3()).x));
  const candidates=seats.map(({box,index},candidateIndex)=>{
    const centre=box.getCenter(new THREE.Vector3()),local=rotate(centre.x,shape.bounds.max.z+navigation.radius+.08,pose.rotation??0);
    const approach={x:pose.x+local.x,z:pose.z+local.z},z=Math.min(box.max.z-.07,Math.max(box.min.z+.10,box.max.z-.075));
    const spacing=Math.min(.20,(box.max.x-box.min.x)*.25),contacts={};
    for(const [side,sign]of[['L',-1],['R',1]]){const p=rotate(centre.x+spacing*sign,z,pose.rotation??0);contacts[side]={x:pose.x+p.x,y:pose.y+box.max.y+.035,z:pose.z+p.z};}
    // The approach cylinder is checked by navigation; a swept hand/torso box
    // covers the reach above the seat and rejects nearby tables or wall trim.
    const points=[approach,...Object.values(contacts)];
    const reach={minX:Math.min(...points.map(p=>p.x))-.16,maxX:Math.max(...points.map(p=>p.x))+.16,minZ:Math.min(...points.map(p=>p.z))-.16,maxZ:Math.max(...points.map(p=>p.z))+.16,minY:Math.min(...Object.values(contacts).map(p=>p.y))-.05,maxY:pose.y+1.5};
    return {id:'tidy',kind:'tidy',label:"DisplayText3932",targetId,approach,approachIndex:candidateIndex,pose:{...approach,y:FLOOR_Y,rotation:(pose.rotation??0)+180},tidy:{contacts,cushionIndex:index,rotation:pose.rotation??0},blocked:obstacles.some(box=>overlap(reach,box))};
  });
  candidates.sort((a,b)=>Number(a.footEntry===true)-Number(b.footEntry===true));
  if(Number.isSafeInteger(approachIndex))candidates.sort((a,b)=>Number(b.approachIndex===approachIndex)-Number(a.approachIndex===approachIndex));
  return candidates.find(row=>!row.blocked&&isAvatarPositionWalkable(home,row.approach,navigation)&&(!from||planAvatarWalk(home,from,row.approach,navigation).ok))??null;
}
/** Contact and release are eased; three alternating pats are followed by a
 * broad smoothing stroke. No random transforms are needed when restoring. */
export function sampleRobotSofaTidy(descriptor,time){
  const t=Math.max(0,Math.min(SOFA_TIDY_DURATION,time)),smooth=u=>u*u*(3-2*u),clamp=u=>Math.max(0,Math.min(1,u));
  const reach=smooth(clamp((t-.40)/.75))*(1-smooth(clamp((t-4.1)/.8)));
  const work=clamp((t-1.15)/2.95),stroke=Math.sin(work*Math.PI*2),contacts={};
  for(const [side,phase]of[['L',0],['R',Math.PI]]){
    const pulse=work>0&&work<.78?Math.max(0,Math.sin(work*Math.PI*8+phase)):0;
    const p=descriptor.tidy.contacts[side],offset=rotate(stroke*.035,work>.74?(work-.74)*.14:0,descriptor.tidy.rotation);
    if(descriptor.kind==='wipe'){
      const sweep=rotate(side==='R'?Math.sin(work*Math.PI*6)*.075:0,side==='R'?(1-Math.cos(work*Math.PI*6))*.025:0,descriptor.tidy.rotation);
      contacts[side]={x:p.x+sweep.x,y:p.y,z:p.z+sweep.z};
    }else contacts[side]={x:p.x+offset.x,y:p.y+.075*pulse,z:p.z+offset.z};
  }
  return {reach,contacts,compression:reach*(.012+.018*Math.max(0,Math.sin(work*Math.PI*8))),turn:smooth(clamp(t/.4))};
}
export function planRobotSofaTelevision(home,seatId,options={}){
  const televisions=(home?.furniture??[]).filter(row=>isRobotTelevisionKind(row.kind));
  const failures=[];
  for(const television of televisions){const plan=planRobotTelevision(home,television.id,{...options,seatId});if(plan.ok)return plan;failures.push(plan);}
  // Keep the most useful actual reason instead of replacing it with a generic
  // instruction to buy/reposition a sofa that may already be correctly placed.
  failures.sort((a,b)=>(televisionFailureProgress[b.reason]??0)-(televisionFailureProgress[a.reason]??0));
  return failures[0]??{ok:false,reason:'missing-television',error:"DisplayText4928, DisplayText4084."};
}
const televisionFailureProgress=Object.freeze({'missing-seat':0,'seat-distance':1,'seat-facing':2,'screen-facing':3,'seat-access':4,'view-blocked':5,'remote-access':6});
/** Select a reachable seat that actually faces the front of this television.
 * Server validation uses the same ownership-independent spatial rules; the
 * renderer additionally supplies its measured real-rig seating envelope. */
export function planRobotTelevision(home,tvId,{navigation,from,poses,seatId}={}){
  const television=home?.furniture?.find(item=>item.id===tvId&&isRobotTelevisionKind(item.kind));
  if(!television)return {ok:false,reason:'missing-television',error:"DisplayText4085."};
  const tvPose=getFurniturePose(home,television),shape=furnitureGeometry(television),dock=shape.remoteDock??{x:.2,y:.73,z:.25};
  const local=rotate(dock.x,shape.bounds.max.z+navigation.radius+.08,tvPose.rotation??0);
  const approach={x:tvPose.x+local.x,z:tvPose.z+local.z},offset=rotate(dock.x,dock.z,tvPose.rotation??0);
  const remoteDock={x:tvPose.x+offset.x,y:tvPose.y+dock.y,z:tvPose.z+offset.z};
  if(!isAvatarPositionWalkable(home,approach,navigation)||from&&!planAvatarWalk(home,from,approach,navigation).ok)return {ok:false,reason:'remote-access',error:"DisplayText4929, DisplayText4930, DisplayText4931."};
  const tvFront=rotate(0,1,tvPose.rotation??0),obstacles=occupiedVolumes(home,`furniture:${tvId}`),candidates=[];
  let failure={ok:false,reason:'missing-seat',error:"DisplayText4932, DisplayText4933, DisplayText4934."};
  const reject=(reason,error)=>{if(televisionFailureProgress[reason]>=(televisionFailureProgress[failure.reason]??0))failure={ok:false,reason,error};};
  for(const item of home.furniture){
    if(!televisionSeatKinds.has(item.kind)||seatId&&item.id!==seatId)continue;
    const seatPose=getFurniturePose(home,item),dx=tvPose.x-seatPose.x,dz=tvPose.z-seatPose.z,distance=Math.hypot(dx,dz),forward=rotate(0,1,seatPose.rotation??0);
    if(distance<1.45||distance>10){reject('seat-distance',distance<1.45?"DisplayText4935, DisplayText4936.":"DisplayText4937, DisplayText4938.");continue;}
    if((forward.x*dx+forward.z*dz)/distance<.88){reject('seat-facing',"DisplayText4939, DisplayText4940.");continue;}
    if((-tvFront.x*dx-tvFront.z*dz)/distance<.65){reject('screen-facing',"DisplayText4941, DisplayText4942.");continue;}
    const choices=poses?listRobotInteractions(home,`furniture:${item.id}`,{navigation,from:approach,poses}):listAvatarInteractions(home,`furniture:${item.id}`,{...navigation,from:approach});
    const seat=choices.find(row=>row.kind==='sit');if(!seat){reject('seat-access',"DisplayText4943, DisplayText4944.");continue;}
    const start=new THREE.Vector3(seatPose.x,seat.pose.y+.80,seatPose.z),end=new THREE.Vector3(tvPose.x,tvPose.y+Math.min(shape.bounds.max.y-.15,1.35),tvPose.z),direction=end.clone().sub(start),length=direction.length(),ray=new THREE.Ray(start,direction.normalize()),hit=new THREE.Vector3();
    if(obstacles.some(box=>box.id!==`furniture:${item.id}`&&ray.intersectBox(new THREE.Box3(new THREE.Vector3(box.minX,box.minY,box.minZ),new THREE.Vector3(box.maxX,box.maxY,box.maxZ)),hit)&&start.distanceTo(hit)<length-.15)){reject('view-blocked',"DisplayText4945, DisplayText4946.");continue;}
    candidates.push({seat,item,distance});
  }
  candidates.sort((a,b)=>a.distance-b.distance);const candidate=candidates[0];
  if(!candidate)return failure;
  return {ok:true,id:'watch',kind:'watch',label:"DisplayText3986, DisplayText3987",targetId:`furniture:${tvId}`,tvId,seatId:candidate.item.id,seat:candidate.seat,approach,remoteDock,tvRotation:tvPose.rotation??0,pickupRotation:(tvPose.rotation??0)+180};
}
function occupiedVolumes(home,targetId){
  const rows=[...getHomeBuildingVolumes(home)];
  if(home.profile!=='upper'&&home.profile!=='account'){
    rows.push(getHomeCandidateVolume(home,{id:'table',...home.table}));
    for(const[id,p]of Object.entries(home.placements??{}))if(id!=='rug')rows.push(getHomeCandidateVolume(home,{id:`placement:${id}`,...p}));
  }
  // A neighbour's empty space below a tabletop or between chair legs is
  // not a solid cube. Retain every real authored component conservatively.
  for(const item of home.furniture??[])if(`furniture:${item.id}`!==targetId){
    const pose=getFurniturePose(home,item);
    for(const {box}of furnitureGeometry(item).parts)rows.push({...poseVolume({min:box.min.toArray(),max:box.max.toArray()},pose),id:`furniture:${item.id}`});
  }
  return rows.filter(Boolean);
}
function poseVolume(local,pose){
  const points=[];for(const x of[local.min[0],local.max[0]])for(const z of[local.min[2],local.max[2]])points.push(rotate(x,z,pose.rotation));
  return {minX:pose.x+Math.min(...points.map(p=>p.x)),maxX:pose.x+Math.max(...points.map(p=>p.x)),minZ:pose.z+Math.min(...points.map(p=>p.z)),maxZ:pose.z+Math.max(...points.map(p=>p.z)),minY:pose.y+local.min[1],maxY:pose.y+local.max[1]};
}
/** Contact is calibrated against the actual robot's supporting thigh/sole geometry.
 * Existing doll anchors supply only furniture semantics and measured seat height. */
export function listRobotInteractions(home,targetId,{navigation,from,poses,entrySide,approachIndex,compactAttempt=false,regularNavigation=navigation}={}){
  const compactFallback=()=>{
    if(compactAttempt||!poses?.compact)return[];
    const radius=Math.max(.32,(poses.compact.bounds.max[0]-poses.compact.bounds.min[0])/2+.01);
    if(radius>=navigation.radius-.01)return[];
    return listRobotInteractions(home,targetId,{navigation:{...navigation,radius},regularNavigation:navigation,from,poses,entrySide,approachIndex,compactAttempt:true}).filter(row=>['sit','lie'].includes(row.kind));
  };
  const existing=listAvatarInteractions(home,targetId,{...navigation,from:compactAttempt?undefined:from,approachIndex});if(!existing.length)return compactFallback();
  const item=targetId.startsWith('furniture:')?home.furniture.find(row=>row.id===targetId.slice(10)):null;
  const result=existing.filter(row=>!['sit','lie','cook'].includes(row.kind));
  if(item&&getCookingStation(item.kind)){const cooking=planRobotCooking(home,targetId,{navigation,from,poses,approachIndex});if(cooking)result.unshift(cooking);}
  if(item&&isRobotSofaKind(item.kind)){const tidy=planRobotSofaTidy(home,targetId,{navigation,from,approachIndex});if(tidy)result.unshift(tidy);}
  if(item&&tableKinds.has(item.kind)){const wipe=planRobotTableWipe(home,targetId,{navigation,from,approachIndex});if(wipe)result.unshift(wipe);}
  const admire=existing.find(row=>row.kind==='admire');
  if(item&&washKinds.has(item.kind)&&!result.some(row=>row.kind==='wash'))result.unshift({...admire,id:'wash',kind:'wash',label:"DisplayText0254"});
  let anchor=existing.find(row=>['sit','lie'].includes(row.kind));
  if(item&&toiletKinds.has(item.kind)){
    const shape=furnitureGeometry(item),seat=shape.parts.filter(row=>row.part==='toilet-seat-ring'||row.part==='toilet-bowl').sort((a,b)=>b.box.max.y-a.box.max.y)[0];
    const y=item.kind==='compactToilet'?.635:seat?.box.max.y;
    if(Number.isFinite(y))anchor={...admire,id:'toilet',kind:'sit',label:"DisplayText4090",pose:{...getFurniturePose(home,item),y:getFurniturePose(home,item).y+y}};
  }
  if(!anchor||!poses?.[anchor.kind]||!poses.idle)return result;
  const local=poses[anchor.kind],pose={...anchor.pose},obstacles=occupiedVolumes(home,targetId);
  let candidates=[];
  if(item){
    const itemPose=getFurniturePose(home,item),shape=furnitureGeometry(item),angle=itemPose.rotation??0;
    if(anchor.kind==='sit'){
      const support=shape.parts.filter(row=>row.box.max.y<pose.y-itemPose.y+.035&&row.box.max.y>pose.y-itemPose.y-.45&&row.box.min.x<.24&&row.box.max.x>-.24);
      const front=Math.max(...support.map(row=>row.box.max.z),shape.bounds.min.z);
      const z=front-local.shinMinZ+.018,offset=rotate(0,z,angle);
      pose.x=itemPose.x+offset.x;pose.z=itemPose.z+offset.z;
      const frontZ=shape.bounds.max.z+navigation.radius+(compactAttempt?.012:.08);
      for(const x of[0,-.22,.22]){const p=rotate(x,frontZ,angle),approach={x:itemPose.x+p.x,z:itemPose.z+p.z};
        candidates.push({...anchor,approachIndex:[0,-.22,.22].indexOf(x),approach,pose,motion:{alignment:robotStandingAlignment(pose,poses),edge:pose,final:pose}});}
    }else{
      let mattresses=shape.parts.filter(row=>['mattress','daybed-mattress'].includes(row.part));
      if(!mattresses.length)mattresses=shape.parts.filter(row=>row.box.max.y<.62&&row.box.max.y>.40&&row.box.max.x-row.box.min.x>.8&&row.box.max.z-row.box.min.z>.8);
      const mattress= mattresses.sort((a,b)=>item.kind==='lcBunkBed'?b.box.max.y-a.box.max.y:(b.box.max.x-b.box.min.x)*(b.box.max.z-b.box.min.z)-(a.box.max.x-a.box.min.x)*(a.box.max.z-a.box.min.z))[0]?.box;
      if(!mattress)return result;
      const variants=[{pose:poses.lie,curl:0,turn:0},{pose:poses.lie,curl:0,turn:90},...poses.curl?[{pose:poses.curl,curl:1,turn:0},{pose:poses.curl,curl:1,turn:90}]:[]];
      const variant=variants.find(v=>{const w=v.pose.bounds.max[0]-v.pose.bounds.min[0],d=v.pose.bounds.max[2]-v.pose.bounds.min[2];return mattress.max.x-mattress.min.x>=(v.turn?d:w)-.025&&mattress.max.z-mattress.min.z>=(v.turn?w:d)-.025;});
      if(!variant)return result;
      const lying=variant.pose,rotation=angle+variant.turn,mattressCentre= mattress.getCenter(new THREE.Vector3());
      pose.y-=Math.min(0,lying.bounds.min[1]);pose.rotation=rotation;
      const centreOffset=rotate(mattressCentre.x,mattressCentre.z,angle),bodyOffset=rotate(-(lying.bounds.min[0]+lying.bounds.max[0])/2,-(lying.bounds.min[2]+lying.bounds.max[2])/2,rotation);
      pose.x=itemPose.x+centreOffset.x+bodyOffset.x;pose.z=itemPose.z+centreOffset.z+bodyOffset.z;
      let index=0;
      for(const side of[-1,1])for(const along of[0,.20,-.20]){
        const edgeOffset=rotate(side<0?mattress.min.x+.10:mattress.max.x-.10,mattressCentre.z+along,angle);
        const edge={x:itemPose.x+edgeOffset.x,y:pose.y,z:itemPose.z+edgeOffset.z,rotation:angle+side*90};
        const margin=side<0?shape.bounds.min.x-navigation.radius-(compactAttempt?.012:.10):shape.bounds.max.x+navigation.radius+(compactAttempt?.012:.10);
        const p=rotate(margin,mattressCentre.z+along,angle),approach={x:itemPose.x+p.x,z:itemPose.z+p.z};
        candidates.push({...anchor,approachIndex:index++,entrySide:side<0?'left':'right',approach,pose,motion:{curl:variant.curl,alignment:robotStandingAlignment(edge,poses),edge,centre:{...pose},final:pose}});
      }
      // A bed against two side walls may still have a completely open foot.
      // Existing checkpoint indices0..11 also identify this safe entry route.
      for(const across of[0,-.2,.2]){
        const edgeOffset=rotate(mattressCentre.x+across,mattress.max.z-.10,angle),p=rotate(mattressCentre.x+across,shape.bounds.max.z+navigation.radius+(compactAttempt?.012:.10),angle);
        const edge={x:itemPose.x+edgeOffset.x,y:pose.y,z:itemPose.z+edgeOffset.z,rotation:angle};
        candidates.push({...anchor,footEntry:true,approachIndex:index++,entrySide:'left',approach:{x:itemPose.x+p.x,z:itemPose.z+p.z},pose,motion:{curl:variant.curl,alignment:robotStandingAlignment(edge,poses),edge,centre:{...pose},final:pose}});
      }
      if(['lcLoftBed','lcBunkBed'].includes(item.kind)){
        const p=rotate(shape.bounds.max.x+navigation.radius+.12,.515,angle),base=rotate(.99,.515,angle),edgeOffset=rotate(mattress.max.x-.08,.515,angle);
        const edge={...pose,rotation:angle};
        candidates=[{...anchor,entrySide:'right',approachIndex:9,approach:{x:itemPose.x+p.x,z:itemPose.z+p.z},pose,motion:{curl:variant.curl,edge,centre:{...pose},final:pose,alignment:robotStandingAlignment(edge,poses),ladder:{base:{x:itemPose.x+base.x,y:FLOOR_Y,z:itemPose.z+base.z},rotation:angle+270,perch:{x:itemPose.x+base.x,z:itemPose.z+base.z,y:itemPose.y+Math.max(...shape.parts.filter(p=>/guard/.test(p.part)).map(p=>p.box.max.y),mattress.max.y)+.015-Math.min(0,poses.perch?.bounds.min[1]??0),rotation:angle+270}}}}];
      }
    }
  }else candidates=[{...anchor,pose,motion:{alignment:robotStandingAlignment(pose,poses),edge:pose,final:pose}}];
  if(from)candidates.sort((a,b)=>Math.hypot(a.approach.x-from.x,a.approach.z-from.z)-Math.hypot(b.approach.x-from.x,b.approach.z-from.z));
  candidates.sort((a,b)=>Number(a.footEntry===true)-Number(b.footEntry===true));
  if(Number.isSafeInteger(approachIndex))candidates.sort((a,b)=>Number(b.approachIndex===approachIndex)-Number(a.approachIndex===approachIndex));
  if(entrySide)candidates.sort((a,b)=>Number(b.entrySide===entrySide)-Number(a.entrySide===entrySide));
  const select=()=>candidates.find(candidate=>{
    if(compactAttempt){
      if(candidate.motion?.ladder)return false;
      let selected=null;
      // Only a short local entry is compact. The regular walk stops in real
      // clear space, then its reversible furniture checkpoint owns the aisle.
      const angles=[...Array(16)].map((_,i)=>i*Math.PI/8);
      for(let distance=.24;distance<=2.4&&!selected;distance+=.24)for(const angle of angles){
        const origin={x:candidate.approach.x+Math.cos(angle)*distance,z:candidate.approach.z+Math.sin(angle)*distance};
        if(!isAvatarPositionWalkable(home,origin,regularNavigation))continue;
        const path=planAvatarWalk(home,origin,candidate.approach,navigation);if(!path.ok||path.path.length>3)continue;
        if(path.path.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-path.path[i].x,p.z-path.path[i].z),0)>2.5)continue;
        selected={origin,path:path.path};break;
      }
      if(!selected||from&&!planAvatarWalk(home,from,selected.origin,regularNavigation).ok)return false;candidate.compactOrigin=selected.origin;candidate.compactPath=selected.path;
    }
    if(!isAvatarPositionWalkable(home,candidate.approach,navigation)||!compactAttempt&&from&&!planAvatarWalk(home,from,candidate.approach,navigation).ok)return false;
    // Check the complete approach/turn/sit/bed sweep against neighbours and
    // walls. The target's own contact geometry was measured above.
    const steps=createRobotFurnitureEntry(candidate,poses,{point:candidate.compactOrigin??candidate.approach,rotation:candidate.motion.alignment.rotation});
    for(const step of steps)for(let n=0;n<=8;n++){
      const sample=sampleRobotMotionStep(step,n/8);
      if(poses.sampleMotion){
        for(const actual of poses.sampleMotion(sample))if(obstacles.some(v=>overlap({...actual,minX:actual.minX-.008,maxX:actual.maxX+.008,minZ:actual.minZ-.008,maxZ:actual.maxZ+.008},v)))return false;
        continue;
      }
      const keys=[step.from.pose,step.to.pose],calibrated=keys.map(p=>poses[p.compact?'compact':p.ladder&&p.action==='sit'?'perch':p.ladder?'ladder':p.tuck?'tuck':p.curl?'curl':p.action]??poses.idle);
      // Sweep corresponding real mesh bounds instead of the complete body's
      // empty bounding cube. Endpoint unions retain joint-arc clearance.
      const ids=new Set(calibrated.flatMap(p=>(p.parts??[]).map(part=>part.id)));
      const volumes=ids.size?[...ids].map(id=>{
        const parts=calibrated.map(p=>p.parts?.find(part=>part.id===id)).filter(Boolean);
        return{min:[0,1,2].map(i=>Math.min(...parts.map(p=>p.min[i]))),max:[0,1,2].map(i=>Math.max(...parts.map(p=>p.max[i])))};
      }):[{min:[0,1,2].map(i=>Math.min(...calibrated.map(p=>p.bounds.min[i]))),max:[0,1,2].map(i=>Math.max(...calibrated.map(p=>p.bounds.max[i])))}];
      for(const bounds of volumes){
        const volume=poseVolume(bounds,{...sample.point,rotation:sample.rotation});
        volume.minX-=.015;volume.maxX+=.015;volume.minZ-=.015;volume.maxZ+=.015;
        if(obstacles.some(v=>overlap(volume,v)))return false;
      }

    }
    return true;
  });
  const chosen=poses.withGeometrySampling?poses.withGeometrySampling(select):select();
  if(chosen)result.unshift(chosen);else result.unshift(...compactFallback());return compactAttempt?result.filter(row=>['sit','lie'].includes(row.kind)):result;
}

/** Build the real sixteen-step line, and verify both floor-height approaches.
 * The staircase itself is traversed explicitly rather than pretending its
 * collision box is ordinary walkable floor. */
export function planRobotStairs(home,floors,index,stairId,from,navigation){
  const stair=getHomeStairs(home).find(row=>row.id===stairId);if(!stair)return {ok:false,error:"DisplayText4091."};
  const target=index+(stair.direction==='up'?1:-1),other=floors?.[target];
  const peer=getHomeStairs(other).find(row=>row.id===stairId&&row.direction!==stair.direction);
  if(!other||!peer)return {ok:false,error:"DisplayText4092."};
  const a=stair.rotation*Math.PI/180,base=stair.direction==='down'?-STOREY_HEIGHT:0;
  const at=(z,y)=>({x:stair.x+Math.sin(a)*z,z:stair.z+Math.cos(a)*z,y:base+y});
  const margin=navigation.radius+.08,lower=at(STAIR_DEPTH/2+margin,FLOOR_Y),upper=at(-STAIR_DEPTH/2-margin,FLOOR_Y+STOREY_HEIGHT);
  const entry=stair.direction==='up'?lower:upper,exit=stair.direction==='up'?upper:lower;
  const approach=planAvatarWalk(home,from,entry,navigation);if(!approach.ok)return {ok:false,error:"DisplayText4093, DisplayText4094."};
  if(!isAvatarPositionWalkable(other,exit,navigation))return {ok:false,error:"DisplayText4095, DisplayText3951."};
  const rise=STOREY_HEIGHT/STAIR_STEP_COUNT,depth=(STAIR_FLIGHT_START-STAIR_FLIGHT_END)/STAIR_STEP_COUNT;
  const points=[lower,at(STAIR_FLIGHT_START+.03,FLOOR_Y)];
  for(let n=0;n<STAIR_STEP_COUNT;n++)points.push(at(STAIR_FLIGHT_START-(n+.5)*depth,FLOOR_Y+(n+1)*rise));
  points.push(at(-STAIR_DEPTH/2,FLOOR_Y+STOREY_HEIGHT),upper);
  if(stair.direction==='down')points.reverse();
  return {ok:true,stairId,stair:{...stair},target,direction:stair.direction,approach:entry,path:points,arrival:{x:exit.x,z:exit.z,y:FLOOR_Y},entrances:getStaircaseEntrances(stair)};
}
