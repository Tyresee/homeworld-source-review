import './home-share-wechat.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createHomeShareExperience} from './home-share-world.js';
import {HOME_THEMES} from './home-theme.js';
import {validateHomeState} from './home-engine.js';
import {createRobotAvatar,setRobotPalette,measureRobotAvatar,disposeRobotAvatar} from './robot-avatar.js';
import {createRobotWardrobe} from './robot-wardrobe.js';
import {findAvatarSpawn} from './home-avatar-navigation.js';
import {getHomeRoamGardenEntry} from './home-roam-outdoor.js';
import {createHomeMaterialMaps} from './home-material-maps.js';
import {getHomeShareCopy} from './home-share-copy.js';

const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const only=(value,keys)=>record(value)&&Object.keys(value).every(key=>keys.includes(key));
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
// The service accepts up to4MiB of snapshot bytes; leave room for its public
// envelope while still rejecting an unbounded or accidental HTML response.
const MAX_PUBLIC_JSON=4*1024*1024+4096;
const errorFor=(code)=>Object.assign(new Error(code),{code});

/** Resolve just a public snapshot or the bundled fictional sample. Neither
 * path accepts a student ID, credentials, a platform session or an edit mode. */
export function getHomeShareRequest(search=''){
  const query=new URLSearchParams(search),id=query.get('share'),sample=query.get('sample');
  if(query.getAll('share').length>1||query.getAll('sample').length>1||id!==null&&sample!==null)throw errorFor('invalid-link');
  if(sample==='1')return{sample:true,path:'assets/home-share/sample.json'};
  if(id&&TOKEN.test(id))return{sample:false,path:`api/v1/shares/${id}`};
  throw errorFor('invalid-link');
}

/** Reject the account shape rather than quietly rendering fields from a full
 * save. The public service owns snapshot validation and identifier remapping. */
