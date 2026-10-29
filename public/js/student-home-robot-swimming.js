/** Outdoor navigation and pool contact paths. No scene, storage or animation loop.
 * Pool contacts are measured from the same scaled models used by the estate. */
import * as THREE from 'three';
import {getFloorBounds,getFloorRects} from './home-layout.js';
import {getOutdoorProduct} from './home-outdoor-catalog.js';
import {getOutdoorLandBounds,getOutdoorItemBounds,OUTDOOR_HOUSE_CLEARANCE} from './home-outdoor-placement.js';
import {getManorEntranceStepBounds} from './home-manor-layout.js';
import {createOutdoorProductModel} from './home-outdoor-models.js';

const E=1e-7,FLOOR_Y=.08,geometryCache=new Map();
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const radians=degrees=>degrees*Math.PI/180;
const rotationBetween=(a,b)=>Math.atan2(b.x-a.x,b.z-a.z)*180/Math.PI;
const failure=(reason,error,visited=0)=>({ok:false,path:[],reason,error,visited});
const expand=(r,amount)=>({minX:r.minX-amount,maxX:r.maxX+amount,minZ:r.minZ-amount,maxZ:r.maxZ+amount});
const within=(p,r)=>p.x>=r.minX-E&&p.x<=r.maxX+E&&p.z>=r.minZ-E&&p.z<=r.maxZ+E;
function navigationFor(options={}){return{radius:Math.max(.08,Math.min(1,Number.isFinite(options.radius)?options.radius:.29)),maxVisited:Math.max(1,Math.min(16000,Number.isSafeInteger(options.maxVisited)?options.maxVisited:8000))};}
function contextFor(state,options={}){
  if(!state?.home)return null;
  const nav=navigationFor(options),land=getOutdoorLandBounds(state),bounds=expand(land,-nav.radius-.02);
  const obstacles=[...getFloorRects(state.home).map(r=>expand(r,OUTDOOR_HOUSE_CLEARANCE+nav.radius)),
    ...getManorEntranceStepBounds(state.home).map(r=>expand(r,nav.radius+.04)),
    ...(state.owned??[]).filter(row=>row.status==='placed').map(row=>getOutdoorItemBounds(row.item)).filter(Boolean).map(r=>expand(r,nav.radius+.03))];
  const clear=p=>finitePoint(p)&&within(p,bounds)&&!obstacles.some(r=>p.x>r.minX+E&&p.x<r.maxX-E&&p.z>r.minZ+E&&p.z<r.maxZ-E);
  return{...nav,bounds,obstacles,clear};
}
function segmentClear(context,a,b){
  if(!context.clear(a)||!context.clear(b))return false;
  // Exact open rectangle/segment clipping; unlike sample-based checks this
  // cannot skip a narrow light post or clip an obstacle corner diagonally.
  for(const r of context.obstacles){
    let lo=0,hi=1;
    for(const axis of ['x','z']){
      const delta=b[axis]-a[axis],min=r[axis==='x'?'minX':'minZ']+E,max=r[axis==='x'?'maxX':'maxZ']-E;
      if(Math.abs(delta)<E){if(a[axis]<=min||a[axis]>=max){lo=2;break;}}
      else{let t0=(min-a[axis])/delta,t1=(max-a[axis])/delta;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);}
    }
    if(lo<hi-E&&hi>0&&lo<1)return false;
  }
  return true;
}
export function isOutdoorRobotPositionWalkable(state,point,options={}){return contextFor(state,options)?.clear(point)??false;}
class Queue{
  constructor(){this.rows=[];}
  push(row){const a=this.rows;a.push(row);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].f<=row.f)break;a[i]=a[p];i=p;}a[i]=row;}
  pop(){const a=this.rows,result=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=last.f)break;a[i]=a[c];i=c;}a[i]=last;}return result;}
  get length(){return this.rows.length;}
}
function plan(context,from,to){
  if(!context||!finitePoint(from)||!finitePoint(to))return failure('invalid',"DisplayText4132.");
  if(!context.clear(from))return failure('blocked-start',"DisplayText4133, DisplayText4134.");
  if(!context.clear(to))return failure('blocked-target',"DisplayText4135, DisplayText4136.");
  const start={x:from.x,z:from.z},end={x:to.x,z:to.z};
  if(segmentClear(context,start,end))return{ok:true,path:[start,end],visited:0};
  const step=.3,origin={x:context.bounds.minX,z:context.bounds.minZ},key=(ix,iz)=>`${ix}:${iz}`,coordinate=(ix,iz)=>({x:origin.x+ix*step,z:origin.z+iz*step}),valid=new Map();
  const cellClear=(ix,iz)=>{const k=key(ix,iz);if(!valid.has(k))valid.set(k,context.clear(coordinate(ix,iz)));return valid.get(k);};
  const near=p=>{const x=Math.round((p.x-origin.x)/step),z=Math.round((p.z-origin.z)/step),out=[];for(let ix=x-2;ix<=x+2;ix++)for(let iz=z-2;iz<=z+2;iz++){const point=coordinate(ix,iz);if(cellClear(ix,iz)&&segmentClear(context,p,point))out.push({ix,iz,key:key(ix,iz),point});}return out;};
  const starts=near(start),ends=new Map(near(end).map(row=>[row.key,row]));
  if(!starts.length||!ends.size)return failure('no-path',"DisplayText4137, DisplayText4138.");
  const open=new Queue(),best=new Map(),nodes=new Map(),closed=new Set();
  for(const node of starts){const g=distance(start,node.point);best.set(node.key,g);nodes.set(node.key,{...node,g,parent:null});open.push({...node,g,f:g+distance(node.point,end)});}
  let reached=null,visited=0;
  while(open.length&&visited<context.maxVisited){
    const current=open.pop();if(closed.has(current.key)||current.g!==best.get(current.key))continue;closed.add(current.key);visited++;
    if(ends.has(current.key)){reached=current.key;break;}
    for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
      const ix=current.ix+dx,iz=current.iz+dz,k=key(ix,iz);if(closed.has(k)||!cellClear(ix,iz))continue;
      if(dx&&dz&&(!cellClear(current.ix+dx,current.iz)||!cellClear(current.ix,current.iz+dz)))continue;
      const point=coordinate(ix,iz);if(!segmentClear(context,current.point,point))continue;
      const g=current.g+distance(current.point,point);if(g>=(best.get(k)??Infinity)-E)continue;
      const node={ix,iz,key:k,point,g,parent:current.key};best.set(k,g);nodes.set(k,node);open.push({...node,f:g+distance(point,end)});
    }
  }
  if(!reached)return failure(visited>=context.maxVisited?'budget':'no-path',"DisplayText4139, DisplayText4140.",visited);
  const reversed=[];for(let k=reached;k;k=nodes.get(k).parent)reversed.push(nodes.get(k).point);
  const raw=[start,...reversed.reverse(),end],path=[start];for(let i=0;i<raw.length-1;){let j=raw.length-1;while(j>i+1&&!segmentClear(context,raw[i],raw[j]))j--;path.push(raw[j]);i=j;}
  return{ok:true,path,visited};
}
export function planOutdoorRobotWalk(state,from,to,options={}){return plan(contextFor(state,options),from,to);}
export function findOutdoorRobotSpawn(state,preferred,options={}){
  const context=contextFor(state,options);if(!context)return null;
  if(finitePoint(preferred)&&context.clear(preferred))return{x:preferred.x,z:preferred.z};
  const house=getFloorBounds(state.home),front=(house.minX+house.maxX)/2;
  const candidates=[{x:front,z:house.maxZ+2},{x:house.maxX+2,z:(house.minZ+house.maxZ)/2},{x:house.minX-2,z:(house.minZ+house.maxZ)/2},{x:front,z:house.minZ-2}];
  for(const p of candidates)if(context.clear(p))return p;
  // Scan bounded rings around the house rather than the potentially huge world.
  let checked=0;for(let r=1;r<=40;r++)for(let side=0;side<4;side++)for(let i=-r;i<=r;i++){
    if(++checked>context.maxVisited)return null;const dx=side<2?i:side===2?-r:r,dz=side>=2?i:side===0?-r:r;
    const p={x:front+dx*.5,z:house.maxZ+2+dz*.5};if(context.clear(p))return p;
  }
  return null;
}
function measuredPool(item){
  const product=getOutdoorProduct(item?.kind);if(product?.feature!=='pool')return null;
  const key=JSON.stringify([item.kind,item.legacyIncludedExtras,item.legacyFootprint,item.legacyPlans]);if(geometryCache.has(key))return geometryCache.get(key);
  const model=createOutdoorProductModel(product,item);model.updateMatrixWorld(true);
  const boxFor=name=>{const box=new THREE.Box3();model.traverse(node=>{if(node.isMesh&&node.name===name)box.union(new THREE.Box3().setFromObject(node));});return box.isEmpty()?null:box;};
  const water=boxFor('pool-water'),coping=boxFor('pool-coping'),deck=boxFor('pool-deck');
  let result=null;
  if(water&&coping&&deck){
    const w=water.max.x-water.min.x,d=water.max.z-water.min.z;
    result={water:{minX:water.min.x,maxX:water.max.x,minZ:water.min.z,maxZ:water.max.z,y:water.max.y,width:w,depth:d,x:(water.min.x+water.max.x)/2,z:(water.min.z+water.max.z)/2},copingY:coping.max.y,deckY:deck.max.y,deckMinZ:deck.min.z,shape:product.level===1&&!item.legacyIncludedExtras?'ellipse':'rectangle'};
  }
  model.dispose();if(geometryCache.size>=64)geometryCache.delete(geometryCache.keys().next().value);geometryCache.set(key,result);return result;
}
function worldPoint(item,local){const a=radians(item.rotation??0);return{x:item.x+local.x*Math.cos(a)+local.z*Math.sin(a),y:local.y??FLOOR_Y,z:item.z-local.x*Math.sin(a)+local.z*Math.cos(a)};}
/** The approach is on clear grass; only these measured entry steps cross the
 * selected pool footprint. Ordinary walking always treats every pool as solid. */
