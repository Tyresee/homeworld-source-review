import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getDecalBounds, getFurnitureBounds, getFurnitureFootprint, getPlacementFootprint, getPlacementBounds, getTableFootprint, findHomeCollision, getHomeCandidateVolume, getPropBounds, findFurnitureRoom, findRoomAt, parseRoomSurfaceId, describeLayout, LAYOUT_PRESETS, getFurniturePose, getFurnitureMountBounds, getWallMountTargets, getFurniturePlacement } from './home-engine.js';
import { createLuxuryItem } from './home-luxury-models.js';
import { createStaticUpgrade, STATIC_UPGRADE_SURFACES } from './home-static-upgrades.js';
import { getWallAttachmentOffset, STARTER_WALL_BLOCKS } from './home-building-collision.js';
import { createRoomExpansion } from './home-room-expansion.js';
import {resolveHomeFloorFinish} from './home-floor-finishes.js';
import {createHomeFloorTextureManager} from './home-floor-textures.js';
import {getDefaultFloorAppearance} from './home-engine.js';
import { getFloorBounds, floorContainsRect, hasStarterRoom } from './home-layout.js';
import { createEstateOutdoor, getEstateForRoomCount } from './home-estate-outdoor.js';
import { createOutdoorWorld } from './home-outdoor-world.js';
import { getOutdoorProduct } from './home-outdoor-catalog.js';
import { createOutdoorProductModel } from './home-outdoor-models.js';
import { getOutdoorLandBounds, getOutdoorItemBounds, validateOutdoorPlacement } from './home-outdoor-placement.js';
import { createEstateManor } from './home-estate-manor.js';
import { captureHomeFloor, createHouseOverview } from './home-house-overview.js';
import { frameHomeCamera, panHomeCamera } from './home-scene-framing.js';
import { boundedZoom, wheelZoom, pinchZoom, cameraProgress, DRAG_THRESHOLD, CAMERA_TRANSITION_MS } from './home-camera-input.js';
import { createHomeFeedback } from './home-feedback.js';
import { createStageLighting } from './student-home-stage-lighting.js';
import { createStageCamera } from './student-home-stage-camera.js';
import { createStageFraming } from './student-home-stage-framing.js';
import { createSofaFabricMaps } from './home-sofa-fabrics.js';
import { freezePlacementAnchor, getFurniturePlacementAtAnchor } from './home-context-placement.js';
import { getFurnitureTableSupport, getFurnitureTableUV } from './home-item-placement.js';
import { createStaircase, splitFloorAroundOpening, clipFloorMeshToOpening, getHomeStairs, getStaircaseSurfaceId } from './home-staircase.js';
import { createAvatarController } from './home-avatar-controller.js';
import { commitHomePlacement } from './home-placement-commit.js';
import {getHomeTheme,getHomeSurfaceAppearance,getRoomTheme} from './home-theme.js';

const WALL_WIDTH = 5.6, WALL_HEIGHT = 2.85, TABLE_WIDTH = 2.25, TABLE_DEPTH = 1.35, TABLE_Y = 1.12;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** One continuous warm finish layer. The texture owns board/tile seams;
 * clipping the mesh keeps a real upper-floor opening without new strip joints. */
export function createWarmStarterFloorSurface(stairs=null) {
  const floor=new THREE.Mesh(new RoundedBoxGeometry(5.6,.07,5.2,3,.012),new THREE.MeshStandardMaterial({color:'#e7cfaa',roughness:.76}));
  floor.name='starter-floor-surface';floor.position.set(0,.025,0);floor.castShadow=true;floor.receiveShadow=true;
  clipFloorMeshToOpening(floor,stairs);return floor;
}

/** Build every real connection on the selected floor. Kept independent of
 * WebGL so floor targets and the cutaway can be verified with real geometry. */
export function createFloorStaircaseGroup(home, activeFloor = 0) {
  const group = new THREE.Group(); group.name = 'floor-staircases';
  for (const stairs of getHomeStairs(home)) {
    const model = createStaircase(stairs), surfaceId = getStaircaseSurfaceId(stairs);
    const target = activeFloor + (stairs.direction === 'up' ? 1 : -1);
    model.userData = {...model.userData, surfaceId, storeyTarget:target};
    // One shaft spans both real storeys. Capture it from its lower floor only;
    // the upstairs counterpart remains visible and interactive in single-floor view.
    if(stairs.type==='elevator'&&stairs.direction==='down')model.userData.overviewExclude=true;
    model.traverse(object => {
      if (object.isMesh) Object.assign(object.userData,{surfaceId,stairId:stairs.id,storeyTarget:target});
    });
    group.add(model);
  }
  return group;
}

/** Route transient robot lift frames only to the current floor's live models.
 * Reset messages deliberately park every car: a previous trip must not leave
 * a door open after interruption, a student change or a floor rebuild. */
export function applyFloorElevatorFrame(group, frame) {
  let changed = false;
  for (const model of group?.children ?? []) {
    const update = model.userData.setElevatorFrame;
    if (typeof update !== 'function') continue;
    if (!frame || frame.reset) changed = update({}) || changed;
    else if (model.userData.stairId === frame.stairId) changed = update(frame) || changed;
  }
  return changed;
}

