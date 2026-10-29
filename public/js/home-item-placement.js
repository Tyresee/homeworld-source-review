/** World poses and mount envelopes shared by the renderer, editor and transactions. */
import { hasStarterRoom, getFloorBoundarySegments, roomRect, roomEdges, getRoomKind, LAYOUT_GRID } from './home-layout.js';
import { getHomeBuildingVolumes, getLuxuryCollisionBounds } from './home-building-collision.js';
import { EXTRA_SHOP_ITEMS } from './home-shop-catalog.js';
const placementByKind = new Map(EXTRA_SHOP_ITEMS.map(item => [item.id, item.placement]));
const definitionByKind = new Map(EXTRA_SHOP_ITEMS.map(item => [item.id, item]));
export const getFurniturePlacement = item => placementByKind.get(typeof item === 'string' ? item : item.kind) ?? 'floor';
export const getFurniturePlacementType = getFurniturePlacement;
const E = 1e-7;
const rotate = (x, z, angle) => ({ x: x * Math.cos(angle) + z * Math.sin(angle), z: -x * Math.sin(angle) + z * Math.cos(angle) });
/** A tabletop belongs either to the original editable table or to one actual
 * purchased floor furnishing. Its net clear rectangle can be offset from the
 * model centre (for example, in front of a desk's built-in rear shelf). */
export function getFurnitureTableSupport(state, parentId = undefined, childId = undefined) {
  if (parentId === undefined) {
    if (['upper','account'].includes(state.profile)) return null;
    const table = state.table;
    if (!table || ![table.x, table.z, table.rotation].every(Number.isFinite)) return null;
    return { x:table.x, z:table.z, y:1.192, rotation:table.rotation, width:2.25, depth:1.35 };
  }
  if (typeof parentId !== 'string' || !parentId || parentId === childId) return null;
  const parent = state.furniture?.find(row => row.id === parentId);
  if (!parent || parent.mount !== undefined || getFurniturePlacement(parent) !== 'floor'
    || ![parent.x, parent.z, parent.rotation ?? 0].every(Number.isFinite)) return null;
  const surface = definitionByKind.get(parent.kind)?.supportSurface;
  if (!surface || ![surface.width, surface.depth, surface.height].every(value => Number.isFinite(value) && value > 0)) return null;
  const offsetX = surface.offsetX ?? 0, offsetZ = surface.offsetZ ?? 0;
  if (![offsetX, offsetZ].every(Number.isFinite)) return null;
  const offset = rotate(offsetX, offsetZ, (parent.rotation ?? 0) * Math.PI / 180);
  return { parentId, x:parent.x+offset.x, z:parent.z+offset.z, y:.08+surface.height,
    rotation:parent.rotation ?? 0, width:surface.width, depth:surface.depth };
}
/** Project an actual world hit into one supporting top's normalized frame. */
export function getFurnitureTableUV(state, point, parentId = undefined) {
  const support = getFurnitureTableSupport(state, parentId);
  if (!support || !point || ![point.x, point.z].every(Number.isFinite)) return null;
  const p = rotate(point.x-support.x, point.z-support.z, -support.rotation * Math.PI / 180);
  return { u:p.x/support.width+.5, v:.5-p.z/support.depth };
}
function rotatedBounds(item, rotation = item.rotation ?? 0) {
  const b = getLuxuryCollisionBounds(item), a = rotation * Math.PI / 180;
  const corners = [b.minX,b.maxX].flatMap(x => [b.minZ,b.maxZ].map(z => rotate(x,z,a)));
  return { ...b, minX: Math.min(...corners.map(p=>p.x)), maxX: Math.max(...corners.map(p=>p.x)), minZ: Math.min(...corners.map(p=>p.z)), maxZ: Math.max(...corners.map(p=>p.z)) };
}
/** Only actual full-height wall segments are mounting surfaces. A cutaway
 * partition, door gap or empty room perimeter is deliberately not a target. */
