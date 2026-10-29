import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getHomeTheme } from './home-theme.js';
import { getRoomTierDefinition, describeRooms, WALL_HEIGHT } from './home-room-expansion.js';
import { getRoomKind, roomRect, roomOuterFaces, CELL, getFloorRects, getFloorBounds } from './home-layout.js';
import { getManorFacadeLayout, getManorDoorWidth, getManorEntranceSteps, MANOR_FACADE_OFFSET } from './home-manor-layout.js';
import { STOREY_HEIGHT } from './home-staircase.js';
import { createWarmGableRoof, WARM_GABLE_COLOR } from './home-roof-gable.js';

const DEFAULT_ROOF = WARM_GABLE_COLOR;
// A was approved as a complete cottage: plain pale walls,
// warm timber doors and terracotta tiles. Share the facade preset with the
// review page so a fresh formal home cannot silently fall back to timber grids.
export const DEFAULT_MANOR_PLANS = Object.freeze({ structure: 1, material: 3, decor: 1, detail: 1 });
const PLAN_KEYS = ['structure', 'material', 'decor', 'detail'];
const clampPlan = value => Math.max(1, Math.min(3, Math.round(Number(value) || 1)));
const normalizePlans = plans => Object.fromEntries(PLAN_KEYS.map(key => [key, clampPlan(plans?.[key] ?? DEFAULT_MANOR_PLANS[key])]));
function normalizeColor(value) {
  try { return `#${new THREE.Color(value || DEFAULT_ROOF).getHexString()}`; } catch { return DEFAULT_ROOF; }
}
function shiftedColor(hex, lightness) {
  const color = new THREE.Color(hex); color.offsetHSL(0, 0, lightness); return `#${color.getHexString()}`;
}
const FACE_NORMALS = Object.freeze({ back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0] });
const SLAB_THICKNESS = .30;

/** Exact rectangular difference: neither partial cells nor an L-shaped void
 * may turn into a roof or a supporting slab. */
function exposedRoofPatches(room, covered) {
  const rect=roomRect(room)??room;
  let remaining=[rect];
  for(const cut of covered)remaining=remaining.flatMap(r=>{
    const x0=Math.max(r.minX,cut.minX),x1=Math.min(r.maxX,cut.maxX),z0=Math.max(r.minZ,cut.minZ),z1=Math.min(r.maxZ,cut.maxZ);
    if(x1<=x0+1e-7||z1<=z0+1e-7)return[r];
    return [
      {minX:r.minX,maxX:x0,minZ:r.minZ,maxZ:r.maxZ},{minX:x1,maxX:r.maxX,minZ:r.minZ,maxZ:r.maxZ},
      {minX:x0,maxX:x1,minZ:r.minZ,maxZ:z0},{minX:x0,maxX:x1,minZ:z1,maxZ:r.maxZ},
    ].filter(p=>p.maxX-p.minX>1e-6&&p.maxZ-p.minZ>1e-6);
  });
  return remaining.map(r=>{
    const overlaps=(a,b,c,d)=>Math.min(b,d)-Math.max(a,c)>1e-7;
    const touches=side=>covered.some(c=>side==='left'?Math.abs(c.maxX-r.minX)<1e-6&&overlaps(c.minZ,c.maxZ,r.minZ,r.maxZ):side==='right'?Math.abs(c.minX-r.maxX)<1e-6&&overlaps(c.minZ,c.maxZ,r.minZ,r.maxZ):side==='back'?Math.abs(c.maxZ-r.minZ)<1e-6&&overlaps(c.minX,c.maxX,r.minX,r.maxX):Math.abs(c.minZ-r.maxZ)<1e-6&&overlaps(c.minX,c.maxX,r.minX,r.maxX));
    const minX=r.minX-(touches('left')?-.10:.18),maxX=r.maxX+(touches('right')?-.10:.18);
    const minZ=r.minZ-(touches('back')?-.10:.18),maxZ=r.maxZ+(touches('front')?-.10:.18);
    return {cx:r.minX/CELL.width,cz:r.minZ/CELL.depth,cols:(r.maxX-r.minX)/CELL.width,rows:(r.maxZ-r.minZ)/CELL.depth,
      rect:r,x:(minX+maxX)/2,z:(minZ+maxZ)/2,width:maxX-minX,depth:maxZ-minZ};
  }).filter(patch=>patch.width>.08&&patch.depth>.08);
}

