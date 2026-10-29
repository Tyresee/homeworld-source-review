import { getStaircaseVolume, getHomeStairs } from './home-staircase-shape.js';
/**
 * Multi-room floor plan for the local home preview.
 *
 * The home is a set of rectangular rooms snapped to a coarse cell grid. The
 * living room is the fixed core (it owns the legacy editable surfaces and the
 * fixed objects); every other room is a function room attached edge-to-edge.
 * The interior builder, the exterior manor and the outdoor estate all read
 * this one layout, so adding a bedroom changes the house silhouette outside.
 *
 * Data only: no THREE, no DOM, no storage.
 */
const freezeRows = rows => Object.freeze(rows.map(row => Object.freeze(row)));

export const CELL = Object.freeze({ width: 2.8, depth: 2.6 });
/** Legacy starter-grid hints for wall rendering; this is not a construction boundary. */
export const LAYOUT_GRID = Object.freeze({ minCx: -1, maxCx: 4, minCz: -1, maxCz: 4 });
/** Input safety ceilings, not unlock levels or a purchasable building envelope. */
export const LAYOUT_TECH_LIMITS = Object.freeze({maxRooms:1024,maxSlabRects:2048,maxCoordinate:10000,maxSlotCandidates:4096,maxSlotChecks:65536,maxCellHints:4096});
export const MAX_ROOMS = LAYOUT_TECH_LIMITS.maxRooms;
/** Footprints may touch a room edge exactly; legacy starter placements rely on that. */
export const ROOM_MARGIN = 0;

const BASE_ROOM_KINDS = [
  { id: 'living', label: "Living room", cols: 2, rows: 2, core: true, icon: '⌂', description: "DisplayText1423, DisplayText1424, DisplayText1425.", floor: '#f8e9cb', wall: '#efe6cc', roofHeight: 1.25, exterior: 'entrance' },
  { id: 'bedroom', label: "Bedroom", cols: 2, rows: 2, icon: '☾', description: "DisplayText1426, DisplayText1427, DisplayText1428.", floor: '#f2e0dc', wall: '#f5e9ea', roofHeight: 1.2, exterior: 'dormer' },
  { id: 'study', label: "Study", cols: 2, rows: 2, icon: '✎', description: "DisplayText1429, DisplayText1430.", floor: '#e7d2ae', wall: '#e8e4d2', roofHeight: 1.15, exterior: 'tallwindow' },
  { id: 'kitchen', label: "Kitchen", cols: 2, rows: 2, icon: '♨', description: "DisplayText1431, DisplayText1432.", floor: '#e3e6da', wall: '#f2efe3', roofHeight: 1.1, exterior: 'chimney' },
  { id: 'playroom', label: "DisplayText1433", cols: 2, rows: 2, icon: '★', description: "DisplayText1434, DisplayText1435; DisplayText1436.", floor: '#f5e7c6', wall: '#dfeaf2', roofHeight: 1.3, exterior: 'roundwindow' },
  { id: 'bathroom', label: "DisplayText0258", cols: 1, rows: 2, icon: '≈', description: "DisplayText1437, DisplayText1438.", floor: '#dcecef', wall: '#e9f4f5', roofHeight: .85, exterior: 'porthole' },
  { id: 'gallery', label: "DisplayText1439", cols: 2, rows: 1, icon: '▭', description: "DisplayText1440, DisplayText1441.", floor: '#efe5d6', wall: '#f5f0e7', roofHeight: .7, exterior: 'skylight' },
  { id: 'sunroom', label: "DisplayText1442", cols: 2, rows: 1, icon: '☼', description: "DisplayText1443, DisplayText1444.", floor: '#e4ead2', wall: '#eef3df', roofHeight: .9, exterior: 'glass' },
  { id: 'hallway', label: "DisplayText1445", cols: 1, rows: 2, icon: '⌂', description: "DisplayText1446, DisplayText1447.", floor: '#e9dcc3', wall: '#f0e9da', roofHeight: .8, exterior: 'porch' },
];
const ROOM_SIZE_NAMES = { compact: "DisplayText1448", standard: "DisplayText1449", spacious: "DisplayText1450" };
const compactSize = kind => ['bathroom', 'gallery', 'sunroom', 'hallway'].includes(kind.id) ? [1, 1] : [1, 2];
const spaciousSize = kind => ['bathroom', 'hallway'].includes(kind.id) ? [2, 2] : [3, 2];
/** Existing kind ids keep their old dimensions; distinct products own distinct footprints. */
export const ROOM_KINDS = freezeRows(BASE_ROOM_KINDS.flatMap(kind => {
  if (kind.core) return [{ ...kind, baseKind: kind.id, size: 'standard' }];
  return ['compact', 'standard', 'spacious'].map(size => {
    const [cols, rows] = size === 'compact' ? compactSize(kind) : size === 'spacious' ? spaciousSize(kind) : [kind.cols, kind.rows];
    return { ...kind, id: size === 'standard' ? kind.id : `${kind.id}-${size}`, baseKind: kind.id, size,
      label: `${ROOM_SIZE_NAMES[size]}${kind.label}`, cols, rows,
      description: `${ROOM_SIZE_NAMES[size]}DisplayText1451${kind.label}.${kind.description}` };
  });
}));
export const ROOM_KIND_IDS = Object.freeze(ROOM_KINDS.map(kind => kind.id));
const KIND_BY_ID = new Map(ROOM_KINDS.map(kind => [kind.id, kind]));
export function getRoomKind(id) { return KIND_BY_ID.get(id) ?? null; }

