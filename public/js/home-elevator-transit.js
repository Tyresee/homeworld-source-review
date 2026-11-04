import * as THREE from 'three';
import {FLOOR_Y,STOREY_HEIGHT} from './home-staircase-shape.js';

const clamp=value=>Math.max(0,Math.min(1,value));
const copyFrame=frame=>frame?{...frame,...frame.doors?{doors:{...frame.doors}}:{}}:null;
const shaftPose=shaft=>{const frame=shaft?.userData.elevatorFrame;return frame?JSON.stringify([frame.stairId,frame.doorStairId,frame.cabinY,frame.doors?.lower,frame.doors?.upper]):null;};
const consumedSnapshots=new WeakSet(),consumedPlaceholders=new WeakSet(),ownedStacks=new WeakMap();
const index=value=>Number.isInteger(value)&&value>=0;

/** Lid presentation (approved 2026-11-01): storeys above the focus storey are
 * lifted straight up by LID_LIFT_HEIGHT so the focus storey is never covered.
 * The lift follows the cabin continuously. Translation only: no fade, no
 * material change. Lifted storeys stop casting shadows. */
export const LID_LIFT_HEIGHT=8.8;
export function lidLiftOffset(storey,focusStorey){const p=clamp(storey-focusStorey);return LID_LIFT_HEIGHT*p*p*(3-2*p);}
const LID_EPSILON=1e-4;
function rememberShadowFlags(snapshot){snapshot.traverse(node=>{if(node.isMesh&&node.userData.lidOriginalCastShadow===undefined)node.userData.lidOriginalCastShadow=node.castShadow;});}

/** Select at most three contiguous real floors around a current storey. */
export function chooseHomeFloorWindow(count,anchorStorey){
  if(!Number.isInteger(count)||count<1||!index(anchorStorey)||anchorStorey>=count)throw new RangeError('A floor window requires a real storey inside the building.');
  const length=Math.min(3,count),start=Math.max(0,Math.min(anchorStorey-1,count-length));
  return Array.from({length},(_,offset)=>start+offset);
}

/** Own two or three real floor captures with presentation-only lid offsets.
 * The scene chooses visibility and camera framing. Residency never fades
 * materials or changes depth/receiveShadow; raised lids stop casting shadows.
 * Fresh detached captures and
 * their resources transfer to this stack exactly once. Rebasing retains the
 * same groups, geometry, materials and texture leases across floor handoffs.
 */