export function readHomeShareEnvelope(value){
  if(!only(value,['share'])||!only(value.share,['id','publishedAt','snapshot']))throw errorFor('invalid-snapshot');
  const snapshot=value.share.snapshot;
  if(!only(snapshot,['schemaVersion','gameId','theme','title','floors','outdoor','avatar'])||snapshot.schemaVersion!==1||snapshot.gameId!=='homeworld'||snapshot.theme!=='warm'
    ||typeof snapshot.title!=='string'||!snapshot.title.trim()||snapshot.title.length>60||!Array.isArray(snapshot.floors)||snapshot.floors.length<1||!snapshot.floors.every(validateHomeState)
    ||!only(snapshot.outdoor,['home','owned'])||!Array.isArray(snapshot.outdoor.owned)||snapshot.outdoor.owned.some(item=>!only(item,['id','status','item'])||typeof item.id!=='string'||item.status!=='placed'||!record(item.item))
    ||!only(snapshot.avatar,['kind','modelId','modelVersion','colors','equipped'])||snapshot.avatar.kind!=='robot'||snapshot.avatar.modelId!=='robot-companion'||snapshot.avatar.modelVersion!=='v4'
    ||!only(snapshot.avatar.colors,['shell','accent'])||!['shell','accent'].every(part=>/^#[a-f\d]{6}$/i.test(snapshot.avatar.colors[part]))
    ||!only(snapshot.avatar.equipped,['outfit','headwear','footwear'])||!['outfit','headwear','footwear'].every(slot=>snapshot.avatar.equipped[slot]===null||typeof snapshot.avatar.equipped[slot]==='string'))throw errorFor('invalid-snapshot');
  if(JSON.stringify(snapshot.outdoor.home)!==JSON.stringify(snapshot.floors[0]))throw errorFor('invalid-snapshot');
  return{snapshot:structuredClone(snapshot),publishedAt:typeof value.share.publishedAt==='string'?value.share.publishedAt:null};
}

function disposeRobotSource(scene){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  scene?.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of[].concat(node.material??[])){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
  for(const value of geometries)value.dispose();for(const value of materials)value.dispose();for(const value of textures)value.dispose();
}
/** Standalone public document: fetch one visual-only snapshot, then allocate
 * the real viewer with spectator controls. No account adapter is constructed. */
export function createHomeSharePage({document=globalThis.document,window=globalThis.window,fetchImpl=globalThis.fetch,
  loadRobot=()=>new GLTFLoader().loadAsync(new URL('../assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url).href).then(gltf=>gltf.scene),
  createExperience=createHomeShareExperience,materialFactory=createHomeMaterialMaps}={}){
  const $=id=>document.getElementById(id),stage=$('share-stage'),loading=$('share-loading'),error=$('share-error'),retry=$('share-retry');
  if(!stage||!loading||!error||!retry)throw new TypeError('The share document is incomplete.');
  let disposed=false,generation=0,request=null,experience=null,cleanup=[];
  function release(){for(const dispose of cleanup.reverse())try{dispose();}catch{/* Keep teardown independent so all owned resources can be retired. */}cleanup=[];experience=null;}
  function setError(code){
    loading.hidden=true;error.hidden=false;retry.hidden=code==='invalid-link'||code==='unavailable';
    $('share-error-title').textContent=code==='invalid-link'?"Invalid share link":code==='unavailable'?"This share has expired":"This home could not be opened";
    $('share-error-detail').textContent=code==='invalid-link'?"Open the complete showcase link provided by the teacher.":code==='unavailable'?"Ask the teacher for a new showcase link.":"Try again, or return later.";
    stage.setAttribute('aria-busy','false');
  }
  async function start(){
    if(disposed)return false;const token=++generation;request?.abort();release();loading.hidden=false;error.hidden=true;retry.hidden=false;stage.setAttribute('aria-busy','true');
    let timeout;
    try{
      const target=getHomeShareRequest(window.location.search),endpoint=new URL('../'+target.path,import.meta.url).href;
      const activeRequest=new AbortController();request=activeRequest;timeout=setTimeout(()=>activeRequest.abort(),15000);
      const response=await fetchImpl(endpoint,{method:'GET',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:activeRequest.signal,headers:{accept:'application/json'}});
      if(token!==generation||disposed)return false;
      if(!response.ok)throw errorFor([404,410].includes(response.status)?'unavailable':'load-failed');
      const text=await response.text();if(new TextEncoder().encode(text).byteLength>MAX_PUBLIC_JSON)throw errorFor('invalid-snapshot');
      const {snapshot,publishedAt}=readHomeShareEnvelope(JSON.parse(text));
      if(token!==generation||disposed)return false;
      clearTimeout(timeout);timeout=null;
      const copy=getHomeShareCopy(snapshot.title);
      $('share-title').textContent=copy.title;document.title=copy.title;
      for(const [id,content] of [['share-meta-description',copy.description],['share-meta-title',copy.title],['share-meta-summary',copy.description]])$(id)?.setAttribute('content',content);
      $('share-kind').hidden=!target.sample;$('share-kind').textContent="fictional sample";
      const date=$('share-published'),timestamp=publishedAt&&Date.parse(publishedAt);date.hidden=!Number.isFinite(timestamp)||target.sample;
      if(!date.hidden){date.dateTime=new Date(timestamp).toISOString();date.textContent="Published on "+new Intl.DateTimeFormat('en',{year:'numeric',month:'long',day:'numeric'}).format(timestamp);}
      $('share-loading-label').textContent="Loading…";
      const source=await loadRobot();
      if(token!==generation||disposed){disposeRobotSource(source);return false;}
      cleanup.push(()=>disposeRobotSource(source));
      const materials=materialFactory();cleanup.push(()=>materials.dispose());
      const robot=createRobotAvatar(source);cleanup.push(()=>disposeRobotAvatar(robot));setRobotPalette(robot,snapshot.avatar.colors);
      const wardrobe=createRobotWardrobe(robot);cleanup.push(()=>wardrobe.dispose());wardrobe.setEquipment(snapshot.avatar.equipped);
      const navigation=measureRobotAvatar(robot).navigation;let robotStorey=0,spawn=null;
      for(let i=0;i<snapshot.floors.length;i++){spawn=findAvatarSpawn(snapshot.floors[i],null,navigation);if(spawn){robotStorey=i;break;}}
      if(spawn)robot.position.set(spawn.x,.08,spawn.z);robot.rotation.y=Math.PI/4;robot.updateMatrixWorld(true);
      experience=createExperience({container:stage,home:snapshot.floors[0],floors:snapshot.floors,outdoor:snapshot.outdoor,theme:HOME_THEMES.warm,maps:materials.maps,robot,robotStorey,robotEnvironment:'interior',readOnly:true,locale:'en',onExit:()=>experience?.viewOverview?.()});
      const viewer=experience;cleanup.push(()=>viewer.dispose());
      if(!spawn&&viewer.model?.robot){
        const point=getHomeRoamGardenEntry({estate:viewer.estate,model:viewer.model});
        if(!point)throw errorFor('invalid-snapshot');
        viewer.scene.add(viewer.model.robot);viewer.model.robot.position.copy(point);viewer.model.robot.userData.robotEnvironment='estate';
      }
      viewer.start();loading.hidden=true;stage.setAttribute('aria-busy','false');return true;
    }catch(failure){if(token!==generation||disposed)return false;release();setError(failure.code??'load-failed');return false;}
    finally{if(timeout)clearTimeout(timeout);}
  }
  const again=()=>{void start();};retry.addEventListener('click',again);
  return{start,dispose(){if(disposed)return;disposed=true;generation++;request?.abort();retry.removeEventListener('click',again);release();}};
}

if(typeof document!=='undefined'&&document.querySelector('[data-home-share]')){
  const page=createHomeSharePage();void page.start();window.addEventListener('pagehide',()=>page.dispose(),{once:true});
}