const E = 1e-8;
export const ROOM_SIZE_STEP = .2;
export const ROOM_SIZE_LIMITS = Object.freeze({ minWidth:1.2, minDepth:1.2, maxWidth:8.4, maxDepth:7.8, step:ROOM_SIZE_STEP });
const snap = n => Math.round(n / ROOM_SIZE_STEP) * ROOM_SIZE_STEP;
const clean = n => Number(n.toFixed(8));
const onStep = n => Number.isFinite(n) && Math.abs(n-snap(n)) < E;
const rectValue = r => r && [r.minX,r.minZ,r.width,r.depth].every(Number.isFinite) && r.width > 0 && r.depth > 0;
const completeRect = r => ({minX:clean(r.minX),minZ:clean(r.minZ),width:clean(r.width),depth:clean(r.depth),maxX:clean(r.minX+r.width),maxZ:clean(r.minZ+r.depth),x:clean(r.minX+r.width/2),z:clean(r.minZ+r.depth/2)});
const footprintRect = p => completeRect({minX:p.x-p.halfX,minZ:p.z-p.halfZ,width:p.halfX*2,depth:p.halfZ*2});
export const isRoomId = value => typeof value === 'string' && /^[a-z\d_.:-]{1,48}$/i.test(value);
export function isRoomSizeValid(width,depth) {
  return onStep(width) && onStep(depth) && width >= ROOM_SIZE_LIMITS.minWidth-E && width <= ROOM_SIZE_LIMITS.maxWidth+E
    && depth >= ROOM_SIZE_LIMITS.minDepth-E && depth <= ROOM_SIZE_LIMITS.maxDepth+E;
}
/** New paid rooms may use precise world coordinates. Legacy grid records stay unchanged. */
export function roomRect(room) {
  const kind = KIND_BY_ID.get(room?.kind);
  if (!kind) return null;
  if (room.bounds !== undefined) return rectValue(room.bounds) ? completeRect(room.bounds) : null;
  if (![room.cx,room.cz].every(Number.isFinite)) return null;
  return completeRect({ minX:room.cx*CELL.width,minZ:room.cz*CELL.depth,width:kind.cols*CELL.width,depth:kind.rows*CELL.depth });
}
/** Coarse touched cells are visual hints only, never a support/overlap authority. */
export function roomCells(room) {
  const r = roomRect(room), cells=[];
  if (!r) return cells;
  for(let cx=Math.floor((r.minX+E)/CELL.width);cx<Math.ceil((r.maxX-E)/CELL.width);cx++)
    for(let cz=Math.floor((r.minZ+E)/CELL.depth);cz<Math.ceil((r.maxZ-E)/CELL.depth);cz++) cells.push({cx,cz});
  return cells;
}
const rectsOverlap = (a,b) => a.minX < b.maxX-E && b.minX < a.maxX-E && a.minZ < b.maxZ-E && b.minZ < a.maxZ-E;
function rectsAdjacent(a,b) {
  if(rectsOverlap(a,b)) return false;
  return ((Math.abs(a.maxX-b.minX)<E || Math.abs(b.maxX-a.minX)<E) && Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ)>E)
    || ((Math.abs(a.maxZ-b.minZ)<E || Math.abs(b.maxZ-a.minZ)<E) && Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX)>E);
}
export function roomsOverlap(a,b) { const ra=roomRect(a),rb=roomRect(b); return !!ra&&!!rb&&rectsOverlap(ra,rb); }
export function roomsAdjacent(a,b) { const ra=roomRect(a),rb=roomRect(b); return !!ra&&!!rb&&rectsAdjacent(ra,rb); }
function inGrid(room) {
  const r=roomRect(room);
  if (!r || ![r.minX,r.maxX,r.minZ,r.maxZ].every(n=>Number.isFinite(n)&&Math.abs(n)<=LAYOUT_TECH_LIMITS.maxCoordinate)) return false;
  if(room.bounds !== undefined) return Object.keys(room.bounds).every(k=>['minX','minZ','width','depth'].includes(k))
    && onStep(r.minX) && onStep(r.minZ) && isRoomSizeValid(r.width,r.depth);
  return Number.isInteger(room.cx) && Number.isInteger(room.cz);
}
function connectedRects(rects) {
  if(!rects.length) return false;
  const seen=new Set([0]),stack=[0];
  while(stack.length) {const index=stack.pop();rects.forEach((r,i)=>{if(!seen.has(i)&&(rectsAdjacent(rects[index],r)||rectsOverlap(rects[index],r))){seen.add(i);stack.push(i);}});}
  return seen.size===rects.length;
}
export function isConnected(rooms) { return Array.isArray(rooms) && connectedRects(rooms.map(roomRect).filter(Boolean)); }
/** Subtract an exact rectangle; all support tests and rendering partitions share this union. */
function subtractRect(source,cut) {
  if(!rectsOverlap(source,cut)) return [source];
  const x0=Math.max(source.minX,cut.minX),x1=Math.min(source.maxX,cut.maxX),z0=Math.max(source.minZ,cut.minZ),z1=Math.min(source.maxZ,cut.maxZ);
  return [
    {minX:source.minX,minZ:source.minZ,width:x0-source.minX,depth:source.depth},
    {minX:x1,minZ:source.minZ,width:source.maxX-x1,depth:source.depth},
    {minX:x0,minZ:source.minZ,width:x1-x0,depth:z0-source.minZ},
    {minX:x0,minZ:z1,width:x1-x0,depth:source.maxZ-z1},
  ].filter(r=>r.width>E&&r.depth>E).map(completeRect);
}
export function isSlabValid(slab) {
  if(!slab || typeof slab!=='object' || Array.isArray(slab) || Object.keys(slab).some(k=>k!=='rects') || !Array.isArray(slab.rects) || !slab.rects.length || slab.rects.length>LAYOUT_TECH_LIMITS.maxSlabRects) return false;
  const rects=[];
  for(const r of slab.rects) {
    if(!rectValue(r) || Object.keys(r).some(k=>!['minX','minZ','width','depth'].includes(k)) || ![r.minX,r.minZ,r.width,r.depth].every(onStep)) return false;
    const rect=completeRect(r); if(![rect.minX,rect.maxX,rect.minZ,rect.maxZ].every(n=>Number.isFinite(n)&&Math.abs(n)<=LAYOUT_TECH_LIMITS.maxCoordinate)) return false; rects.push(rect);
  }
  return connectedRects(rects);
}
/** Nonoverlapping world rectangles, from persistent slab or the legacy room footprint. */
export function getFloorRects(home) {
  const rooms=Array.isArray(home)?home:Array.isArray(home?.rooms)?home.rooms:[];
  const source=Array.isArray(home?.slab?.rects)?home.slab.rects:rooms.map(roomRect);
  const result=[];
  for(const raw of source) {
    if(!rectValue(raw)) continue;
    let pieces=[completeRect(raw)];
    for(const prior of result) pieces=pieces.flatMap(piece=>subtractRect(piece,prior));
    result.push(...pieces);
  }
  return result;
}
export function floorContainsRect(home,raw) {
  const candidate=rectValue(raw)?completeRect(raw):raw&&[raw.minX,raw.maxX,raw.minZ,raw.maxZ].every(Number.isFinite)?completeRect({minX:raw.minX,minZ:raw.minZ,width:raw.maxX-raw.minX,depth:raw.maxZ-raw.minZ}):null;
  if(!candidate || candidate.width<=0 || candidate.depth<=0) return false;
  let missing=[candidate];
  for(const support of getFloorRects(home)) {missing=missing.flatMap(piece=>subtractRect(piece,support));if(!missing.length)return true;}
  return false;
}
function boundsOf(rects) {
  if(!rects.length) return null;
  const minX=Math.min(...rects.map(r=>r.minX)),maxX=Math.max(...rects.map(r=>r.maxX)),minZ=Math.min(...rects.map(r=>r.minZ)),maxZ=Math.max(...rects.map(r=>r.maxZ));
  return completeRect({minX,minZ,width:maxX-minX,depth:maxZ-minZ});
}
export function getFloorBounds(home) { return boundsOf(getFloorRects(home)); }
export function getFloorArea(home) { return clean(getFloorRects(home).reduce((sum,r)=>sum+r.width*r.depth,0)); }
export function getFloorCells(home) {
  const cells=new Map();
  for(const r of getFloorRects(home)) for(let cx=Math.floor((r.minX+E)/CELL.width);cx<Math.ceil((r.maxX-E)/CELL.width);cx++)
    for(let cz=Math.floor((r.minZ+E)/CELL.depth);cz<Math.ceil((r.maxZ-E)/CELL.depth);cz++){cells.set(`${cx}:${cz}`,{cx,cz});if(cells.size>=LAYOUT_TECH_LIMITS.maxCellHints)return [...cells.values()];}
  return [...cells.values()];
}
export function hasStarterRoom(home) { return home?.profile !== 'account' && (Array.isArray(home)?home:home?.rooms??[]).some(r=>r.id==='living'&&r.kind==='living'); }
/** Boundary segments: back/front run along x with at=z; left/right along z with at=x. */
export function getFloorBoundarySegments(home) {
  const rects=getFloorRects(home), segments=[];
  for(const r of rects) for(const side of ['back','front','left','right']) {
    const horizontal=side==='back'||side==='front',at=side==='back'?r.minZ:side==='front'?r.maxZ:side==='left'?r.minX:r.maxX;
    const from=horizontal?r.minX:r.minZ,to=horizontal?r.maxX:r.maxZ;
    const cuts=[from,to,...rects.flatMap(o=>horizontal?[o.minX,o.maxX]:[o.minZ,o.maxZ])].filter(n=>n>=from-E&&n<=to+E).sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++) {
      if(cuts[i]-cuts[i-1]<E)continue;
      const middle=(cuts[i]+cuts[i-1])/2,probe=at+(['back','left'].includes(side)?-1:1)*1e-6;
      const x=horizontal?middle:probe,z=horizontal?probe:middle;
      if(rects.some(o=>x>o.minX&&x<o.maxX&&z>o.minZ&&z<o.maxZ))continue;
      segments.push({side,at:clean(at),from:clean(cuts[i-1]),to:clean(cuts[i])});
    }
  }
  const merged=[];
  for(const seg of segments.sort((a,b)=>a.side.localeCompare(b.side)||a.at-b.at||a.from-b.from)) {
    const last=merged.at(-1);
    if(last&&last.side===seg.side&&Math.abs(last.at-seg.at)<E&&seg.from<=last.to+E)last.to=Math.max(last.to,seg.to);
    else merged.push({...seg});
  }
  return merged;
}
/** Structural validity only. New upper slabs permit independent rooms and empty public space. */
export function isLayoutValid(rooms,options={}) {
  if(!Array.isArray(rooms)||rooms.length>MAX_ROOMS)return false;
  const slabMode=options.slab!==undefined;
  if(slabMode&&!isSlabValid(options.slab))return false;
  if((!slabMode||options.profile!=='upper')&&(!rooms.length||rooms[0]?.kind!=='living'||rooms[0]?.id!=='living'||rooms[0]?.cx!==-1||rooms[0]?.cz!==-1||rooms[0]?.bounds!==undefined))return false;
  const ids=new Set();
  for(const room of rooms) {
    if(!room||typeof room!=='object'||!isRoomId(room.id)||ids.has(room.id)||!inGrid(room))return false;
    if(room.kind==='living'&&(room.id!=='living'||room!==rooms[0]||room.cx!==-1||room.cz!==-1||room.bounds!==undefined))return false;
    if(slabMode&&!floorContainsRect(options,roomRect(room)))return false;
    ids.add(room.id);
  }
  for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++)if(roomsOverlap(rooms[i],rooms[j]))return false;
  return slabMode||isConnected(rooms);
}
/** Grid slots remain stable for old homes; precise slabs/custom rooms add edge-aligned choices. */
export function getRoomSlots(rooms,kindId,options={}) {
  const kind=KIND_BY_ID.get(kindId);
  if(!kind||kind.core||!Array.isArray(rooms)||rooms.length>=MAX_ROOMS)return [];
  const width=options.width??kind.cols*CELL.width,depth=options.depth??kind.rows*CELL.depth;
  if(!isRoomSizeValid(width,depth))return [];
  const precise=!!options.slab||rooms.some(r=>r.bounds)||options.width!==undefined||options.depth!==undefined;
  const xs=new Set(),zs=new Set(),support=getFloorRects(options),source=[...rooms.map(roomRect),...support].filter(Boolean);
  // Candidate positions are local to actual room/floor edges. No six-cell world cap or enormous coordinate loop.
  for(const r of source) {
    for(const x of [r.minX,r.maxX,r.minX-width,r.maxX-width])xs.add(clean(x));
    for(const z of [r.minZ,r.maxZ,r.minZ-depth,r.maxZ-depth])zs.add(clean(z));
  }
  if(!source.length){xs.add(-CELL.width);zs.add(-CELL.depth);}
  const slots=[];let checked=0;
  for(const minX of [...xs].sort((a,b)=>a-b))for(const minZ of [...zs].sort((a,b)=>a-b)) {
    if(++checked>LAYOUT_TECH_LIMITS.maxSlotChecks)return slots;
    const bounds={minX,minZ,width,depth},cx=Math.round(minX/CELL.width),cz=Math.round(minZ/CELL.depth);
    const candidate={id:'__slot__',kind:kindId,cx,cz,...(precise?{bounds}:{})};
    if(!inGrid(candidate)||rooms.some(room=>roomsOverlap(room,candidate)))continue;
    if(options.slab) {if(!floorContainsRect(options,roomRect(candidate)))continue;}
    else if(!rooms.some(room=>roomsAdjacent(room,candidate)))continue;
    if(slots.length>=LAYOUT_TECH_LIMITS.maxSlotCandidates)return slots;
    slots.push({key:`${kindId}:${clean(minX)}:${clean(minZ)}:${clean(width)}:${clean(depth)}`,cx,cz,...(precise?{bounds}:{ }),rect:roomRect(candidate)});
  }
  return slots;
}
export function layoutBounds(rooms) { return boundsOf((rooms??[]).map(roomRect).filter(Boolean)); }
export function findRoomAt(rooms,x,z) {return rooms.find(room=>{const r=roomRect(room);return r&&x>=r.minX-E&&x<=r.maxX+E&&z>=r.minZ-E&&z<=r.maxZ+E;})??null;}
export function roomFootprintBounds(room,halfX,halfZ,margin=ROOM_MARGIN) {
  const r=roomRect(room);if(!r)return null;
  const b={minX:r.minX+margin+halfX,maxX:r.maxX-margin-halfX,minZ:r.minZ+margin+halfZ,maxZ:r.maxZ-margin-halfZ};
  return b.minX<=b.maxX+E&&b.minZ<=b.maxZ+E?b:null;
}
export function fitsInRoom(room,footprint,margin=ROOM_MARGIN) {
  const b=roomFootprintBounds(room,footprint.halfX,footprint.halfZ,margin);
  return !!b&&footprint.x>=b.minX-E&&footprint.x<=b.maxX+E&&footprint.z>=b.minZ-E&&footprint.z<=b.maxZ+E;
}
export function findContainingRoom(rooms,footprint,margin=ROOM_MARGIN) {return rooms.find(room=>fitsInRoom(room,footprint,margin))??null;}
export function floorContainsFootprint(home,footprint) {return floorContainsRect(home,footprintRect(footprint));}
export function clampToRoom(room,footprint,margin=ROOM_MARGIN) {
  const b=roomFootprintBounds(room,footprint.halfX,footprint.halfZ,margin);if(!b)return null;
  return {x:Math.max(b.minX,Math.min(b.maxX,footprint.x)),z:Math.max(b.minZ,Math.min(b.maxZ,footprint.z))};
}
function edgeSegments(rooms,room,side) {
  const r=roomRect(room);if(!r)return [];
  const alongX=side==='back'||side==='front',from=alongX?r.minX:r.minZ,to=alongX?r.maxX:r.maxZ;
  const at=side==='back'?r.minZ:side==='front'?r.maxZ:side==='left'?r.minX:r.maxX;
  const neighbors=rooms.filter(other=>other!==room&&other.id!==room.id).map(other=>({room:other,r:roomRect(other)})).filter(({r:o})=>o&&Math.abs((side==='back'?o.maxZ:side==='front'?o.minZ:side==='left'?o.maxX:o.minX)-at)<E);
  const cuts=[from,to,...neighbors.flatMap(({r:o})=>alongX?[o.minX,o.maxX]:[o.minZ,o.maxZ])].filter(n=>n>=from-E&&n<=to+E).sort((a,b)=>a-b),result=[];
  for(let i=1;i<cuts.length;i++) {
    const a=clean(cuts[i-1]),b=clean(cuts[i]);if(b-a<E)continue;
    const mid=(a+b)/2,neighbor=neighbors.find(({r:o})=>mid>(alongX?o.minX:o.minZ)-E&&mid<(alongX?o.maxX:o.maxZ)+E)?.room;
    const last=result.at(-1);
    if(last&&last.neighbor===(neighbor?.id??null)&&Math.abs(last.to-a)<E)last.to=b;
    else result.push({from:a,to:b,shared:!!neighbor,neighbor:neighbor?.id??null});
  }
  return result;
}
export function roomEdges(rooms,room) {
  return {back:edgeSegments(rooms,room,'back'),left:edgeSegments(rooms,room,'left'),
    frontShared:edgeSegments(rooms,room,'front').some(s=>s.shared),rightShared:edgeSegments(rooms,room,'right').some(s=>s.shared)};
}
/** Exposed faces retain CELL-sized window bays for legacy visual proportions. */
export function roomOuterFaces(rooms,room) {
  const result=[];
  for(const side of ['back','left','front','right'])for(const s of edgeSegments(rooms,room,side).filter(s=>!s.shared)) {
    const count=Math.max(1,Math.ceil((s.to-s.from)/(side==='back'||side==='front'?CELL.width:CELL.depth)-E));
    for(let i=0;i<count;i++)result.push({side,from:clean(s.from+(s.to-s.from)*i/count),to:clean(s.from+(s.to-s.from)*(i+1)/count)});
  }
  return result;
}
/** A strip is closed on an edge when every interval is outside the slab or occupied by another room. */
function edgeIsBlocked(home,others,side,strip) {
  const alongX=side==='back'||side==='front',at=side==='back'?strip.minZ:side==='front'?strip.maxZ:side==='left'?strip.minX:strip.maxX;
  const from=alongX?strip.minX:strip.minZ,to=alongX?strip.maxX:strip.maxZ,all=[...getFloorRects(home),...others];
  const cuts=[from,to,...all.flatMap(r=>alongX?[r.minX,r.maxX]:[r.minZ,r.maxZ])].filter(n=>n>=from-E&&n<=to+E).sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++) {
    if(cuts[i]-cuts[i-1]<E)continue;
    const middle=(cuts[i]+cuts[i-1])/2,probe=at+(['back','left'].includes(side)?-1:1)*1e-5;
    const x=alongX?middle:probe,z=alongX?probe:middle;
    const within=r=>x>r.minX&&x<r.maxX&&z>r.minZ&&z<r.maxZ;
    if(getFloorRects(home).some(within)&&!others.some(within))return false;
  }
  return true;
}
/** Fill only local dead-end slivers. Never consumes a through corridor or moves an existing room. */
export function getRoomAutoFit(home,candidate) {
  const initial=roomRect(candidate),unchanged={room:{...candidate,...(candidate.bounds?{bounds:{...candidate.bounds}}:{})},adjustments:[],addedArea:0,filled:false};
  if(!initial||!home?.slab||!floorContainsRect(home,initial)||home.rooms.some(r=>r.id!==candidate.id&&roomsOverlap(r,candidate)))return unchanged;
  const others=home.rooms.filter(r=>r.id!==candidate.id).map(roomRect).filter(Boolean),reserved=getHomeStairs(home).map(getStaircaseVolume).filter(Boolean);
  let rect=initial;
  for(let pass=0;pass<2;pass++)for(const side of ['right','front','left','back']) {
    const alongX=side==='left'||side==='right',positive=side==='right'||side==='front',edge=alongX?(positive?rect.maxX:rect.minX):(positive?rect.maxZ:rect.minZ);
    const used=alongX?rect.width-initial.width:rect.depth-initial.depth;
    const limit=Math.min(1,(alongX?initial.width:initial.depth)*.35-used);
    const coordinates=[...getFloorRects(home),...others].flatMap(r=>alongX?[r.minX,r.maxX]:[r.minZ,r.maxZ]);
    const gaps=[...new Set(coordinates.map(v=>clean((v-edge)*(positive?1:-1))))].filter(g=>g>E&&g<=limit+E&&onStep(g)).sort((a,b)=>a-b);
    for(const gap of gaps) {
      const strip=completeRect(alongX?{minX:positive?rect.maxX:rect.minX-gap,minZ:rect.minZ,width:gap,depth:rect.depth}:{minX:rect.minX,minZ:positive?rect.maxZ:rect.minZ-gap,width:rect.width,depth:gap});
      if(!floorContainsRect(home,strip)||others.some(r=>rectsOverlap(r,strip))||reserved.some(r=>rectsOverlap(r,strip)))continue;
      // A narrow ribbon open at both ends is a passage. At least one end must be closed.
      if(!edgeIsBlocked(home,others,side,strip)||!(alongX?['back','front']:['left','right']).some(end=>edgeIsBlocked(home,others,end,strip)))continue;
      const next=completeRect({minX:side==='left'?rect.minX-gap:rect.minX,minZ:side==='back'?rect.minZ-gap:rect.minZ,width:rect.width+(alongX?gap:0),depth:rect.depth+(alongX?0:gap)});
      if(!isRoomSizeValid(next.width,next.depth))continue;
      rect=next;break;
    }
  }
  const beforeArea=clean(initial.width*initial.depth),afterArea=clean(rect.width*rect.depth),addedArea=clean(afterArea-beforeArea);
  if(addedArea<E)return unchanged;
  const bounds={minX:rect.minX,minZ:rect.minZ,width:rect.width,depth:rect.depth};
  return {room:{...candidate,bounds},adjustments:[{roomId:candidate.id,bounds:{...bounds},beforeArea,afterArea,addedArea}],addedArea,filled:true};
}
export function createRoom(kind, cx, cz, id, bounds) {
  const definition = KIND_BY_ID.get(kind);
  if (!definition) throw new RangeError(`Unknown room kind: ${kind}`);
  if (definition.core) return { id: 'living', kind: 'living', cx: -1, cz: -1 };
  return { id, kind, cx:cx??(bounds?Math.round(bounds.minX/CELL.width):cx), cz:cz??(bounds?Math.round(bounds.minZ/CELL.depth):cz), ...(bounds ? {bounds:{...bounds}} : {}), floor: { color: definition.floor, material: 'oak' }, wall: { color: definition.wall, material: 'ceramic' } };
}
export function nextRoomId(rooms) {
  let n = rooms.length;
  while (rooms.some(room => room.id === `room-${n}`)) n += 1;
  return `room-${n}`;
}
/** Legacy single-rectangle tiers, expressed as layouts. Old saves migrate through these. */
const deepFreeze = value => { if (value && typeof value === 'object') Object.values(value).forEach(deepFreeze); return Object.freeze(value); };
const preset = (id, label, shortLabel, description, extras) => deepFreeze({ id, label, shortLabel, description,
  rooms: [createRoom('living'), ...extras.map(([kind, cx, cz], index) => createRoom(kind, cx, cz, `room-${index + 1}`))] });
