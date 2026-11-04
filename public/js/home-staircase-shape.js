/** Data-only staircase footprint shared by layout, collision and render models. */
/** Shared architectural dimensions. Both floors use the same world footprint. */
export const STOREY_HEIGHT = 3.15;
export const STAIR_WIDTH = 2.2;
export const STAIR_DEPTH = 3.2;
export const FLOOR_Y = .08, HANDRAIL_HEIGHT = .72;
// Keep the reserved footprint stable for existing homes. The walkable straight
// flight runs from +Z to -Z inside it, with a landing at each end.
export const STAIR_FLIGHT_WIDTH = 1.56;
export const STAIR_STEP_COUNT = 16;
export const STAIR_FLIGHT_START = 1.34;
export const STAIR_FLIGHT_END = -1.32;
/** Real clear opening, excluding the elevator frame, floor and cabin ceiling. */
export const ELEVATOR_DOOR_CLEAR_WIDTH = 1.08;
export const ELEVATOR_CABIN_CLEAR_HEIGHT = 1.81;
// Every storey uses the same local +Z front door. These authored door planes
// are distinct from the staircase reservation endpoints.
// The rendering model and temporary visitor contacts share these dimensions.
export const ELEVATOR_LANDING_DOOR_OFFSET = 1.44;
export const ELEVATOR_CABIN_DOOR_OFFSET = 1.29;
export const ELEVATOR_WAITING_CLEARANCE = .35;
/** Fixed starter-cell installation. Extensions never move this axis. The old
 * stair IDs survive because they are payment and inter-storey link identities. */
export const EXTERIOR_ELEVATOR_PLACEMENT='exterior-left-v1';
export const EXTERIOR_ELEVATOR_WALL_X=-2.8;
export function isExteriorElevator(stairs){return stairs?.type==='elevator'&&stairs?.placement===EXTERIOR_ELEVATOR_PLACEMENT;}
export function getExteriorElevatorPose(){return {x:-3.7,z:1.25,rotation:90,placement:EXTERIOR_ELEVATOR_PLACEMENT};}
export function getElevatorDimensions(stairs){return isExteriorElevator(stairs)
  ? {width:1.7,depth:1.8,landingDoorOffset:.9,cabinDoorOffset:.74,waitingClearance:.7}
  : {width:STAIR_WIDTH,depth:STAIR_DEPTH,landingDoorOffset:ELEVATOR_LANDING_DOOR_OFFSET,cabinDoorOffset:ELEVATOR_CABIN_DOOR_OFFSET,waitingClearance:ELEVATOR_WAITING_CLEARANCE};}
/** Furniture reservation: 1.25 m inside × 1.40 m along wall, comfortably
 * exceeding the robot's .72 × .49 m box, including a .34 m side margin. */
export function getExteriorElevatorDoorBounds(stairs){
  if(!isExteriorElevator(stairs))return null;
  return {minX:-2.8,maxX:-1.55,minZ:.55,maxZ:1.95,minY:FLOOR_Y+.01,maxY:FLOOR_Y+2.2};
}
export function getExteriorElevatorShaftBounds(stairs){
  if(!isExteriorElevator(stairs))return null;
  return {minX:-4.6,maxX:-2.8,minZ:.4,maxZ:2.1,width:1.8,depth:1.7};
}
export function isStaircaseValid(stairs) {
  return !!stairs && typeof stairs === 'object' && !Array.isArray(stairs)
    && Object.keys(stairs).every(key => ['id','x','z','rotation','direction','type','placement'].includes(key))
    && (stairs.type === undefined || stairs.type === 'elevator')
    && (stairs.placement === undefined || stairs.type==='elevator' && stairs.placement===EXTERIOR_ELEVATOR_PLACEMENT && stairs.x===-3.7 && stairs.z===1.25 && stairs.rotation===90)
    && typeof stairs.id === 'string' && /^[a-z\d_.:-]{1,48}$/i.test(stairs.id) && Number.isFinite(stairs.x) && Number.isFinite(stairs.z)
    && [0,90,180,270].includes(stairs.rotation) && ['up','down'].includes(stairs.direction);
}
/** The authored lift uses one vertical footprint. Adjacent links retain their
 * own IDs for receipts and travel while sharing that physical shaft. */