/**
 * Exterior of the home, generated from the same floor plan as the interior.
 * Every room becomes its own block with the selected tiled gable roof and kind-specific facade
 * features, so adding a kitchen inside adds a chimneyed wing outside.
 *
 * `plans` are independent routes: structure (porch and cornice), material
 * (facade), decor (shutters, planters, crowns) and detail (lamps, finials).
 */
export function createEstateManor({ tier = 'mansion', rooms, floors, plans = {}, color = DEFAULT_ROOF, theme = getHomeTheme() } = {}) {
  const root = new THREE.Group();
  root.name = 'estate-manor';
  root.userData.estateFeature = 'manor';
  const geometries = new Set();
  const materials = new Map();
  let definition, layout, floorLayouts = [], disposed = false, currentRoom = null, currentStorey = 0;
  let customization = { plans: normalizePlans(plans), color: normalizeColor(color) };
  let colors = {};
  function refreshColors() {
    const roof = customization.color;
    colors = {
      wall: theme.manor.wall ?? '#e6c48b', trim: theme.manor.trim ?? '#f3dca7', base: theme.manor.base ?? '#98714c', wood: theme.manor.wood ?? '#8f5839',
      woodWall: '#b8784d', woodLine: '#70432f', stoneWall: '#d6bc91', stoneLine: '#997d5a',
      marbleWall: theme.manor.wall ?? '#f4f0e6', marbleLine: '#d8d1c4', roof, roofDark: shiftedColor(roof, -.18),
      roofEdge: shiftedColor(roof, .14), gold: theme.manor.gold ?? '#dca64e', glass: theme.manor.glass ?? '#426f77', leaf: theme.manor.leaf ?? '#428750',
      flower: theme.manor.flower ?? '#ed8c87', glow: '#ffd778', chimney: '#8c6a57', skylight: '#9fd0dd',
    };
  }
  refreshColors();
  function mat(color, options = {}) {
    const key = `${color}:${JSON.stringify(options)}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .7, ...options }));
    return materials.get(key);
  }
  function add(g, color, pos, parent = root, options) {
    geometries.add(g);
    const mesh = new THREE.Mesh(g, mat(color, options));
    mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { roomId: currentRoom?.id ?? null, storey: currentStorey, buildingPart: 'decoration' };
    parent.add(mesh); return mesh;
  }
  function box(size, color, pos, r = .07, parent, options) {
    return add(new RoundedBoxGeometry(...size, 2, Math.min(r, ...size.map(v => v / 2))), color, pos, parent, options);
  }
  function ball(color, pos, size, parent) { const mesh = add(new THREE.SphereGeometry(1, 12, 10), color, pos, parent); mesh.scale.set(...size); return mesh; }
  function column(r, h, color, pos, parent) { return add(new THREE.CylinderGeometry(r, r * 1.08, h, 12), color, pos, parent); }
  function gableRoof(w, d, h, pos, rotate = false) {
    const group = createWarmGableRoof({ width: w, depth: d, height: h, color: colors.roof });
    group.position.set(...pos); if (rotate) group.rotation.y = Math.PI / 2; root.add(group);
    Object.assign(group.userData, { ridgeHeight: h, roomId: currentRoom?.id ?? null, storey: currentStorey });
    group.name = `manor-roof:${currentStorey}:${currentRoom?.id ?? 'porch'}`;
    // The manor owns every roof resource, including on setFloors / paint rebuilds.
    group.traverse(node => {
      if (!node.isMesh) return;
      geometries.add(node.geometry); materials.set(node.material.uuid, node.material);
      Object.assign(node.userData, { roomId: currentRoom?.id ?? null, storey: currentStorey });
    });
    return group;
  }
  function arch(w, h) {
    const radius = w / 2, shape = new THREE.Shape();
    shape.moveTo(-radius, 0); shape.lineTo(radius, 0); shape.lineTo(radius, h - radius);
    shape.absarc(0, h - radius, radius, 0, Math.PI, false); shape.closePath(); return shape;
  }
  /** Group positioned on a facade: local +z points out of the wall. */
  function facadeGroup(x, y, z, side) {
    const group = new THREE.Group(); group.position.set(x, y, z);
    group.rotation.y = { front: 0, back: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 }[side]; root.add(group); return group;
  }
  function windowAt(group, scale = 1, options = {}) {
    const g = new THREE.Group(); g.scale.setScalar(scale); group.add(g);
    g.userData = { roomId: currentRoom?.id ?? null, storey: currentStorey, buildingPart: 'window' };
    if (options.round) {
      add(new THREE.TorusGeometry(.42, .08, 8, 24), colors.trim, [0, .55, .06], g);
      add(new THREE.CircleGeometry(.4, 24), options.color ?? colors.glass, [0, .55, .07], g);
      if (options.cross) { box([.06, .78, .04], colors.gold, [0, .55, .1], .01, g); box([.78, .06, .04], colors.gold, [0, .55, .1], .01, g); }
      return g;
    }
    const height = options.tall ? 1.95 : 1.52, width = options.tall ? 1.0 : 1.12;
    add(new THREE.ExtrudeGeometry(arch(width, height), { depth: .14, bevelEnabled: true, bevelSize: .045, bevelThickness: .04, bevelSegments: 2, steps: 1, curveSegments: 12 }), colors.trim, [0, 0, -.07], g);
    add(new THREE.ShapeGeometry(arch(width - .26, height - .27), 16), options.color ?? colors.glass, [0, .12, .12], g);
    box([.065, height - .44, .06], colors.gold, [0, height / 2 - .03, .15], .018, g);
    box([width - .25, .055, .06], colors.trim, [0, height * .44, .15], .01, g);
    box([width + .18, .16, .35], colors.base, [0, -.08, .07], .04, g);
    if (options.shutters) for (const sign of [-1, 1]) {
      box([.23, height - .4, .12], colors.roof, [sign * (width / 2 + .16), height * .4, .025], .045, g);
      for (const yy of [.3, .52, .74, .96]) box([.19, .035, .05], colors.roofEdge, [sign * (width / 2 + .16), yy, .1], .008, g);
    }
    return g;
  }
  function planter(group, width = 1.7, y = .35, z = .34) {
    box([width, .37, .55], colors.wood, [0, y, z], .1, group);
    for (let i = 0; i < 5; i++) {
      const px = (i - 2) * width / 5;
      ball(colors.leaf, [px, y + .26, z], [.26, .22, .28], group); ball(i % 2 ? colors.flower : '#f4cd70', [px, y + .46, z], [.14, .15, .13], group);
    }
  }
  function wallLamp(group, x, y, large = false) {
    const arm = box([.10, .32, .10], colors.gold, [x, y, .05], .025, group); arm.rotation.z = Math.sign(x || 1) * .25;
    box([large ? .28 : .18, large ? .34 : .24, large ? .22 : .16], colors.gold, [x, y - .03, .12], .05, group);
    ball(colors.glow, [x, y - .03, .2], large ? [.11, .15, .09] : [.075, .10, .06], group);
    const light = new THREE.PointLight(colors.glow, large ? 1.1 : .55, large ? 4.2 : 2.8, 2); light.position.set(x, y, .3); group.add(light);
  }
  function facadePattern(group, width, wallH, style) {
    if (style === 1) {
      for (let y = .62; y < wallH - .1; y += .42) box([width - .22, .045, .045], colors.woodLine, [0, y, .035], .012, group);
      for (let x = -width / 2 + .32; x < width / 2 - .1; x += .74) box([.045, wallH - .5, .05], colors.woodLine, [x, wallH / 2 + .1, .036], .012, group);
    } else if (style === 2) {
      for (let y = .66; y < wallH - .1; y += .52) {
        box([width - .2, .042, .045], colors.stoneLine, [0, y, .038], .01, group);
        const offset = Math.round(y * 10) % 2 ? .34 : 0;
        for (let x = -width / 2 + .28 + offset; x < width / 2 - .1; x += .9) box([.042, .48, .05], colors.stoneLine, [x, y - .25, .04], .01, group);
      }
    }
    // The cream facade stays plain; its eave, base and window frames provide
    // the edges without drawing a second grid over the wall surface.
  }
  function door(group, wallH, structure, decor, detail, facadeLength) {
    const doorH = structure === 3 ? 2.45 : structure === 2 ? 2.05 : 1.76, doorW = getManorDoorWidth(structure);
    add(new THREE.ExtrudeGeometry(arch(doorW + .36, doorH + .20), { depth: .24, bevelEnabled: true, bevelSize: .035, bevelThickness: .035, bevelSegments: 2, steps: 1, curveSegments: 16 }), colors.trim, [0, 0, .02], group);
    add(new THREE.ShapeGeometry(arch(doorW, doorH), 16), colors.wood, [0, .08, .31], group);
    for (const sign of [-1, 1]) { box([.045, doorH * .72, .045], colors.gold, [sign * doorW * .34, doorH * .40 + .16, .34], .01, group); ball(colors.gold, [sign * .15, doorH * .44 + .11, .38], [.055, .075, .06], group); }
    for (const step of getManorEntranceSteps(structure)) {
      const model = box([step.width, step.height, step.depth], colors.trim, [step.x, step.y, step.z], .045, group);
      model.userData.buildingPart = 'entrance-step';
    }
    if (structure >= 2) {
      const columnX = Math.min(1.6, facadeLength / 2 - .30);
      for (const sign of [-1, 1]) { column(.13, 2.45, colors.trim, [sign * columnX, 1.25, .88], group); box([.40, .15, .40], colors.gold, [sign * columnX, .12, .88], .04, group); box([.39, .14, .39], colors.gold, [sign * columnX, 2.48, .88], .04, group); }
      const porch = gableRoof(columnX*2+.55, 1.45, structure === 3 ? .46 : .34, [0, 0, 0]); root.remove(porch); group.add(porch); porch.position.set(0, 2.58, .85);
      porch.userData.buildingPart = 'porch'; porch.traverse(node=>{if(node.isMesh)node.userData.buildingPart='porch';});
    }
    if (decor >= 3) {
      const crown = add(new THREE.ExtrudeGeometry(arch(Math.min(doorW + 1.3, 3.15), 1.28), { depth: .10, bevelEnabled: true, bevelSize: .03, bevelThickness: .03, bevelSegments: 2, steps: 1, curveSegments: 16 }), colors.trim, [0, wallH * .55, .09], group);
      crown.scale.set(1, .82, 1); ball(colors.gold, [0, wallH * .9, .17], [.29, .36, .09], group);
      for (const sign of [-1, 1]) { ball(colors.leaf, [sign * doorW * .9, wallH * .5, .13], [.15, .36, .12], group); ball(colors.leaf, [sign * doorW * .95, wallH * .76, .13], [.13, .30, .11], group); }
    }
    if (detail >= 2) { wallLamp(group, -doorW * .85, wallH * .58, detail >= 3); wallLamp(group, doorW * .85, wallH * .58, detail >= 3); }
    if (detail >= 3) {
      for (const sign of [-1, 1]) {
        const x = sign * (doorW + .9); box([.22, 1.6, .22], colors.gold, [x, .55, 1.25], .04, group); box([.34, .4, .34], colors.gold, [x, 1.5, 1.25], .08, group); box([.22, .26, .22], colors.glow, [x, 1.5, 1.25], .04, group, { emissive: colors.glow, emissiveIntensity: .6 });
        const light = new THREE.PointLight(colors.glow, 1.5, 5.2, 2); light.position.set(x, 1.6, 1.3); group.add(light);
      }
      box([.9, .3, .05], colors.gold, [0, doorH + .55, .36], .02, group); box([.78, .18, .02], '#473f38', [0, doorH + .55, .39], .01, group);
    }
    return doorW;
  }
  function roomFacades(roomsList, room, rect, ox, oz, baseY, wallH, structure, materialPlan, decor, detail, entrance) {
    const kind = getRoomKind(room.kind);
    for (const face of roomOuterFaces(roomsList, room)) {
      const [nx, nz] = FACE_NORMALS[face.side], length = face.to - face.from, mid = (face.from + face.to) / 2;
      const x = (nx === 0 ? mid : (nx > 0 ? rect.maxX : rect.minX)) + ox, z = (nz === 0 ? mid : (nz > 0 ? rect.maxZ : rect.minZ)) + oz;
      const group = facadeGroup(x + nx * MANOR_FACADE_OFFSET, baseY, z + nz * MANOR_FACADE_OFFSET, face.side);
      group.userData = { roomId: room.id, storey: currentStorey, buildingPart: 'facade', side: face.side };
      facadePattern(group, length, wallH, materialPlan);
      const isEntrance = !!entrance && entrance.room === room && entrance.face.side === face.side && entrance.face.from === face.from;
      if (isEntrance) { door(group, wallH, structure, decor, detail, length); continue; }
      const front = face.side === 'front' || face.side === 'right';
      if ((kind.baseKind ?? kind.id) === 'sunroom') {
        for (let i = 0; i < 3; i++) box([length / 3 - .12, wallH - .7, .06], colors.skylight, [-length / 3 + i * length / 3, wallH / 2 + .05, .04], .02, group, { transparent: true, opacity: .7, roughness: .18 });
        for (let i = 0; i <= 3; i++) box([.07, wallH - .6, .09], colors.trim, [-length / 2 + .08 + i * (length - .16) / 3, wallH / 2 + .05, .05], .01, group);
        box([length - .1, .07, .09], colors.trim, [0, wallH - .32, .06], .01, group);
      } else if ((kind.baseKind ?? kind.id) === 'bathroom') windowAt(group, .72, { round: true, color: '#cfe6ea' }).position.set(0, wallH * .42, 0);
      else if ((kind.baseKind ?? kind.id) === 'playroom') windowAt(group, 1.05, { round: true, cross: true, color: '#f1c860' }).position.set(0, wallH * .38, 0);
      else if ((kind.baseKind ?? kind.id) === 'study') windowAt(group, .78, { tall: true, shutters: decor >= 2 }).position.set(0, .55, 0);
      else if ((kind.baseKind ?? kind.id) === 'gallery') { for (const sx of [-length * .25, length * .25]) windowAt(group, .5).position.set(sx, wallH * .5, 0); }
      else if ((kind.baseKind ?? kind.id) === 'hallway') windowAt(group, .55).position.set(0, wallH * .45, 0);
      else {
        const count = length > 4.5 ? 2 : 1;
        for (let i = 0; i < count; i++) windowAt(group, structure === 3 ? .88 : structure === 2 ? .78 : .7, { shutters: decor >= 2 }).position.set(count === 1 ? 0 : (i - .5) * length * .45, .72, 0);
      }
      if (decor >= 2 && front && (kind.baseKind ?? kind.id) !== 'sunroom') planter(group, Math.max(1.0, Math.min(2.2, length * .4)), .35, .38);
      if (decor >= 3 && front) for (const sx of [-length / 2 + .35, length / 2 - .35]) { ball(colors.leaf, [sx, .5, .45], [.3, .34, .3], group); ball(colors.flower, [sx, .78, .45], [.12, .12, .12], group); }
      if (detail >= 2 && front && (kind.baseKind ?? kind.id) !== 'sunroom') wallLamp(group, -length / 2 + .4, wallH * .62, detail >= 3);
      if (detail >= 3 && front) for (let i = 0; i < Math.floor(length / .5); i++) ball(colors.glow, [-length / 2 + .35 + i * .5, wallH + .18, .12], [.05, .05, .05], group).material = mat(colors.glow, { emissive: colors.glow, emissiveIntensity: .7 });
    }
  }
  /** Any purchased floor, including the ground floor, owns its enclosing shell. Interior partitions
   * never change this outside silhouette or invent free functional rooms. */
  function buildFloorShell(home,{baseY,ox,oz,covered,wallColor,structure,materialPlan,decor,detail,onRoof}) {
    currentRoom=null;
    for(const rect of getFloorRects(home)) {
      const width=rect.maxX-rect.minX,depth=rect.maxZ-rect.minZ,x=(rect.minX+rect.maxX)/2+ox,z=(rect.minZ+rect.maxZ)/2+oz;
      const slab=box([width,SLAB_THICKNESS,depth],currentStorey===0?colors.base:colors.trim,[x,baseY-SLAB_THICKNESS/2,z],.025);slab.userData.buildingPart='floor-slab';
      const body=box([width,WALL_HEIGHT,depth],wallColor,[x,baseY+WALL_HEIGHT/2,z],.025);body.userData.buildingPart='shell-volume';
      for(const patch of exposedRoofPatches(rect,covered)) {
        const px=patch.x+ox,pz=patch.z+oz,roofH=Math.min(1.34,Math.min(patch.rect.maxX-patch.rect.minX,patch.rect.maxZ-patch.rect.minZ)*.24),roofBase=baseY+WALL_HEIGHT+.08;
        const rotate=patch.depth>patch.width,roof=gableRoof(rotate?patch.depth:patch.width,rotate?patch.width:patch.depth,roofH,[px,roofBase,pz],rotate);
        roof.userData.patch={...patch.rect};roof.userData.shell=true;
        onRoof({y:roofBase+roofH,x:px,z:pz,room:null,storey:currentStorey});
      }
    }
    const layout = getManorFacadeLayout(home);
    const entrance = currentStorey === 0 ? layout.entrance?.face : null;
    for(const { face } of layout.faces) {
      const [nx,nz]=FACE_NORMALS[face.side],length=face.to-face.from,mid=(face.from+face.to)/2;
      const x=(nx===0?mid:face.at)+ox,z=(nz===0?mid:face.at)+oz;
      const group=facadeGroup(x+nx*MANOR_FACADE_OFFSET,baseY,z+nz*MANOR_FACADE_OFFSET,face.side);
      group.userData={roomId:null,storey:currentStorey,buildingPart:'facade',side:face.side,shell:true};
      facadePattern(group,length,WALL_HEIGHT,materialPlan);
      if(face===entrance){door(group,WALL_HEIGHT,structure,decor,detail,length);group.userData.entrance=true;}
      else if(length>=.7) {
        const scale=Math.min(structure===3?.88:structure===2?.78:.7,(length-.12)/(decor>=2?1.67:1.30));
        windowAt(group,scale,{shutters:decor>=2}).position.set(0,.72,0);
      }
      box([length,.13,.12],colors.trim,[0,.075,.015],.025,group);
      box([length,.15,.16],colors.trim,[0,WALL_HEIGHT-.04,.015],.025,group);
      if(face!==entrance&&decor>=2&&(face.side==='front'||face.side==='right'))planter(group,Math.min(1.7,length*.5),.35,.38);
      if(face!==entrance&&detail>=2&&length>1)wallLamp(group,-length/2+.35,WALL_HEIGHT*.62,detail>=3);
    }
  }
  function build(value, nextFloors) {
    if (nextFloors !== undefined) {
      if (!Array.isArray(nextFloors) || !nextFloors.length || nextFloors.some(home => !home || !Array.isArray(home.rooms) || !getFloorBounds(home))) {
        throw new TypeError('A manor floor requires real rooms or a nonempty slab');
      }
      floorLayouts = nextFloors.map(home => {const bounds=getFloorBounds(home);return {...describeRooms(home.rooms),home,bounds,width:bounds.width,depth:bounds.depth};});
    } else {const legacy=describeRooms(value);floorLayouts=[{...legacy,home:{rooms:legacy.rooms}}];}
    geometries.forEach(geometry => geometry.dispose()); geometries.clear(); materials.forEach(material => material.dispose()); materials.clear(); root.clear(); refreshColors();
    layout = floorLayouts[0];
    const totalRooms = floorLayouts.reduce((sum, floor) => sum + floor.rooms.length, 0);
    const id = totalRooms >= 5 ? 'mansion' : totalRooms >= 3 ? 'atrium' : totalRooms >= 2 ? 'suite' : 'starter';
    definition = { id, width: layout.width, depth: layout.depth, rooms: layout.rooms, floorCount: floorLayouts.length };
    const { structure, material: materialPlan, decor, detail } = customization.plans;
    const w = layout.width, d = layout.depth, ox = -layout.bounds.x, oz = -layout.bounds.z;
    const wallH = WALL_HEIGHT;
    const wallColor = materialPlan === 1 ? colors.woodWall : materialPlan === 2 ? colors.stoneWall : colors.marbleWall;
    const entrance = getManorFacadeLayout(layout.home).entrance;
    let highest = { y: 0, x: 0, z: 0, room: layout.rooms[0], storey: 0 };
    const provenance = [];
    for (let storey = 0; storey < floorLayouts.length; storey++) {
      const roomsList = floorLayouts[storey].rooms, baseY = storey * STOREY_HEIGHT;
      // Only the immediately adjacent purchased level closes this level's
      // roof. Expanding a lower footprint never resizes a purchased upper one.
      const covered = floorLayouts[storey + 1] ? getFloorRects(floorLayouts[storey + 1].home) : [];
      currentStorey = storey;
      provenance.push({ storey, baseY, wallHeight: WALL_HEIGHT, slabThickness: SLAB_THICKNESS, rooms: roomsList, roomCount: roomsList.length, slab:floorLayouts[storey].home.slab??null, footprint:getFloorRects(floorLayouts[storey].home) });
      if(floorLayouts[storey].home.slab) {
        buildFloorShell(floorLayouts[storey].home,{baseY,ox,oz,covered,wallColor,structure,materialPlan,decor,detail,onRoof:entry=>{if(entry.y>highest.y)highest=entry;}});
        continue;
      }
      for (const room of roomsList) {
        currentRoom = room;
        const kind = getRoomKind(room.kind), baseKind = kind.baseKind ?? kind.id, rect = roomRect(room);
        const x = rect.x + ox, z = rect.z + oz, rw = rect.width - .04, rd = rect.depth - .04;
        // Every physical slab and wall volume belongs to one actual room.
        // There is deliberately no full-house bounding-box foundation or belt.
        const slab = box([rect.width + .14, SLAB_THICKNESS, rect.depth + .14], storey === 0 ? colors.base : colors.trim, [x, baseY - SLAB_THICKNESS / 2, z], .06);
        slab.userData.buildingPart = 'floor-slab';
        const volume = box([rw, wallH, rd], wallColor, [x, baseY + wallH / 2, z], .05);
        volume.userData.buildingPart = 'wall-volume';
        box([rw + .08, .13, rd + .08], colors.trim, [x, baseY + .075, z], .035);
        box([rw + .10, structure === 3 ? .22 : .13, rd + .10], colors.trim, [x, baseY + wallH - .045, z], .035);
        const patches = exposedRoofPatches(room, covered);
        for (const patch of patches) {
          const px = patch.x + ox, pz = patch.z + oz;
          const roofH = Math.min(1.34, Math.min(patch.rect.maxX - patch.rect.minX, patch.rect.maxZ - patch.rect.minZ) * .24);
          const rotate = patch.depth > patch.width, roofBase = baseY + wallH + .08;
          const roof = gableRoof(rotate ? patch.depth : patch.width, rotate ? patch.width : patch.depth, roofH, [px, roofBase, pz], rotate);
          roof.userData.patch = { cx: patch.cx, cz: patch.cz, cols: patch.cols, rows: patch.rows };
          if (roofBase + roofH > highest.y) highest = { y: roofBase + roofH, x: px, z: pz, room, storey };
          // Functional roof details occur only on exposed roofs. No bedroom
          // dormer, phantom attic, level-driven second storey or tower exists.
          if (baseKind === 'kitchen') {
            const cx = px + patch.width * .21, cz = pz - patch.depth * .12;
            box([.44, roofH + .62, .44], colors.chimney, [cx, roofBase + roofH * .5 + .25, cz], .035);
            box([.59, .13, .59], colors.trim, [cx, roofBase + roofH + .60, cz], .025);
            box([.35, .035, .35], '#473f38', [cx, roofBase + roofH + .68, cz], .008);
          }
          if (baseKind === 'gallery' || baseKind === 'sunroom') {
            const count = patch.cols >= 2 ? 3 : 1;
            for (let i = 0; i < count; i++) {
              const sx = count === 1 ? 0 : (i - (count - 1) / 2) * patch.width * .25;
              const sky = box([.55, .07, .55], colors.skylight, [px + sx, roofBase + roofH * .55, pz + patch.depth * .22], .02, undefined, { roughness: .2 });
              sky.rotation.x = -Math.atan2(roofH, patch.depth / 2) * .8;
              const frame = box([.63, .04, .63], colors.trim, [px + sx, roofBase + roofH * .55 - .04, pz + patch.depth * .22], .012); frame.rotation.x = sky.rotation.x;
            }
          }
          if (baseKind === 'playroom') {
            column(.025, .64, colors.gold, [px, roofBase + roofH + .28, pz]);
            const flag = box([.45, .25, .03], '#ee8f7e', [px + .21, roofBase + roofH + .52, pz], .015); flag.rotation.z = -.1;
          }
        }
        roomFacades(roomsList, room, rect, ox, oz, baseY, wallH, structure, materialPlan, decor, detail, storey === 0 ? entrance : null);
        // Eave ornament follows the real room's exterior edges; never cover
        // an unbuilt courtyard with a single oversized horizontal slab.
        if (detail >= 2) for (const face of roomOuterFaces(roomsList, room)) {
          const [nx,nz] = FACE_NORMALS[face.side], length = face.to - face.from, mid = (face.from + face.to) / 2;
          const fx = (nx === 0 ? mid : nx > 0 ? rect.maxX : rect.minX) + ox;
          const fz = (nz === 0 ? mid : nz > 0 ? rect.maxZ : rect.minZ) + oz;
          const belt = box(nx === 0 ? [length,.12,.14] : [.14,.12,length], detail >= 3 ? colors.gold : '#e07a62', [fx + nx * .04,baseY + wallH - .16,fz + nz * .04], .025);
          belt.userData.buildingPart = 'cornice';
        }
      }
    }
    currentRoom = highest.room; currentStorey = highest.storey;
    if (detail >= 3) {
      column(.028,.55,colors.gold,[highest.x,highest.y+.34,highest.z]);
      const vane=box([.55,.04,.04],colors.gold,[highest.x,highest.y+.60,highest.z],.008);vane.rotation.y=.6;
      add(new THREE.ConeGeometry(.09,.23,4),colors.gold,[highest.x+.25*Math.cos(.6),highest.y+.60,highest.z-.25*Math.sin(.6)]).rotation.z=-Math.PI/2;
    }
    if (decor >= 2) {
      column(.025,.54,colors.gold,[highest.x+.6,highest.y+.25,highest.z+.18]);
      const banner=box([.48,.25,.03],'#dd8b61',[highest.x+.82,highest.y+.42,highest.z+.18],.018);banner.rotation.z=-.09;
    }
    currentRoom = null; currentStorey = 0;
    root.userData.manorTier = definition.id; root.userData.manorDefinition = definition;
    root.userData.manorRooms = layout.rooms; root.userData.manorFloors = provenance;
    root.userData.manorPlans = { ...customization.plans }; root.userData.manorColor = customization.color;
    root.updateMatrixWorld(true);
    const physicalBounds = new THREE.Box3().setFromObject(root);
    root.userData.manorDimensions = { width:w, depth:d, height:physicalBounds.max.y-physicalBounds.min.y, floorCount:provenance.length };
    const roofMaterials = new Set([...materials.values()].filter(m=>`#${m.color.getHexString()}`===colors.roof));
    root.traverse(node=>{if(node.isMesh&&node.userData.paintSurface==='roof')roofMaterials.add(node.material);});
    root.userData.paintMaterials = { roof:[...roofMaterials], wall:[...materials.values()].filter(m=>`#${m.color.getHexString()}`===wallColor) };
    root.userData.estateFeature = 'manor';
    root.traverse(o=>{if(o.isMesh)o.userData.estateFeature='manor';});
  }
  build(rooms ?? tier, floors);
  root.setTier = value => { if(disposed)throw new Error('Cannot change a disposed manor'); build(getRoomTierDefinition(value).id); return root; };
  root.setRooms = value => { if(disposed)throw new Error('Cannot change a disposed manor'); build(value); return root; };
  root.setFloors = value => { if(disposed)throw new Error('Cannot change a disposed manor'); build(undefined,value); return root; };
  root.setCustomization = ({ tier:nextTier, rooms:nextRooms, floors:nextFloors, plans:nextPlans, color:nextColor } = {}) => {
    if(disposed)throw new Error('Cannot change a disposed manor');
    customization={ plans:normalizePlans(nextPlans?{...customization.plans,...nextPlans}:customization.plans), color:nextColor===undefined?customization.color:normalizeColor(nextColor) };
    if(nextFloors!==undefined)build(undefined,nextFloors);
    else if(nextRooms!==undefined||nextTier!==undefined)build(nextRooms??nextTier);
    else build(undefined,floorLayouts.map(floor=>floor.home));
    return root;
  };
  root.getCustomization = () => ({ tier: definition.id, plans: { ...customization.plans }, color: customization.color });
  root.getDefinition = () => definition;
  root.dispose = () => { if (disposed) return; disposed = true; geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); geometries.clear(); materials.clear(); root.clear(); };
  return root;
}

export default createEstateManor;