export function getRobotPoolDescriptor(state,targetId,{navigation={},from}={}){
  const id=String(targetId??'').replace(/^outdoor:/,''),owned=state?.owned?.find(row=>row.id===id&&row.status==='placed'),item=owned?.item;
  if(!item||!getOutdoorItemBounds(item))return null;const measured=measuredPool(item);if(!measured)return null;
  const nav=navigationFor(navigation),w=measured.water,margin=Math.max(.88,nav.radius+.55),rx=Math.max(.16,w.width/2-margin),rz=Math.max(.25,w.depth/2-margin);
  const approach=worldPoint(item,{x:w.x,y:FLOOR_Y,z:Math.min(measured.deckMinZ,-(item.legacyFootprint?.depth??getOutdoorProduct(item.kind).depth)/2)-nav.radius-.14});
  if(!isOutdoorRobotPositionWalkable(state,approach,navigation)||finitePoint(from)&&!planOutdoorRobotWalk(state,from,approach,navigation).ok)return null;
  const pool={ownedId:owned.id,itemId:owned.id,rotation:item.rotation??0,waterY:w.y,water:{...w},shape:measured.shape,
    transform:{x:item.x,z:item.z,rotation:item.rotation??0},loop:{x:w.x,z:w.z,rx,rz,duration:Math.max(7,Math.PI*(rx+rz)/.75)},
    approach,deck:worldPoint(item,{x:w.x,y:measured.deckY,z:measured.deckMinZ+.20}),
    edge:worldPoint(item,{x:w.x,y:measured.copingY,z:w.minZ-.10}),
    shallow:worldPoint(item,{x:w.x,y:w.y,z:w.minZ+.38}),
    swimStart:worldPoint(item,{x:w.x,y:w.y,z:w.z-rz})};
  return{id:'swim',kind:'swim',targetId:`outdoor:${owned.id}`,label:"DisplayText4141",approach,pool};
}
export function listOutdoorRobotInteractions(state,targetId,options={}){const d=getRobotPoolDescriptor(state,targetId,options);return d?[d]:[];}
const frame=(point,rotation,swimBlend=0)=>({point:{x:point.x,y:point.y??FLOOR_Y,z:point.z},rotation,swimBlend});
const step=(phase,label,duration,from,to,gait=false)=>({phase,label,duration,from,to,gait});
const durationFor=(a,b,speed=.85)=>Math.max(.45,Math.hypot(a.x-b.x,(a.y??0)-(b.y??0),a.z-b.z)/speed);
export function createRobotPoolEntry(descriptor,{point=descriptor.approach,rotation=descriptor.pool.rotation,time=0}={}){
  const pool=descriptor.pool,inward=pool.rotation,along=pool.rotation+90,start=frame(point,rotation),aligned=frame(pool.approach,inward),deck=frame(pool.deck,inward),edge=frame(pool.edge,inward),shallow=frame(pool.shallow,inward,.5),swim=frame(pool.swimStart,along,1);
  return[step('pool-align',"DisplayText4142, DisplayText4143",.45,start,aligned),
    step('pool-deck',"DisplayText4144",durationFor(pool.approach,pool.deck),aligned,deck,true),
    step('pool-edge',"DisplayText4145",durationFor(pool.deck,pool.edge,.55),deck,edge,true),
    step('pool-wade',"DisplayText4146, DisplayText4147",1.25,edge,shallow),
    step('pool-push',"DisplayText4148, DisplayText4149",1.35,shallow,swim)];
}
export function createRobotPoolExit(value,{point,rotation=0,swimBlend=1}={}){
  const pool=value.pool??value,outward=pool.rotation+180,start=frame(point??pool.swimStart,rotation,swimBlend),lane=frame(pool.swimStart,outward,1),shallow=frame(pool.shallow,outward,.5),edge=frame(pool.edge,outward),deck=frame(pool.deck,outward),ground=frame(pool.approach,outward);
  if(swimBlend<1-E){
    // A cancelled entrance reverses only the already travelled contacts. In
    // particular a robot still on dry decking must never detour into water.
    const localZ=p=>{const a=radians(pool.rotation);return(p.x-pool.transform.x)*Math.sin(a)+(p.z-pool.transform.z)*Math.cos(a);};
    const contacts=[{phase:'pool-rise',label:"DisplayText4150, DisplayText4151",value:edge},
      {phase:'pool-step-out',label:"DisplayText4152",value:deck},
      {phase:'pool-ground',label:"DisplayText4153, DisplayText4154",value:ground}];
    const steps=[];let previous=start;
    for(const contact of contacts){if(localZ(contact.value.point)>localZ(start.point)+E)continue;
      steps.push(step(contact.phase,contact.label,durationFor(previous.point,contact.value.point,.65),previous,contact.value,previous.swimBlend===0));previous=contact.value;}
    if(!steps.length)steps.push(step('pool-ground',"DisplayText4155",.45,start,ground));
    return steps;
  }
  return[step('pool-return',"DisplayText4156",durationFor(start.point,pool.swimStart,.75),start,lane),
    step('pool-shallow',"DisplayText4157, DisplayText4158",1.1,lane,shallow),
    step('pool-rise',"DisplayText4159, DisplayText4160",1.35,shallow,edge),
    step('pool-step-out',"DisplayText4152",durationFor(pool.edge,pool.deck,.65),edge,deck,true),
    step('pool-ground',"DisplayText4153, DisplayText4154",durationFor(pool.deck,pool.approach),deck,ground,true)];
}
export function sampleRobotPoolMotionStep(step,progress,time=0){
  const p=Math.max(0,Math.min(1,progress)),t=p*p*(3-2*p),a=step.from,b=step.to,delta=((b.rotation-a.rotation+540)%360)-180;
  return{point:{x:a.point.x+(b.point.x-a.point.x)*t,y:a.point.y+(b.point.y-a.point.y)*t,z:a.point.z+(b.point.z-a.point.z)*t},rotation:a.rotation+delta*t,swimBlend:a.swimBlend+(b.swimBlend-a.swimBlend)*t,phase:step.phase,phaseLabel:step.label,gait:step.gait?Math.sin(Math.PI*p):0,time};
}
export function sampleRobotPoolLoop(value,time=0){
  const pool=value.pool??value,loop=pool.loop,theta=-Math.PI/2+time/loop.duration*Math.PI*2;
  const point=worldPoint(pool.transform,{x:loop.x+loop.rx*Math.cos(theta),y:pool.waterY,z:loop.z+loop.rz*Math.sin(theta)}),tangent={x:-loop.rx*Math.sin(theta),z:loop.rz*Math.cos(theta)};
  return{point,rotation:rotationBetween({x:0,z:0},tangent)+pool.rotation,swimBlend:1,phase:'swimming',phaseLabel:"DisplayText3735",time};
}
// Alias kept descriptive for callers that treat this as a sampled activity.
export const sampleRobotPoolSwim=sampleRobotPoolLoop;
