import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ROOM_KINDS, getRoomKind, roomRect, roomEdges, layoutBounds, resolveRooms, LAYOUT_PRESETS, LAYOUT_GRID, CELL, getFloorRects, getFloorBounds, getFloorBoundarySegments, hasStarterRoom } from './home-layout.js';
import { getHomeTheme, getRoomTheme } from './home-theme.js';
import {resolveHomeFloorFinish} from './home-floor-finishes.js';
import {getDefaultFloorAppearance} from './home-engine.js';
import {createHomeFloorTextureManager} from './home-floor-textures.js';
import { splitFloorAroundOpening, clipFloorMeshToOpening, getHomeStairs } from './home-staircase.js';

export { ROOM_KINDS, getRoomKind, roomRect, layoutBounds };
export const WALL_HEIGHT = 2.85;
export const PARTITION_HEIGHT = .98;

/** Legacy preset ids remain available as one-click layouts. */
export const ROOM_TIERS = Object.freeze(LAYOUT_PRESETS.map((item, index) => {
  const bounds = layoutBounds(item.rooms);
  return Object.freeze({ id: item.id, level: index + 1, label: item.label, shortLabel: item.shortLabel, description: item.description,
    width: bounds.width, depth: bounds.depth, height: WALL_HEIGHT, rooms: item.rooms, bounds: Object.freeze({ ...bounds }),
    zones: Object.freeze(item.rooms.map(room => Object.freeze({ id: room.id, kind: room.kind, label: getRoomKind(room.kind).label, bounds: Object.freeze(roomRect(room)) }))) });
}));
export const ROOM_TIER_IDS = Object.freeze(ROOM_TIERS.map(t => t.id));
export function getRoomTierDefinition(tier = 'starter') {
  if (tier && typeof tier === 'object' && !Array.isArray(tier)) tier = tier.id ?? tier.level;
  return ROOM_TIERS.find(t => t.id === tier || t.level === tier) || ROOM_TIERS[0];
}
/** Accepts rooms, a preset id or a preset definition. */
export function describeRooms(value) {
  const rooms = Array.isArray(value) ? value : resolveRooms(typeof value === 'object' ? value?.id : value);
  const bounds = layoutBounds(rooms);
  return { rooms, bounds, width: bounds?.width ?? 0, depth: bounds?.depth ?? 0, height: WALL_HEIGHT, count: rooms.length };
}

const PALETTE = Object.freeze({ trim: '#e6c49e', plinth: '#d0bb9b', accent: '#c8dbbd', grid: '#dfc79f', frame: '#f8efdc', glass: '#c5e0db',
  white: '#fbf7ef', mint: '#a6cbb6', sky: '#a7c8e5', sun: '#efcf77', coral: '#eeaaa4' });

/**
 * Interior rooms attached to the hand-built living room. The living room's
 * own shell lives in the scene; this group only draws the added rooms, their
 * partitions, outer walls, windows and floor accents. Furniture and decor
 * belong to the editable item system; this architectural shell never bakes
 * them into a room. Floor and wall skins carry `surfaceId`
 * (`room:<id>.floor` / `room:<id>.wall`) so they can be painted separately.
 */