export function getWallMountTargets(state) {
  const targets = hasStarterRoom(state) ? [
    { wallId:'wall.inner', surfaceId:'wall.inner', roomId:'living', label:"DisplayText1178", axis:'x', from:-2.65, to:2.65, face:-2.504, minY:.32, maxY:2.78, rotation:0 },
    { wallId:'wall.side', surfaceId:'wall.side', roomId:'living', label:"DisplayText1179", axis:'z', from:-2.45, to:2.45, face:-2.70, minY:.32, maxY:2.78, rotation:90 },
  ] : [];
  if(state.slab) {
    const legacy=hasStarterRoom(state);
    for(const seg of getFloorBoundarySegments(state).filter(s=>s.side==='back'||s.side==='left')) {
      const back=seg.side==='back',owners=legacy?(state.rooms??[]).filter(room=>{const r=roomRect(room);return Math.abs((back?r.minZ:r.minX)-seg.at)<1e-7;}):[];
      const cuts=[seg.from,seg.to,...owners.flatMap(room=>{const r=roomRect(room);return back?[r.minX,r.maxX]:[r.minZ,r.maxZ];})].filter(v=>v>=seg.from-1e-7&&v<=seg.to+1e-7).sort((a,b)=>a-b);
      for(let i=1;i<cuts.length;i++) {
        const from=Number(cuts[i-1].toFixed(8)),to=Number(cuts[i].toFixed(8)),mid=(from+to)/2;
        if(to-from<=.32)continue;
        const owner=owners.find(room=>{const r=roomRect(room);return mid>(back?r.minX:r.minZ)&&mid<(back?r.maxX:r.maxZ);});
        if(owner?.id==='living')continue;
        targets.push({wallId:owner?`room:${owner.id}:${seg.side}:${from}:${to}`:`slab:${seg.side}:${seg.at}:${from}:${to}`,
          surfaceId:owner?`room:${owner.id}.wall`:back?'wall.inner':'wall.side',roomId:owner?.id??null,
          label:owner?`${getRoomKind(owner.kind).label}${back?"DisplayText1180":"DisplayText0484"}`:back?"DisplayText1181":"DisplayText1182",
          axis:back?'x':'z',from:from+.16,to:to-.16,face:seg.at+.08,minY:.32,maxY:2.76,rotation:back?0:90});
      }
    }
    return targets;
  }
  for (const room of state.rooms ?? []) {
    if (room.id === 'living') continue;
    const r = roomRect(room), edges = roomEdges(state.rooms,room);
    for (const side of ['back','left']) {
      if (side === 'back' ? Math.abs(r.minZ-LAYOUT_GRID.minCz*2.6)>1e-8 : Math.abs(r.minX-LAYOUT_GRID.minCx*2.8)>1e-8) continue;
      for (const seg of edges[side]) {
        if (seg.shared) continue;
        targets.push({ wallId:`room:${room.id}:${side}:${seg.from}:${seg.to}`, surfaceId:`room:${room.id}.wall`, roomId:room.id,
          label:`${getRoomKind(room.kind).label}${side==='back'?"DisplayText1180":"DisplayText0484"}`, axis:side==='back'?'x':'z', from:seg.from+.16, to:seg.to-.16,
          face:(side==='back'?r.minZ:r.minX)+.08, minY:.32,maxY:2.76,rotation:side==='back'?0:90 });
      }
    }
  }
  return targets;
}
/** u/v anchor bounds. y is a bottom anchor, not an object's midpoint. */
export function getFurnitureMountBounds(state,item) {
  const mount = item.mount, placement = getFurniturePlacement(item);
  if (!mount || mount.type !== placement) return null;
  if (placement !== 'table' && Object.hasOwn(mount,'parentId')) return null;
  const b = rotatedBounds(item, placement === 'wall' ? 0 : item.rotation ?? 0);
  if (placement === 'table') {
    const support = getFurnitureTableSupport(state,mount.parentId,item.id);
    if (!support) return null;
    const { width, depth } = support;
    const bounds = { minU:(-width/2+.015-b.minX)/width+.5, maxU:(width/2-.015-b.maxX)/width+.5,
      minV:.5-(depth/2-.015-b.maxZ)/depth,maxV:.5-(-depth/2+.015-b.minZ)/depth };
    return bounds.minU <= bounds.maxU+E && bounds.minV <= bounds.maxV+E ? bounds : null;
  }
  const target = getWallMountTargets(state).find(w=>w.wallId===mount.wallId); if(!target) return null;
  const length=target.to-target.from,height=target.maxY-target.minY;
  const bounds={minU:(target.axis==='x'?-b.minX:b.maxX)/length,maxU:1-(target.axis==='x'?b.maxX:-b.minX)/length,minV:0,maxV:1-(b.maxY-b.minY)/height,target};
  return bounds.minU<=bounds.maxU+E && bounds.minV<=bounds.maxV+E ? bounds : null;
}
export function isFurnitureMountValid(state,item) {
  const type=getFurniturePlacement(item);
  if(type==='floor') return item.mount === undefined;
  const b=getFurnitureMountBounds(state,item), m=item.mount;
  return !!b && Number.isFinite(m.u) && Number.isFinite(m.v) && m.u>=b.minU-E && m.u<=b.maxU+E && m.v>=b.minV-E && m.v<=b.maxV+E
    && (type!=='wall' || (item.rotation??0)===0);
}
export function getFurniturePose(state,item) {
  const m=item.mount, type=getFurniturePlacement(item);
  if (!m || m.type!==type || type==='floor') return {x:item.x??0,y:item.kind==='chandelier'?1.65:item.kind==='rug'?.096:.08,z:item.z??0,rotation:item.rotation??0};
  const b=getLuxuryCollisionBounds(item);
  if(type==='table') {
    const support=getFurnitureTableSupport(state,m.parentId,item.id);
    if(!support) return {x:item.x??0,y:.08,z:item.z??0,rotation:item.rotation??0};
    const p=rotate((m.u-.5)*support.width,(.5-m.v)*support.depth,support.rotation*Math.PI/180);
    return {x:support.x+p.x,y:support.y-b.minY,z:support.z+p.z,rotation:support.rotation+(item.rotation??0)};
  }
  const target=getWallMountTargets(state).find(w=>w.wallId===m.wallId);
  if(!target) return {x:item.x??0,y:.08,z:item.z??0,rotation:0};
  const along=target.from+m.u*(target.to-target.from), bottom=target.minY+m.v*(target.maxY-target.minY);
  let face=target.face;
  // Skins vary per actual component and height. A sunroom's glass skin is
  // mounted in front of its slab too; start outside that visible surface.
  // Window frames/sills stay obstacles and never become a supporting plane.
  const objectId=m.wallId==='wall.inner'?'wall':m.wallId==='wall.side'?'sidewall':null;
  const alongMin=along+(target.axis==='x'?b.minX:-b.maxX),alongMax=along+(target.axis==='x'?b.maxX:-b.minX);
  for(const wall of getHomeBuildingVolumes(state)) {
    const normalMin=target.axis==='x'?wall.minZ:wall.minX,normalMax=target.axis==='x'?wall.maxZ:wall.maxX;
    const expandedSkin=!objectId && wall.surfaceId===target.surfaceId
      && (wall.roomPart==='walls' || wall.meshName==='sunroom-glazing')
      // Exclude perpendicular partitions belonging to this same room.
      && normalMax-normalMin<=.35 && normalMin<=target.face+.1 && normalMax>=target.face-.1;
    if(!(objectId ? wall.objectId===objectId : expandedSkin) || wall.minY>=bottom+b.maxY-b.minY || wall.maxY<=bottom) continue;
    const left=target.axis==='x'?wall.minX:wall.minZ,right=target.axis==='x'?wall.maxX:wall.maxZ;
    if(left<alongMax && right>alongMin) face=Math.max(face,normalMax);
  }
  face+=.008-b.minZ;
  return {x:target.axis==='x'?along:face,y:bottom-b.minY,z:target.axis==='x'?face:along,rotation:target.rotation};
}