export function createHomeFloorStack({anchorStorey,snapshots}={}){
  if(!index(anchorStorey))throw new TypeError('A floor stack requires a real anchor storey.');
  if(!Array.isArray(snapshots)||snapshots.length<2||snapshots.length>3||new Set(snapshots.map(row=>row?.storey)).size!==snapshots.length||new Set(snapshots.map(row=>row?.group)).size!==snapshots.length)throw new TypeError('A floor stack requires two or three fresh captures.');
  let storeys=snapshots.map(row=>row?.storey).sort((a,b)=>a-b);
  if(!storeys.every((storey,i)=>index(storey)&&(!i||storey>storeys[i-1]))||!storeys.includes(anchorStorey))throw new TypeError('A floor stack requires distinct real storeys including its anchor.');
  for(const row of snapshots)if(!row.group?.isGroup||row.group.parent||consumedSnapshots.has(row.group)||row.group.userData.floorIndex!==row.storey||!row.group.userData.captureStats||typeof row.group.userData.dispose!=='function')throw new TypeError('A floor stack accepts fresh detached captureHomeFloor outputs only.');
  const group=new THREE.Group();group.name='home-resident-floor-stack';Object.assign(group.userData,{anchorStorey,coordinateSpace:'anchor-floor-local'});
  let rows=snapshots.map(({storey,group:snapshot})=>{consumedSnapshots.add(snapshot);rememberShadowFlags(snapshot);snapshot.visible=true;group.add(snapshot);return {storey,group:snapshot,lifted:false};});
  let disposed=false,focusStorey=anchorStorey,placeholders=[];
  // Positions every resident storey from anchor + focus. Returns whether any
  // position or shadow flag changed so the scene can refresh its shadow map.
  function layout(){
    let moved=false,shadowChanged=false;
    for(const row of [...rows,...placeholders]){
      const y=(row.storey-anchorStorey)*STOREY_HEIGHT+lidLiftOffset(row.storey,focusStorey);
      if(Math.abs(row.group.position.y-y)>1e-9||row.group.position.x!==0||row.group.position.z!==0){row.group.position.set(0,y,0);moved=true;}
      const lifted=lidLiftOffset(row.storey,focusStorey)>LID_EPSILON;
      if(row.lifted!==lifted){row.lifted=lifted;shadowChanged=true;row.group.traverse(node=>{if(node.isMesh)node.castShadow=!lifted&&node.userData.lidOriginalCastShadow!==false;});}
    }
    group.updateMatrixWorld(true);return {moved,shadowChanged};
  }
  function setAnchorStorey(next){
    if(disposed)return false;
    if(!index(next)||!storeys.includes(next))throw new RangeError('The floor stack can only rebase to a resident real storey.');
    const changed=anchorStorey!==next;anchorStorey=next;focusStorey=next;group.userData.anchorStorey=next;
    layout();return changed;
  }
  /** Plain geometry for skipped floors. Real captures remain separately
   * bounded to three. Validate the entire replacement before adopting any
   * resource; repeating the same list never disposes its live groups. */
  function setPlaceholders(list=[]){
    if(disposed)return false;
    if(!Array.isArray(list)||new Set(list.map(row=>row?.storey)).size!==list.length||new Set(list.map(row=>row?.group)).size!==list.length)throw new TypeError('Placeholders need distinct non-resident storeys and groups.');
    const retained=new Map(placeholders.map(row=>[row.group,row]));
    for(const row of list){
      const prior=retained.get(row?.group);
      if(!index(row?.storey)||rows.some(real=>real.storey===row.storey)||!row.group?.isGroup||row.group.userData.placeholder!==true||row.group.userData.floorIndex!==row.storey||typeof row.group.userData.dispose!=='function'||(prior?prior.storey!==row.storey||row.group.parent!==group:row.group.parent||consumedPlaceholders.has(row.group)))throw new TypeError('Placeholders require fresh detached stand-ins for non-resident storeys.');
    }
    const ordered=[...list].sort((a,b)=>a.storey-b.storey);
    if(ordered.length===placeholders.length&&ordered.every((row,i)=>row.storey===placeholders[i].storey&&row.group===placeholders[i].group))return false;
    const keep=new Set(ordered.map(row=>row.group)),retired=placeholders.filter(row=>!keep.has(row.group));
    placeholders=ordered.map(({storey,group:stand})=>{
      const prior=retained.get(stand);if(prior)return prior;
      consumedPlaceholders.add(stand);rememberShadowFlags(stand);stand.visible=true;group.add(stand);return {storey,group:stand,lifted:false,placeholder:true};
    });
    layout();for(const row of retired)row.group.userData.dispose();return true;
  }
  /** Continuous focus in storey units, e.g. 1.4 while riding from 2F to 1F. */
  function setFocusStorey(value){
    if(disposed)return {moved:false,shadowChanged:false};
    if(!Number.isFinite(value))throw new TypeError('The lid focus must be a finite storey value.');
    focusStorey=Math.max(storeys[0],Math.min(storeys[storeys.length-1],value));return layout();
  }
  setAnchorStorey(anchorStorey);
  function setWindow({anchorStorey:nextAnchor,storeys:nextStoreys,snapshots:incoming=[]}={}){
    if(disposed)return false;
    if(!Array.isArray(nextStoreys)||nextStoreys.length<2||nextStoreys.length>3||new Set(nextStoreys).size!==nextStoreys.length)throw new TypeError('A floor stack window requires two or three distinct real storeys.');
    const ordered=[...nextStoreys].sort((a,b)=>a-b);
    if(!ordered.every((storey,i)=>index(storey)&&(!i||storey>ordered[i-1]))||!index(nextAnchor)||!ordered.includes(nextAnchor))throw new TypeError('A floor stack window requires distinct real storeys including its anchor.');
    if(!Array.isArray(incoming)||incoming.length>3||new Set(incoming.map(row=>row?.storey)).size!==incoming.length||new Set(incoming.map(row=>row?.group)).size!==incoming.length)throw new TypeError('A floor stack window accepts unique fresh replacement captures only.');
    const nextSet=new Set(ordered),existing=new Map(rows.map(row=>[row.storey,row])),replacements=new Map();
    for(const row of incoming){
      if(!nextSet.has(row?.storey))throw new TypeError('A replacement capture must belong to the requested floor window.');
      if(!row.group?.isGroup||row.group.parent||consumedSnapshots.has(row.group)||row.group.userData.floorIndex!==row.storey||!row.group.userData.captureStats||typeof row.group.userData.dispose!=='function')throw new TypeError('A floor stack window accepts fresh detached captureHomeFloor outputs only.');
      replacements.set(row.storey,{storey:row.storey,group:row.group,lifted:false});
    }
    for(const storey of ordered)if(!existing.has(storey)&&!replacements.has(storey))throw new TypeError('Every new resident storey requires a fresh capture.');
    // No groups, ownership flags, positions or resources change until every
    // requested storey and incoming capture has passed validation.
    const retired=rows.filter(row=>!nextSet.has(row.storey)||replacements.has(row.storey));
    const changed=anchorStorey!==nextAnchor||storeys.length!==ordered.length||storeys.some((storey,i)=>storey!==ordered[i])||incoming.length>0;
    for(const row of replacements.values()){consumedSnapshots.add(row.group);rememberShadowFlags(row.group);row.lifted=false;row.group.visible=true;group.add(row.group);}
    const replacedStandIns=placeholders.filter(row=>nextSet.has(row.storey));placeholders=placeholders.filter(row=>!nextSet.has(row.storey));
    rows=ordered.map(storey=>replacements.get(storey)??existing.get(storey));storeys=ordered;
    setAnchorStorey(nextAnchor);for(const row of [...retired,...replacedStandIns])row.group.userData.dispose();return changed;
  }
  function getState(){return {disposed,anchorStorey,focusStorey,residentCount:rows.length,visible:group.visible,groupUUID:group.uuid,floors:rows.map(row=>({storey:row.storey,weight:1,visible:row.group.visible,y:row.group.position.y,lift:lidLiftOffset(row.storey,focusStorey),lifted:row.lifted,groupUUID:row.group.uuid,captureStats:{...row.group.userData.captureStats}})),placeholders:placeholders.map(row=>({storey:row.storey,y:row.group.position.y,lift:lidLiftOffset(row.storey,focusStorey),lifted:row.lifted,visible:row.group.visible,groupUUID:row.group.uuid}))};}
  function dispose(){if(disposed)return false;disposed=true;for(const row of [...rows,...placeholders])row.group.userData.dispose();placeholders=[];group.clear();group.removeFromParent();return true;}
  const stack={group,setAnchorStorey,setFocusStorey,setPlaceholders,setWindow,getState,dispose};ownedStacks.set(stack,()=>disposed);return stack;
}