export function areElevatorsAligned(a,b) {
  return isStaircaseValid(a)&&isStaircaseValid(b)&&a.type==='elevator'&&b.type==='elevator'
    &&a.x===b.x&&a.z===b.z&&a.rotation===b.rotation&&a.placement===b.placement;
}
export function isElevatorShaftContinuation(a,b) {
  return areElevatorsAligned(a,b)&&a.id!==b.id&&a.direction!==b.direction;
}
export function getStaircaseVolume(stairs) {
  if (!isStaircaseValid(stairs)) return null;
  if(isExteriorElevator(stairs))return {...getExteriorElevatorDoorBounds(stairs),id:`building:${stairs.id}`,stairId:stairs.id,objectId:'stairs',surfaceId:getStaircaseSurfaceId(stairs),label:"DisplayText4909",roomPart:'stairs',placementOnly:true};
  const turned = stairs.rotation % 180 !== 0;
  const halfX = (turned ? STAIR_DEPTH : STAIR_WIDTH) / 2, halfZ = (turned ? STAIR_WIDTH : STAIR_DEPTH) / 2;
  const base = stairs.direction === 'down' ? -STOREY_HEIGHT : 0;
  return { id: `building:${stairs.id}`, stairId:stairs.id, objectId:'stairs', surfaceId:getStaircaseSurfaceId(stairs), label: stairs.type==='elevator'?"DisplayText3493":stairs.direction==='up'?"DisplayText3494":"DisplayText3495", roomPart:'stairs',
    minX:stairs.x-halfX, maxX:stairs.x+halfX, minZ:stairs.z-halfZ, maxZ:stairs.z+halfZ,
    minY:base+FLOOR_Y-.02, maxY:base+FLOOR_Y+STOREY_HEIGHT+(stairs.type==='elevator'?2.2:HANDRAIL_HEIGHT+.045) };
}

/** Floor-height entry/exit centers; shared by either view of the same stairs. */
export function getStaircaseEntrances(stairs) {
  if (!isStaircaseValid(stairs)) return null;
  if(isExteriorElevator(stairs)){const contacts=getElevatorStationContacts(stairs);return {lower:{...contacts.lower.waitingPosition},upper:{...contacts.upper.waitingPosition}};}
  const angle = stairs.rotation * Math.PI / 180;
  const base = stairs.direction === 'down' ? -STOREY_HEIGHT : 0;
  const point = (z, y) => ({x: stairs.x + Math.sin(angle) * z, y: base + y, z: stairs.z + Math.cos(angle) * z});
  return {lower:point(STAIR_DEPTH / 2, FLOOR_Y),upper:point((stairs.type==='elevator'?1:-1)*STAIR_DEPTH / 2, FLOOR_Y + STOREY_HEIGHT)};
}

/** Actual door/cabin contact frames, in the supplied stair record's floor
 * coordinates. A down-facing record retains its existing -STOREY_HEIGHT base;
 * callers rendering the whole building add their source storey's world Y. */
export function getElevatorStationContacts(stairs) {
  if(!isStaircaseValid(stairs)||stairs.type!=='elevator')return null;
  const angle=stairs.rotation*Math.PI/180,sin=Math.sin(angle),cos=Math.cos(angle),base=stairs.direction==='down'?-STOREY_HEIGHT:0;
  const at=(z,y)=>({x:stairs.x+sin*z,y:base+y,z:stairs.z+cos*z});
  const dimensions=getElevatorDimensions(stairs);
  const station=(sign,y)=>({
    position:at(sign*dimensions.landingDoorOffset,y),
    doorPosition:at(sign*dimensions.landingDoorOffset,y),
    normal:{x:sin*sign,y:0,z:cos*sign},
    waitingPosition:at(sign*(dimensions.depth/2+dimensions.waitingClearance),y),
    cabinDoorPosition:at(sign*dimensions.cabinDoorOffset,y),
    cabinCentre:at(0,y),
    clearWidth:ELEVATOR_DOOR_CLEAR_WIDTH,clearHeight:ELEVATOR_CABIN_CLEAR_HEIGHT,
  });
  return {lower:station(1,FLOOR_Y),upper:station(1,FLOOR_Y+STOREY_HEIGHT)};
}

/** Legacy saves keep their single record until a second connection is installed. */
export function getHomeStairs(home) {
  if(Array.isArray(home?.staircases))return home.staircases;
  return home?.stairs ? (Array.isArray(home.stairs)?home.stairs:[home.stairs]) : [];
}
export function getStaircaseSurfaceId(stairs) { return stairs?.id==='main-stairs'?'stairs.main':`stairs:${stairs?.id}`; }
export function areHomeStairsValid(home) {
  if(home?.stairs!==undefined&&home?.staircases!==undefined)return false;
  if(home?.stairs!==undefined&&!isStaircaseValid(home.stairs))return false;
  if(home?.staircases!==undefined&&(!Array.isArray(home.staircases)||home.staircases.length>2))return false;
  const rows=getHomeStairs(home),ids=new Set(),directions=new Set();
  for(const row of rows){if(!isStaircaseValid(row)||ids.has(row.id)||directions.has(row.direction))return false;ids.add(row.id);directions.add(row.direction);}
  return true;
}
