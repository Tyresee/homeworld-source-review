/** Resolve a quick-placement choice against the surface captured when its
 * context menu opened. No camera, pointer, preview or persistent state changes. */
import { getFurniturePlacement, getFurniturePose, getFurnitureMountBounds, getWallMountTargets, getFurnitureTableSupport, getFurnitureTableUV } from './home-item-placement.js';
import { getLuxuryCollisionBounds } from './home-building-collision.js';
import { findContainingRoom, floorContainsFootprint } from './home-layout.js';

const E = 1e-7;
const fail = error => ({ ok: false, error });
const finitePoint = point => point && ['x','y','z'].every(key => Number.isFinite(point[key]));
const isFloor = id => id === 'floor.main' || /^room:.+\.floor$/.test(id ?? '');
const fitsMount = (bounds, mount) => bounds && mount.u >= bounds.minU - E && mount.u <= bounds.maxU + E
  && mount.v >= bounds.minV - E && mount.v <= bounds.maxV + E;

/** Keep only plain, frozen values: menu actions must never follow a subsequently
 * moved pointer, changed camera, or live Three.js intersection vector. */
export function freezePlacementAnchor(anchor) {
  const point = value => value ? Object.freeze({ x: value.x, y: value.y, z: value.z }) : null;
  const hit = anchor.hit ? Object.freeze({ ...anchor.hit, point: point(anchor.hit.point), normal: point(anchor.hit.normal) }) : null;
  return Object.freeze({ view: anchor.view, hit, floorPoint: point(anchor.floorPoint),
    tableUV: anchor.tableUV ? Object.freeze({ u: anchor.tableUV.u, v: anchor.tableUV.v }) : null });
}

export function getFurniturePlacementAtAnchor(state, item, anchor) {
  if (!anchor) return fail("DisplayText0719, DisplayText0720.");
  if (anchor.view !== 'interior') return fail("DisplayText0721, DisplayText0722.");
  const hit = anchor.hit;
  if (!hit || !finitePoint(hit.point) || !finitePoint(hit.normal)) return fail("DisplayText0723, DisplayText0724, DisplayText0725.");
  const type = getFurniturePlacement(item), rotation = item.rotation ?? 0;
  // Rugs are an underlay in the collision engine, not a solid obstacle. Match
  // a purchased rug against the actual home item rather than trusting a name
  // on an arbitrary mesh; every other visible furnishing stays an obstacle.
  const hitFurnitureId = hit.furnitureId ?? (hit.dynamicId?.startsWith('furniture:') ? hit.dynamicId.slice(10) : null);
  const rugSupport = type === 'floor' && !hit.propId && (hit.surfaceId === 'rug.main' && !hitFurnitureId && !hit.dynamicId
    || hitFurnitureId && hit.surfaceId === `furniture:${hitFurnitureId}` && state.furniture.some(row => row.id === hitFurnitureId && row.kind === 'rug'));
  const tableSupport = type === 'table' && !hit.propId && hitFurnitureId
    && hit.surfaceId === `furniture:${hitFurnitureId}` && getFurnitureTableSupport(state,hitFurnitureId,item.id);
  if ((hit.furnitureId || hit.dynamicId || hit.propId) && !rugSupport && !tableSupport) return fail("DisplayText0726, DisplayText0727.");
  if (type === 'floor') {
    if ((!isFloor(hit.surfaceId) && !rugSupport) || hit.normal.y < .85) return fail("DisplayText0728, DisplayText0729.");
    const { x, z } = hit.point, b = getLuxuryCollisionBounds(item), a = rotation * Math.PI / 180;
    const corners = [b.minX,b.maxX].flatMap(px => [b.minZ,b.maxZ].map(pz => ({
      x: px * Math.cos(a) + pz * Math.sin(a), z: -px * Math.sin(a) + pz * Math.cos(a),
    })));
    const minX = Math.min(...corners.map(p=>p.x)), maxX = Math.max(...corners.map(p=>p.x));
    const minZ = Math.min(...corners.map(p=>p.z)), maxZ = Math.max(...corners.map(p=>p.z));
    const footprint={ x:x+(minX+maxX)/2,z:z+(minZ+maxZ)/2,halfX:(maxX-minX)/2,halfZ:(maxZ-minZ)/2 };
    if (!(state.slab ? floorContainsFootprint(state,footprint) : findContainingRoom(state.rooms,footprint))) return fail("DisplayText0730, DisplayText0731.");
    return { ok: true, pose: { x, z, rotation } };
  }
  if (type === 'table') {
    if ((!tableSupport && hit.surfaceId !== 'table.top') || hit.normal.y < .85 || !anchor.tableUV)
      return fail("DisplayText0732, DisplayText0733.");
    if(tableSupport) {
      const pointUV=getFurnitureTableUV(state,hit.point,hitFurnitureId);
      if(Math.abs(hit.point.y-tableSupport.y)>.045 || !pointUV
        || pointUV.u<0 || pointUV.u>1 || pointUV.v<0 || pointUV.v>1)
        return fail("DisplayText0734, DisplayText0735, DisplayText0736.");
    }
    const mount = { type, ...(tableSupport ? {parentId:hitFurnitureId} : {}), u: anchor.tableUV.u, v: anchor.tableUV.v };
    if (!fitsMount(getFurnitureMountBounds(state, { ...item, mount }), mount)) return fail("DisplayText0737, DisplayText0738.");
    const pose = getFurniturePose(state, { ...item, mount });
    return { ok: true, pose: { x: pose.x, z: pose.z, rotation, mount } };
  }
  if (hit.surfaceId === 'window.frame' || hit.roomPart === 'windows' && hit.meshName !== 'sunroom-glazing')
    return fail("DisplayText0739, DisplayText0740.");
  if (hit.roomPart === 'columns') return fail("DisplayText0741, DisplayText0740.");
  const targets = getWallMountTargets(state).filter(target => target.surfaceId === hit.surfaceId
    && (target.axis === 'x' ? hit.normal.z : hit.normal.x) >= .85
    && Math.abs((target.axis === 'x' ? hit.point.z : hit.point.x) - target.face) <= .65);
  const b = getLuxuryCollisionBounds(item), height = b.maxY - b.minY;
  for (const target of targets) {
    const along = target.axis === 'x' ? hit.point.x : hit.point.z;
    if (along < target.from - E || along > target.to + E) continue;
    const mount = { type, wallId: target.wallId, u: (along - target.from) / (target.to-target.from),
      v: (hit.point.y - height/2 - target.minY) / (target.maxY-target.minY) };
    if (!fitsMount(getFurnitureMountBounds(state, { ...item, rotation: 0, mount }), mount))
      return fail("DisplayText0742, DisplayText0743.");
    const pose = getFurniturePose(state, { ...item, rotation: 0, mount });
    return { ok: true, pose: { x: pose.x, z: pose.z, rotation: 0, mount } };
  }
  return fail("DisplayText0744, DisplayText0745, DisplayText0746.");
}
