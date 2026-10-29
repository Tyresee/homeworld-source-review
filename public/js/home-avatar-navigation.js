import {getFurnitureRobotAction,isRobotBedKind} from './home-furniture-capabilities.js';
/** CPU-only navigation and interaction anchors. Build once per requested walk,
 * never from the animation loop. Uses the same model envelopes as placement. */
import * as THREE from 'three';
import { getFloorRects, hasStarterRoom } from './home-layout.js';
import { getHomeBuildingVolumes } from './home-building-collision.js';
import { getHomeCandidateVolume, getFurniturePose, FURNITURE_ITEMS } from './home-engine.js';
import { createLuxuryItem } from './home-luxury-models.js';

export const AVATAR_NAVIGATION = Object.freeze({ radius:.29, height:1.47, floorY:.08, step:.22, maxVisited:8000 });
const E = 1e-7, definitions = new Map(FURNITURE_ITEMS.map(row=>[row.id,row]));
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const rotationOf = (a,b) => Math.atan2(b.x-a.x,b.z-a.z)*180/Math.PI;
const rotate = (x,z,rotation) => { const a=rotation*Math.PI/180; return {x:x*Math.cos(a)+z*Math.sin(a),z:-x*Math.sin(a)+z*Math.cos(a)}; };
const failure = (reason,error) => ({ok:false,path:[],reason,error});
function optionsFor(options={}) {
  return {radius:Number.isFinite(options.radius)&&options.radius>0?Math.max(.08,Math.min(1,options.radius)):AVATAR_NAVIGATION.radius,
    height:Number.isFinite(options.height)&&options.height>0?Math.max(.25,Math.min(2.4,options.height)):AVATAR_NAVIGATION.height,
    maxVisited:Number.isInteger(options.maxVisited)&&options.maxVisited>0?Math.min(16000,options.maxVisited):AVATAR_NAVIGATION.maxVisited};
}
function contextFor(home,options={}) {
  const settings=optionsFor(options), rects=getFloorRects(home), floorY=AVATAR_NAVIGATION.floorY;
  if(!rects.length)return null;
  const candidates=[];
  if(home.profile!=='upper'&&hasStarterRoom(home)) {
    candidates.push({id:'table',x:home.table.x,z:home.table.z});
    for(const [id,p] of Object.entries(home.placements??{}))if(id!=='rug')candidates.push({id:`placement:${id}`,x:p.x,z:p.z});
    for(const item of home.props??[]) {
      const offset=rotate((item.u-.5)*2.25,(.5-item.v)*1.35,home.table.rotation);
      candidates.push({id:`prop:${item.id}`,item,x:home.table.x+offset.x,z:home.table.z+offset.z,rotation:home.table.rotation});
    }
  }
  for(const item of home.furniture??[]) {
    if(item.kind==='rug'||definitions.get(item.kind)?.family==='rugs')continue;
    candidates.push({id:`furniture:${item.id}`,item});
  }
  const volumes=[...getHomeBuildingVolumes(home),...candidates.map(c=>getHomeCandidateVolume(home,c)).filter(Boolean)]
    .filter(v=>v.maxY>floorY+.04&&v.minY<floorY+settings.height-E);
  const obstacles=volumes.map(v=>({...v,minX:v.minX-settings.radius,maxX:v.maxX+settings.radius,minZ:v.minZ-settings.radius,maxZ:v.maxZ+settings.radius}));
  const bounds={minX:Math.min(...rects.map(r=>r.minX)),maxX:Math.max(...rects.map(r=>r.maxX)),minZ:Math.min(...rects.map(r=>r.minZ)),maxZ:Math.max(...rects.map(r=>r.maxZ))};
  const floorIndex=spatialIndex(rects),obstacleIndex=spatialIndex(obstacles);
  const supported=p=>{
    const box={minX:p.x-settings.radius,maxX:p.x+settings.radius,minZ:p.z-settings.radius,maxZ:p.z+settings.radius};
    // getFloorRects is a disjoint union: overlapping intersection areas may
    // safely be summed without rebuilding/subtracting every slab per node.
    let area=0;for(const r of floorIndex(box))area+=Math.max(0,Math.min(box.maxX,r.maxX)-Math.max(box.minX,r.minX))*Math.max(0,Math.min(box.maxZ,r.maxZ)-Math.max(box.minZ,r.minZ));
    return area>=settings.radius*settings.radius*4-E;
  };
  const clear=p=>finitePoint(p)&&supported(p)&&!obstacleIndex({minX:p.x,maxX:p.x,minZ:p.z,maxZ:p.z}).some(v=>p.x>v.minX+E&&p.x<v.maxX-E&&p.z>v.minZ+E&&p.z<v.maxZ-E);
  return {home,...settings,rects,obstacles,bounds,supported,clear,floorIndex,obstacleIndex};
}
function spatialIndex(rows) {
  const bins=new Map(),large=[];
  for(const row of rows) {
    const x0=Math.floor(row.minX),x1=Math.floor(row.maxX),z0=Math.floor(row.minZ),z1=Math.floor(row.maxZ);
    if((x1-x0+1)*(z1-z0+1)>1024){large.push(row);continue;}
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=`${x}:${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(row);}
  }
  return box=>{
    const x0=Math.floor(box.minX),x1=Math.floor(box.maxX),z0=Math.floor(box.minZ),z1=Math.floor(box.maxZ);
    if((x1-x0+1)*(z1-z0+1)>2048)return rows;
    const found=new Set(large);for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)for(const row of bins.get(`${x}:${z}`)??[])found.add(row);
    return [...found];
  };
}
/** Segment intersection against conservative radius-expanded envelopes. Exact
 * wall segments prevent tunnelling through thin partitions or diagonal cuts. */
function intersects(a,b,box) {
  let low=0,high=1;
  for(const axis of ['X','Z']) {
    const key=axis.toLowerCase(),delta=b[key]-a[key],min=box[`min${axis}`]+E,max=box[`max${axis}`]-E;
    if(Math.abs(delta)<E) {if(a[key]<=min||a[key]>=max)return false;continue;}
    const u=(min-a[key])/delta,v=(max-a[key])/delta;
    low=Math.max(low,Math.min(u,v));high=Math.min(high,Math.max(u,v));
    if(low>=high)return false;
  }
  return high>0&&low<1;
}
function segmentClear(context,a,b) {
  const swept={minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)};
  if(!context.clear(a)||!context.clear(b)||context.obstacleIndex(swept).some(box=>intersects(a,b,box)))return false;
  // Support membership can change only when one side of the avatar footprint
  // crosses a slab edge. Test each resulting interval, including thin gaps.
  const cuts=[0,1];
  for(const r of context.floorIndex({minX:swept.minX-context.radius,maxX:swept.maxX+context.radius,minZ:swept.minZ-context.radius,maxZ:swept.maxZ+context.radius}))for(const axis of ['X','Z']) {
    const key=axis.toLowerCase(),delta=b[key]-a[key];if(Math.abs(delta)<E)continue;
    for(const edge of [r[`min${axis}`],r[`max${axis}`]])for(const offset of [-context.radius,context.radius]) {
      const t=(edge+offset-a[key])/delta;if(t>0&&t<1)cuts.push(t);
    }
  }
  cuts.sort((x,y)=>x-y);
  for(let i=1;i<cuts.length;i++) {
    const t=(cuts[i-1]+cuts[i])/2;
    if(!context.supported({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}))return false;
  }
  return true;
}
/** Public collision query is useful when the floor changes or furniture moves. */
export function isAvatarPositionWalkable(home,point,options={}) {return contextFor(home,options)?.clear(point)??false;}

class Queue {
  constructor(){this.rows=[];}
  push(row){const a=this.rows;a.push(row);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].f<=row.f)break;a[i]=a[p];i=p;}a[i]=row;}
  pop(){const a=this.rows,result=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=last.f)break;a[i]=a[c];i=c;}a[i]=last;}return result;}
  get length(){return this.rows.length;}
}
function planWithContext(context,from,to) {
  if(!context||!finitePoint(from)||!finitePoint(to))return failure('invalid',"DisplayText0233.");
  if(!context.clear(from))return failure('blocked-start',"DisplayText0234, DisplayText0235.");
  if(!context.clear(to))return failure('blocked-target',"DisplayText0236, DisplayText0237, DisplayText0238.");
  const start={x:from.x,z:from.z},end={x:to.x,z:to.z};
  if(segmentClear(context,start,end))return {ok:true,path:[start,end],visited:0};
  const step=AVATAR_NAVIGATION.step,origin={x:context.bounds.minX,z:context.bounds.minZ};
  const coordinate=(ix,iz)=>({x:origin.x+ix*step,z:origin.z+iz*step});
  const valid=new Map(), key=(ix,iz)=>`${ix}:${iz}`;
  const cellClear=(ix,iz)=>{const k=key(ix,iz);if(!valid.has(k))valid.set(k,context.clear(coordinate(ix,iz)));return valid.get(k);};
  const near=p=>{const x=Math.round((p.x-origin.x)/step),z=Math.round((p.z-origin.z)/step),out=[];
    for(let ix=x-2;ix<=x+2;ix++)for(let iz=z-2;iz<=z+2;iz++){const point=coordinate(ix,iz);if(cellClear(ix,iz)&&segmentClear(context,p,point))out.push({ix,iz,key:key(ix,iz),point});}
    return out;};
  const starts=near(start),ends=new Map(near(end).map(row=>[row.key,row]));
  if(!starts.length||!ends.size)return failure('no-path',"DisplayText0239.");
  const open=new Queue(),best=new Map(),nodes=new Map(),closed=new Set();
  for(const node of starts){const g=distance(start,node.point);best.set(node.key,g);nodes.set(node.key,{...node,g,parent:null});open.push({...node,g,f:g+distance(node.point,end)});}
  let reached=null,visited=0;
  while(open.length&&visited<context.maxVisited) {
    const current=open.pop();if(closed.has(current.key)||current.g!==best.get(current.key))continue;
    closed.add(current.key);visited++;
    if(ends.has(current.key)){reached=current.key;break;}
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
      const ix=current.ix+dx,iz=current.iz+dz,k=key(ix,iz);
      if(closed.has(k)||!cellClear(ix,iz))continue;
      if(dx&&dz&&(!cellClear(current.ix+dx,current.iz)||!cellClear(current.ix,current.iz+dz)))continue;
      const point=coordinate(ix,iz);if(!segmentClear(context,current.point,point))continue;
      const g=current.g+distance(current.point,point);if(g>=(best.get(k)??Infinity)-E)continue;
      const node={ix,iz,key:k,point,g,parent:current.key};best.set(k,g);nodes.set(k,node);open.push({...node,f:g+distance(point,end)});
    }
  }
  if(!reached)return {...failure(visited>=context.maxVisited?'budget':'no-path',visited>=context.maxVisited?"DisplayText0240, DisplayText0241.":"DisplayText0242, DisplayText0243."),visited};
  const reversed=[];for(let k=reached;k;k=nodes.get(k).parent)reversed.push(nodes.get(k).point);
  const raw=[start,...reversed.reverse(),end],path=[start];
  for(let i=0;i<raw.length-1;){let j=raw.length-1;while(j>i+1&&!segmentClear(context,raw[i],raw[j]))j--;path.push(raw[j]);i=j;}
  return {ok:true,path,visited};
}
export function planAvatarWalk(home,from,to,options={}) {return planWithContext(contextFor(home,options),from,to);}
export function findAvatarSpawn(home,preferred,options={}) {
  const context=contextFor(home,options);if(!context)return null;
  if(finitePoint(preferred)&&context.clear(preferred))return {x:preferred.x,z:preferred.z};
  // Candidate priority is stable. Enumerate each actual slab, never the empty
  // world rectangle between distant pieces; stop at a fixed work budget.
  const common=[{x:0,z:1.65},{x:1.5,z:1.5},{x:-1.5,z:1.5},{x:0,z:-1.5}];
  for(const point of common)if(context.clear(point))return point;
  let checked=0;
  for(const r of context.rects) {
    const center={x:(r.minX+r.maxX)/2,z:(r.minZ+r.maxZ)/2};if(context.clear(center))return center;
    for(let z=r.minZ+context.radius+.02;z<r.maxZ-context.radius;z+=.28)for(let x=r.minX+context.radius+.02;x<r.maxX-context.radius;x+=.28) {
      if(++checked>context.maxVisited)return null;const point={x,z};if(context.clear(point))return point;
    }
  }
  return null;
}

const anchorCache=new Map();
const seatKinds=new Set(['sofa','daybedSofa','diningChair','lcCloudSofa','lcSpindleSofa','lcWingChair','lcBarrelChair','lcWovenBench','lcPianoBench','lcEntryBench','lcOttoman','hhSpindleChair','hhTulipChair','hhDiningBench','hhShoeBench']);
const bedKinds={has:isRobotBedKind};
function actionAnchor(item) {
  if(!seatKinds.has(item.kind)&&!bedKinds.has(item.kind))return null;
  const key=JSON.stringify([item.kind,item.level,item.plans,item.material]);if(anchorCache.has(key))return anchorCache.get(key);
  const model=createLuxuryItem(item),parts=[];
  model.updateMatrixWorld(true);
  model.traverse(mesh=>{if(!mesh.isMesh)return;const box=new THREE.Box3().setFromObject(mesh);parts.push({part:mesh.userData.part,box});});
  let selected=bedKinds.has(item.kind)?parts.filter(p=>['duvet','mattress','daybed-mattress','folded-blanket'].includes(p.part))
    :parts.filter(p=>['seat-cushion','continuous-seat','round-seat','bench-seat','woven-seat-strip','wide-bench-cushion','bench-cushion'].includes(p.part));
  if(item.kind==='sofa')selected=parts.filter(p=>p.part==='upholstery'&&p.box.max.y<.70&&p.box.max.y>.38&&p.box.max.x-p.box.min.x>.55&&p.box.max.z-p.box.min.z>.45);
  if(['hhSpindleChair','hhTulipChair','hhDiningBench','hhShoeBench'].includes(item.kind))selected=parts.filter(p=>p.box.min.y>.40&&p.box.max.y<.70&&p.box.max.x-p.box.min.x>.4&&p.box.max.z-p.box.min.z>.35);
  if(item.kind==='bed')selected=parts.filter(p=>p.box.max.y<.59&&p.box.max.y>.44&&p.box.max.x-p.box.min.x>1&&p.box.max.z-p.box.min.z>.7);
  if(bedKinds.has(item.kind)&&selected.some(p=>p.part==='duvet'))selected=selected.filter(p=>p.part==='duvet');
  selected.sort((a,b)=>b.box.max.y-a.box.max.y);
  const box=selected[0]?.box,center=box?.getCenter(new THREE.Vector3());
  const anchor=box?{kind:bedKinds.has(item.kind)?'lie':'sit',x:item.kind==='sofa'?center.x:0,y:box.max.y+.012,z:bedKinds.has(item.kind)?0:center.z}:null;
  const geometries=new Set(),materials=new Set();model.traverse(mesh=>{if(mesh.geometry)geometries.add(mesh.geometry);for(const mat of [].concat(mesh.material??[]))materials.add(mat);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  if(anchorCache.size>=128)anchorCache.delete(anchorCache.keys().next().value);anchorCache.set(key,anchor);return anchor;
}
function targetFor(home,targetId) {
  if(!home||typeof targetId!=='string')return null;
  if(targetId?.startsWith('furniture:')) {
    const item=home.furniture?.find(row=>row.id===targetId.slice(10));if(!item)return null;
    const parent=item.mount?.type==='table'?(item.mount.parentId?home.furniture.find(row=>row.id===item.mount.parentId):home.table):null;
    const approachVolume=parent?getHomeCandidateVolume(home,item.mount.parentId?{id:`furniture:${parent.id}`,item:parent}:{id:'table',...parent}):null;
    return {targetId,item,pose:getFurniturePose(home,item),volume:getHomeCandidateVolume(home,{id:targetId,item}),approachVolume,label:definitions.get(item.kind)?.label??"DisplayText0244"};
  }
  if(home.profile==='upper'||!hasStarterRoom(home))return null;
  if(targetId?.startsWith('prop:')) {
    const item=home.props?.find(row=>row.id===targetId.slice(5));if(!item)return null;
    const offset=rotate((item.u-.5)*2.25,(.5-item.v)*1.35,home.table.rotation),pose={x:home.table.x+offset.x,z:home.table.z+offset.z,y:1.192,rotation:home.table.rotation};
    return {targetId,pose,volume:getHomeCandidateVolume(home,{id:targetId,item,...pose}),approachVolume:getHomeCandidateVolume(home,{id:'table',...home.table}),label:"DisplayText0245"};
  }
  const id=String(targetId??'').split('.')[0];
  if(id==='table')return {targetId:'table.top',pose:{...home.table,y:.08},volume:getHomeCandidateVolume(home,{id:'table',...home.table}),label:"DisplayText0246"};
  if(['stool','toy','plant'].includes(id)&&home.placements?.[id]) {
    const p=home.placements[id];return {targetId:id==='stool'?'stool.main':id==='toy'?'toy.body':'plant.pot',pose:{...p,y:.08,rotation:0},volume:getHomeCandidateVolume(home,{id:`placement:${id}`,...p}),label:id==='stool'?"DisplayText0247":id==='toy'?"DisplayText0248":"DisplayText0249"};
  }
  return null;
}
/** Distinguish a known but obstructed object from a non-interactive surface.
 * Does not require a free approach or run a search. */
export function getAvatarInteractionTargetLabel(home,targetId) {return targetFor(home,targetId)?.label??null;}

/** `from` filters genuinely reachable approaches. Without it the caller must
 * call planAvatarWalk before beginning an action. IDs always name placed items. */
export function listAvatarInteractions(home,targetId,options={}) {
  const target=targetFor(home,targetId),context=contextFor(home,options);if(!target||!context)return [];
  const {pose,item}=target,volume=target.approachVolume??target.volume,margin=context.radius+.10;
  const centre={x:(volume.minX+volume.maxX)/2,z:(volume.minZ+volume.maxZ)/2};
  const width=volume.maxX-volume.minX,depth=volume.maxZ-volume.minZ;
  // Sample each actual world envelope edge at its midpoint and two points
  // towards the ends. A bedside cabinet may block the midpoint while leaving
  // an ordinary usable gap beside the foot or the head of a rotated bed.
  const approaches=[0,-.36,.36].flatMap(offset=>[
    {x:centre.x+width*offset,z:volume.maxZ+margin},
    {x:volume.maxX+margin,z:centre.z+depth*offset},
    {x:volume.minX-margin,z:centre.z+depth*offset},
    {x:centre.x+width*offset,z:volume.minZ-margin},
  ]).map((p,index)=>({...p,approachIndex:index})).filter(p=>context.clear(p));
  if(finitePoint(options.from))approaches.sort((a,b)=>distance(a,options.from)-distance(b,options.from));
  if(Number.isSafeInteger(options.approachIndex))approaches.sort((a,b)=>Number(b.approachIndex===options.approachIndex)-Number(a.approachIndex===options.approachIndex));
  let remaining=context.maxVisited;
  const direct=finitePoint(options.from)?approaches.find(p=>segmentClear(context,options.from,p)):null;
  const approach=direct??approaches.find(p=>{
    if(!finitePoint(options.from))return true;
    if(remaining<=0)return false;
    const result=planWithContext({...context,maxVisited:remaining},options.from,p);remaining-=result.visited??0;return result.ok;
  });if(!approach)return [];
  const approachIndex=approach.approachIndex;delete approach.approachIndex;
  const stand={x:approach.x,y:AVATAR_NAVIGATION.floorY,z:approach.z,rotation:rotationOf(approach,pose)};
  const result=[{id:'admire',label:`DisplayText0250${target.label}`,targetId:target.targetId,kind:'admire',approachIndex,approach,pose:stand}];
  let anchor=item?actionAnchor(item):target.targetId==='stool.main'?{kind:'sit',x:0,y:(home.plans?.stool?.decor??home.upgrades?.stool??1)>=2?.71:(home.plans?.stool?.structure??home.upgrades?.stool??1)>=3?.685:.625,z:.04}:null;
  if(anchor) {
    const offset=rotate(anchor.x,anchor.z,pose.rotation??0);
    result.unshift({id:anchor.kind,label:anchor.kind==='sit'?"DisplayText0251":"DisplayText0252",targetId:target.targetId,kind:anchor.kind,approach,
      pose:{x:pose.x+offset.x,y:pose.y+anchor.y,z:pose.z+offset.z,rotation:pose.rotation??0}});
  }
  const kind=item?.kind;
  if(target.targetId==='table.top'||getFurnitureRobotAction(kind)==='read')result.unshift({id:'read',label:"DisplayText0253",targetId:target.targetId,kind:'read',approachIndex,approach,pose:stand});
  if(getFurnitureRobotAction(kind)==='wash')result.unshift({id:'wash',label:"DisplayText0254",targetId:target.targetId,kind:'wash',approachIndex,approach,pose:stand});
  if(getFurnitureRobotAction(kind)==='cook')result.unshift({id:'cook',label:"DisplayText0255",targetId:target.targetId,kind:'cook',approachIndex,approach,pose:stand});
  if(getFurnitureRobotAction(kind)==='dishwash')result.unshift({id:'dishwash',label:"DisplayText0256",targetId:target.targetId,kind:'dishwash',approachIndex,approach,pose:stand});
  return result;
}
