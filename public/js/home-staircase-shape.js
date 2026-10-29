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
export function isStaircaseValid(stairs) {
  return !!stairs && typeof stairs === 'object' && !Array.isArray(stairs)
    && Object.keys(stairs).every(key => ['id','x','z','rotation','direction','type'].includes(key))
    && (stairs.type === undefined || stairs.type === 'elevator')
    && typeof stairs.id === 'string' && /^[a-z\d_.:-]{1,48}$/i.test(stairs.id) && Number.isFinite(stairs.x) && Number.isFinite(stairs.z)
    && [0,90,180,270].includes(stairs.rotation) && ['up','down'].includes(stairs.direction);
}
export function getStaircaseVolume(stairs) {
  if (!isStaircaseValid(stairs)) return null;
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
  const angle = stairs.rotation * Math.PI / 180;
  const base = stairs.direction === 'down' ? -STOREY_HEIGHT : 0;
  const point = (z, y) => ({x: stairs.x + Math.sin(angle) * z, y: base + y, z: stairs.z + Math.cos(angle) * z});
  return {lower:point(STAIR_DEPTH / 2, FLOOR_Y),upper:point(-STAIR_DEPTH / 2, FLOOR_Y + STOREY_HEIGHT)};
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