// Each editable part owns its material. Appearance changes never mutate a shared asset.
export function createHomeScene({ container, onSelect, onObjectClick, onEstateSelect, onEstateFocus, onEstateViewChange, onStoreyChange, onOutdoorMove, onDrag, onCancel, onObjectEdit, onPlacementPreview, onPlacementCommit, onPlacementReject, onPlacementCancel, onContextMenu, onPanStart, onAvatarClick, onAvatarStatus, onAvatarActivityChange, onAvatarObjectAction, onAvatarObjectPresentation, onBeforeModelRelease, onStageCameraChange, avatarFactory = createAvatarController, floorClickWalk = false, theme = getHomeTheme(), onRenderSetup }) {
  const lighting=theme.lighting.editor??{};
  const floorTextures=theme.id==='warm'?createHomeFloorTextureManager():null;
  const scene = new THREE.Scene();
  const originalBackdrop=container.style.background;
  if(theme.id==='warm'&&theme.backdrop)container.style.background=`radial-gradient(ellipse at 45% 42%,${theme.backdrop.inner},${theme.backdrop.outer})`;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  // A retina display at DPR 2 quadruples the canvas pixels while the scene is
  // still being projected into the same classroom-sized panel. Capping at
  // 1.5 keeps the isometric edges crisp and leaves headroom for dragging.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // The estate is static while the teacher pans it. Updating a 2048px shadow
  // map on every pointer frame wastes the drag budget; scene mutations mark it
  // dirty and the next render refreshes it once.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = lighting.toneMapping==='neutral'?THREE.NeutralToneMapping:lighting.toneMapping==='agx'?THREE.AgXToneMapping:THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = lighting.exposure??1.1;
  renderer.domElement.setAttribute('aria-label', "DisplayText2742");
  renderer.domElement.style.touchAction = 'none';
  container.prepend(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-6, 6, 4, -4, .1, 70);
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  if(theme.id==='warm'&&Number.isFinite(lighting.environmentIntensity))scene.environmentIntensity=lighting.environmentIntensity;
  const root = new THREE.Group(), table = new THREE.Group();
  scene.add(root); root.add(table);
  const parts = new Map(), pickables = [], dynamic = new THREE.Group(); root.add(dynamic);
  const roomPickables = new Set(), starterShell = new THREE.Group(); starterShell.name = 'starter-envelope'; root.add(starterShell);
  let roomExpansion, estateOutdoor, estateManor, staircase = null, staircaseKey = '';
  let floorHomes = null, activeFloor = 0;
  let outdoorState = null; const outdoorWorld=createOutdoorWorld(); root.add(outdoorWorld); outdoorWorld.visible=false;
  const estateFeature = id => id==='manor' ? estateManor : outdoorState ? outdoorWorld.getFeature(id) : estateOutdoor.getFeature(id);
  let houseOverview = null, houseOverviewKey = '', houseMode = 'exterior', capturingHouse = false;
  const houseLabels = document.createElement('div'); houseLabels.className = 'house-floor-labels'; houseLabels.hidden = true; container.append(houseLabels);
  let houseLabelAnchors = [];
  const floorCameraPoses = new Map();
  const textures = [], ownedMaterials = new Set(), ownedGeometries = new Set();
  // `rooms` is the live floor plan; the living room's shell is hand-built below
  // and the expansion group draws every room added to it.
  let state, selected = 'wall.inner', tool = 'paint', rooms = LAYOUT_PRESETS[0].rooms, layoutKey = JSON.stringify(rooms.map(r => [r.id, r.kind, r.cx, r.cz])), angle = Math.PI / 4, zoom = .94;
  const standaloneFloor = () => !!state?.slab && !hasStarterRoom(state);
  const roomStage = () => {const stage=describeLayout(rooms),bounds=getFloorBounds(state??{rooms});return {...stage,bounds,width:bounds?.width??0,depth:bounds?.depth??0};};
  let starterSurfaceParts=null;
  const groundHome = () => floorHomes?.[0] ?? state ?? {rooms};
  const groundRooms = () => groundHome().rooms;
  const exteriorFloors = () => floorHomes ?? [state ?? {rooms}];
  let dragging = null, scheduled = false, disposed = false, renderFrame = 0;
  let view = 'interior', estateFocus = null, requestedFocus = null, estateLevels = {manor:3};
  const estatePan = new THREE.Vector3();
  const cameraPan = estatePan;
  let cameraMotion = null, cameraAnimation = 0, overviewPose = null, lastPanAt = -Infinity;
  let lastCameraBounds = null;
  let dragQualityReduced = false;
  let furniturePlacement = null, placementFrame = 0, placementPointer = null, lastPlacementAt = -Infinity;
  let spaceHeld = false, spaceUsedForPan = false, lastPointerEvent = null;
  let lifeMode = false;
  const touchPoints = new Map();
  let pinchDistance = null;
  const dynamicItems = new Map(), upgradeItems = new Map();
  const anchorProjectionPoint = new THREE.Vector3();

  let stageLighting=null,stageCamera=null,stageCameraTime=0,lastStageCameraFrame=null,stageFacingBound=false;
  function render() {
    scheduled=false;renderFrame=0;if(disposed)return;
    const now=performance.now();
    let stage=view==='interior'?avatarActor.getStageState?.():{active:false,requested:false};
    if(!document.hidden){
      // The robot's +Z front faces the orthographic view direction, not the
      // last segment of its walking route. Bind once, not on each orbit frame.
      if(stage?.requested&&!stageFacingBound){stageFacingBound=true;avatarActor.setDanceFacing?.(angle);stage=avatarActor.getStageState?.()??stage;}
      else if(!stage?.requested)stageFacingBound=false;
    }
    // Camera time pauses with the tab. A long background interval must not
    // become a sudden orbit jump when the classroom view becomes visible.
    if(document.hidden)lastStageCameraFrame=null;
    else{stageCameraTime+=lastStageCameraFrame===null?0:Math.min(64,Math.max(0,now-lastStageCameraFrame));lastStageCameraFrame=now;}
    const filming=!document.hidden&&stageCamera?.update(stage,stageCameraTime);
    const fading=stageLighting?.update(stage,now);
    const amount=stageLighting?.getState().amount??0,oldSelection=selection.visible;
    if(amount>0)selection.visible=false;
    const dark=String(amount>.5);if(container.dataset.stageActive!==dark)container.dataset.stageActive=dark;
    renderer.render(scene,camera);selection.visible=oldSelection;updateHouseLabels();
    if((fading||filming)&&!document.hidden)requestRender();
  }
  function requestRender() { if (!scheduled&&!disposed) { scheduled = true; renderFrame=requestAnimationFrame(render); } }
  function markShadowsDirty() { renderer.shadowMap.needsUpdate = true; }
  function setDragQuality(reduced) {
    if (dragQualityReduced === reduced) return;
    dragQualityReduced = reduced;
    renderer.shadowMap.enabled = !reduced && !(view==='building' && houseMode==='floors');
    if (!reduced) { markShadowsDirty(); requestRender(); }
  }
  const feedback = createHomeFeedback({ container, camera, requestRender });
  let pendingAvatarArrival = null;
  const avatarActor = avatarFactory({ parent:scene, requestRender, onStatus:onAvatarStatus, onActivityChange:onAvatarActivityChange,onObjectAction:onAvatarObjectAction,onObjectPresentation:onAvatarObjectPresentation,
    onStoreyChange:({index,point})=>{pendingAvatarArrival={index,point};onStoreyChange?.(index);},
    onElevatorFrame:frame=>{if(disposed)return;applyFloorElevatorFrame(staircase,frame);requestRender();},
  });
  function material(color, options = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: .76, ...options }); ownedMaterials.add(m); return m;
  }
  function mesh(parent, geometry, color, position, options = {}) {
    ownedGeometries.add(geometry);
    const m = new THREE.Mesh(geometry, material(color, options));
    m.position.set(...position); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, color, size, position, r = .06, options) {
    return mesh(parent, new RoundedBoxGeometry(...size, 3, Math.min(r, Math.min(...size) / 2)), color, position, options);
  }
  function ball(parent, color, position, scale) {
    const m = mesh(parent, new THREE.SphereGeometry(1, 20, 14), color, position); m.scale.set(...scale); return m;
  }
  function cylinder(parent, color, radiusTop, radiusBottom, height, position, options) {
    return mesh(parent, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 28), color, position, options);
  }
  function register(id, objects) {
    parts.set(id, objects);
    for (const object of objects) { object.userData.surfaceId = id; pickables.push(object); }
  }
  function grain(kind) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256);
    if (kind === 'oak') {
      for (let i = 0; i < 90; i++) {
        const y = i * 3.1;
        ctx.strokeStyle = i % 3 ? 'rgba(102,68,30,.09)' : 'rgba(108,65,28,.2)';
        ctx.lineWidth = i % 3 ? .8 : 1.4; ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, y + Math.sin(x / 48 + i) * 2.5);
        ctx.stroke();
      }
    } else if (kind === 'stone') {
      for (let i = 0; i < 11; i++) {
        ctx.strokeStyle = 'rgba(104,113,108,.15)'; ctx.lineWidth = i % 3 === 0 ? 2 : .7;
        ctx.beginPath(); ctx.moveTo(i * 40 - 50, 0); ctx.bezierCurveTo(i * 28 + 10, 70, i * 42 - 10, 140, i * 27 + 60, 256); ctx.stroke();
      }
    } else if (kind === 'wool' || kind === 'linen' || kind === 'velvet') {
      const base = kind === 'wool' ? 'rgba(160,132,104,.16)' : kind === 'linen' ? 'rgba(112,137,124,.13)' : 'rgba(125,78,99,.14)';
      ctx.strokeStyle = base; ctx.lineWidth = kind === 'velvet' ? 3 : 1.4;
      for (let i = 0; i < 256; i += (kind === 'wool' ? 7 : 11)) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i + Math.sin(i) * 2); ctx.stroke(); }
      if (kind === 'wool') for (let i = -256; i < 256; i += 18) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 256, 256); ctx.stroke(); }
    } else {
      ctx.strokeStyle = 'rgba(91,132,133,.14)'; ctx.lineWidth = 2;
      for (let i = 0; i <= 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); }
    }
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; textures.push(t); return t;
  }
  const sofaFabricMaps = createSofaFabricMaps();
  Object.values(sofaFabricMaps).forEach(texture => textures.push(texture));
  const maps = { oak: grain('oak'), stone: grain('stone'), ceramic: grain('ceramic'), walnut: grain('oak'), marble: grain('stone'), wool: grain('wool'), linen: grain('linen'), velvet: grain('velvet'), ...Object.fromEntries(Object.entries(sofaFabricMaps).map(([name, texture]) => [`sofa-${name}`, texture])) };
  roomExpansion = createRoomExpansion({ rooms, maps, includeWalls: true, includeGrid: true, theme, floorTextureManager:floorTextures }); root.add(roomExpansion);
  // The outdoor estate is an isolated scene layer. Its house is generated from
  // the same floor plan as the interior, so adding a room inside changes the
  // silhouette outside; it never participates in interior surfaces or bounds.
  estateOutdoor = createEstateOutdoor({ tier: 'courtyard', house: roomStage() }); estateOutdoor.visible = false; root.add(estateOutdoor);
  estateManor = createEstateManor({ rooms, theme }); estateManor.visible = false; root.add(estateManor);
  const hemisphere=new THREE.HemisphereLight(lighting.hemisphere?.sky??'#fff8e6', lighting.hemisphere?.ground??'#9daa98', lighting.hemisphere?.intensity??2.1);scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(lighting.sun?.color??'#fff4d9', lighting.sun?.intensity??3.4); sun.position.set(3, 8, 6); sun.castShadow = true;
  stageLighting=createStageLighting({scene,requestRender,backdropColor:theme.backdrop?.inner});
  const stageFraming=createStageFraming();
  stageCamera=createStageCamera({
    getPose:()=>({pan:{x:cameraPan.x,y:cameraPan.y,z:cameraPan.z},zoom,angle}),
    applyPose:pose=>{cameraPan.set(pose.pan.x,pose.pan.y,pose.pan.z);zoom=pose.zoom;angle=pose.angle;frameCamera(lastCameraBounds);},
    focusPose:(point,angle)=>stageFraming({point,angle,bounds:lastCameraBounds??cameraBounds(),width:container.clientWidth||800,height:container.clientHeight||600}),
    reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    requestRender,onChange:onStageCameraChange,
  });
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .5, far: 25 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.0002; sun.shadow.radius = lighting.shadowRadius??4; scene.add(sun);
  const sunTarget = new THREE.Object3D(); scene.add(sunTarget); sun.target = sunTarget;
  function fitSunToLayout() {
    const bounds = roomStage().bounds;
    const envelope = new THREE.Box3(new THREE.Vector3(bounds.minX,-.5,bounds.minZ),new THREE.Vector3(bounds.maxX,4,bounds.maxZ));
    // The camera already follows the real building height. Shadow bounds must
    // follow it too; otherwise additional storeys rise above the light camera.
    envelope.union(new THREE.Box3().setFromObject(estateManor));
    if(outdoorState && view==='estate')envelope.union(outdoorWorld.getPlacedBounds());
    const center=envelope.getCenter(new THREE.Vector3()),reach=envelope.getSize(new THREE.Vector3()).length()/2+2;
    const lightOffset=new THREE.Vector3(3,8,6).normalize().multiplyScalar(Math.max(14,reach+3));
    sunTarget.position.copy(center); sun.position.copy(center).add(lightOffset);
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, far: 25 + reach*2 });
    sun.shadow.camera.updateProjectionMatrix();
  }

  const fill = new THREE.DirectionalLight(lighting.fill?.color??'#dceceb', lighting.fill?.intensity??1); fill.position.set(-5, 4, -3); scene.add(fill);

  function starterWallBlock(id) {
    const block = STARTER_WALL_BLOCKS.find(block => block.id === id);
    const color=(['toy','warm'].includes(theme.id)?(id.includes('body')?theme.rooms.living.wall:id.includes('skirting')?theme.rooms.living.trim:theme.shell.wallCap):null)??block.color;
    return box(starterShell, color, block.size, block.position, block.radius);
  }
  // A miniature architectural slice, with real inner/outer skins on the editable wall.
  box(starterShell, '#d0bb9b', [6, .38, 5.65], [0, -.3, 0], .17);
  box(starterShell, '#f8e9cb', [5.85, .13, 5.5], [0, -.065, 0], .09);
  const floorParts = [];
  // Replace the slab together with its visible planks so a stairwell is a real hole.
  const starterFloor = new THREE.Group();starterFloor.name='starter-floor';starterShell.add(starterFloor);
  // The two original solid plinths are rebuilt below with the same opening.
  for(const child of [...starterShell.children])if(child.isMesh&&child.position.y<0)release(child);
  function rebuildStarterFloor(stairs) {
    for(const child of [...starterFloor.children])release(child);floorParts.length=0;
    const slab=(width,depth,height,y,color,radius)=>{
      for(const p of splitFloorAroundOpening({minX:-width/2,maxX:width/2,minZ:-depth/2,maxZ:depth/2},stairs))
        box(starterFloor,color,[p.maxX-p.minX,height,p.maxZ-p.minZ],[(p.minX+p.maxX)/2,y,(p.minZ+p.maxZ)/2],radius);
    };
    slab(6,5.65,.38,-.3,'#d0bb9b',.07);slab(5.85,5.5,.13,-.065,'#f8e9cb',.04);
    if(theme.id==='warm') {
      const floor=createWarmStarterFloorSurface(stairs);starterFloor.add(floor);adopt(floor);floorParts.push(floor);
    }else for(let i=0;i<13;i++) {
      const z=-2.4+i*.405;
      for(const p of splitFloorAroundOpening({minX:-2.8,maxX:2.8,minZ:z-.1975,maxZ:z+.1975},stairs)) {
        const plank=box(starterFloor,i%3===0?'#e7cfaa':i%3===1?'#ecd7b5':'#f1dfc1',[p.maxX-p.minX,.07,p.maxZ-p.minZ],[(p.minX+p.maxX)/2,.025,(p.minZ+p.maxZ)/2],.012);
        plank.material.map=maps.oak;floorParts.push(plank);
      }
    }
    register('floor.main',floorParts);
    starterSurfaceParts?.set('floor.main',[...floorParts]);
    if(state?.slab&&hasStarterRoom(state))parts.set('floor.main',[...floorParts,...(roomExpansion?.userData.roomParts?.floor??[]).filter(o=>o.userData.surfaceId==='floor.main')]);
  }
  rebuildStarterFloor(null);
  starterWallBlock('back-body');
  const inner = mesh(starterShell, new THREE.PlaneGeometry(WALL_WIDTH, WALL_HEIGHT), '#efe6cc', [0, 1.46, -2.504]);
  inner.castShadow = false;
  const outer = mesh(starterShell, new THREE.PlaneGeometry(WALL_WIDTH, WALL_HEIGHT), '#dfd7bf', [0, 1.46, -2.756]); outer.rotation.y = Math.PI; outer.castShadow = false;
  register('wall.inner', [inner]); register('wall.outer', [outer]);
  starterWallBlock('back-cornice');
  starterWallBlock('back-skirting');
  register('wall.side', [starterWallBlock('side-body')]);
  starterWallBlock('side-skirting');
  starterWallBlock('side-cornice');

  // Window and shelf retain their scene details when their body is painted.
  const windowGroup = new THREE.Group(); windowGroup.position.set(-2.675, 1.76, -.9); windowGroup.rotation.y = Math.PI / 2; root.add(windowGroup);
  box(windowGroup, theme.shell.glass??'#aeccc6', [1.44, 1.46, .06], [0, 0, .015], .12, { roughness: .45 });
  const outside = box(windowGroup, '#e4f0e0', [1.24, 1.26, .025], [0, 0, .055], .10); outside.castShadow = false;
  ball(windowGroup, '#f4d487', [.28, .34, .077], [.19, .19, .014]);
  for (const [x, y, w] of [[-.3, -.25, .32], [.2, -.42, .43]]) ball(windowGroup, '#a7cba4', [x, y, .087], [w, .29, .02]);
  const frameParts = [];
  for (const x of [-.7, .7]) frameParts.push(box(windowGroup, '#faf0d7', [.1, 1.5, .13], [x, 0, .14], .025));
  for (const y of [-.72, .72]) frameParts.push(box(windowGroup, '#faf0d7', [1.5, .1, .13], [0, y, .14], .025));
  frameParts.push(box(windowGroup, '#faf0d7', [.065, 1.36, .12], [0, 0, .16], .015));
  frameParts.push(box(windowGroup, '#faf0d7', [1.38, .065, .12], [0, 0, .16], .015));
  frameParts.push(box(windowGroup, '#e9ccaa', [1.72, .13, .35], [0, -.78, .18], .04));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) box(windowGroup, '#efc8ad', [.105, 1.55 - i * .05, .16], [side * (.83 + i * .1), -.05, .14], .04);
  }
  cylinder(windowGroup, '#bd9468', .025, .025, 2.4, [0, .87, .16]).rotation.z = Math.PI / 2;
  register('window.frame', frameParts); tagGroup(windowGroup, 'window.frame');

  const shelfGroup = new THREE.Group(); root.add(shelfGroup);
  register('shelf.main', [box(shelfGroup, '#cda67c', [1.44, .12, .40], [-1.35, 1.78, -2.29], .04)]);
  for (let i = 0; i < 4; i++) box(shelfGroup, ['#abc4a7', '#dfb9a1', '#edd38a', '#b4cdd0'][i], [.14, .40 + i * .035, .24], [-1.78 + i * .18, 2.02, -2.31], .018);
  makePlant(shelfGroup, [-.84, 1.85, -2.3], .56);
  // Floor decor leaves the central floor open for free placement.
  const rug = new THREE.Group(); rug.position.set(.28, .079, .58); rug.scale.set(2.23, 1, 2.23); root.add(rug);
  const stool = new THREE.Group(); root.add(stool); stool.position.set(2.42, .08, 2.4);
  for (const x of [-.24, .24]) for (const z of [-.19, .19]) box(stool, '#c49b73', [.085, .48, .085], [x, .23, z], .02);
  box(stool, '#daae87', [.75, .14, .62], [0, .5, 0], .12);
  box(stool, '#efcbb3', [.67, .07, .55], [0, .59, 0], .09);
  const plant = new THREE.Group(); plant.position.set(-2.43, .08, 2.30); root.add(plant);
  register('stool.main', stool.children.filter(o => o.isMesh));
  // The rabbit uses a rounded soft-toy model; later levels add its costume.
  const rabbit = new THREE.Group(); rabbit.position.set(2.02, .085, -1.44); root.add(rabbit);

  const top = box(table, '#d5b082', [TABLE_WIDTH, .075, TABLE_DEPTH], [0, TABLE_Y, 0], .036);
  const edge = box(table, '#c5a079', [TABLE_WIDTH, .18, TABLE_DEPTH], [0, TABLE_Y - .13, 0], .07);
  const legs = [];
  for (const x of [-.88, .88]) for (const z of [-.46, .46]) {
    const leg = box(table, '#d0af85', [.17, .94, .17], [x, .51, z], .045); legs.push(leg);
    legs.push(box(table, '#b99b77', [.18, .08, .18], [x, .11, z], .035));
  }
  register('table.top', [top]); register('table.edge', [edge]); register('table.legs', legs);

  function makePlant(parent, pos, scale = 1) {
    const group = new THREE.Group(); group.position.set(...pos); group.scale.setScalar(scale); parent.add(group);
    group.userData.paintParts = [cylinder(group, '#d79d7c', .20, .15, .32, [0, .16, 0]), cylinder(group, '#e7b697', .22, .22, .065, [0, .31, 0])];
    cylinder(group, '#6e8c56', .018, .023, .62, [0, .64, 0]);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, y = .44 + i * .065;
      const leaf = ball(group, i % 2 ? '#88a768' : '#a4ba7b', [Math.cos(a) * .14, y, Math.sin(a) * .14], [.11, .23, .05]); leaf.rotation.set(.5 * Math.sin(a), a, .7 * Math.cos(a));
    }
    return group;
  }

  const selection = new THREE.BoxHelper(top, '#f0a77b'); selection.material.depthTest = false; selection.material.transparent = true; selection.material.opacity = .76; selection.renderOrder = 5; scene.add(selection);
  const collisionSource = new THREE.BoxGeometry(1, 1, 1), collisionGuide = new THREE.LineSegments(new THREE.EdgesGeometry(collisionSource), new THREE.LineBasicMaterial({ color: '#73a965', transparent: true, opacity: .9, depthTest: false }));
  collisionSource.dispose(); collisionGuide.visible = false; collisionGuide.renderOrder = 16; scene.add(collisionGuide);
  const wallBlockGuide = new THREE.LineSegments(collisionGuide.geometry, new THREE.LineBasicMaterial({ color: '#d95f59', transparent: true, opacity: .95, depthTest: false }));
  wallBlockGuide.visible = false; wallBlockGuide.renderOrder = 17; scene.add(wallBlockGuide);
  let wallBlockTimer = null;
  let pulseFrame = 0;
  function clearPulse() {
    if (pulseFrame) cancelAnimationFrame(pulseFrame);
    pulseFrame = 0;
  }
  function flashObjects(objects) {
    // The screen-space feedback layer traces the projected object contour. Do
    // not add a second radial burst here: it obscures small details and does
    // not follow the shape the teacher is pointing at.
    if (!objects?.length) return;
    clearPulse();
    requestRender();
  }
  function flashSelection(target = {}) {
    const targetId = target.dynamicId ?? target.targetId ?? selected;
    const objectId = target.objectId;
    const record = dynamicItems.get(targetId);
    const fixed = objectId && fixedModels.get(objectId);
    const upgrade = objectId && upgradeItems.get(objectId);
    const candidates = record?.group ? [record.group] : fixed?.group ? [fixed.group] : [...(parts.get(targetId) ?? []), ...(upgrade?.group ? [upgrade.group] : [])];
    const objects = [];
    for (const object of candidates) {
      if (!object || objects.includes(object)) continue;
      const bounds = new THREE.Box3().setFromObject(object);
      if (!bounds.isEmpty()) objects.push(object);
    }
    if (!objects.length) return;
    flashObjects(objects);
    feedback.play(objects, { kind: target.kind ?? 'upgrade', color: target.color ?? '#efb84e', label: target.label ?? "DisplayText0876", entrance: target.entrance === true });
  }
  function flashEstate(featureId) {
    if (!featureId) return;
    const feature = estateFeature(featureId);
    if (feature) { flashObjects([feature]); feedback.play([feature], { kind: 'upgrade', label: "DisplayText2743" }); }
  }
  function updateSelection() {
    const objects = parts.get(selected);
    selection.visible = view === 'interior' && !lifeMode && !!objects?.length;
    if (objects?.length) {
      const bounds = new THREE.Box3(); for (const o of objects) bounds.expandByObject(o);
      const proxy = new THREE.Object3D(); proxy.geometry = new THREE.BoxGeometry(1, 1, 1);
      const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3()).addScalar(.025);
      proxy.position.copy(center); proxy.scale.copy(size); proxy.updateMatrixWorld(true);
      selection.setFromObject(proxy); proxy.geometry.dispose();
    }
    requestRender();
  }
  function collisionCandidate(change) {
    if (!change || !state) return null;
    if (change.type === 'furniture') {
      const item = state.furniture.find(value => value.id === change.id) ?? change;
      const footprint = getFurnitureFootprint(item.kind, change.rotation ?? item.rotation);
      return footprint && { id: `furniture:${item.id}`, item: { ...item, ...change }, rotation: change.rotation ?? item.rotation, kind: item.kind, x: change.x ?? item.x, z: change.z ?? item.z, ...footprint,
        layer: item.kind === 'rug' ? 'underlay' : item.kind === 'chandelier' ? 'ceiling' : 'solid' };
    }
    if (change.type === 'placement') {
      const footprint = getPlacementFootprint(change.objectId);
      return footprint && { id: `placement:${change.objectId}`, x: change.x, z: change.z, ...footprint, layer: change.objectId === 'rug' ? 'underlay' : 'solid' };
    }
    if (change.type === 'table') {
      const rotation = change.rotation ?? state.table.rotation;
      const footprint = getTableFootprint(rotation);
      return { id: 'table', rotation, x: change.x ?? state.table.x, z: change.z ?? state.table.z,
        ...footprint, layer: 'solid' };
    }
    return null;
  }
  function updateCollisionGuide(change) {
    const candidate = collisionCandidate(change);
    if (!candidate) { collisionGuide.visible = false; return; }
    const blocker = findHomeCollision(state, candidate);
    setVolumeGuide(collisionGuide, getHomeCandidateVolume(state, candidate));
    showWallBlock(blocker);
    collisionGuide.material.color.set(blocker ? '#d95f59' : '#73a965'); collisionGuide.visible = true; requestRender();
  }
  function setVolumeGuide(guide, volume) {
    if (!volume || !Number.isFinite(volume.minY)) { guide.visible = false; return; }
    guide.position.set((volume.minX + volume.maxX)/2, (volume.minY + volume.maxY)/2, (volume.minZ + volume.maxZ)/2);
    guide.scale.set(Math.max(.015,volume.maxX-volume.minX), Math.max(.015,volume.maxY-volume.minY), Math.max(.015,volume.maxZ-volume.minZ));
    guide.visible = true;
  }
  function showWallBlock(volume, transient = false) {
    clearTimeout(wallBlockTimer); wallBlockTimer = null; setVolumeGuide(wallBlockGuide, volume);
    if (transient && wallBlockGuide.visible) wallBlockTimer = setTimeout(() => { wallBlockGuide.visible = false; requestRender(); }, 2600);
    requestRender();
  }
  function hideCollisionGuide() { collisionGuide.visible = false; showWallBlock(null); requestRender(); }
  function faceFrame(surfaceId) {
    if (surfaceId === 'table.top') { table.updateMatrixWorld(true); return { parent: table, width: TABLE_WIDTH, height: TABLE_DEPTH, pos: new THREE.Vector3(0, TABLE_Y + .044, 0), rotation: new THREE.Euler(-Math.PI / 2, 0, 0) }; }
    // Decal surfaces all belong to the living room, whose shell never moves.
    if (surfaceId === 'floor.main') return { parent: root, width: WALL_WIDTH, height: 5.2, pos: new THREE.Vector3(0, .076, 0), rotation: new THREE.Euler(-Math.PI / 2, 0, 0) };
    if (surfaceId === 'wall.side') return { parent: root, width: 5.2, height: WALL_HEIGHT, pos: new THREE.Vector3(-2.687, 1.46, 0), rotation: new THREE.Euler(0, Math.PI / 2, 0) };
    return { parent: root, width: WALL_WIDTH, height: WALL_HEIGHT, pos: new THREE.Vector3(0, 1.46, surfaceId === 'wall.outer' ? -2.766 : -2.494), rotation: new THREE.Euler(0, surfaceId === 'wall.outer' ? Math.PI : 0, 0) };
  }
  function decalGeometry(kind) {
    const shape = new THREE.Shape();
    if (kind === 'star') {
      for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .23 : .5; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? shape.lineTo(x, y) : shape.moveTo(x, y); }
    } else if (kind === 'heart') {
      shape.moveTo(0, -.47); shape.bezierCurveTo(-.8, .0, -.45, .76, 0, .29); shape.bezierCurveTo(.45, .76, .8, .0, 0, -.47);
    } else if (kind === 'diamond') {
      shape.moveTo(0,.5); shape.lineTo(.36,0); shape.lineTo(0,-.5); shape.lineTo(-.36,0);
    } else if (kind === 'crown') {
      shape.moveTo(-.5,-.27); shape.lineTo(-.5,.35); shape.lineTo(-.24,.03); shape.lineTo(0,.5); shape.lineTo(.24,.03); shape.lineTo(.5,.35); shape.lineTo(.5,-.27);
    } else {
      for (let i = 0; i < 90; i++) { const a = i / 90 * Math.PI * 2, r = .37 + .115 * Math.cos(a * 5); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? shape.lineTo(x, y) : shape.moveTo(x, y); }
    }
    shape.closePath(); return new THREE.ShapeGeometry(shape, 20);
  }
  function tagGroup(group, surfaceId, extra = {}) {
    group.traverse(o => { if (o.isMesh) {
      // A static table carries distinct top/edge/leg surfaces. Its upgraded
      // parts and trim must keep the same target when ray-picked.
      const target = o.userData.isStaticUpgrade ? (o.userData.surfaceId ?? surfaceId) : surfaceId;
      o.userData = { ...o.userData, surfaceId: target, ...extra };
    } });
    if (group.parent !== dynamic && !pickables.includes(group)) pickables.push(group);
  }
  function adopt(group) {
    group.traverse(o => { if (o.isMesh) { ownedGeometries.add(o.geometry); ownedMaterials.add(o.material); } });
  }
  function release(group) {
    onBeforeModelRelease?.(group);
    const descendants = new Set(); group.traverse(o => descendants.add(o));
    // Elevators own cached indicator materials in addition to their currently
    // mounted meshes. Retire their runtime and resources through that owner.
    for (const object of descendants) if (object.userData.transportType === 'elevator' && typeof object.userData.setElevatorFrame === 'function') {
      object.userData.dispose(resource=>{ownedGeometries.delete(resource);ownedMaterials.delete(resource);});
    }
    group.traverse(o => { if (o.isMesh) { floorTextures?.release(o);o.geometry.dispose(); ownedGeometries.delete(o.geometry); o.material.dispose(); ownedMaterials.delete(o.material); } });
    group.removeFromParent(); for (let i = pickables.length - 1; i >= 0; i--) if (descendants.has(pickables[i])) pickables.splice(i, 1);
  }
  function syncDynamic(next) {
    const alive = new Set();
    // Stable instance IDs keep movement cheap: pose changes reuse every mesh and material.
    for (const [type, items] of [['decal',next.decals],['prop',next.props],['furniture',next.furniture]]) for (const item of items) {
      const key = `${type}:${item.id}`, surfaceId = type === 'decal' ? item.surfaceId : key;
      alive.add(key); const style = JSON.stringify([item.kind,item.color,item.material,item.level,item.plans]);
      let record = dynamicItems.get(key);
      if (!record || record.style !== style) {
        if (record) { release(record.group); parts.delete(key); }
        let group;
        if (type === 'decal') {
          group = new THREE.Group();
          const sticker = mesh(group, decalGeometry(item.kind), {star:'#e9b947',flower:'#df8d77',heart:'#d98484',diamond:'#9cb8c5',crown:'#caa360'}[item.kind], [0,0,0], {side:THREE.DoubleSide,roughness:.6});
          sticker.castShadow = false; sticker.receiveShadow = false;
          if (item.kind === 'flower') { const center=mesh(group,new THREE.CircleGeometry(.12,24),'#f7d779',[0,0,.002],{side:THREE.DoubleSide}); center.castShadow=false; }
        } else group = createLuxuryItem({ ...item, maps });
        adopt(group); dynamic.add(group);
        tagGroup(group,surfaceId,type === 'decal' ? {decalId:item.id} : type === 'prop' ? {propId:item.id} : {furnitureId:item.id,dynamicId:key});
        if (type !== 'decal') parts.set(key,[group]);
        record = {group,style,anchorBounds:null}; dynamicItems.set(key,record);
      }
      const group = record.group;
      if (type === 'decal') {
        tagGroup(group,surfaceId,{decalId:item.id}); const f = faceFrame(item.surfaceId);
        const local = new THREE.Vector3((item.u-.5)*f.width,(item.v-.5)*f.height,0).applyEuler(f.rotation).add(f.pos);
        group.position.copy(f.parent.localToWorld(local)); group.quaternion.copy(f.parent.getWorldQuaternion(new THREE.Quaternion())).multiply(new THREE.Quaternion().setFromEuler(f.rotation));
        group.rotateZ(THREE.MathUtils.degToRad(item.rotation)); group.scale.setScalar(item.size*Math.min(f.width,f.height));
      } else if (type === 'prop') {
        group.position.copy(table.localToWorld(new THREE.Vector3((item.u-.5)*TABLE_WIDTH,TABLE_Y+.042,(.5-item.v)*TABLE_DEPTH))); group.quaternion.copy(table.quaternion);
      } else {
        const pose = getFurniturePose(next, item), rotation = THREE.MathUtils.degToRad(pose.rotation);
        if (group.position.x !== pose.x || group.position.y !== pose.y || group.position.z !== pose.z || group.rotation.y !== rotation) record.anchorBounds = null;
        group.position.set(pose.x, pose.y, pose.z); group.rotation.y = rotation;
      }
    }
    for (const [key,record] of dynamicItems) if (!alive.has(key)) { release(record.group); parts.delete(key); dynamicItems.delete(key); }
  }
  const upgradeParents = { table, window:windowGroup, shelf:shelfGroup, stool, plant, toy:rabbit };
  const upgradeSurfaces = {wall:'wall.inner',sidewall:'wall.side',floor:'floor.main',table:'table.top',window:'window.frame',shelf:'shelf.main',stool:'stool.main',plant:'plant.pot',toy:'toy.body',rug:'rug.main'};
  const fixedModels = new Map();
  const roomSurfaceIds = new Set();
  /** Outdoor tier and unlocked facilities follow the number of rooms in the plan. */
  function outdoorPlan() {
    const stage=describeLayout(groundRooms()), bounds=getFloorBounds(groundHome()), tier = getEstateForRoomCount(stage.count);
    const unlocked = stage.count >= 5 ? ['courtyard','garden','pool','tennis','treehouse','gazebo'] : stage.count >= 3 ? ['courtyard','garden','pool'] : stage.count >= 2 ? ['courtyard','garden'] : [];
    return { tier: tier?.id ?? 'courtyard', unlocked: new Set(unlocked), house: { width: bounds?.width ?? stage.width, depth: bounds?.depth ?? stage.depth } };
  }
  function syncRoomEnvelope() {
    // The exterior is generated from the same floor plan: every added room
    // becomes a wing of the manor and widens the estate around it.
    const plan = outdoorPlan();
    if(!starterSurfaceParts)starterSurfaceParts=new Map(['floor.main','wall.inner','wall.outer','wall.side','window.frame'].map(id=>[id,parts.get(id)]));
    if (!capturingHouse) {
      estateManor.setCustomization({rooms:groundRooms(),floors:exteriorFloors()});
      estateOutdoor.setTier(plan.tier, plan.house);
    }
    for (const id of ['courtyard','garden','pool','tennis','treehouse','gazebo']) {
      const feature = estateOutdoor.getFeature(id); if (feature) feature.visible = plan.unlocked.has(id);
    }
    for (const object of roomPickables) { const index = pickables.indexOf(object); if (index >= 0) pickables.splice(index, 1); }
    roomPickables.clear();
    for (const id of roomSurfaceIds) parts.delete(id); roomSurfaceIds.clear();
    for(const [id,objects] of starterSurfaceParts)if(objects)parts.set(id,objects);
    const all = Object.values(roomExpansion.userData.roomParts ?? {}).flat();
    for (const surfaceId of Object.values(roomExpansion.userData.surfaceIds ?? {})) {
      const architectural=all.filter(mesh=>mesh.userData.surfaceId===surfaceId&&['floor','walls'].includes(mesh.userData.roomPart));
      parts.set(surfaceId,[...(!standaloneFloor()?starterSurfaceParts.get(surfaceId)??[]:[]),...architectural]);
      roomSurfaceIds.add(surfaceId);
    }
    for (const object of all.filter(mesh => mesh.userData.surfaceId)) { pickables.push(object); roomPickables.add(object); }
    if (!capturingHouse) fitSunToLayout();
    syncView();
  }
  function syncView() {
    for (const child of root.children) child.visible = view === 'interior';
    estateOutdoor.visible = view === 'estate' && !outdoorState;
    outdoorWorld.visible = view === 'estate' && !!outdoorState;
    // The owned lawn ends at y=-.02; the exterior's foundation and entrance
    // steps extend down to -.32. Seat that foundation on the lawn rather than
    // burying it. Interior/overview floors retain their construction datum.
    estateManor.position.y = view === 'estate' && outdoorState ? .30 : 0;
    if(furniturePlacement)furniturePlacement.group.visible=furniturePlacement.onSurface && (furniturePlacement.outdoor ? view==='estate' : view==='interior');
    estateManor.visible = view === 'estate' || view === 'building' && houseMode === 'exterior';
    if (houseOverview) houseOverview.visible = view === 'building' && houseMode === 'floors';
    houseLabels.hidden = view !== 'building' || houseMode !== 'floors';
    renderer.shadowMap.enabled = !dragQualityReduced && !(view==='building' && houseMode==='floors');
    roomExpansion.visible = view === 'interior';
    starterShell.visible = view === 'interior'&&!standaloneFloor();
    windowGroup.visible = view === 'interior'&&!standaloneFloor();
    if(['upper','account'].includes(state?.profile))for(const object of[table,shelfGroup,stool,plant,rabbit,rug])object.visible=false;
    if(staircase)staircase.visible=view==='interior';
    selection.visible = view === 'interior' && !lifeMode;
    avatarActor.setEnvironment?.(view);
    avatarActor.setVisible((view === 'interior' || view === 'estate' && avatarActor.supportsOutdoor && !!outdoorState) && !capturingHouse);
  }
  /** Appearance of a surface: fixed living-room surfaces live in `surfaces`, added rooms carry their own skins. */
  function surfaceAppearance(next, id) {
    const room = parseRoomSurfaceId(id);
    if (!room) return getHomeSurfaceAppearance(id,next.surfaces[id],theme);
    const owner=next.rooms?.find(item => item.id === room.roomId),appearance=owner?.[room.part]??null;
    if(!appearance||theme.id==='default')return appearance;
    const skin=getRoomTheme(owner.kind,owner,theme);
    return {...appearance,color:skin[room.part],...(theme.id==='warm'&&room.part==='wall'&&skin.wallMaterial?{material:skin.wallMaterial}:{})};
  }
  function syncFixedModels(next) {
    if(next.profile==='upper')return;
    const placements = next.placements ?? {};
    for (const [id, group] of [['plant', plant], ['toy', rabbit], ['rug', rug], ['stool', stool]]) {
      const placement = placements[id];
      if (placement) group.position.set(placement.x, id === 'rug' ? .079 : .08, placement.z);
    }
    for (const [id, kind, parent, surfaceId] of [['plant','plant',plant,'plant.pot'],['toy','statue',rabbit,'toy.body'],['rug','rug',rug,'rug.main']]) {
      const a = getHomeSurfaceAppearance(surfaceId,next.surfaces[surfaceId],theme), plans = next.plans[id];
      const style = JSON.stringify([a,plans]); const old = fixedModels.get(id);
      if (old?.style === style) continue;
      if (old) release(old.group);
      const group = createLuxuryItem({kind, ...a, level:next.upgrades[id], plans, maps}); parent.add(group); adopt(group);
      register(surfaceId, group.children.filter(o => o.isMesh && o.userData.paintable)); tagGroup(group,surfaceId);
      fixedModels.set(id,{group,style});
    }
  }
  function syncUpgrades(next) {
    const windowOffset = getWallAttachmentOffset(next, 'window'), shelfOffset = getWallAttachmentOffset(next, 'shelf');
    windowGroup.position.set(-2.675 + windowOffset.x, 1.76, -.9);
    shelfGroup.position.set(0, 0, shelfOffset.z);
    for (const [objectId,level] of Object.entries(next.upgrades)) {
      if (['plant','toy','rug'].includes(objectId)) continue;
      if(standaloneFloor() || next.profile==='upper'&&['table','shelf','stool'].includes(objectId)) {
        const old=upgradeItems.get(objectId);if(old){release(old.group);upgradeItems.delete(objectId);}continue;
      }
      const surfaces = Object.fromEntries((STATIC_UPGRADE_SURFACES[objectId] ?? []).map(id => [id, getHomeSurfaceAppearance(id,next.surfaces[id],theme)]));
      const plans = next.plans[objectId], style = JSON.stringify([level,plans,surfaces,objectId==='floor'?getHomeStairs(next):null]);
      const old = upgradeItems.get(objectId); if (old?.style === style) continue;
      if (old) release(old.group);
      const group = createStaticUpgrade({objectId,level,plans,surfaces,maps});
      if(objectId==='floor')group.traverse(object=>{if(object.isMesh)clipFloorMeshToOpening(object,getHomeStairs(next));});
      adopt(group); (upgradeParents[objectId]??root).add(group); tagGroup(group,upgradeSurfaces[objectId]);
      upgradeItems.set(objectId,{group,style});
    }
  }
  function syncStaircase(next) {
    const stairs=getHomeStairs(next),key=JSON.stringify([stairs,activeFloor,standaloneFloor()]);if(key===staircaseKey)return;staircaseKey=key;
    if(staircase){for(const model of staircase.children)parts.delete(model.userData.surfaceId);release(staircase);staircase=null;}
    if(!standaloneFloor())rebuildStarterFloor(stairs);
    if(!stairs.length)return;
    staircase=createFloorStaircaseGroup(next,activeFloor);adopt(staircase);root.add(staircase);
    // The upstairs opening shows the straight flight and its open arrival platform.
    // The complete straight flight and its collision volume remain downstairs.
    for(const model of staircase.children){tagGroup(model,model.userData.surfaceId);parts.set(model.userData.surfaceId,[model]);}
  }
  function setState(next, options = {}) {
    const nextFloor=Number.isInteger(options.activeFloor)?options.activeFloor:activeFloor;
    const changedFloor=nextFloor!==activeFloor||!!state&&state.profile!==next.profile;
    if(changedFloor && !capturingHouse) {
      stageFacingBound=false;
      stageCamera?.reset();
      floorCameraPoses.set(activeFloor,{pan:cameraPan.clone(),zoom,angle});
      cancelDrag();clearFurniturePlacement(false);stopCameraMotion();clearPulse();selected='floor.main';lastCameraBounds=null;
      const pose=floorCameraPoses.get(nextFloor);cameraPan.copy(pose?.pan??new THREE.Vector3());zoom=pose?.zoom??1;angle=pose?.angle??angle;onPanStart?.();
    }
    activeFloor=nextFloor;
    if(Array.isArray(options.floors))floorHomes=options.floors;
    state = next;
    let changedLayout=false;
    if (Array.isArray(next.rooms)) {
      const key = JSON.stringify([next.rooms.map(r => [r.id,r.kind,r.cx,r.cz,r.bounds]),next.slab,next.profile,getHomeStairs(next),floorHomes?.map(home=>[home.slab,home.rooms.map(r=>[r.id,r.kind,r.cx,r.cz,r.bounds])])]);
      if (key !== layoutKey) { rooms = next.rooms; layoutKey = key; roomExpansion.setRooms(rooms,{stairs:getHomeStairs(next),slab:next.slab??null,profile:next.profile}); syncRoomEnvelope(); changedLayout=true; }
      else rooms = next.rooms;
    }
    syncStaircase(next);
    syncFixedModels(next);
    table.position.set(next.table.x, .03, next.table.z); table.rotation.y = THREE.MathUtils.degToRad(next.table.rotation);
    const themeRooms=['toy','warm'].includes(theme.id)?new Map(next.rooms.map(room=>[room.id,room])):null;
    for (const [id, objects] of parts) {
      const a = surfaceAppearance(next, id); if (!a) continue;
      for (const o of objects) {
        if(floorTextures&&(id==='floor.main'||parseRoomSurfaceId(id)?.part==='floor')&&o.userData.roomPart!=='zones') {
          const roomId=parseRoomSurfaceId(id)?.roomId,owner=next.rooms.find(room=>room.id===(roomId??o.userData.roomId))??next.rooms.find(room=>room.id==='living')??next.rooms[0];
          const publicFloor=id==='floor.main',skin=publicFloor?next.surfaces['floor.main']:owner?.floor;
          const finish=resolveHomeFloorFinish(owner?.kind??'living',skin,{themeId:theme.id,...publicFloor?{legacyDefault:getDefaultFloorAppearance()}:{} });
          if(finish&&floorTextures.apply(o,finish))continue;
          floorTextures.release(o);
        }
        const room=themeRooms?.get(o.userData.themeRoomId);
        const appearance=room?getHomeSurfaceAppearance(id,next.surfaces[id]??a,theme,room):a;
        o.material.color.set(appearance.color);
        const materialId=theme.id==='warm'?appearance.material:a.material;
        const map = maps[materialId] || null;
        if (o.material.map !== map) { o.material.map = map; o.material.needsUpdate = true; }
        o.material.roughness = materialId === 'gold' ? .35 : materialId === 'ceramic' ? .45 : ['stone','marble'].includes(materialId) ? .4 : .72; o.material.metalness = materialId === 'gold' ? .6 : 0;
      }
    }
    syncUpgrades(next);roomExpansion.syncFloorFinishes?.(next); root.updateMatrixWorld(true); syncDynamic(next); syncView(); root.updateMatrixWorld(true); updateSelection(); markShadowsDirty();
    if(!capturingHouse){
      avatarActor.setWorld(next,activeFloor,{floors:floorHomes,arrivalPoint:pendingAvatarArrival?.index===activeFloor?pendingAvatarArrival.point:null});
      pendingAvatarArrival=null;
    }
    if (!capturingHouse) {
      const allFloorsVisible=view==='building' && houseMode==='floors';
      if(allFloorsVisible)ensureHouseOverview();
      if(changedFloor||changedLayout||allFloorsVisible)frameCamera(); requestRender();
    }
  }
  // Capture through the same interior builders as the editor. This changes only
  // transient render state; the active floor, camera and persistent home are restored.
  function ensureHouseOverview() {
    const homes = exteriorFloors(), key = JSON.stringify(homes);
    if (houseOverview && houseOverviewKey === key) return;
    clearPulse(); feedback.clear();
    const saved = { state, activeFloor, view, selected, pan:cameraPan.clone(), zoom, angle };
    const snapshots = [];
    capturingHouse = true; view = 'interior';
    try {
      homes.forEach((home, index) => {
        setState(home, { activeFloor:index });
        snapshots.push(captureHomeFloor(root.children.filter(child => child.visible && ![estateManor,estateOutdoor,houseOverview,selection].includes(child)), { floorIndex:index, label:`${index + 1} DisplayText0931`, home }));
      });
    } catch (error) {
      snapshots.forEach(group => group.userData.dispose?.()); throw error;
    } finally {
      setState(saved.state, {activeFloor:saved.activeFloor});
      view=saved.view; selected=saved.selected; cameraPan.copy(saved.pan); zoom=saved.zoom; angle=saved.angle; capturingHouse=false; syncView(); updateSelection();
    }
    houseOverview?.userData.dispose?.(); houseOverview?.removeFromParent();
    houseOverview = createHouseOverview(snapshots); root.add(houseOverview); houseOverviewKey=key;
    houseLabelAnchors = snapshots.map((group,index) => {
      const bounds = new THREE.Box3().setFromObject(group);
      const button = document.createElement('button'); button.type='button';
      button.className='house-floor-label'; button.setAttribute('aria-label',`DisplayText2744${index+1}DisplayText2745`);
      const title=document.createElement('strong');title.textContent=`${index+1} DisplayText0931`;
      const detail=document.createElement('span');detail.textContent=`${homes[index].rooms.length} DisplayText2746 · DisplayText2747`;
      button.append(title,detail); button.addEventListener('click',()=>onStoreyChange?.(index));
      return {button,group,anchor:new THREE.Vector3(bounds.min.x-group.position.x,.15,bounds.max.z-group.position.z)};
    });
    houseLabels.replaceChildren(...houseLabelAnchors.map(item=>item.button));
    syncView(); markShadowsDirty();
  }
  function updateHouseLabels() {
    if (houseLabels.hidden) return;
    for (const {button,anchor,group} of houseLabelAnchors) {
      const point=group.localToWorld(anchor.clone()).project(camera);
      button.style.left=`${clamp((point.x+1)*container.clientWidth/2,65,container.clientWidth-65)}px`;
      button.style.top=`${clamp((1-point.y)*container.clientHeight/2,155,container.clientHeight-65)}px`;
      button.hidden=point.z < -1 || point.z > 1;
    }
  }
  function setHouseMode(mode) {
    if (!['exterior','floors'].includes(mode)) return;
    cancelDrag();stopCameraMotion();houseMode=mode;
    if (mode==='floors') ensureHouseOverview();
    cameraPan.set(0,0,0); zoom=1; syncView();frameCamera();
  }
  function cameraBounds() {
    // Hidden feature groups are still part of the Three.js graph, so expand
    // only the room plus the visible estate modules. This prevents a locked
    // future tennis court from shrinking the garden preview.
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    if (view === 'building') {
      bounds.setFromObject(houseMode==='floors' ? houseOverview : estateManor);
    } else if (view === 'estate' && estateFocus) {
      const feature = estateFeature(estateFocus);
      if (feature?.visible) bounds.setFromObject(feature, true).expandByScalar(.6);
    } else if (view==='estate' && outdoorState) {
      bounds.setFromObject(estateManor).union(outdoorWorld.getPlacedBounds()).expandByScalar(2.5);
    } else if (estateOutdoor.visible) {
      for (const id of ['lawn', 'courtyard', 'garden', 'pool', 'tennis', 'treehouse', 'gazebo']) {
        const feature = estateOutdoor.getFeature(id);
        if (feature?.visible) bounds.expandByObject(feature);
      }
      if (estateManor.visible) bounds.expandByObject(estateManor);
    } else {
      if(standaloneFloor())bounds.setFromObject(roomExpansion);
      else {bounds.setFromObject(starterShell);if(state?.slab||rooms.length>1)bounds.expandByObject(roomExpansion);}
      if(staircase)for(const model of staircase.children){const stairBounds=new THREE.Box3().setFromObject(model);if(model.userData.stairs.direction==='down')stairBounds.min.y=Math.max(stairBounds.min.y,-.4);bounds.union(stairBounds);}
    }
    return bounds;
  }
  function frameCamera(boundsOverride = null) {
    const width = container.clientWidth || 800, height = container.clientHeight || 600;
    // ResizeObserver passes an entry when used as a callback; only a real
    // Box3 is a valid cached-bounds override.
    const expandedHouse=view==='building' && houseMode==='floors';
    if(expandedHouse)houseOverview?.arrange?.({angle,aspect:width/height});
    const bounds = expandedHouse ? cameraBounds() : boundsOverride?.isBox3 ? boundsOverride : cameraBounds();
    lastCameraBounds = bounds.clone();
    frameHomeCamera(camera, bounds, { width, height, angle, zoom, padding: view==='estate' ? 1.16 : 1.15, centerOffset: cameraPan, ...(expandedHouse?{fitBounds:houseOverview.children.map(floor=>new THREE.Box3().setFromObject(floor))}:{}) });
    if(view==='estate' && outdoorState){
      // Keep the whole land in the depth range even when framing a small pool.
      // Extending only depth preserves the user's current screen scale and pan.
      const land=getOutdoorLandBounds(outdoorState);let near=Infinity,far=-Infinity;
      for(const x of [land.minX,land.maxX])for(const z of [land.minZ,land.maxZ])for(const y of [-.5,(floorHomes?.length??1)*4+6]){
        const depth=-new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse).z;near=Math.min(near,depth);far=Math.max(far,depth);
      }
      const back=Math.max(0,2-near);if(back){camera.position.add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-back));camera.updateMatrixWorld(true);}
      camera.near=.01;camera.far=Math.max(camera.far,far+back+2);camera.updateProjectionMatrix();
    }
    if (renderer.domElement.width !== Math.round(width * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(height * renderer.getPixelRatio())) renderer.setSize(width, height);
    requestRender();
  }
  function stopCameraMotion() {
    if (cameraAnimation) cancelAnimationFrame(cameraAnimation);
    cameraAnimation = 0; cameraMotion = null;
  }
  function interruptCameraMotion() {
    // Freezing halfway through a focus zoom leaves the pool and treehouse
    // sliced by the frame, which reads as missing models.
    const finish = cameraMotion?.finish;
    stopCameraMotion();
    finish?.();
  }
  function moveCamera(targetPan, targetZoom, onDone) {
    stopCameraMotion();
    const finish = () => { cameraPan.copy(targetPan); zoom = targetZoom; frameCamera(); onDone?.(); };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish(); return;
    }
    cameraMotion={fromPan:cameraPan.clone(),toPan:targetPan.clone(),fromZoom:zoom,toZoom:targetZoom,started:performance.now(),finish};
    const tick = now => {
      if (!cameraMotion) return;
      const t=cameraProgress(now-cameraMotion.started, CAMERA_TRANSITION_MS);
      cameraPan.lerpVectors(cameraMotion.fromPan,cameraMotion.toPan,t);
      zoom=Math.exp(THREE.MathUtils.lerp(Math.log(cameraMotion.fromZoom),Math.log(cameraMotion.toZoom),t));
      frameCamera();
      if(t<1) cameraAnimation=requestAnimationFrame(tick); else {cameraAnimation=0;cameraMotion=null;onDone?.();}
    };
    cameraAnimation=requestAnimationFrame(tick);
  }
  function focusEstate(id) {
    if (id && id===requestedFocus) id=null;
    if(!id) {
      if (!estateFocus && requestedFocus) { estateFocus=requestedFocus; stopCameraMotion(); }
      if (!estateFocus) return;
      const oldFocus=estateFocus, localFeature=estateFeature(oldFocus);
      const local=new THREE.Box3().setFromObject(localFeature,true).expandByScalar(.6);
      estateFocus=null; const whole=cameraBounds(); estateFocus=oldFocus;
      const localFit=camera.clone();
      const overviewFit=camera.clone();
      frameHomeCamera(overviewFit,whole,{width:container.clientWidth,height:container.clientHeight,angle,padding:1.03});
      frameHomeCamera(localFit,local,{width:container.clientWidth,height:container.clientHeight,angle,padding:1.03});
      const pose=overviewPose ?? {pan:new THREE.Vector3(),zoom:1};
      const targetZoom=boundedZoom(pose.zoom * localFit.top/overviewFit.top,view);
      requestedFocus=null;
      moveCamera(pose.pan,targetZoom,()=>{estateFocus=null;cameraPan.copy(pose.pan);zoom=pose.zoom;frameCamera();onEstateViewChange?.();}); return;
    }
    const feature=estateFeature(id);
    if(!feature?.visible)return;
    if(!estateFocus) {
      const pendingFocus = requestedFocus !== null;
      if (pendingFocus) stopCameraMotion();
      requestedFocus=id;
      if (!pendingFocus) overviewPose={pan:cameraPan.clone(),zoom};
      const whole=cameraBounds(); const local=new THREE.Box3().setFromObject(feature,true).expandByScalar(.6);
      const wholeFit=camera.clone(), localFit=camera.clone(), size={width:container.clientWidth,height:container.clientHeight,angle,padding:1.03};
      frameHomeCamera(wholeFit,whole,size);frameHomeCamera(localFit,local,size);
      const targetZoom=boundedZoom(wholeFit.top/localFit.top,view), targetPan=local.getCenter(new THREE.Vector3()).sub(whole.getCenter(new THREE.Vector3())); targetPan.y=0;
      moveCamera(targetPan,targetZoom,()=>{estateFocus=id;requestedFocus=id;cameraPan.set(0,0,0);zoom=1;frameCamera();onEstateViewChange?.();});
    } else {
      requestedFocus=id;
      const current=estateFeature(estateFocus), currentBounds=new THREE.Box3().setFromObject(current,true).expandByScalar(.6), nextBounds=new THREE.Box3().setFromObject(feature,true).expandByScalar(.6);
      const currentFit=camera.clone(),nextFit=camera.clone(), size={width:container.clientWidth,height:container.clientHeight,angle,padding:1.03};
      frameHomeCamera(currentFit,currentBounds,size);frameHomeCamera(nextFit,nextBounds,size);
      const targetPan=nextBounds.getCenter(new THREE.Vector3()).sub(currentBounds.getCenter(new THREE.Vector3())); targetPan.y=0;
      moveCamera(targetPan,boundedZoom(currentFit.top/nextFit.top,view),()=>{estateFocus=id;requestedFocus=id;cameraPan.set(0,0,0);zoom=1;frameCamera();onEstateViewChange?.();});
    }
  }
  syncRoomEnvelope();
  const observer = new ResizeObserver(frameCamera); observer.observe(container); frameCamera();
  function eventRay(event) {
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
  }
  function surfaceUV(event, id) {
    eventRay(event); const f = faceFrame(id);
    const matrix = new THREE.Matrix4().compose(f.pos, new THREE.Quaternion().setFromEuler(f.rotation), new THREE.Vector3(1, 1, 1));
    if (id === 'table.top') matrix.premultiply(table.matrixWorld);
    const inverse = matrix.clone().invert(); const origin = new THREE.Vector3().setFromMatrixPosition(matrix);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(matrix);
    const hit = raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin), new THREE.Vector3());
    if (!hit) return null; hit.applyMatrix4(inverse); return { u: hit.x / f.width + .5, v: hit.y / f.height + .5 };
  }
  function floorPoint(event) { eventRay(event); return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -.08), new THREE.Vector3()); }
  function getFloorGroundPoint(clientX,clientY) {
    const point=floorPoint({clientX,clientY});
    if(!point||!floorContainsRect(state??{rooms},{minX:point.x-1e-5,maxX:point.x+1e-5,minZ:point.z-1e-5,maxZ:point.z+1e-5}))return null;
    return {x:point.x,y:point.y,z:point.z};
  }
  function interiorHit(event) {
    eventRay(event);
    return raycaster.intersectObjects([...pickables, dynamic], true).find(hit => {
      let node = hit.object;
      while (node) { if (!node.visible) return false; node = node.parent; }
      return hit.object.userData.surfaceId;
    });
  }
  function getFurnitureAnchor(id) {
    const key = String(id ?? '').startsWith('furniture:') ? id : `furniture:${id}`;
    const record = dynamicItems.get(key), group = record?.group;
    if (!group || !group.visible || view !== 'interior') return { x: 0, y: 0, visible: false };
    // Usually only the camera changes. Entrance feedback also animates the
    // group directly, so compare its tiny pose before reusing cached bounds.
    // This catches the final restored pose without walking meshes each frame.
    const pose = record.anchorPose;
    if (!record.anchorBounds || !pose || !pose.position.equals(group.position) || !pose.quaternion.equals(group.quaternion) || !pose.scale.equals(group.scale)) {
      group.updateWorldMatrix(true, true);
      record.anchorBounds = new THREE.Box3().setFromObject(group);
      if (pose) { pose.position.copy(group.position); pose.quaternion.copy(group.quaternion); pose.scale.copy(group.scale); }
      else record.anchorPose = { position: group.position.clone(), quaternion: group.quaternion.clone(), scale: group.scale.clone() };
    }
    const bounds = record.anchorBounds, rect = renderer.domElement.getBoundingClientRect();
    if (bounds.isEmpty() || !rect.width || !rect.height) return { x: 0, y: 0, visible: false };
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let corner = 0; corner < 8; corner++) {
      const point = anchorProjectionPoint.set(corner & 1 ? bounds.max.x : bounds.min.x, corner & 2 ? bounds.max.y : bounds.min.y, corner & 4 ? bounds.max.z : bounds.min.z).project(camera);
      const screenX = rect.left + (point.x + 1) * rect.width / 2, screenY = rect.top + (1 - point.y) * rect.height / 2;
      left = Math.min(left, screenX); right = Math.max(right, screenX); top = Math.min(top, screenY); bottom = Math.max(bottom, screenY);
    }
    // CSS viewport coordinates keep the floating editor independent of DPR.
    return { x: (left + right) / 2, y: top - 12, left, right, top, bottom, visible: right >= rect.left && left <= rect.right && bottom >= rect.top && top <= rect.bottom };
  }
  function editFurniture(event) {
    if (spaceHeld || dragging?.spacePan || view !== 'interior' || furniturePlacement || performance.now() - lastPanAt < 350 || performance.now() - lastPlacementAt < 350) return false;
    const data = interiorHit(event)?.object.userData;
    const id = data?.furnitureId ?? data?.dynamicId?.replace(/^furniture:/, '');
    if (!id || !state?.furniture.some(item => item.id === id)) return false;
    cancelDrag(); onSelect?.(data);
    const anchor = getFurnitureAnchor(id);
    onObjectEdit?.({ id, surfaceId: data.surfaceId, clientX: anchor.visible ? anchor.x : event.clientX, clientY: anchor.visible ? anchor.y : event.clientY });
    return true;
  }
  function placementPose() {
    const item = furniturePlacement?.item;
    return item ? { x: item.x, z: item.z, rotation: item.rotation, ...(item.mount ? { mount: { ...item.mount } } : {}) } : null;
  }
  // Project onto the supporting surface, never onto the floor underneath it.
  function mountAtPointer(event, item, offset = null, rawForDrag = false) {
    const type = getFurniturePlacement(item);
    let mount;
    if (type === 'table') {
      const movingExisting = rawForDrag || offset;
      const hit = movingExisting ? null : interiorHit(event);
      const parentId = movingExisting ? item.mount?.parentId : hit?.object.userData.furnitureId;
      if (!movingExisting && (!hit || !parentId && hit.object.userData.surfaceId !== 'table.top')) return null;
      const support = getFurnitureTableSupport(state, parentId, item.id);
      if (!support) return null;
      if (!movingExisting && (Math.abs(hit.point.y-support.y) > .045 || !hit.face || hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y < .85)) return null;
      eventRay(event);
      const point = movingExisting ? raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-support.y),new THREE.Vector3()) : hit.point;
      const uv = getFurnitureTableUV(state, point, parentId);
      if (!uv || (!offset && !rawForDrag && (uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1))) return null;
      mount = { type, ...(parentId ? {parentId} : {}), u: uv.u - (offset?.u ?? 0), v: uv.v - (offset?.v ?? 0) };
    } else if (type === 'wall') {
      // New items follow the wall actually under the cursor. A ray through an
      // arbitrary wall plane can select a hidden wall behind a window/room.
      const movingExisting = rawForDrag || offset;
      const visibleHit = movingExisting ? null : interiorHit(event);
      if (!movingExisting && !visibleHit) return null;
      if (!movingExisting && furniturePlacement) {
        const data = visibleHit.object.userData;
        const window = data.surfaceId === 'window.frame' || data.roomPart === 'windows' && visibleHit.object.name !== 'sunroom-glazing';
        const obstruction = window ? "DisplayText2748, DisplayText2749."
          : data.roomPart === 'columns' ? "DisplayText0741, DisplayText2749."
          : data.furnitureId ? "DisplayText2750, DisplayText2751." : null;
        if (obstruction) { furniturePlacement.surfaceError = obstruction; return null; }
      }
      eventRay(event);
      const targets = getWallMountTargets(state), hits = [];
      for (const target of targets) {
        // Existing wall items move in their current plane; the initial ray may
        // land outside the mount envelope when grabbing a protruding edge.
        if (movingExisting && target.wallId !== item.mount?.wallId) continue;
        if (!movingExisting && visibleHit.object.userData.surfaceId !== target.surfaceId) continue;
        const normal = new THREE.Vector3(target.axis === 'x' ? 0 : 1, 0, target.axis === 'x' ? 1 : 0);
        if (!movingExisting && (!visibleHit.face || visibleHit.face.normal.clone()
          .transformDirection(visibleHit.object.matrixWorld).dot(normal) < .85)) continue;
        const currentPose = movingExisting ? getFurniturePose(state, item) : null;
        const face = Number.isFinite(offset?.planeFace) ? offset.planeFace
          : currentPose ? target.axis === 'x' ? currentPose.z : currentPose.x : target.face;
        const point = movingExisting
          ? raycaster.ray.intersectPlane(new THREE.Plane(normal, -face), new THREE.Vector3())
          : visibleHit.point;
        if (!point) continue;
        // Cutaway partitions share a room's surface id but are not the full
        // mounting wall. Do not teleport the item from them to the far wall.
        if (!movingExisting && Math.abs((target.axis === 'x' ? point.z : point.x) - target.face) > .65) continue;
        const along = target.axis === 'x' ? point.x : point.z;
        const u = (along - target.from) / (target.to - target.from);
        const pointerV = (point.y - target.minY) / (target.maxY - target.minY);
        if (!movingExisting && (u < 0 || u > 1 || pointerV < 0 || pointerV > 1)) continue;
        // The engine stores a bottom anchor; users point at the item's centre.
        const v = pointerV - (movingExisting ? 0 : (furniturePlacement?.height ?? 0) / 2 / (target.maxY - target.minY));
        hits.push({ target, u, v, distance: point.distanceToSquared(raycaster.ray.origin) });
      }
      const hit = hits.sort((a, b) => a.distance - b.distance)[0];
      if (!hit) return null;
      const keepOffset = !offset?.wallId || offset.wallId === hit.target.wallId;
      mount = { type, wallId: hit.target.wallId, u: hit.u - (keepOffset ? offset?.u ?? 0 : 0), v: hit.v - (keepOffset ? offset?.v ?? 0 : 0) };
    } else return null;
    if (rawForDrag) return mount;
    const bounds = getFurnitureMountBounds(state, { ...item, mount });
    if (!bounds) return null;
    mount.u = clamp(mount.u, bounds.minU, bounds.maxU); mount.v = clamp(mount.v, bounds.minV, bounds.maxV);
    return mount;
  }
  function refreshPlacement(event = null) {
    if(furniturePlacement?.committing)return {ok:true,pending:true};
    if (!furniturePlacement) return;
    if(furniturePlacement.outdoor)return refreshOutdoorPlacement(event);
    const { item, group, materials } = furniturePlacement;
    const type = getFurniturePlacement(item);
    if (event) {
      furniturePlacement.pointer = { clientX: event.clientX, clientY: event.clientY };
      furniturePlacement.surfaceError = null;
      if (type === 'floor') {
        const point = floorPoint(event);
        furniturePlacement.onSurface = !!point;
        if (point) { item.x = Math.round(point.x * 20) / 20; item.z = Math.round(point.z * 20) / 20; }
      } else {
        const mount = mountAtPointer(event, item);
        furniturePlacement.onSurface = !!mount;
        if (mount) item.mount = mount;
      }
    }
    const pose = getFurniturePose(state, item);
    item.x = pose.x; item.z = pose.z;
    group.position.set(pose.x, pose.y, pose.z); group.rotation.y = THREE.MathUtils.degToRad(pose.rotation);
    const candidate = collisionCandidate({ ...item, type: 'furniture' });
    const surfaceError = furniturePlacement.onSurface === false ? furniturePlacement.surfaceError
      ?? (type === 'table' ? "DisplayText2752" : type === 'wall' ? "DisplayText2753" : "DisplayText2754") : null;
    const result = onPlacementPreview?.(placementPose(), { surfaceError, pointer: furniturePlacement.pointer ?? null, waiting: !furniturePlacement.pointer })
      ?? (surfaceError ? { ok: false, error: surfaceError } : { ok: (state?.slab?floorContainsRect(state,{minX:item.x-candidate.halfX,maxX:item.x+candidate.halfX,minZ:item.z-candidate.halfZ,maxZ:item.z+candidate.halfZ}):!!findFurnitureRoom(rooms,item)) && !findHomeCollision(state, candidate) });
    furniturePlacement.valid = result?.ok === true;
    group.visible = furniturePlacement.onSurface !== false;
    const tint = furniturePlacement.valid ? '#75b795' : '#e27d73';
    for (const mat of materials) { if (mat.emissive) mat.emissive.set(tint); }
    hideCollisionGuide();
    if (candidate && group.visible) {
      setVolumeGuide(collisionGuide, getHomeCandidateVolume(state, candidate));
      collisionGuide.material.color.set(tint); collisionGuide.visible = true;
      showWallBlock(result?.collision ?? findHomeCollision(state, candidate));
    }
    requestRender();
    return result;
  }
  function queuePlacementPointer(event) {
    placementPointer = { clientX: event.clientX, clientY: event.clientY };
    // A pointer can fire faster than the display. Reuse the one ghost and
    // validate at most once per frame instead of rebuilding the house.
    if (!placementFrame) placementFrame = requestAnimationFrame(() => {
      placementFrame = 0;
      if (furniturePlacement && placementPointer && !spaceHeld && !dragging?.spacePan) refreshPlacement(placementPointer);
    });
  }
  function clearFurniturePlacement(notify = false) {
    if (!furniturePlacement) return;
    if (placementFrame) cancelAnimationFrame(placementFrame);
    placementFrame = 0; placementPointer = null;
    if(furniturePlacement.outdoor){furniturePlacement.group.userData.dispose?.();furniturePlacement.group.removeFromParent();}
    else release(furniturePlacement.group); furniturePlacement = null;
    cancelDrag(); hideCollisionGuide();
    syncPointerCursor();
    if (notify) onPlacementCancel?.();
  }
  function beginFurniturePlacement(item) {
    if (view !== 'interior' || !state || !getFurnitureFootprint(item?.kind, item.rotation ?? 0)) return false;
    clearFurniturePlacement(false); cancelDrag();
    const group = createLuxuryItem({ ...item, maps }), materials = new Set();
    const height = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).y;
    group.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = false; node.receiveShadow = false;
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
        mat.transparent = true; mat.opacity = .78; mat.depthWrite = false; mat.emissiveIntensity = .24; materials.add(mat);
      }
    });
    adopt(group); root.add(group);
    const room = rooms.find(room => room.id === item.roomId) ?? rooms[0];
    const bounds = (state.slab?getFloorBounds(state):getFurnitureBounds(item.kind,item.rotation??0,room))??getFloorBounds(state);
    const type = getFurniturePlacement(item);
    const mount = type === 'table' ? { type, u: .5, v: .5 }
      : type === 'wall' ? { type, wallId: getWallMountTargets(state)[0]?.wallId, u: .5, v: .5 } : null;
    furniturePlacement = { group, materials, height, onSurface: false, item: { ...item,
      x: Number.isFinite(item.x) ? item.x : (bounds.minX + bounds.maxX) / 2,
      z: Number.isFinite(item.z) ? item.z : (bounds.minZ + bounds.maxZ) / 2,
      rotation: type === 'wall' ? 0 : item.rotation ?? 0, ...(mount ? { mount } : {}) }, valid: false };
    syncPointerCursor(); refreshPlacement();
    return true;
  }
  function refreshOutdoorPlacement(event) {
    const placement=furniturePlacement, {item,group,materials}=placement;
    if(event){const point=floorPoint(event);placement.pointer={clientX:event.clientX,clientY:event.clientY};placement.onSurface=!!point;if(point){item.x=Math.round(point.x*20)/20;item.z=Math.round(point.z*20)/20;}}
    group.position.set(item.x,0,item.z);group.rotation.y=THREE.MathUtils.degToRad(item.rotation);
    const result=onPlacementPreview?.(placementPose(),{surfaceError:placement.onSurface?null:"DisplayText2755",pointer:placement.pointer??null,waiting:!placement.pointer})??validateOutdoorPlacement(outdoorState,item);
    placement.valid=result.ok;group.visible=placement.onSurface;
    const tint=result.ok?'#75b795':'#e27d73';for(const mat of materials)if(mat.emissive)mat.emissive.set(tint);
    hideCollisionGuide();if(group.visible){setVolumeGuide(collisionGuide,getOutdoorItemBounds(item));collisionGuide.material.color.set(tint);}
    requestRender();return result;
  }
  function beginOutdoorPlacement(item) {
    const product=getOutdoorProduct(item?.kind);if(view!=='estate'||!outdoorState||!product)return false;
    clearFurniturePlacement(false);cancelDrag();
    const group=createOutdoorProductModel(product,item),materials=new Set();
    group.traverse(node=>{if(!node.isMesh)return;node.castShadow=false;node.receiveShadow=false;for(const mat of Array.isArray(node.material)?node.material:[node.material]){mat.transparent=true;mat.opacity=.78;mat.depthWrite=false;mat.emissiveIntensity=.24;materials.add(mat);}});
    root.add(group);furniturePlacement={outdoor:true,group,materials,onSurface:false,item:{...item,x:item.x??0,z:item.z??0,rotation:item.rotation??0},valid:false};
    stopCameraMotion();estateFocus=null;requestedFocus=null;cameraPan.set(0,0,0);zoom=1;
    const land=getOutdoorLandBounds(outdoorState),bounds=new THREE.Box3(new THREE.Vector3(land.minX,-.3,land.minZ),new THREE.Vector3(land.maxX,1,land.maxZ)).expandByObject(estateManor);
    frameCamera(bounds);syncPointerCursor();refreshPlacement();return true;
  }
  function setOutdoorState(next) {
    const wasInitialized=!!outdoorState;outdoorState=next;
    const changed=outdoorWorld.setState(next);
    avatarActor.setOutdoorWorld?.(next);
    const removedFocus=estateFocus && !estateFeature(estateFocus);
    if(estateFocus && !estateFeature(estateFocus)){stopCameraMotion();estateFocus=null;requestedFocus=null;cameraPan.set(0,0,0);zoom=1;}
    syncView();if(changed){fitSunToLayout();markShadowsDirty();}
    if(view==='estate' && (!wasInitialized||removedFocus))frameCamera();else requestRender();
  }
  function flashOutdoor(id,options={}) {const group=outdoorWorld.getOwned(id);if(group){flashObjects([group]);feedback.play([group],{kind:'add',entrance:true,label:"DisplayText2756",...options});}}
  function rotatePlacement(delta = 90) {
    if (!furniturePlacement || furniturePlacement.committing || !Number.isFinite(delta) || !furniturePlacement.outdoor && getFurniturePlacement(furniturePlacement.item) === 'wall') return false;
    furniturePlacement.item.rotation = ((furniturePlacement.item.rotation + delta) % 360 + 360) % 360;
    refreshPlacement(); return true;
  }
  function placementKeydown(event) {
    if (event.key === 'Escape' && furniturePlacement) { event.preventDefault(); clearFurniturePlacement(true); }
  }
  function syncPointerCursor() {
    renderer.domElement.style.cursor = furniturePlacement?.committing ? 'wait' : spaceHeld || dragging?.spacePan
      ? dragging?.moved ? 'grabbing' : 'grab'
      : dragging?.moved ? 'grabbing' : furniturePlacement ? 'crosshair' : ['move', 'furniture'].includes(tool) ? 'grab' : 'pointer';
  }
  function keyboardBelongsToControl(event) {
    const target = event.target;
    return target?.isContentEditable || target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"][aria-modal="true"]')
      || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]:not([hidden])');
  }
  function startSpacePan(event) {
    if (event.defaultPrevented || (event.code !== 'Space' && event.key !== ' ') || event.altKey || event.ctrlKey || event.metaKey || keyboardBelongsToControl(event)) return;
    // A focused menu/color button still owns its native Space activation.
    // Arm the temporary hand without closing that menu; pointerDown on the
    // canvas takes over only if the user actually starts a Space-drag.
    const focusedAction = event.target?.closest?.('button, [role="button"], [role="menuitem"], a[href]');
    if (!focusedAction) event.preventDefault();
    if (spaceHeld) return;
    spaceHeld = true;
    if (!focusedAction) onPanStart?.();
    if (placementFrame) cancelAnimationFrame(placementFrame);
    placementFrame = 0; placementPointer = null;
    // If Space arrives during a furniture gesture, discard its preview and
    // take over at the current pointer without committing that furniture pose.
    if (dragging && lastPointerEvent) {
      const previous = dragging;
      cancelDrag();
      if (previous.last) onCancel?.();
      beginPan(lastPointerEvent, null, null, true);
    }
    syncPointerCursor();
  }
  function stopSpacePan(event) {
    if (event?.type === 'keyup' && event.code !== 'Space' && event.key !== ' ') return;
    if (spaceUsedForPan) event?.preventDefault();
    spaceUsedForPan = false;
    const wasHeld = spaceHeld; spaceHeld = false;
    if (dragging?.spacePan) { lastPanAt = performance.now(); cancelDrag(); }
    if (wasHeld) syncPointerCursor();
  }
  function releaseInput() {
    const previewWasMoved = !!dragging?.last;
    stopSpacePan(); touchPoints.clear(); pinchDistance = null; cancelDrag();
    if (previewWasMoved) onCancel?.();
  }
  function visibilityChanged() { if (document.hidden) { stageFacingBound=false;releaseInput(); } else requestRender(); }
  document.addEventListener('keydown', placementKeydown);
  document.addEventListener('keydown', startSpacePan);
  document.addEventListener('keyup', stopSpacePan);
  window.addEventListener('blur', releaseInput);
  document.addEventListener('visibilitychange', visibilityChanged);
  function contextMenuAt(event, data, { select = false } = {}) {
    if (!onContextMenu || spaceHeld || dragging?.spacePan || furniturePlacement) return false;
    if (select && data && !data.stairId) {
      if (view === 'estate') onEstateSelect?.(data.estateFeature);
      else if(data.surfaceId!=='avatar' && !lifeMode)onSelect?.(data);
    }
    const point = floorPoint(event);
    // Snapshot the actual visible surface now. Submenu selection can happen
    // later and elsewhere; its coordinates must never become a new target.
    const hit = view === 'interior' ? interiorHit(event) : null;
    let tableUV = null;
    if (hit && (hit.object.userData.surfaceId === 'table.top' || hit.object.userData.furnitureId))
      tableUV = getFurnitureTableUV(state, hit.point, hit.object.userData.furnitureId);
    const hitData = hit?.object.userData;
    const placementAnchor = freezePlacementAnchor({ view, floorPoint: point, tableUV,
      hit: hit ? { surfaceId: hitData.surfaceId, roomPart: hitData.roomPart, furnitureId: hitData.furnitureId,
        dynamicId: hitData.dynamicId, propId: hitData.propId, meshName: hit.object.name,
        point: hit.point, normal: hit.face?.normal.clone().transformDirection(hit.object.matrixWorld) } : null });
    onContextMenu({ data: data ?? null, clientX: event.clientX, clientY: event.clientY, worldPoint: point ? { x: point.x, y: point.y, z: point.z } : null, placementAnchor, view });
    return true;
  }
  function estateHit(event) {
    eventRay(event);
    return raycaster.intersectObjects([estateManor, estateOutdoor, outdoorWorld], true).find(hit => {
      let node=hit.object; while(node){if(!node.visible)return false;node=node.parent;}
      return hit.object.userData.estateFeature || hit.object.userData.outdoorOwnedId;
    });
  }
  function panCamera(event) {
    const point=floorPoint(event);if(!point || !dragging.anchor)return;
    // Keep the grabbed world point under the pointer, regardless of zoom.
    const before = cameraPan.clone();
    cameraPan.add(dragging.anchor.clone().sub(point));
    cameraPan.y=0;
    cameraPan.x=clamp(cameraPan.x,-40,40);cameraPan.z=clamp(cameraPan.z,-40,40);
    // Keep the depth interval aligned with the house while translating. This
    // hot path stays independent of scene complexity and preserves picking.
    panHomeCamera(camera, cameraPan.clone().sub(before));
    requestRender();
  }
  function beginPan(event, feature=null, contextData=null, spacePan=false) {
    if (spacePan) {
      spaceUsedForPan = true;
      container.focus({ preventScroll: true });
    }
    if (view !== 'interior') setDragQuality(true);
    dragging={type:'camera-pan',feature,contextData,spacePan,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false,anchor:floorPoint(event)};
    renderer.domElement.setPointerCapture(event.pointerId);
    syncPointerCursor();
  }
  function pointerDown(event) {
    // macOS Control-click also belongs to the secondary-click menu gesture.
    if (event.button !== 0 || event.ctrlKey) return;
    // Freeze before capturing any drag anchor. Manual input must never fight
    // an orbit that moves the same world point underneath the pointer.
    stageCamera?.exit({restore:false});
    lastPointerEvent = { clientX:event.clientX, clientY:event.clientY, pointerId:event.pointerId };
    if(event.pointerType==='touch') {
      touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(touchPoints.size===2) {
        cancelDrag();onCancel?.();onPanStart?.();
        const [a,b]=[...touchPoints.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);
        renderer.domElement.setPointerCapture(event.pointerId);return;
      }
    }
    if (spaceHeld) { onPanStart?.(); beginPan(event, null, null, true); return; }
    eventRay(event);
    if (view === 'building') {
      const target=houseMode==='floors'?houseOverview:estateManor;
      const hit=raycaster.intersectObject(target,true).find(hit=>hit.object.visible);
      const storeyTarget=houseMode==='floors'?hit?.object.userData.overviewFloor:hit?.object.userData.storey;
      beginPan(event,null,Number.isInteger(storeyTarget)?{storeyTarget}:null);return;
    }
    if (furniturePlacement) {
      if(furniturePlacement.committing)return;
      refreshPlacement(event);
      dragging = { type:'placement-pointer', pointerId:event.pointerId, startX:event.clientX, startY:event.clientY, moved:false, anchor:floorPoint(event) };
      renderer.domElement.setPointerCapture(event.pointerId); return;
    }
    if (view === 'estate') {
      const actorHit=avatarActor.supportsOutdoor?avatarActor.hit(raycaster):null;
      if(actorHit){dragging={type:'avatar-pointer',data:{surfaceId:'avatar'},pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false};renderer.domElement.setPointerCapture(event.pointerId);return;}
      const hit=estateHit(event),id=hit?.object.userData.outdoorOwnedId;
      const owned=outdoorState?.owned.find(row=>row.id===id && row.status==='placed'),point=floorPoint(event);
      if(owned && point){
        dragging={type:'outdoor',id,item:{...owned.item},offset:point.clone().sub(new THREE.Vector3(owned.item.x,0,owned.item.z)),pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false,last:null};
        renderer.domElement.setPointerCapture(event.pointerId);setDragQuality(true);syncPointerCursor();
      }else beginPan(event,hit?.object.userData.estateFeature,hit?.object.userData??null);
      return;
    }
    const hit = interiorHit(event);
    const actorHit = avatarActor.hit(raycaster);
    const floorHit=floorClickWalk&&hit&&(hit.object.userData.surfaceId==='floor.main'||/^room:.+\.floor$/.test(hit.object.userData.surfaceId??''))&&hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).y>.8;
    if(lifeMode || floorHit || actorHit && (!hit || actorHit.distance < hit.distance)) {
      const data=actorHit && (!hit || actorHit.distance < hit.distance)?{surfaceId:'avatar'}:hit?.object.userData??null;
      dragging={type:'avatar-pointer',data,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false};
      renderer.domElement.setPointerCapture(event.pointerId);return;
    }
    if (!hit) { beginPan(event);return; }
    if(hit.object.userData.stairId){beginPan(event,null,hit.object.userData);return;}
    const data = hit.object.userData, activeTool = tool; onSelect?.(data);
    if (data.surfaceId.startsWith('table.')) {
      const p = floorPoint(event); if (p) dragging = { type: 'table', offset: p.clone().sub(table.position), last: null };
    } else if (data.furnitureId) {
      const p = floorPoint(event), e = state.furniture.find(f => f.id===data.furnitureId);
      if (e && getFurniturePlacement(e) !== 'floor') {
        const mount = mountAtPointer(event, e, null, true);
        if (mount) {
          const target = mount.type === 'wall' ? getWallMountTargets(state).find(wall => wall.wallId === mount.wallId) : null;
          const pose = target ? getFurniturePose(state, e) : null;
          dragging = { type: 'mounted-furniture', id: e.id, offset: { u: mount.u-e.mount.u, v: mount.v-e.mount.v, wallId: e.mount.wallId,
            ...(target ? { planeFace: target.axis === 'x' ? pose.z : pose.x } : {}) }, last: null };
        }
      } else if (p && e) dragging = {type:'furniture',id:e.id,offset:p.clone().sub(new THREE.Vector3(e.x,.08,e.z)),last:null};
    } else if (data.propId || (activeTool === 'decal' && data.decalId)) {
      const type=data.propId?'prop':'decal',id=data.propId??data.decalId;
      const item=state[type==='prop'?'props':'decals'].find(p=>p.id===id);
      const uv=item && surfaceUV(event,item.surfaceId || 'table.top');
      if(uv) dragging={type,id,offset:{u:uv.u-item.u,v:uv.v-item.v},last:null};
    } else if (['plant','toy','rug','stool'].includes(data.surfaceId.split('.')[0])) {
      const objectId=data.surfaceId.split('.')[0],group={plant,toy:rabbit,rug,stool}[objectId],p=floorPoint(event);
      if(p) dragging={type:'placement',objectId,offset:p.clone().sub(group.position),last:null};
    } else {beginPan(event,null,data);return;}
    if (dragging) {
      dragging.contextData = data;
      dragging.pointerId = event.pointerId;dragging.startX=event.clientX;dragging.startY=event.clientY;dragging.moved=false;renderer.domElement.setPointerCapture(event.pointerId);
      if (dragging.type === 'furniture' || dragging.type === 'mounted-furniture') { const item = state.furniture.find(value => value.id === dragging.id); updateCollisionGuide({ ...item, type:'furniture' }); }
      else if (dragging.type === 'placement') { const group = { plant, toy:rabbit, rug, stool }[dragging.objectId]; updateCollisionGuide({ type:'placement', objectId:dragging.objectId, x:group.position.x, z:group.position.z }); }
      else if (dragging.type === 'table') updateCollisionGuide({ type:'table', ...state.table });
    }
  }
  function pointerMove(event) {
    lastPointerEvent = { clientX:event.clientX, clientY:event.clientY, pointerId:event.pointerId };
    if(touchPoints.has(event.pointerId))touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(touchPoints.size===2 && pinchDistance!==null) {
      const [a,b]=[...touchPoints.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);
      interruptCameraMotion();zoom=pinchZoom(zoom,pinchDistance,distance,view);pinchDistance=distance;frameCamera(lastCameraBounds);if(furniturePlacement)refreshPlacement();return;
    }
    if (furniturePlacement && !dragging && !spaceHeld) { queuePlacementPointer(event); return; }
    if (!dragging || !state) return;
    if(!dragging.moved && Math.hypot(event.clientX-dragging.startX,event.clientY-dragging.startY)<=DRAG_THRESHOLD)return;
    if(dragging.type==='avatar-pointer'){dragging.moved=true;return;}
    if (dragging.type === 'placement-pointer') {
      dragging.moved = true; refreshPlacement(event); return;
    }
    if (!dragging.moved) onPanStart?.();
    dragging.moved=true;interruptCameraMotion();renderer.domElement.style.cursor='grabbing';
    if (dragging.type === 'camera-pan') { panCamera(event); return; }
    if(dragging.type==='outdoor'){
      const point=floorPoint(event),group=outdoorWorld.getOwned(dragging.id);if(!point||!group)return;point.sub(dragging.offset);
      const candidate={...dragging.item,x:Math.round(point.x*20)/20,z:Math.round(point.z*20)/20};
      dragging.last={x:candidate.x,z:candidate.z};dragging.validation=validateOutdoorPlacement(outdoorState,candidate);
      group.position.set(candidate.x,0,candidate.z);setVolumeGuide(collisionGuide,getOutdoorItemBounds(candidate));collisionGuide.material.color.set(dragging.validation.ok?'#73a965':'#d95f59');requestRender();return;
    }
    let change;
    if (dragging.type === 'table') {
      const point = floorPoint(event); if (!point) return; point.sub(dragging.offset);
      change = { type: 'table', x: clamp(point.x, -1.1, 1.1), z: clamp(point.z, -1.1, 1.1), rotation: state.table.rotation };
    } else if (dragging.type === 'mounted-furniture') {
      const item = state.furniture.find(f => f.id === dragging.id); if (!item) return;
      const mount = mountAtPointer(event, item, dragging.offset); if (!mount) return;
      const pose = getFurniturePose(state, { ...item, mount });
      change = { type: 'furniture', id: item.id, mount, x: pose.x, z: pose.z };
    } else if (dragging.type === 'furniture') {
      const point=floorPoint(event), item=state.furniture.find(f=>f.id===dragging.id); if(!point||!item)return; point.sub(dragging.offset);
      // Furniture follows the pointer into whichever room it is over and stays
      // fully inside that room, so a sofa can be carried from the living room
      // into the study without ever straddling a partition.
      if(state?.slab)change={type:'furniture',id:item.id,x:point.x,z:point.z};
      else {const room=findRoomAt(rooms,point.x,point.z) ?? findFurnitureRoom(rooms,item) ?? rooms[0];
        const bounds=getFurnitureBounds(item.kind,item.rotation,room) ?? getFurnitureBounds(item.kind,item.rotation,findFurnitureRoom(rooms,item) ?? rooms[0]);
        change={type:'furniture',id:item.id,x:clamp(point.x,bounds.minX,bounds.maxX),z:clamp(point.z,bounds.minZ,bounds.maxZ)};}
    } else if(dragging.type==='placement') {
      const point=floorPoint(event);if(!point)return;point.sub(dragging.offset);
      const group={plant,toy:rabbit,rug,stool}[dragging.objectId];
      const room=findRoomAt(rooms,point.x,point.z) ?? findRoomAt(rooms,group.position.x,group.position.z) ?? rooms[0];
      const bounds=getPlacementBounds(dragging.objectId,room);
      change={type:'placement',objectId:dragging.objectId,x:bounds?clamp(point.x,bounds.minX,bounds.maxX):point.x,z:bounds?clamp(point.z,bounds.minZ,bounds.maxZ):point.z};
    } else {
      const entity = dragging.type === 'decal' ? state.decals.find(d => d.id === dragging.id) : state.props.find(p => p.id === dragging.id);
      if (!entity) return; const uv = surfaceUV(event, entity.surfaceId || 'table.top'); if (!uv) return;
      const bounds = dragging.type === 'decal' ? getDecalBounds(entity.size, entity.rotation) : getPropBounds();
      change = { ...entity, type: dragging.type, u: clamp(uv.u-dragging.offset.u, bounds.minU, bounds.maxU), v: clamp(uv.v-dragging.offset.v, bounds.minV, bounds.maxV) };
    }
    dragging.last = change; updateCollisionGuide(change); onDrag(change, false);
  }
  function pointerUp(event) {
    touchPoints.delete(event.pointerId);
    if(pinchDistance!==null) {pinchDistance=null;cancelDrag();return;}
    if (!dragging || dragging.pointerId!==event.pointerId) return;
    if(dragging.type==='avatar-pointer'){
      const {data,moved}=dragging;cancelDrag();
      if(!moved){
        onObjectClick?.({data,view,clientX:event.clientX,clientY:event.clientY});
        if(data?.stairId&&avatarActor.useStairs)avatarActor.useStairs(data.stairId);
        else onAvatarClick?.({data,clientX:event.clientX,clientY:event.clientY,worldPoint:getFloorGroundPoint(event.clientX,event.clientY)});
      }
      return;
    }
    if(dragging.type==='camera-pan'&&!dragging.moved&&Number.isInteger(dragging.contextData?.storeyTarget)) {
      const data=dragging.contextData,{storeyTarget:target,stairId}=data;cancelDrag();
      if(stairId&&onObjectClick)onObjectClick({data,view,clientX:event.clientX,clientY:event.clientY});
      else if(avatarActor.useStairs)avatarActor.useStairs(stairId);else onStoreyChange?.(target);return;
    }
    if (dragging.spacePan) {
      lastPanAt = performance.now(); cancelDrag();
      if (furniturePlacement) refreshPlacement();
      syncPointerCursor(); return;
    }
    if (dragging.type === 'placement-pointer') {
      cancelDrag();
      if (!furniturePlacement) return;
      const valid = refreshPlacement(event);
      if (valid?.ok === true) {
        const placement=furniturePlacement,pose=placementPose();
        commitHomePlacement(placement,{
          commit:()=>onPlacementCommit?.(pose),
          isCurrent:value=>!disposed&&furniturePlacement===value,
          accept:()=>{lastPlacementAt=performance.now();clearFurniturePlacement(false);syncPointerCursor();},
          reject:result=>{refreshPlacement();onPlacementReject?.(result);syncPointerCursor();},
        });
      } else onPlacementReject?.(valid);
      syncPointerCursor();
      return;
    }
    if(dragging.type==='outdoor'){
      const {id,last,validation,moved}=dragging;if(moved)lastPanAt=performance.now();cancelDrag();
      if(last){if(validation?.ok)onOutdoorMove?.(id,last);else onPlacementReject?.(validation);}
      if(!moved)onObjectClick?.({data:{outdoorOwnedId:id},view,clientX:event.clientX,clientY:event.clientY});
      return;
    }
    if (dragging.moved) lastPanAt = performance.now();
    if(dragging.type==='camera-pan') {
      if(dragging.moved)lastPanAt=performance.now();
      else if(view==='estate'&&floorClickWalk&&avatarActor.supportsOutdoor&&dragging.feature==='lawn'){const point=floorPoint(event);if(point)onAvatarClick?.({data:{surfaceId:'outdoor-ground'},clientX:event.clientX,clientY:event.clientY,worldPoint:{x:point.x,y:point.y,z:point.z}});}
      else if(dragging.feature)onEstateSelect?.(dragging.feature);
    }
    // A completed primary click, never pointer-down, opens object actions.
    // Drag, pinch, Control-click and Space-pan keep their existing ownership.
    const clickedData=!dragging.moved?dragging.contextData??null:undefined;
    if (dragging.last) onDrag(dragging.last, true); dragging = null; hideCollisionGuide();
    if(clickedData!==undefined)onObjectClick?.({data:clickedData,view,clientX:event.clientX,clientY:event.clientY});
    if (view !== 'interior') setDragQuality(false);
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    syncPointerCursor();
    // Primary clicks select or place; editing is opened by the native
    // contextmenu event (right button or a trackpad secondary click).
  }
  function cancelDrag() {
    if(dragging?.type==='outdoor'){const item=outdoorState?.owned.find(row=>row.id===dragging.id)?.item,group=outdoorWorld.getOwned(dragging.id);if(item&&group)group.position.set(item.x,0,item.z);}
    if (dragging && renderer.domElement.hasPointerCapture(dragging.pointerId)) renderer.domElement.releasePointerCapture(dragging.pointerId);
    dragging = null; hideCollisionGuide(); if (view !== 'interior') setDragQuality(false); syncPointerCursor();
  }
  renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointerup', pointerUp); renderer.domElement.addEventListener('pointercancel', event => {touchPoints.delete(event.pointerId);pinchDistance=null;cancelDrag();onCancel?.();});
  renderer.domElement.addEventListener('dblclick', event => {
    if (spaceHeld || dragging?.spacePan) return;
    if (view !== 'estate') return;
    if (performance.now()-lastPanAt<350) return;
    const hit = estateHit(event);
    onPanStart?.();
    onEstateFocus?.(hit?.object.userData.estateFeature ?? null);
  });
  renderer.domElement.addEventListener('contextmenu', event => {
    stageCamera?.exit({restore:false});
    if (spaceHeld || dragging?.spacePan || furniturePlacement) { event.preventDefault(); return; }
    if(view==='building'){event.preventDefault();cancelDrag();contextMenuAt(event,null);return;}
    if (onContextMenu) {
      event.preventDefault();
      const hadPreview = !!dragging?.last;
      cancelDrag();
      if (hadPreview) onCancel?.();
      let hit = view === 'estate' ? estateHit(event) : interiorHit(event);
      if(view==='interior'||view==='estate'&&avatarActor.supportsOutdoor){const actorHit=avatarActor.hit(raycaster);if(actorHit&&(!hit||actorHit.distance<hit.distance))hit=actorHit;}
      contextMenuAt(event, hit?.object.userData ?? null, { select:true }); return;
    }
    if (view === 'interior' && (furniturePlacement || editFurniture(event))) event.preventDefault();
  });
  renderer.domElement.addEventListener('wheel', event => {
    event.preventDefault();stageCamera?.exit({restore:false});onPanStart?.();interruptCameraMotion();
    if(event.ctrlKey || event.deltaMode!==0) zoom=wheelZoom(zoom,event.deltaY,event.deltaMode,view);
    else {
      const start={clientX:event.clientX,clientY:event.clientY},end={clientX:event.clientX-event.deltaX,clientY:event.clientY-event.deltaY};
      const anchor=floorPoint(start),point=floorPoint(end);
      if(anchor&&point)cameraPan.add(anchor.sub(point));
      cameraPan.x=clamp(cameraPan.x,-40,40);cameraPan.z=clamp(cameraPan.z,-40,40);
    }
    frameCamera(lastCameraBounds);
  }, { passive: false });
  // Optional presentation adapter for isolated look development. The ordinary
  // account editor supplies neither option; its lighting and input stay owned
  // by this renderer. No account state or persistence capability is exposed.
  onRenderSetup?.({scene,renderer,camera,hemisphere,sun,fill,maps,requestRender,markShadowsDirty});
  return {
    setState, setOutdoorState, beginOutdoorPlacement, flashOutdoor,
    setAvatar:value=>avatarActor.setAvatar(value),
    captureRobotActivity:options=>avatarActor.captureActivity?.(options)??null,
    clearRobotAccountBinding(){stageFacingBound=false;stageCamera?.reset();container.dataset.stageActive='false';stageLighting?.reset();avatarActor.clearAccountBinding?.();},
    getFurnitureModels:()=>[...dynamicItems.entries()].filter(([id])=>id.startsWith('furniture:')).map(([id,record])=>({itemId:id.slice(10),group:record.group})),
    requestObjectRender:requestRender,
    setObjectContext:commerce=>avatarActor.setObjectContext?.(commerce),
    changeAvatarTelevisionChannel:id=>avatarActor.changeTelevisionChannel?.(id)??{ok:false,error:"DisplayText2757."},
    setLifeMode(value){lifeMode=!!value;cancelDrag();avatarActor.stand();updateSelection();syncPointerCursor();},
    walkAvatar:point=>avatarActor.walk(point),
    getAvatarInteractions:id=>avatarActor.interactions(id),
    getAvatarTargetLabel:id=>avatarActor.targetLabel(id),
    interactAvatar:(targetId,id)=>avatarActor.interact(targetId,id),
    standAvatar:()=>avatarActor.stand(),
    danceAvatar:options=>avatarActor.dance?.({...options,facing:angle})??{ok:false,error:"DisplayText2758."},
    stopAvatarDance:()=>avatarActor.stopDance?.(),
    getStageState:()=>avatarActor.getStageState?.()??{active:false},
    getStageCameraState:()=>stageCamera.getState(),
    exitStageCamera:()=>stageCamera.exit(),
    resumeStageCamera:()=>{avatarActor.setDanceFacing?.(angle);return stageCamera.resume();},
    hideAvatar(){stageFacingBound=false;stageCamera?.reset();pendingAvatarArrival=null;container.dataset.stageActive='false';stageLighting?.reset();avatarActor.setVisible(false);},
    waveAvatar:()=>avatarActor.wave(),
    getAvatarStairs:()=>avatarActor.listStairs?.()??[],
    useAvatarStairs:id=>avatarActor.useStairs?.(id)??{ok:false,error:"DisplayText2759."},
    setView(value) { if(!['estate','interior','building'].includes(value))return; if(value!==view){stageFacingBound=false;stageCamera?.reset();clearFurniturePlacement(true);}else stageCamera?.exit({restore:false}); cancelDrag();stopCameraMotion(); clearPulse();feedback.clear();view=value;estateFocus=null;requestedFocus=null;estatePan.set(0,0,0);zoom=1;angle=Math.PI/4;if(view==='building'&&houseMode==='floors')ensureHouseOverview();syncView();fitSunToLayout();markShadowsDirty();frameCamera(); },
    setHouseMode,
    getHouseMode() { return houseMode; },
    setEstateState(value) {
      // The estate editor has four independent routes per area. Keep the
      // exterior scene in sync with the full v2 state so a material, decor,
      // detail, or colour click is visible immediately instead of only
      // changing the legacy structure rank.
      estateLevels = value.levels;
      const plan = outdoorPlan();
      estateOutdoor.setTier(plan.tier, plan.house);
      estateOutdoor.setCustomization({ levels: value.levels, plans: value.plans, colors: value.colors });
      estateManor.setCustomization({ rooms:groundRooms(),floors:exteriorFloors(), plans: value.plans?.manor, color: value.colors?.manor });
      syncRoomEnvelope();
      syncView(); markShadowsDirty(); frameCamera();
    },
    focusEstate,
    isEstateFocused() { return requestedFocus !== null; },
    getEstateFocus() { return estateFocus; },
    setRooms(value) { rooms = value; layoutKey = ''; roomExpansion.setRooms(value,{stairs:getHomeStairs(state),slab:state?.slab??null,profile:state?.profile}); syncRoomEnvelope(); markShadowsDirty(); frameCamera(); requestRender(); },
    getRooms() { return rooms; },
    getFloorGroundPoint,
    getFloorBounds() { return getFloorBounds(state??{rooms}); },
    getFurnitureAnchor,
    getFurniturePlacementAtContext(item, request) { return getFurniturePlacementAtAnchor(state, item, request?.placementAnchor); },
    beginFurniturePlacement,
    rotatePlacement,
    cancelPlacement() { clearFurniturePlacement(true); },
    isPlacing() { return furniturePlacement !== null; },
    cancelDrag,
    // Picking a visible surface must not recenter or rotate the user's view.
    // Camera movement belongs to explicit pan, zoom, turn and focus actions.
    selectSurface(id) { selected = id; updateSelection(); },
    setTool(value) { tool = value; syncPointerCursor(); },
    flashSelection,
    flashEstate,
    cameraTurn(direction) { stageCamera?.exit({restore:false}); angle += direction * Math.PI / 2; frameCamera(lastCameraBounds); },
    zoom(direction) { stageCamera?.exit({restore:false});interruptCameraMotion(); zoom = boundedZoom(zoom + direction * .1, view); frameCamera(lastCameraBounds); },
    showCollision(volume) { showWallBlock(volume, true); },
    getStats() { return { ...renderer.info.render, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, surfaceCount: parts.size }; },
    dispose() { disposed=true; stageCamera?.dispose(); stageLighting?.dispose(); if(renderFrame)cancelAnimationFrame(renderFrame); avatarActor.dispose(); if(staircase){release(staircase);staircase=null;} outdoorWorld.dispose(); houseOverview?.userData.dispose?.(); houseLabels.remove(); releaseInput(); clearFurniturePlacement(false); document.removeEventListener('keydown', placementKeydown); document.removeEventListener('keydown', startSpacePan); document.removeEventListener('keyup', stopSpacePan); window.removeEventListener('blur', releaseInput); document.removeEventListener('visibilitychange', visibilityChanged); clearPulse(); feedback.dispose(); clearTimeout(wallBlockTimer); wallBlockGuide.material.dispose(); collisionGuide.geometry.dispose(); collisionGuide.material.dispose(); observer.disconnect(); selection.geometry.dispose(); selection.material.dispose(); sun.shadow.dispose(); renderer.dispose(); ownedGeometries.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); roomExpansion.dispose();floorTextures?.dispose(); estateOutdoor.dispose(); estateManor.dispose();if(theme.id==='warm')container.style.background=originalBackdrop; renderer.domElement.remove(); }
  };
}