/** Track a journey through a resident stack without owning or fading it.
 *
 * A borrowed stack and shaft remain under their scene's ownership after
 * arrival or cancellation. Standalone snapshots still transfer ownership to
 * this journey for callers without a persistent cache. The actor remains in
 * its source-floor coordinates throughout travel.
 */
export function createHomeElevatorTransit({fromStorey,targetStorey,stack=null,snapshots,shaft=null,placeholders=[]}={}){
  if(!index(fromStorey)||!index(targetStorey)||targetStorey===fromStorey)throw new TypeError('Elevator transit requires different real storeys.');
  if(!Array.isArray(placeholders))throw new TypeError('An elevator journey accepts a placeholder array.');
  if(stack&&snapshots!==undefined)throw new TypeError('An elevator journey accepts either a borrowed stack or fresh snapshots.');
  if(shaft&&(!shaft.isObject3D||typeof shaft.userData.setElevatorFrame!=='function'))throw new TypeError('Elevator transit requires a real borrowed elevator model.');
  const borrowed=stack!==null;
  if(borrowed&&(!ownedStacks.has(stack)||ownedStacks.get(stack)()))throw new TypeError('Elevator transit requires a live real floor stack.');
  if(!borrowed&&(!Array.isArray(snapshots)||![fromStorey,targetStorey].every(storey=>snapshots.some(row=>row?.storey===storey))))throw new TypeError('Elevator transit requires fresh source and target snapshots.');
  if(!borrowed)stack=createHomeFloorStack({anchorStorey:fromStorey,snapshots});
  const initial=stack.getState();
  if(initial.anchorStorey!==fromStorey||![fromStorey,targetStorey].every(storey=>initial.floors.some(row=>row.storey===storey))){
    if(!borrowed)stack.dispose();throw new TypeError('The resident stack must include both journey floors and be anchored at departure.');
  }
  const group=stack.group;let disposed=false,progress=0,lastFrame=null;
  try{if(placeholders.length)stack.setPlaceholders(placeholders);}
  catch(error){if(!borrowed)stack.dispose();throw error;}

  function update(frame){
    // A controller emits reset immediately before changing the active floor.
    // Keep rendering the same stack through the synchronous world rebase.
    if(disposed||ownedStacks.get(stack)()||!frame||frame.reset)return {changed:false,shadowChanged:false,progress};
    let lid={moved:false,shadowChanged:false};
    if(Number.isFinite(frame.cabinY)){
      progress=clamp((frame.cabinY-FLOOR_Y)/((targetStorey-fromStorey)*STOREY_HEIGHT));
      // The actor stays in source-floor coordinates, so cabin height maps directly to a continuous focus storey.
      lid=stack.setFocusStorey(fromStorey+(targetStorey-fromStorey)*progress);
    }
    lastFrame=copyFrame(frame);
    let shaftChanged=false;
    if(shaft){const before=shaftPose(shaft),updated=shaft.userData.setElevatorFrame(copyFrame(frame)),after=shaftPose(shaft);shaftChanged=before!==null||after!==null?before!==after:updated===true;}
    const lidChanged=lid.moved||lid.shadowChanged;
    return {changed:shaftChanged||lidChanged,shadowChanged:shaftChanged||lidChanged,lidChanged,progress};
  }
  function dispose(){
    if(disposed)return false;disposed=true;if(!borrowed)stack.dispose();else if(!ownedStacks.get(stack)())stack.setPlaceholders([]);return true;
  }
  function getState(){const resident=stack.getState(),row=storey=>resident.floors.find(floor=>floor.storey===storey);return {disposed,progress,fromStorey,targetStorey,lastFrame:copyFrame(lastFrame),source:row(fromStorey),target:row(targetStorey),residentCount:resident.residentCount,anchorStorey:resident.anchorStorey,floors:resident.floors,borrowedStack:borrowed};}
  return {group,update,dispose,getState};
}