/** Plain, unfrozen copies for engine state. */
export const cloneRooms = rooms => rooms.map(room => ({ ...room, ...(room.bounds ? {bounds:{...room.bounds}} : {}), ...(room.floor ? { floor: { ...room.floor } } : {}), ...(room.wall ? { wall: { ...room.wall } } : {}) }));
export const LAYOUT_PRESETS = Object.freeze([
  preset('starter', "Starter DisplayText1452", "DisplayText1452", "DisplayText1453, DisplayText1454.", []),
  preset('suite', "Suite DisplayText1455", "DisplayText1455", "DisplayText1456.", [['study', 1, -1]]),
  preset('atrium', "Atrium DisplayText1457", "DisplayText1457", "DisplayText1458, DisplayText1459, DisplayText1460.", [['study', 1, -1], ['bedroom', -1, 1], ['gallery', 1, 1]]),
  preset('mansion', "Mansion DisplayText1461", "DisplayText1461", "DisplayText1462: Study, Kitchen, Bedroom, DisplayText0258, DisplayText1433, DisplayText1463.", [['study', 1, -1], ['kitchen', 3, -1], ['bedroom', -1, 1], ['bathroom', 1, 1], ['playroom', 2, 1], ['sunroom', -1, 3], ['gallery', 1, 3]]),
]);
const PRESET_BY_ID = new Map(LAYOUT_PRESETS.map(item => [item.id, item]));
export function getLayoutPreset(id) { return PRESET_BY_ID.get(id) ?? null; }
/** Accepts a rooms array or a legacy tier id and returns a rooms array. */
export function resolveRooms(value) {
  if (Array.isArray(value)) return value;
  return (PRESET_BY_ID.get(value) ?? PRESET_BY_ID.get('starter')).rooms;
}
/** Which legacy tier a layout most resembles, by room count. Used for copy and outdoor unlocks. */
export function describeLayout(rooms) {
  const bounds = layoutBounds(rooms) ?? { width: 0, depth: 0 };
  const count = rooms.length;
  const stage = count >= 5 ? 'mansion' : count >= 3 ? 'atrium' : count >= 2 ? 'suite' : 'starter';
  return { count, stage, width: bounds.width, depth: bounds.depth, bounds, kinds: rooms.map(room => room.kind) };
}
export default ROOM_KINDS;
