import * as THREE from 'three';
import {getFloorRects,roomRect} from './home-layout.js';
import {FLOOR_Y,getHomeStairs,getStaircaseVolume} from './home-staircase-shape.js';
import {HOME_ROAM_ACCESS} from './home-roam-access.js';

const EPS=1e-7,finiteBox=box=>box&&!box.isEmpty()&&[...box.min.toArray(),...box.max.toArray()].every(Number.isFinite);
const parts=new Set(['walls','windows','columns','border']);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Choose an eye-level view inside the existing floor, not an orbit point or
 * a robot position. Complete architecture is queried even while cut away.
 * No object, robot, account or saved placement is moved by this calculation. */
export function getHomeRoamInteriorEntry({model,storey}={}){
  const row=model?.floorModels?.find(row=>row.storey===storey);
  if(!row||!Number.isFinite(row.baseY)||typeof row.architecture?.traverse!=='function')return null;
  const rects=row.rects?.length?row.rects:getFloorRects(row.home);
  if(!rects.length||rects.some(r=>![r.minX,r.maxX,r.minZ,r.maxZ].every(Number.isFinite)||r.minX>=r.maxX||r.minZ>=r.maxZ))return null;
  const {radius,height,eye}=HOME_ROAM_ACCESS,floorY=row.baseY+FLOOR_Y,eyeY=floorY+eye,bodyTop=floorY+height;
  model.scene?.updateMatrixWorld(true);row.group?.updateWorldMatrix(true,true);
  const ceiling=(row.ceilings??[]).filter(mesh=>mesh.geometry?.attributes.position?.count).map(mesh=>new THREE.Box3().setFromObject(mesh).min.y);
  if(ceiling.length&&Math.min(...ceiling)<bodyTop-EPS)return null;
  const raw=[],meshes=[],siteBoxes=[],foci=[];
  const add=mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes.position?.count||mesh.userData.roamCutCap)return;
    const box=new THREE.Box3().setFromObject(mesh);if(!finiteBox(box))return;meshes.push(mesh);
    if(box.max.y<=floorY+.04+EPS||box.min.y>=bodyTop-EPS)return;
    raw.push({minX:box.min.x-radius,maxX:box.max.x+radius,minZ:box.min.z-radius,maxZ:box.max.z+radius});
  };
  row.architecture.traverse(mesh=>{if(parts.has(mesh.userData.roomPart))add(mesh);});
  for(const descriptor of row.furniture??[]){
    descriptor.group?.traverse(add);const box=descriptor.group&&new THREE.Box3().setFromObject(descriptor.group);if(!finiteBox(box))continue;
    const centre=box.getCenter(new THREE.Vector3());centre.y=THREE.MathUtils.clamp(centre.y,floorY+.6,eyeY);
    const interesting=/sofa|bed|desk|book|table|television|media|piano/i.test(descriptor.item?.kind??'');
    foci.push({point:centre,group:descriptor.group,weight:interesting?2:1});siteBoxes.push(box);
  }
  const stairs=new Map(getHomeStairs(row.home).map(stair=>[stair.id,stair]));
  for(const link of model.transports??[])if([link.from,link.to].includes(storey)&&link.stairs)stairs.set(link.stairId??link.stairs.id,link.stairs);
  for(const stair of stairs.values()){const volume=getStaircaseVolume(stair);if(volume){raw.push({minX:volume.minX-radius,maxX:volume.maxX+radius,minZ:volume.minZ-radius,maxZ:volume.maxZ+radius});siteBoxes.push(new THREE.Box3(new THREE.Vector3(volume.minX,floorY,volume.minZ),new THREE.Vector3(volume.maxX,bodyTop,volume.maxZ)));}}
  // Spatial bins keep the explicit entry query bounded without a render-loop
  // cache or mutable references to the source home.
  const bins=new Map(),large=[];
  for(const box of raw){const x0=Math.floor(box.minX),x1=Math.floor(box.maxX),z0=Math.floor(box.minZ),z1=Math.floor(box.maxZ);if((x1-x0+1)*(z1-z0+1)>1024){large.push(box);continue;}for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=`${x}:${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(box);}}
  const nearby=(point,reach=0)=>{const result=new Set(large);for(let x=Math.floor(point.x-reach);x<=Math.floor(point.x+reach);x++)for(let z=Math.floor(point.z-reach);z<=Math.floor(point.z+reach);z++)for(const box of bins.get(`${x}:${z}`)??[])result.add(box);return result;};
  const supported=point=>{const f={minX:point.x-radius,maxX:point.x+radius,minZ:point.z-radius,maxZ:point.z+radius};let area=0;for(const r of rects)area+=Math.max(0,Math.min(f.maxX,r.maxX)-Math.max(f.minX,r.minX))*Math.max(0,Math.min(f.maxZ,r.maxZ)-Math.max(f.minZ,r.minZ));return area>=4*radius*radius-EPS;};
  const clear=point=>supported(point)&&![...nearby(point)].some(b=>point.x>b.minX+EPS&&point.x<b.maxX-EPS&&point.z>b.minZ+EPS&&point.z<b.maxZ-EPS);
  const rooms=(row.home.rooms??[]).map(room=>({room,rect:roomRect(room)})).filter(({rect})=>rect&&[rect.minX,rect.maxX,rect.minZ,rect.maxZ].every(Number.isFinite)).sort((a,b)=>b.rect.width*b.rect.depth-a.rect.width*a.rect.depth);
  for(const {rect:r}of rooms)foci.push({point:new THREE.Vector3((r.minX+r.maxX)/2,eyeY-.12,(r.minZ+r.maxZ)/2),group:null,weight:1.2});
  const bounds={minX:Math.min(...rects.map(r=>r.minX)),maxX:Math.max(...rects.map(r=>r.maxX)),minZ:Math.min(...rects.map(r=>r.minZ)),maxZ:Math.max(...rects.map(r=>r.maxZ))};
  const centre=rooms[0]?.rect??{...bounds},preferred={x:(centre.minX+centre.maxX)/2,z:(centre.minZ+centre.maxZ)/2};
  const candidates=[],keys=new Set();
  const addSite=(x,z)=>{if(!Number.isFinite(x)||!Number.isFinite(z)||candidates.length>=8192)return;const key=`${x.toFixed(4)}:${z.toFixed(4)}`;if(keys.has(key))return;keys.add(key);const point={x,z};if(!clear(point))return;let clearance=1.2;for(const b of nearby(point,1.2))clearance=Math.min(clearance,Math.hypot(Math.max(b.minX-x,0,x-b.maxX),Math.max(b.minZ-z,0,z-b.maxZ)));candidates.push({point,base:clearance*.5-distance(point,preferred)*.025});};
  for(const {rect:r}of rooms)addSite((r.minX+r.maxX)/2,(r.minZ+r.maxZ)/2);
  for(const r of rects)addSite((r.minX+r.maxX)/2,(r.minZ+r.maxZ)/2);
  if(storey===0&&model.entrance){const {center,outward}=model.entrance;addSite(center.x-outward.x*2,center.z-outward.z*2);}
  for(const link of model.transports??[]){const station=link.landings?.[storey===link.from?'lower':storey===link.to?'upper':'none'];if(station?.waitingPosition)addSite(station.waitingPosition.x+station.normal.x*.6,station.waitingPosition.z+station.normal.z*.6);}
  for(const box of siteBoxes){for(const x of[box.min.x-radius-.02,box.max.x+radius+.02]){addSite(x,preferred.z);for(const z of[box.min.z-radius-.02,box.max.z+radius+.02])addSite(x,z);}for(const z of[box.min.z-radius-.02,box.max.z+radius+.02])addSite(preferred.x,z);}
  const step=Math.max(.3,(bounds.maxX-bounds.minX)/64,(bounds.maxZ-bounds.minZ)/64);
  for(let z=bounds.minZ+radius;z<=bounds.maxZ-radius+EPS;z+=step)for(let x=bounds.minX+radius;x<=bounds.maxX-radius+EPS;x+=step)addSite(x,z);
  if(!candidates.length)return null;candidates.sort((a,b)=>b.base-a.base||a.point.z-b.point.z||a.point.x-b.point.x);
  const ray=new THREE.Raycaster(),isChild=(node,parent)=>{for(let n=node;n;n=n.parent)if(n===parent)return true;return false;};
  let best=null;
  for(const {point,base}of candidates.slice(0,32)){
    const position=new THREE.Vector3(point.x,eyeY,point.z);
    for(const target of foci){const d=position.distanceTo(target.point);if(d<1.2||d>9)continue;ray.set(position,target.point.clone().sub(position).normalize());ray.near=.01;ray.far=d-.05;const first=ray.intersectObjects(meshes,false)[0];if(first&&(!target.group||!isChild(first.object,target.group)))continue;const score=base+target.weight*.75-Math.abs(d-3)*.07;if(!best||score>best.score)best={score,position,lookAt:target.point.clone()};}
    // Empty or crowded rooms still have a usable facing direction. Rank rays
    // by the real clear sight distance; no furniture interaction is invoked.
    for(let i=0;i<16;i++){const angle=i*Math.PI/8,direction=new THREE.Vector3(Math.sin(angle),-.025,Math.cos(angle)).normalize();ray.set(position,direction);ray.near=.01;ray.far=6;const first=ray.intersectObjects(meshes,false)[0],reach=first?.distance??6,score=base+Math.min(reach,4)*.12;if(!best||score>best.score)best={score,position,lookAt:position.clone().addScaledVector(direction,Math.max(.3,Math.min(reach*.7,3)))};}
  }
  return best?{position:best.position,lookAt:best.lookAt}:null;
}
