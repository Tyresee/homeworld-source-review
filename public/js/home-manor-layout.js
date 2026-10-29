import { CELL, getFloorBoundarySegments, getRoomKind, roomOuterFaces, roomRect } from './home-layout.js';

/** Shared exterior layout in the saved floor's coordinates; no renderer or storage. */
export const MANOR_FACADE_OFFSET = .03;
const NORMALS = { back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0] };
const sidePriority = side => side === 'front' ? 0 : side === 'right' ? 1 : 2;

export function getManorFacadeLayout(home) {
  if (home?.slab) {
    // Split only real perimeter segments. Courtyard voids remain unbuilt.
    const faces = getFloorBoundarySegments(home).flatMap(face => {
      const length = face.to - face.from;
      const target = face.side === 'front' || face.side === 'back' ? CELL.width : CELL.depth;
      const count = Math.max(1, Math.round(length / target));
      return Array.from({ length: count }, (_, index) => ({ room: null, face: {
        ...face, from: face.from + length * index / count, to: face.from + length * (index + 1) / count,
      } }));
    });
    const entrance = faces.filter(({ face }) => face.to - face.from >= 1.4).sort((a, b) =>
      sidePriority(a.face.side) - sidePriority(b.face.side) || (b.face.to - b.face.from) - (a.face.to - a.face.from))[0] ?? null;
    return { faces, entrance };
  }
  const rooms = home?.rooms ?? [];
  const faces = rooms.flatMap(room => roomOuterFaces(rooms, room).map(face => ({ room, face })));
  const prefer = predicate => faces.find(predicate);
  const entrance = prefer(({ room, face }) => (getRoomKind(room.kind)?.baseKind ?? room.kind) === 'hallway' && face.side === 'front')
    ?? prefer(({ room, face }) => (getRoomKind(room.kind)?.baseKind ?? room.kind) === 'hallway' && face.side === 'right')
    ?? prefer(({ room, face }) => room.kind === 'living' && face.side === 'front')
    ?? prefer(({ face }) => face.side === 'front')
    ?? prefer(({ face }) => face.side === 'right') ?? null;
  return { faces, entrance };
}

export function getManorDoorWidth(structure = 1) { return structure === 3 ? 1.8 : structure === 2 ? 1.40 : 1.16; }

/** Local coordinates on a facade; +z points out from the wall. */
export function getManorEntranceSteps(structure = 1) {
  const width = getManorDoorWidth(structure);
  return Array.from({ length: 3 }, (_, index) => ({
    width: width + 1.1 - index * .15, height: .12, depth: .36,
    x: 0, y: -.26 + index * .09, z: 1.01 - index * .3,
  }));
}

/** Exact step footprints, without enlarging unrelated walls or courtyard gaps. */
export function getManorEntranceStepBounds(home, { structure = 1 } = {}) {
  const entrance = getManorFacadeLayout(home).entrance;
  if (!entrance) return [];
  const { face, room } = entrance, [nx, nz] = NORMALS[face.side];
  const rect = room ? roomRect(room) : null;
  const at = face.at ?? (face.side === 'back' ? rect.minZ : face.side === 'front' ? rect.maxZ : face.side === 'left' ? rect.minX : rect.maxX);
  const mid = (face.from + face.to) / 2;
  const wallX = nx === 0 ? mid : at, wallZ = nz === 0 ? mid : at;
  return getManorEntranceSteps(structure).map(step => {
    const width = nx === 0 ? step.width : step.depth, depth = nz === 0 ? step.width : step.depth;
    const x = wallX + nx * (MANOR_FACADE_OFFSET + step.z), z = wallZ + nz * (MANOR_FACADE_OFFSET + step.z);
    return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, width, depth, x, z };
  });
}
