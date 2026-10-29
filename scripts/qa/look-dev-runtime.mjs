// Browser-only adapter for the local Look Dev workstation. All house geometry
// and character code come from the actual game; no account API is contacted.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createHomeScene} from '../../public/js/home-scene.js';
import {createStudentHomeRobotController} from '../../public/js/student-home-robot-controller.js';
import {HOME_THEMES} from '../../public/js/home-theme.js';
import {getRoomKind} from '../../public/js/home-layout.js';
import {validateHomeState,MATERIALS} from '../../public/js/home-engine.js';
import {createLookDevFixture,LOOK_DEV_SIZE,LOOK_DEV_VIEWS} from './look-dev-fixtures.mjs';
import {paintLookDevBackdrop} from './look-dev-backdrop.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const hex=value=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value);
const materialIds=new Set(MATERIALS.map(row=>row.id));
const number=(value,fallback,min=0,max=20)=>Number.isFinite(value)?THREE.MathUtils.clamp(value,min,max):fallback;
const color=(target,value)=>{if(hex(value))target.set(value);};
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const cleanOverlay=(base,overlay)=>{
  const output=clone(base);
  for(const[key,value]of Object.entries(overlay??{})) {
    if(value===null||value===undefined||['__proto__','constructor','prototype'].includes(key))continue;
    output[key]=typeof value==='object'&&!Array.isArray(value)?cleanOverlay(output[key]??{},value):value;
  }
  return output;
};
const validMaterial=value=>typeof value==='string'&&materialIds.has(value);
const materialCopy=(skin,role,part)=>{
  if(!skin)return;
  if(hex(role?.[part]))skin.color=role[part];
  if(validMaterial(role?.[part+'Material']))skin.material=role[part+'Material'];
};
/** Explicit role edits affect only fresh QA fixture data, never source defaults. */
export function resolveLookDevBuild(fixture,preset) {
  const patch=preset.build?.theme??{},base=Object.hasOwn(HOME_THEMES,patch.id)?HOME_THEMES[patch.id]:HOME_THEMES.default,theme=cleanOverlay(base,patch);
  theme.id=base.id;
  // Keep all maps shape-complete even when a hand-authored preset omits a role.
  theme.rooms??={};theme.shell??={};theme.manor??={};theme.surfaceRemap??={};theme.lighting??={};
  for(const floor of fixture.floors) {
    for(const room of floor.rooms) {
      const kind=getRoomKind(room.kind),role=patch.rooms?.[kind?.baseKind??room.kind]??patch.rooms?.[room.kind];
      if(room.id==='living') {
        if(hex(role?.floor)){floor.surfaces['floor.main'].color=role.floor;if(theme.surfaceRemap['floor.main'])theme.surfaceRemap['floor.main'].to=role.floor;}
        if(validMaterial(role?.floorMaterial))floor.surfaces['floor.main'].material=role.floorMaterial;
        if(hex(role?.wall))for(const id of ['wall.inner','wall.outer','wall.side']){floor.surfaces[id].color=role.wall;if(theme.surfaceRemap[id])theme.surfaceRemap[id].to=role.wall;}
        if(validMaterial(role?.wallMaterial))for(const id of ['wall.inner','wall.outer','wall.side'])floor.surfaces[id].material=role.wallMaterial;
      } else {
        materialCopy(room.floor,role,'floor');materialCopy(room.wall,role,'wall');
      }
    }
    const first=floor.rooms[0],kind=getRoomKind(first?.kind),role=patch.rooms?.[kind?.baseKind??first?.kind]??patch.rooms?.[first?.kind];
    // Unallocated slabs and outer wall parts retain real global surfaces. When
    // editing this reference room, do not let that skin overwrite the role.
    if(hex(role?.floor)){floor.surfaces['floor.main'].color=role.floor;if(theme.surfaceRemap['floor.main'])theme.surfaceRemap['floor.main'].to=role.floor;}
    if(validMaterial(role?.floorMaterial))floor.surfaces['floor.main'].material=role.floorMaterial;
    if(hex(role?.wall))for(const id of ['wall.inner','wall.outer','wall.side']){floor.surfaces[id].color=role.wall;if(theme.surfaceRemap[id])theme.surfaceRemap[id].to=role.wall;}
    if(validMaterial(role?.wallMaterial))for(const id of ['wall.inner','wall.outer','wall.side'])floor.surfaces[id].material=role.wallMaterial;
    if(preset.build?.furniture?.mode==='examples') {
      const examples=preset.build.furniture.examples??{};
      for(const item of floor.furniture) {
        const raw=examples[item.id]??examples[item.kind],example=typeof raw==='string'?{color:raw}:raw;
        if(hex(example?.color))item.color=example.color;
        if(validMaterial(example?.material))item.material=example.material;
      }
    }
    if(!validateHomeState(floor))throw new TypeError('Preset produced an invalid isolated fixture');
  }
  return theme;
}

