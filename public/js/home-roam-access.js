import * as THREE from 'three';
import {getFloorRects} from './home-layout.js';
import {FLOOR_Y,getHomeStairs,getStaircaseVolume,isElevatorShaftContinuation,isExteriorElevator,getExteriorElevatorShaftBounds} from './home-staircase-shape.js';

export const HOME_ROAM_ACCESS=Object.freeze({radius:.20,height:1.70,eye:1.45,step:.16,maxVisited:20000});
const EPS=1e-7,finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const failure=(reason,error,visited=0)=>({ok:false,points:[],reason,error,visited});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

function indexRows(rows){
  const bins=new Map(),large=[];
  for(const row of rows){
    const x0=Math.floor(row.minX),x1=Math.floor(row.maxX),z0=Math.floor(row.minZ),z1=Math.floor(row.maxZ);
    if((x1-x0+1)*(z1-z0+1)>1024){large.push(row);continue;}
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=`${x}:${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(row);}
  }
  return box=>{
    const x0=Math.floor(box.minX),x1=Math.floor(box.maxX),z0=Math.floor(box.minZ),z1=Math.floor(box.maxZ);
    if((x1-x0+1)*(z1-z0+1)>2048)return rows;
    const result=new Set(large);for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)for(const row of bins.get(`${x}:${z}`)??[])result.add(row);
    return [...result];
  };
}
function crossed(a,b,box){
  let lo=0,hi=1;
  for(const axis of['X','Z']){
    const key=axis.toLowerCase(),delta=b[key]-a[key],min=box[`min${axis}`]+EPS,max=box[`max${axis}`]-EPS;
    if(Math.abs(delta)<EPS){if(a[key]<=min||a[key]>=max)return false;continue;}
    const u=(min-a[key])/delta,v=(max-a[key])/delta;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>=hi)return false;
  }
  return hi>0&&lo<1;
}
/** Use the visitor's complete, uncut architecture, not its temporary clipping
 * planes or a second independently inferred set of room walls. Only this CPU
 * query is allocated; no new scene/model, account write or render loop exists. */
function contextFor(model,row,transport,{bodyBottom,bodyTop,skipSelectedShaft=false}={}){
  const settings=HOME_ROAM_ACCESS,rects=[...(row.rects?.length?row.rects:getFloorRects(row.home)),...(skipSelectedShaft&&isExteriorElevator(transport.stairs)?[getExteriorElevatorShaftBounds(transport.stairs)]:[])],floorY=row.baseY+FLOOR_Y,raw=[];
  bodyBottom??=floorY+.04;bodyTop??=floorY+settings.height;
  const addMesh=mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes.position?.count||mesh.userData.roamCutCap)return;
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    const box=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    if(box.isEmpty()||box.max.y<=bodyBottom+EPS||box.min.y>=bodyTop-EPS)return;
    const wall=mesh.userData.roamWall,door=wall?.doorway;
    // A wall mesh may include its jambs and lintel in one buffer. Its whole
    // bounding box must not fill the real open doorway below the lintel.
    if(door&&row.baseY+door.top>=bodyTop-EPS){
      const axis=wall.alongAxis,lo=box.min[axis],hi=box.max[axis],centre=(door.from+door.to)/2,radius=(door.to-door.from)/2,archRise=Math.max(0,bodyTop-(row.baseY+door.top-radius)),half=door.arch===false?radius:Math.sqrt(Math.max(0,radius*radius-archRise*archRise));
      for(const [a,b]of [[lo,Math.min(hi,centre-half)],[Math.max(lo,centre+half),hi]])if(b-a>EPS){const piece=box.clone();piece.min[axis]=a;piece.max[axis]=b;raw.push(piece);}
    }else raw.push(box);
  };
  model.scene?.updateMatrixWorld(true);row.group?.updateWorldMatrix(true,true);
  row.architecture?.traverse(mesh=>{if(['walls','windows','columns','border'].includes(mesh.userData.roomPart))addMesh(mesh);});
  for(const item of row.furniture??[])item.group?.traverse(addMesh);
  // A flight or lift is a reserved volume, not ordinary room floor. Even the
  // selected shaft remains closed to approach planning; only the subsequent
  // authored door-boarding sequence may cross its actual entrance plane.
  const localStairs=getHomeStairs(row.home),selected=localStairs.find(stair=>stair.id===(transport.stairId??transport.stairs?.id)),siblings=new Set(localStairs.filter(stair=>isElevatorShaftContinuation(stair,selected)).map(stair=>stair.id));
  const stairs=new Map(localStairs.map(stair=>[stair.id,stair]));
  for(const connection of model.transports??[])if([connection.from,connection.to].includes(row.storey)&&connection.stairs)stairs.set(connection.stairId??connection.stairs.id,connection.stairs);
  if(transport.stairs)stairs.set(transport.stairId??transport.stairs.id,transport.stairs);
  for(const stair of stairs.values()){
    if(skipSelectedShaft&&(stair.id===(transport.stairId??transport.stairs?.id)||siblings.has(stair.id)))continue;
    const volume=getStaircaseVolume(stair);if(volume&&!volume.placementOnly)raw.push(new THREE.Box3(new THREE.Vector3(volume.minX,floorY,volume.minZ),new THREE.Vector3(volume.maxX,floorY+settings.height,volume.maxZ)));
  }
  const obstacles=raw.map(box=>({minX:box.min.x-settings.radius,maxX:box.max.x+settings.radius,minZ:box.min.z-settings.radius,maxZ:box.max.z+settings.radius}));
  const floorIndex=indexRows(rects),obstacleIndex=indexRows(obstacles),bounds={minX:Math.min(...rects.map(r=>r.minX)),maxX:Math.max(...rects.map(r=>r.maxX)),minZ:Math.min(...rects.map(r=>r.minZ)),maxZ:Math.max(...rects.map(r=>r.maxZ))};
  const supported=p=>{
    const footprint={minX:p.x-settings.radius,maxX:p.x+settings.radius,minZ:p.z-settings.radius,maxZ:p.z+settings.radius};
    let area=0;for(const r of floorIndex(footprint))area+=Math.max(0,Math.min(footprint.maxX,r.maxX)-Math.max(footprint.minX,r.minX))*Math.max(0,Math.min(footprint.maxZ,r.maxZ)-Math.max(footprint.minZ,r.minZ));
    return area>=4*settings.radius*settings.radius-EPS;
  };
  const clear=p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&supported(p)&&!obstacleIndex({minX:p.x,maxX:p.x,minZ:p.z,maxZ:p.z}).some(box=>p.x>box.minX+EPS&&p.x<box.maxX-EPS&&p.z>box.minZ+EPS&&p.z<box.maxZ-EPS);
  const segmentClear=(a,b)=>{
    const swept={minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)};
    if(!clear(a)||!clear(b)||obstacleIndex(swept).some(box=>crossed(a,b,box)))return false;
    const cuts=[0,1];
    for(const r of floorIndex({minX:swept.minX-settings.radius,maxX:swept.maxX+settings.radius,minZ:swept.minZ-settings.radius,maxZ:swept.maxZ+settings.radius}))for(const axis of['X','Z']){
      const key=axis.toLowerCase(),delta=b[key]-a[key];if(Math.abs(delta)<EPS)continue;
      for(const edge of[r[`min${axis}`],r[`max${axis}`]])for(const offset of[-settings.radius,settings.radius]){const t=(edge+offset-a[key])/delta;if(t>0&&t<1)cuts.push(t);}
    }
    cuts.sort((a,b)=>a-b);for(let i=1;i<cuts.length;i++){const t=(cuts[i-1]+cuts[i])/2;if(!supported({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}))return false;}
    return true;
  };
  return{clear,segmentClear,bounds,floorY,settings};
}
class Queue{
  constructor(){this.rows=[];}
  push(row){const a=this.rows;a.push(row);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].f<=row.f)break;a[i]=a[p];i=p;}a[i]=row;}
  pop(){const a=this.rows,result=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=last.f)break;a[i]=a[c];i=c;}a[i]=last;}return result;}
  get length(){return this.rows.length;}
}

/** Return a collision-checked room-floor route ending at the exact front-door
 * waiting point. The first point preserves the input exactly; a checked
 * vertical settle and all subsequent points use the normal visitor eye height. Missing routes fail closed; there is no straight-line fallback. */
export function planHomeRoamApproach({model,transport,fromStorey,position,target}={}){
  const row=model?.floorModels?.find(row=>row.storey===fromStorey),side=fromStorey===transport?.from?'lower':'upper';
  target??=transport?.landings?.[side]?.waitingPosition;
  if(!row||typeof row.architecture?.traverse!=='function'||!transport||!getStaircaseVolume(transport.stairs)||![transport.from,transport.to].includes(fromStorey)||!finite(position)||!finite(target)||!Number.isFinite(row.baseY))return failure('invalid',"DisplayText4879, DisplayText4880.");
  if(!row.rects?.length&&!getFloorRects(row.home).length)return failure('no-floor',"DisplayText4881.");
  model.scene?.updateMatrixWorld(true);
  const ceilingPlanes=(row.ceilings??[]).filter(mesh=>mesh.geometry?.attributes.position?.count).map(mesh=>mesh.getWorldPosition(new THREE.Vector3()).y);
  const eyeY=row.baseY+FLOOR_Y+HOME_ROAM_ACCESS.eye,ceilingY=ceilingPlanes.length?Math.min(...ceilingPlanes):row.baseY+2.91;
  if(position.y<eyeY-.03-EPS||position.y-HOME_ROAM_ACCESS.eye+HOME_ROAM_ACCESS.height>ceilingY+EPS)return failure('height-outside-floor',"DisplayText4882, DisplayText4883.");
  const context=contextFor(model,row,transport);
  const start={x:position.x,z:position.z},end={x:target.x,z:target.z};
  if(!context.clear(start)||Math.abs(position.y-eyeY)>EPS&&!contextFor(model,row,transport,{bodyBottom:Math.min(context.floorY+.04,position.y-HOME_ROAM_ACCESS.eye+.04),bodyTop:Math.max(context.floorY+HOME_ROAM_ACCESS.height,position.y-HOME_ROAM_ACCESS.eye+HOME_ROAM_ACCESS.height)}).clear(start))return failure('blocked-start',"DisplayText4884, DisplayText4885, DisplayText4886.");
  if(!context.clear(end))return failure('blocked-target',"DisplayText4887, DisplayText3951.");
  const finish=(path,visited=0)=>{const points=path.map(p=>new THREE.Vector3(p.x,eyeY,p.z));if(Math.abs(position.y-eyeY)>EPS)points.unshift(new THREE.Vector3(position.x,position.y,position.z));return{ok:true,points,visited};};
  if(context.segmentClear(start,end))return finish(distance(start,end)<EPS?[start]:[start,end]);
  const step=context.settings.step,origin=context.bounds,key=(x,z)=>`${x}:${z}`,point=(ix,iz)=>({x:origin.minX+ix*step,z:origin.minZ+iz*step});
  const validity=new Map(),cellClear=(ix,iz)=>{const k=key(ix,iz);if(!validity.has(k))validity.set(k,context.clear(point(ix,iz)));return validity.get(k);};
  const near=p=>{const ix=Math.round((p.x-origin.minX)/step),iz=Math.round((p.z-origin.minZ)/step),rows=[];
    for(let x=ix-2;x<=ix+2;x++)for(let z=iz-2;z<=iz+2;z++){const value=point(x,z);if(cellClear(x,z)&&context.segmentClear(p,value))rows.push({ix:x,iz:z,key:key(x,z),point:value});}return rows;};
  const starts=near(start),ends=new Set(near(end).map(row=>row.key));if(!starts.length||!ends.size)return failure('no-path',"DisplayText4888.");
  const queue=new Queue(),best=new Map(),nodes=new Map(),closed=new Set();
  for(const node of starts){const g=distance(start,node.point);best.set(node.key,g);nodes.set(node.key,{...node,g,parent:null});queue.push({...node,g,f:g+distance(node.point,end)});}
  let reached=null,visited=0;
  while(queue.length&&visited<context.settings.maxVisited){
    const current=queue.pop();if(closed.has(current.key)||current.g!==best.get(current.key))continue;closed.add(current.key);visited++;
    if(ends.has(current.key)){reached=current.key;break;}
    for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const ix=current.ix+dx,iz=current.iz+dz,k=key(ix,iz);if(closed.has(k)||!cellClear(ix,iz))continue;
      if(dx&&dz&&(!cellClear(current.ix+dx,current.iz)||!cellClear(current.ix,current.iz+dz)))continue;
      const p=point(ix,iz);if(!context.segmentClear(current.point,p))continue;
      const g=current.g+distance(current.point,p);if(g>=(best.get(k)??Infinity)-EPS)continue;
      const node={ix,iz,key:k,point:p,g,parent:current.key};best.set(k,g);nodes.set(k,node);queue.push({...node,f:g+distance(p,end)});
    }
  }
  if(!reached)return failure(visited>=context.settings.maxVisited?'budget':'no-path',visited>=context.settings.maxVisited?"DisplayText4889, DisplayText4890.":"DisplayText4891, DisplayText4892, DisplayText4893.",visited);
  const reversed=[];for(let k=reached;k;k=nodes.get(k).parent)reversed.push(nodes.get(k).point);
  const raw=[start,...reversed.reverse(),end],path=[start];for(let i=0;i<raw.length-1;){let j=raw.length-1;while(j>i+1&&!context.segmentClear(raw[i],raw[j]))j--;path.push(raw[j]);i=j;}
  return finish(path,visited);
}


/** Boarding is a separate, fixed doorway corridor. Its selected shaft reserve
 * may be crossed here only, while real architecture, furniture and every other
 * staircase remain solid. Never reroute a passenger around the actual gate. */
export function checkHomeRoamDoorwayPassage({model,transport,storey}={}){
  const row=model?.floorModels?.find(row=>row.storey===storey),side=storey===transport?.from?'lower':storey===transport?.to?'upper':null,station=side&&transport?.landings?.[side];
  if(!row||typeof row.architecture?.traverse!=='function'||transport?.type!=='elevator'||!station||!getStaircaseVolume(transport.stairs)||!Number.isFinite(row.baseY))return failure('invalid-doorway',"DisplayText4894.");
  const wait=station.waitingPosition?.clone()??station.position?.clone().addScaledVector(station.normal,.65),centre=station.cabinCentre?.clone()??new THREE.Vector3(transport.stairs.x,row.baseY+FLOOR_Y,transport.stairs.z);
  if(!finite(wait)||!finite(centre)||!row.rects?.length&&!getFloorRects(row.home).length)return failure('invalid-doorway',"DisplayText4895.");
  const context=contextFor(model,row,transport,{skipSelectedShaft:true});
  if(!context.segmentClear(wait,centre))return failure('blocked-doorway',"DisplayText4896, DisplayText4897, DisplayText3951.");
  return{ok:true};
}