export function createRoomExpansion({ rooms = 'starter', tier, maps = {}, includeWalls = true, includeGrid = true, stairs = null, staircases, slab = null, profile, theme = getHomeTheme(), surfaces = null, floorTextureManager = null } = {}) {
  stairs = Array.isArray(stairs) ? stairs : getHomeStairs({stairs,staircases});
  const group = new THREE.Group(); group.name = 'room-expansion';
  const geometries = new Set(), materials = new Set();
  const floorTextures=theme.id==='warm'?(floorTextureManager??createHomeFloorTextureManager()):null;
  const ownsFloorTextures=!!floorTextures&&!floorTextureManager;
  // Keep the empty fixtures bucket for callers that inspect older roomParts.
  const parts = { floor: [], walls: [], border: [], zones: [], columns: [], accents: [], windows: [], fixtures: [] };
  let definition, disposed = false, currentRoom = null, boundarySkinRoom = null;
  const shellColor = (key, fallback = PALETTE[key]) => theme.shell[key] ?? fallback;
  // Existing architecture already owns these strips, sills and posts. Theme
  // them in place without adding volume, faces or new collision surfaces.
  const trimColor = (fallback = PALETTE.trim) => {
    const owner = currentRoom ?? boundarySkinRoom;
    return (owner ? getRoomTheme(owner.kind, owner, theme)?.trim : null) ?? shellColor('trim', fallback);
  };
  function material(color, options = {}) {
    const { mapKey, ...rest } = options;
    const m = new THREE.MeshStandardMaterial({ color, roughness: .76, ...rest });
    if (mapKey && maps[mapKey]) m.map = maps[mapKey];
    materials.add(m); return m;
  }
  function add(geometry, color, position, bucket = 'accents', options = {}) {
    geometries.add(geometry); const m = new THREE.Mesh(geometry, material(color, options));
    m.position.set(...position); m.castShadow = true; m.receiveShadow = true;
    m.userData = { roomPart: bucket, roomId: currentRoom?.id ?? null, roomKind: currentRoom?.kind ?? null };
    if (currentRoom) m.userData.surfaceId = `room:${currentRoom.id}.${bucket === 'floor' || bucket === 'zones' ? 'floor' : 'wall'}`;
    parts[bucket].push(m); group.add(m); return m;
  }
  function box(size, position, color, bucket = 'accents', radius = .035, options = {}) {
    return add(new RoundedBoxGeometry(...size, 3, Math.max(.001, Math.min(radius, ...size.map(s => s / 2)))), color, position, bucket, options);
  }
  function clipFloor(mesh) {
    const original=mesh.geometry;
    if(clipFloorMeshToOpening(mesh,stairs)){geometries.delete(original);geometries.add(mesh.geometry);}
  }
  function roundedOpening(x, y, width, height, radius = .22) {
    const p = new THREE.Path(), l = x - width / 2, r = x + width / 2, b = y - height / 2, t = y + height / 2, q = Math.min(radius, width / 2, height / 2);
    p.moveTo(l + q, b); p.lineTo(l, b + q); p.lineTo(l, t - q); p.quadraticCurveTo(l, t, l + q, t); p.lineTo(r - q, t); p.quadraticCurveTo(r, t, r, t - q); p.lineTo(r, b + q); p.quadraticCurveTo(r, b, r - q, b); p.lineTo(l + q, b); return p;
  }
  function wallShape(width, height, holes = []) {
    const s = new THREE.Shape(); s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(width / 2, height); s.lineTo(-width / 2, height); s.closePath();
    for (const hole of holes) s.holes.push(roundedOpening(...hole)); return s;
  }
  /** A solid full-height wall slab with optional window holes, centred on `center`, running along `axis`. */
  function fullWall(length, center, axis, color, holes) {
    const geometry = new THREE.ExtrudeGeometry(wallShape(length, WALL_HEIGHT, holes), { depth: .22, bevelEnabled: false, curveSegments: 12 });
    geometry.translate(0, 0, -.11);
    const m = add(geometry, color, center, 'walls', { roughness: .86 });
    if (axis === 'z') m.rotation.y = Math.PI / 2;
    return m;
  }
  function windowAt(center, axis, width = 1.25, height = 1.35, y = 1.77) {
    const g = new THREE.Group(); g.position.set(...center); if (axis === 'z') g.rotation.y = Math.PI / 2; group.add(g);
    const local = (geometry, color, position, options = {}) => { const m = add(geometry, color, [0, 0, 0], 'windows', options); group.remove(m); g.add(m); m.position.set(...position); return m; };
    const glass = local(new RoundedBoxGeometry(width - .05, height - .05, .03, 3, .17), shellColor('glass'), [0, y, 0], { transparent: true, opacity: .82, roughness: .3 }); glass.castShadow = false;
    for (const [size, pos] of [[[.055, height + .13, .11], [-width / 2, y, .14]], [[.055, height + .13, .11], [width / 2, y, .14]], [[width + .12, .065, .11], [0, y - height / 2, .14]], [[width + .12, .065, .11], [0, y + height / 2, .14]], [[.045, height, .08], [0, y, .15]], [[width, .045, .08], [0, y, .15]]]) local(new RoundedBoxGeometry(...size, 3, .02), shellColor('frame'), pos);
    local(new RoundedBoxGeometry(width + .25, .085, .28, 3, .03), trimColor(), [0, y - height / 2 - .03, .2]);
    // Painted sky and hills behind the glass make the opening read as a window from inside.
    local(new RoundedBoxGeometry(width - .1, height - .1, .02, 3, .1), '#e4f0e0', [0, y, -.04]).castShadow = false;
    local(new THREE.SphereGeometry(1, 12, 8), PALETTE.sun, [width * .22, y + .3, -.03]).scale.set(.16, .16, .01);
    for (const [x, yy, w] of [[-.28, y - .35, .3], [.2, y - .48, .42]]) local(new THREE.SphereGeometry(1, 12, 8), '#a7cba4', [x, yy, -.02]).scale.set(w, .26, .01);
  }
  function lowWall(length, center, axis, color, height = PARTITION_HEIGHT) {
    const size = axis === 'x' ? [length, height, .17] : [.17, height, length];
    const m = box(size, [center[0], height / 2 + .06, center[2]], color, 'walls', .03, { roughness: .86 });
    return m;
  }
  function post(position, height = PARTITION_HEIGHT + .16) {
    box([.16, height, .16], [position[0], height / 2 + .06, position[2]], trimColor(), 'columns', .035);
    box([.24, .08, .24], [position[0], height + .1, position[2]], shellColor('wallCap', PALETTE.accent), 'columns', .03);
  }
  /** Shared edges become a knee wall with a wide doorway so every floor stays visible from the isometric camera. */
  function partition(from, to, fixed, axis, color) {
    const length = to - from, door = Math.min(1.45, length * .5), stub = (length - door) / 2;
    if (stub > .12) for (const [start, end] of [[from, from + stub], [to - stub, to]]) {
      const mid = (start + end) / 2;
      lowWall(end - start, axis === 'x' ? [mid, 0, fixed] : [fixed, 0, mid], axis, color);
    }
    for (const edge of [from + stub, to - stub]) post(axis === 'x' ? [edge, 0, fixed] : [fixed, 0, edge]);
    const mid = (from + to) / 2;
    const sill = box(axis === 'x' ? [door, .05, .22] : [.22, .05, door], axis === 'x' ? [mid, .08, fixed] : [fixed, .08, mid], trimColor(), 'accents', .012); sill.castShadow = false;
  }
  /** Colored inlaid tiles are part of the paintable floor, not furniture. */
  function floorAccents(rect, kind) {
    if(theme.id==='warm')return;
    const w = rect.width, d = rect.depth, x0 = rect.minX, z0 = rect.minZ;
    const tileAt = (size, position, color, radius) => {
      const tile = box(size, position, color, 'zones', radius);
      tile.name = 'room-floor-accent'; tile.castShadow = false;
    };
    if ((kind.baseKind ?? kind.id) === 'playroom') {
      const tile = .56, cols = Math.floor((w - .3) / tile), rows = Math.floor((d - .3) / tile);
      const colors = [PALETTE.coral, PALETTE.sky, PALETTE.sun, PALETTE.mint];
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if ((i + j) % 2 === 0) {
        tileAt([tile - .05, .004, tile - .05], [x0 + .15 + tile / 2 + i * tile, .065, z0 + .15 + tile / 2 + j * tile], colors[(i * 3 + j) % 4], .004);
      }
    } else if ((kind.baseKind ?? kind.id) === 'bathroom') {
      for (let i = 0; i < Math.floor((w - .2) / .32); i++) {
        tileAt([.28, .005, .28], [x0 + .26 + i * .32, .065, z0 + d - .3], i % 2 ? PALETTE.sky : PALETTE.white, .003);
      }
    }
  }
  /** The sunroom's glass enclosure is architecture and participates in wall collision. */
  function sunroomGlazing(rect, edges) {
    for (const side of ['back', 'left']) for (const seg of edges[side].filter(s => !s.shared)) {
      const alongX = side === 'back', mid = (seg.from + seg.to) / 2, len = seg.to - seg.from;
      for (let i = 0; i < 3; i++) {
        const offset = seg.from + len / 6 + i * len / 3;
        const pane = box(alongX ? [len / 3 - .08, 1.3, .04] : [.04, 1.3, len / 3 - .08],
          alongX ? [offset, 1.01, rect.minZ + .1] : [rect.minX + .1, 1.01, offset],
          shellColor('glass'), 'windows', .01, { transparent: true, opacity: .55, roughness: .2 });
        pane.name = 'sunroom-glazing'; pane.castShadow = false;
      }
      const frame = box(alongX ? [len, .08, .12] : [.12, .08, len],
        alongX ? [mid, 1.66, rect.minZ + .1] : [rect.minX + .1, 1.66, mid], shellColor('frame', PALETTE.white), 'windows', .02);
      frame.name = 'sunroom-window-frame';
    }
  }
  function clear() {
    for(const mesh of parts.floor)floorTextures?.release(mesh);
    for (const list of Object.values(parts)) { list.length = 0; }
    group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    geometries.clear(); materials.clear(); group.clear();
  }
  function buildRoom(rooms, room, bounds) {
    const kind = getRoomKind(room.kind), rect = roomRect(room), edges = roomEdges(rooms, room);
    currentRoom = room;
    const { floor: floorColor, wall: wallColor } = getRoomTheme(kind, room, theme);
    const w = rect.width, d = rect.depth;
    for(const piece of splitFloorAroundOpening({minX:rect.minX-.07,maxX:rect.maxX+.07,minZ:rect.minZ-.07,maxZ:rect.maxZ+.07},stairs))
      box([piece.maxX-piece.minX,.32,piece.maxZ-piece.minZ],[(piece.minX+piece.maxX)/2,-.13,(piece.minZ+piece.maxZ)/2],shellColor('plinth'),'border',.04);
    for(const piece of splitFloorAroundOpening(rect,stairs)) {
      const floor=box([piece.maxX-piece.minX,.06,piece.maxZ-piece.minZ],[(piece.minX+piece.maxX)/2,.03,(piece.minZ+piece.maxZ)/2],floorColor,'floor',.012,{mapKey:room.floor?.material??'oak'});floor.castShadow=false;
    }
    if (includeGrid && theme.id!=='warm') {
      for (let z = rect.minZ + .45; z < rect.maxZ - .25; z += .68) { const seam = box([w - .4, .003, .008], [rect.x, .063, z], PALETTE.grid, 'zones', .001); seam.castShadow = false; }
      for (let x = rect.minX + .5; x < rect.maxX - .25; x += 1.4) { const seam = box([.008, .003, d - .4], [x, .064, rect.z], PALETTE.grid, 'zones', .001); seam.castShadow = false; }
    }
    // Threshold strip where this room meets the living room or another room.
    const threshold = box([w - .1, .05, .06], [rect.x, .07, rect.minZ + .03], trimColor(), 'accents', .01); threshold.castShadow = false;
    if (includeWalls) {
      const backRow = Math.abs(rect.minZ-LAYOUT_GRID.minCz*CELL.depth)<1e-7, leftColumn = Math.abs(rect.minX-LAYOUT_GRID.minCx*CELL.width)<1e-7;
      for (const seg of edges.back) {
        const mid = (seg.from + seg.to) / 2, len = seg.to - seg.from;
        if (seg.shared) partition(seg.from, seg.to, rect.minZ + .085, 'x', wallColor);
        else if (backRow) {
          const holes = len > 2 ? [[0, 1.77, 1.25, 1.35, .21]] : [];
          fullWall(len, [mid, .06, rect.minZ - .03], 'x', wallColor, holes);
          for (const [x] of holes) windowAt([mid + x, 0, rect.minZ + .1], 'x');
          box([len, .14, .11], [mid, .16, rect.minZ + .14], trimColor(PALETTE.frame), 'border', .02);
          box([len + .1, .11, .29], [mid, WALL_HEIGHT + .12, rect.minZ - .03], shellColor('wallCap', PALETTE.trim), 'border', .025);
        } else lowWall(len, [mid, 0, rect.minZ + .085], 'x', wallColor, .72);
      }
      for (const seg of edges.left) {
        const mid = (seg.from + seg.to) / 2, len = seg.to - seg.from;
        if (seg.shared) partition(seg.from, seg.to, rect.minX + .085, 'z', wallColor);
        else if (leftColumn) {
          const holes = len > 2 ? [[0, 1.77, 1.25, 1.35, .21]] : [];
          fullWall(len, [rect.minX - .03, .06, mid], 'z', wallColor, holes);
          for (const [x] of holes) windowAt([rect.minX + .1, 0, mid + x], 'z');
          box([.11, .14, len], [rect.minX + .14, .16, mid], trimColor(PALETTE.frame), 'border', .02);
          box([.29, .11, len + .1], [rect.minX - .03, WALL_HEIGHT + .12, mid], shellColor('wallCap', PALETTE.trim), 'border', .025);
        } else lowWall(len, [rect.minX + .085, 0, mid], 'z', wallColor, .72);
      }
      // Corner posts where two full-height outer walls or a wall and a cut-away meet.
      if (backRow && edges.back.some(s => !s.shared)) post([rect.maxX - .11, 0, rect.minZ - .03], WALL_HEIGHT + .12);
      if (leftColumn && edges.left.some(s => !s.shared)) post([rect.minX - .03, 0, rect.maxZ - .11], WALL_HEIGHT + .12);
      if (!edges.frontShared) { const lip = box([w + .14, .05, .08], [rect.x, .085, rect.maxZ - .02], trimColor(), 'border', .015); lip.castShadow = false; }
      if (!edges.rightShared) { const lip = box([.08, .05, d + .14], [rect.maxX - .02, .085, rect.z], trimColor(), 'border', .015); lip.castShadow = false; }
    }
    floorAccents(rect, kind);
    for(const part of ['zones','accents'])for(const object of parts[part])if(object.userData.surfaceId?.startsWith(`room:${room.id}.`)&&object.position.y<.2)clipFloor(object);
    if (includeWalls && (kind.baseKind ?? kind.id) === 'sunroom') sunroomGlazing(rect, edges);
    void bounds;
    currentRoom = null;
  }
  /** A purchased floor shell is real structure, not a synthetic living room. */
  function buildSlabFloor(home) {
    const legacy=hasStarterRoom(home),starter=legacy?home.rooms.find(room=>room.id==='living'):null,starterRect=starter?roomRect(starter):null;
    const subtract=(r,cut)=>{
      if(!cut)return[r];const x0=Math.max(r.minX,cut.minX),x1=Math.min(r.maxX,cut.maxX),z0=Math.max(r.minZ,cut.minZ),z1=Math.min(r.maxZ,cut.maxZ);
      if(x1<=x0+1e-7||z1<=z0+1e-7)return[r];
      return [{minX:r.minX,maxX:x0,minZ:r.minZ,maxZ:r.maxZ},{minX:x1,maxX:r.maxX,minZ:r.minZ,maxZ:r.maxZ},{minX:x0,maxX:x1,minZ:r.minZ,maxZ:z0},{minX:x0,maxX:x1,minZ:z1,maxZ:r.maxZ}].filter(p=>p.maxX-p.minX>1e-6&&p.maxZ-p.minZ>1e-6);
    };
    const outer=getFloorBoundarySegments(home);
    const shell=outer.flatMap(edge=>{
      if(!legacy)return[edge];
      const horizontal=edge.side==='back'||edge.side==='front',full=edge.side==='back'||edge.side==='left';
      // The living shell already owns all four edges, not only its tall
      // back/left walls. A duplicate raised front/right rim would create a
      // new obstacle under furnishings when an unchanged old home gains slab
      // metadata. Keep only the genuinely new portions of those low edges.
      const owners=home.rooms.filter(room=>{
        if(!full&&room.id!=='living')return false;
        const r=roomRect(room),at=edge.side==='back'?r.minZ:edge.side==='front'?r.maxZ:edge.side==='left'?r.minX:r.maxX;
        return Math.abs(at-edge.at)<1e-6;
      });
      const cuts=[edge.from,edge.to,...owners.flatMap(room=>{const r=roomRect(room);return horizontal?[r.minX,r.maxX]:[r.minZ,r.maxZ];})].filter(n=>n>=edge.from-1e-6&&n<=edge.to+1e-6).sort((a,b)=>a-b);
      return cuts.slice(1).map((to,i)=>{const from=cuts[i],mid=(from+to)/2,owner=owners.find(room=>{const r=roomRect(room);return mid>(horizontal?r.minX:r.minZ)&&mid<(horizontal?r.maxX:r.maxZ);});return {...edge,from,to,owner};}).filter(edge=>edge.to-edge.from>1e-6);
    });
    currentRoom = null;
    for (const rect of getFloorRects(home).flatMap(rect=>subtract(rect,starterRect))) {
      for (const piece of splitFloorAroundOpening(rect, stairs)) {
        const size = [piece.maxX-piece.minX, .30, piece.maxZ-piece.minZ], center = [(piece.minX+piece.maxX)/2, -.15, (piece.minZ+piece.maxZ)/2];
        box(size, center, shellColor('plinth'), 'border', .015);
        const floor = box([size[0], .06, size[2]], [center[0], .03, center[2]], getRoomTheme('living', null, theme).floor, 'floor', .008, {mapKey:'oak'});
        floor.userData.surfaceId='floor.main';floor.userData.publicFloor=true;floor.castShadow=false;
      }
    }
    if (includeWalls) for (const edge of shell) {
      if(edge.owner?.id==='living')continue;
      currentRoom=edge.owner??null;
      // Purchased floors keep their public wall paint targets. Resolve only a
      // color owner here: assigning edge.owner would turn a right-click on the
      // same wall into a different room target. A single existing trim strip
      // can inherit a room color only when that room covers the complete edge.
      boundarySkinRoom = home.rooms.find(room => {
        const rect = roomRect(room), alongX = edge.side === 'back' || edge.side === 'front';
        const at = edge.side === 'back' ? rect.minZ : edge.side === 'front' ? rect.maxZ : edge.side === 'left' ? rect.minX : rect.maxX;
        const from = alongX ? rect.minX : rect.minZ, to = alongX ? rect.maxX : rect.maxZ;
        return Math.abs(at - edge.at) < 1e-6 && from <= edge.from + 1e-6 && to >= edge.to - 1e-6;
      }) ?? null;
      const alongX=edge.side==='back'||edge.side==='front', axis=alongX?'x':'z', length=edge.to-edge.from, mid=(edge.from+edge.to)/2;
      const full=edge.side==='back'||edge.side==='left', surfaceId=edge.owner?`room:${edge.owner.id}.wall`:edge.side==='left'?'wall.side':'wall.inner';
      const center=alongX?[mid,.06,edge.at-.03]:[edge.at-.03,.06,mid];
      const before=new Set(Object.values(parts).flat());
      if (full) {
        const holes=length>2.1?[[0,1.77,Math.min(1.25,length-.65),1.35,.21]]:[];
        // The historical slab fallback differs from room-kind defaults. Keep
        // it byte-for-byte in default; only the candidate resolves room color.
        const wallColor = theme.id === 'default' ? edge.owner?.wall?.color ?? '#efe6cc' : getRoomTheme(edge.owner?.kind ?? 'living', edge.owner, theme).wall;
        fullWall(length,center,axis,wallColor,holes);
        if(holes.length)windowAt(alongX?[mid,0,edge.at+.1]:[edge.at+.1,0,mid],axis,holes[0][2]);
        box(alongX?[length,.11,.29]:[.29,.11,length],alongX?[mid,WALL_HEIGHT+.12,edge.at-.03]:[edge.at-.03,WALL_HEIGHT+.12,mid],shellColor('wallCap', PALETTE.trim),'border',.025);
        box(alongX?[length,.14,.11]:[.11,.14,length],alongX?[mid,.16,edge.at+.14]:[edge.at+.14,.16,mid],trimColor(PALETTE.frame),'border',.02);
      } else {
        const lip=box(alongX?[length,.08,.09]:[.09,.08,length],alongX?[mid,.08,edge.at]:[edge.at,.08,mid],trimColor(),'border',.015);lip.castShadow=false;
      }
      for(const object of Object.values(parts).flat()) if(!before.has(object)) {
        object.userData.surfaceId=surfaceId;object.userData.floorBoundary={...edge};
        if(['toy','warm'].includes(theme.id)&&!legacy&&boundarySkinRoom&&object.userData.roomPart==='walls')object.userData.themeRoomId=boundarySkinRoom.id;
        if(full)object.userData.wallId=edge.owner?`room:${edge.owner.id}:${edge.side}:${edge.from}:${edge.to}`:`slab:${edge.side}:${edge.at}:${edge.from}:${edge.to}`;
      }
    }
    boundarySkinRoom = null;
    // The original living room keeps its actual back/left walls and mounted
    // objects when purchased floor extends behind it. Those walls then become
    // interior partitions, with the same solids in the collision model. Do not
    // build a second low partition on top of either preserved wall.
    const drawn=starterRect ? [
      {side:'back',at:starterRect.minZ,from:starterRect.minX,to:starterRect.maxX},
      {side:'left',at:starterRect.minX,from:starterRect.minZ,to:starterRect.maxZ},
    ] : [];
    const removeIntervals=(segments,cut)=>segments.flatMap(segment=>{
      if(cut.to<=segment.from+1e-7||cut.from>=segment.to-1e-7)return[segment];
      return [{from:segment.from,to:Math.min(segment.to,cut.from)},{from:Math.max(segment.from,cut.to),to:segment.to}].filter(p=>p.to-p.from>1e-6);
    });
    for(const room of home.rooms.filter(room=>room.id!=='living')) {
      currentRoom=room;const rect=roomRect(room),kind=getRoomKind(room.kind);
      for(const piece of splitFloorAroundOpening(rect,stairs)) {
        const floor=box([piece.maxX-piece.minX,.006,piece.maxZ-piece.minZ],[(piece.minX+piece.maxX)/2,.064,(piece.minZ+piece.maxZ)/2],getRoomTheme(kind,room,theme).floor,'floor',.002,{mapKey:room.floor?.material??'oak'});floor.castShadow=false;
      }
      if(includeWalls)for(const edge of getFloorBoundarySegments({rooms:[room]})) {
        const axis=edge.side==='back'||edge.side==='front'?'x':'z';let intervals=[{from:edge.from,to:edge.to}];
        for(const other of [...shell,...drawn]) {
          const otherAxis=other.side==='back'||other.side==='front'?'x':'z';
          if(axis===otherAxis&&Math.abs(edge.at-other.at)<1e-6)intervals=removeIntervals(intervals,other);
        }
        for(const part of intervals){partition(part.from,part.to,edge.at,axis,getRoomTheme(kind,room,theme).wall);drawn.push({...edge,...part});}
      }
      const before=new Set(parts.zones);floorAccents(rect,kind);
      for(const object of parts.zones)if(!before.has(object)){object.position.y+=.007;clipFloor(object);}
    }
    currentRoom=null;
  }
  function build(rooms) {
    const home={rooms:resolveRooms(rooms),...(slab?{slab}:{}),profile,surfaces};
    const slabMode=!!slab,standalone=slabMode&&!hasStarterRoom(home);
    if(slabMode){
      const bounds=getFloorBounds(home);
      if(!bounds)throw new TypeError('A floor needs actual slab area');
      definition={rooms:home.rooms,bounds,width:bounds.width,depth:bounds.depth,height:WALL_HEIGHT,count:home.rooms.length};
      buildSlabFloor(home);
    } else {
      definition = describeRooms(rooms);
      for (const room of definition.rooms.filter(room=>room.id!=='living')) buildRoom(definition.rooms, room, definition.bounds);
    }
    group.userData.rooms = definition.rooms; group.userData.roomCount = definition.count;
    group.userData.roomBounds = definition.bounds; group.userData.roomDimensions = { width: definition.width, depth: definition.depth, height: WALL_HEIGHT };
    group.userData.roomParts = parts;
    syncFloorFinishes(home);
    group.userData.surfaceIds = Object.fromEntries(definition.rooms.filter(room=>room.id!=='living').flatMap(room => [[`${room.id}.floor`, `room:${room.id}.floor`], [`${room.id}.wall`, `room:${room.id}.wall`]]));
    if(slabMode)Object.assign(group.userData.surfaceIds,{'slab.floor':'floor.main','slab.back':'wall.inner','slab.left':'wall.side'});
    group.userData.slab=slab;group.userData.standalone=standalone;group.userData.slabMode=slabMode;
    group.userData.roomTier = Array.isArray(rooms) ? describeStage(definition.count) : rooms;
  }
  function syncFloorFinishes(home) {
    if(!floorTextures)return;
    for(const mesh of parts.floor) {
      const owner=home.rooms.find(room=>room.id===mesh.userData.roomId)??home.rooms.find(room=>room.id==='living')??home.rooms[0];
      const publicFloor=mesh.userData.surfaceId==='floor.main',kind=owner?.kind??'living';
      const appearance=publicFloor?(home.surfaces?.['floor.main']??getDefaultFloorAppearance()):(owner?.floor??{color:getRoomKind(kind).floor,material:'oak'});
      const finish=resolveHomeFloorFinish(kind,appearance,{themeId:theme.id,...publicFloor?{legacyDefault:getDefaultFloorAppearance()}:{} });
      floorTextures.apply(mesh,finish);
    }
  }
  group.syncFloorFinishes=syncFloorFinishes;
  const describeStage = count => count >= 5 ? 'mansion' : count >= 3 ? 'atrium' : count >= 2 ? 'suite' : 'starter';
  build(tier ?? rooms);
  group.setRooms = (value, options = {}) => { if (disposed) throw new Error('Cannot change a disposed room expansion.'); if(Object.hasOwn(options,'staircases'))stairs=getHomeStairs(options);else if(Object.hasOwn(options,'stairs'))stairs=Array.isArray(options.stairs)?options.stairs:getHomeStairs(options);if(Object.hasOwn(options,'slab'))slab=options.slab;if(Object.hasOwn(options,'profile'))profile=options.profile;if(Object.hasOwn(options,'surfaces'))surfaces=options.surfaces; clear(); build(value); return group; };
  group.setTier = value => group.setRooms(getRoomTierDefinition(value).id);
  group.getDefinition = () => definition;
  group.dispose = () => { if (disposed) return; disposed = true; clear();if(ownsFloorTextures)floorTextures.dispose(); group.userData.roomParts = null; };
  return group;
}
export { CELL };
export default createRoomExpansion;