export async function createLookDevRuntime({container,preset,fixtureId='living',onStatus=()=>{},onReady=()=>{},onFrame=()=>{}}) {
  if(!container)throw new TypeError('A fixed-size canvas container is required');
  const {width,height}=LOOK_DEV_SIZE;
  container.style.width=width+'px';container.style.height=height+'px';
  container.style.position||='relative';container.style.overflow='hidden';
  const presentation=document.createElement('canvas');presentation.width=width;presentation.height=height;
  const context=presentation.getContext('2d',{alpha:false});
  if(!context)throw new Error('2D capture context unavailable');
  let current=clone(preset??{}),currentId=fixtureId,world=null,refs=null,fixture=null,source=null,sourcePromise=null,buildKey='',generation=0,disposed=false,ready=false,readyPromise=Promise.resolve();
  let baselineSun=null,baselineRender=null,capabilities={contactShadow:false};
  const size=()=>({width,height,dpr:1,canvasWidth:refs?.renderer.domElement.width??0,canvasHeight:refs?.renderer.domElement.height??0});
  function emitFrame() {
    if(!refs||disposed)return;
    const backdrop=current.backdrop??{},inner=hex(backdrop.inner)?backdrop.inner:'#fcf7df',outer=hex(backdrop.outer)?backdrop.outer:'#e5edce';
    paintLookDevBackdrop(context,width,height,{inner,outer});
    context.drawImage(refs.renderer.domElement,0,0,width,height);onFrame(presentation);
  }
  function renderNow() {if(!refs||disposed)return;refs.renderer.render(refs.scene,refs.camera);}
  function roomSurfaceSnapshot() {
    const parts=refs?.scene.getObjectByName('room-expansion')?.userData.roomParts;
    if(!parts)return [];
    const textures=Object.entries(refs.maps??{}),rows=new Map();
    for(const part of ['floor','walls'])for(const mesh of parts[part]??[]) {
      for(const material of[].concat(mesh.material??[])) {
        if(!material.color)continue;
        const surfaceId=mesh.userData.surfaceId??null;
        const roomId=mesh.userData.roomId??mesh.userData.themeRoomId??(/^room:(.+)\.(?:floor|wall)$/.exec(surfaceId??'')?.[1])??null;
        const materialKey=material.map?(textures.find(([,texture])=>texture===material.map)?.[0]??'unregistered'):null;
        const row={roomId,surfaceId,part,color:'#'+material.color.getHexString(),materialKey};
        rows.set(JSON.stringify(row),row);
      }
    }
    return [...rows.values()].slice(0,32);
  }
  function snapshot() {
    const render=refs?{
      toneMapping:refs.renderer.toneMapping===THREE.NeutralToneMapping?'neutral':refs.renderer.toneMapping===THREE.ACESFilmicToneMapping?'aces':refs.renderer.toneMapping===THREE.AgXToneMapping?'agx':'none',exposure:refs.renderer.toneMappingExposure,
      hemisphere:{sky:'#'+refs.hemisphere.color.getHexString(),ground:'#'+refs.hemisphere.groundColor.getHexString(),intensity:refs.hemisphere.intensity},
      sun:{color:'#'+refs.sun.color.getHexString(),intensity:refs.sun.intensity,position:refs.sun.position.toArray(),target:refs.sun.target.position.toArray()},
      fill:{color:'#'+refs.fill.color.getHexString(),intensity:refs.fill.intensity},shadowRadius:refs.sun.shadow.radius,environmentIntensity:refs.scene.environmentIntensity,
    }:null;
    return {fixtureId:currentId,presetId:current.id??'custom',ready,size:size(),render,backdrop:clone(current.backdrop??{}),capabilities:{...capabilities},
      camera:refs?{position:refs.camera.position.toArray(),quaternion:refs.camera.quaternion.toArray(),left:refs.camera.left,right:refs.camera.right,top:refs.camera.top,bottom:refs.camera.bottom,near:refs.camera.near,far:refs.camera.far,zoom:refs.camera.zoom}:null,
      items:fixture?.items.map(item=>{const actual=fixture.floors[item.storey].furniture.find(row=>row.id===item.id);return {...item,color:actual?.color,material:actual?.material};})??[],
      roomSurfaces:roomSurfaceSnapshot(),revisions:fixture?.floors.map(floor=>floor.revision)??[],stats:world?.getStats()??null};
  }
  function applyRender() {
    if(!refs||!baselineRender)return;
    const config=current.render??{},r=refs.renderer,scene=refs.scene;
    r.toneMapping=config.toneMapping==='neutral'?THREE.NeutralToneMapping:config.toneMapping==='aces'?THREE.ACESFilmicToneMapping:config.toneMapping==='agx'?THREE.AgXToneMapping:config.toneMapping==='none'?THREE.NoToneMapping:baselineRender.toneMapping;
    r.toneMappingExposure=number(config.exposure,baselineRender.exposure,0,3);
    color(refs.hemisphere.color,config.hemisphere?.sky??baselineRender.sky);color(refs.hemisphere.groundColor,config.hemisphere?.ground??baselineRender.ground);refs.hemisphere.intensity=number(config.hemisphere?.intensity,baselineRender.hemisphere,0,6);
    color(refs.sun.color,config.sun?.color??baselineRender.sunColor);refs.sun.intensity=number(config.sun?.intensity,baselineRender.sun,0,10);
    color(refs.fill.color,config.fill?.color??baselineRender.fillColor);refs.fill.intensity=number(config.fill?.intensity,baselineRender.fill,0,5);
    refs.sun.shadow.radius=number(config.shadowRadius,baselineRender.shadowRadius,0,10);scene.environmentIntensity=number(config.environmentIntensity,baselineRender.environmentIntensity,0,4);
    if(baselineSun&&(Number.isFinite(config.sun?.azimuth)||Number.isFinite(config.sun?.altitude))) {
      const offset=baselineSun.position.clone().sub(baselineSun.target),radius=offset.length(),baselineAzimuth=THREE.MathUtils.radToDeg(Math.atan2(offset.x,offset.z)),baselineAltitude=THREE.MathUtils.radToDeg(Math.asin(offset.y/radius));
      const azimuth=THREE.MathUtils.degToRad(number(config.sun?.azimuth,baselineAzimuth,-180,180)),altitude=THREE.MathUtils.degToRad(number(config.sun?.altitude,baselineAltitude,5,90));
      refs.sun.position.copy(refs.sun.target.position).add(new THREE.Vector3(Math.sin(azimuth)*Math.cos(altitude)*radius,Math.sin(altitude)*radius,Math.cos(azimuth)*Math.cos(altitude)*radius));
    }else if(baselineSun)refs.sun.position.copy(baselineSun.position);
    const contact=hex(config.contactShadow)?config.contactShadow:null;let shadowMaterials=0;
    refs.scene.traverse(object=>{for(const mat of[].concat(object.material??[]))if(mat.isShadowMaterial){shadowMaterials++;if(contact)mat.color.set(contact);}});
    capabilities.contactShadow=shadowMaterials>0;
    refs.markShadowsDirty();refs.requestRender();
  }
  async function loadSource() {return sourcePromise??=new GLTFLoader().loadAsync('/assets/asset-lab/robot-v1/models/v4/robot.glb').then(gltf=>source=gltf.scene);}
  async function rebuild() {
    const own=++generation,nextId=currentId,nextPreset=clone(current);ready=false;onStatus('Building real '+nextId+' scene…');
    const model=await loadSource();if(disposed||own!==generation)return;
    const next=createLookDevFixture(nextId),theme=resolveLookDevBuild(next,nextPreset);
    const previousRenderer=refs?.renderer;world?.dispose();previousRenderer?.forceContextLoss();world=null;refs=null;baselineSun=null;baselineRender=null;fixture=next;
    container.dataset.theme=theme.id;container.style.background='transparent';
    world=createHomeScene({container,theme,onRenderSetup:value=>{
      refs=value;if(!refs.camera)throw new Error('Look Dev requires the scene camera in onRenderSetup');
      refs.renderer.setPixelRatio(1);refs.renderer.setSize(width,height,false);
      const nativeRender=refs.renderer.render.bind(refs.renderer);refs.renderer.render=(...args)=>{const result=nativeRender(...args);emitFrame();return result;};
    },avatarFactory:options=>createStudentHomeRobotController({...options,source:model})});
    if(!refs)throw new Error('Look Dev render setup callback was not provided');
    world.setState(next.home,{floors:next.floors,activeFloor:0});world.setOutdoorState(next);world.setView(next.view);world.selectSurface(null);world.setTool('move');
    const activity={kind:'stand',environment:next.view==='estate'?'estate':'interior',storey:0,point:{...next.robotPoint},rotation:Math.PI/4};
    world.setAvatar({...next.avatar,activity});
    baselineSun={position:refs.sun.position.clone(),target:refs.sun.target.position.clone()};
    baselineRender={sky:'#'+refs.hemisphere.color.getHexString(),ground:'#'+refs.hemisphere.groundColor.getHexString(),sunColor:'#'+refs.sun.color.getHexString(),fillColor:'#'+refs.fill.color.getHexString(),toneMapping:refs.renderer.toneMapping,exposure:refs.renderer.toneMappingExposure,hemisphere:refs.hemisphere.intensity,sun:refs.sun.intensity,fill:refs.fill.intensity,shadowRadius:refs.sun.shadow.radius,environmentIntensity:refs.scene.environmentIntensity};
    buildKey=JSON.stringify(current.build??{});applyRender();
    await nextFrame();await nextFrame();if(disposed||own!==generation)return;
    // Render and copy while the WebGL drawing buffer is still valid.
    renderNow();ready=true;onStatus('Ready · '+nextId+' · 1440 × 900 · DPR 1');onReady(snapshot());
  }
  function scheduleBuild(){readyPromise=rebuild();return readyPromise;}
  async function setPreset(value) {
    if(disposed)throw new Error('Look Dev runtime is disposed');
    if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Preset must be an object');
    current=clone(value);if(!world||buildKey!==JSON.stringify(current.build??{}))return scheduleBuild();
    applyRender();renderNow();return readyPromise;
  }
  async function setFixture(id) {
    if(!LOOK_DEV_VIEWS.some(view=>view.id===id))throw new RangeError('Unknown Look Dev view: '+id);
    if(disposed)throw new Error('Look Dev runtime is disposed');
    if(id===currentId&&world)return readyPromise;currentId=id;return scheduleBuild();
  }
  async function whenReady(){await readyPromise;return snapshot();}
  async function captureView(id=currentId) {
    const previous=currentId;
    try {
      await setFixture(id);await whenReady();renderNow();
      return await new Promise((resolve,reject)=>presentation.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG capture failed')),'image/png'));
    }finally{if(!disposed&&previous!==currentId){await setFixture(previous);await whenReady();}}
  }
  function dispose() {
    if(disposed)return;disposed=true;generation++;ready=false;const previousRenderer=refs?.renderer;world?.dispose();previousRenderer?.forceContextLoss();world=null;refs=null;
    const geometries=new Set(),materials=new Set(),textures=new Set();source?.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const mat of[].concat(node.material??[])){materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);}});
    geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());
  }
  await scheduleBuild();
  return {setPreset,setFixture,whenReady,captureView,dispose,getSnapshot:snapshot,requestRender(){refs?.requestRender();},getCanvas:()=>presentation};
}
