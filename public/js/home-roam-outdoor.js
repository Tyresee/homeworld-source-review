import * as THREE from 'three';
import {createOutdoorWorld} from './home-outdoor-world.js';
import {getOutdoorLandBounds} from './home-outdoor-placement.js';

/** A disposable rendering of the actual owned estate. The normal estate
 * builder remains the sole source of lawn, garden, pool and sports geometry. */
export function createHomeRoamOutdoor({outdoor}={}){
  if(!outdoor?.home||!Array.isArray(outdoor.owned))return null;
  const group=createOutdoorWorld(),land=getOutdoorLandBounds(outdoor),before=JSON.stringify(outdoor);
  group.setState(outdoor);group.name='roam-owned-estate';
  group.traverse(node=>{if(node.isMesh){node.userData.roamOutdoor=true;if(node.userData.estateFeature==='lawn')node.userData.roamWalkSurface=true;}});
  const bounds=new THREE.Box3(new THREE.Vector3(land.minX,-.34,land.minZ),new THREE.Vector3(land.maxX,0,land.maxZ)).union(group.getPlacedBounds());
  let disposed=false;
  return{group,bounds,land,placedIds:outdoor.owned.filter(row=>row.status==='placed'&&group.getOwned(row.id)).map(row=>row.id),
    getUnchanged:()=>JSON.stringify(outdoor)===before,
    dispose(){if(disposed)return;disposed=true;group.dispose();group.removeFromParent();}};
}

const GARDEN_RADIUS=.25,GARDEN_EDGE_MARGIN=.4;
const finitePoint=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.z);
const finiteBox=box=>box&&typeof box.isEmpty==='function'&&!box.isEmpty()&&[box.min.x,box.min.y,box.min.z,box.max.x,box.max.y,box.max.z].every(Number.isFinite);

/** Select real lawn, not a pool, sports surface, roof or owned prop. A clicked
 * clear lawn point is retained exactly; a blocked click picks a nearby clear
 * candidate. This only queries existing scene geometry and never edits a home. */
export function getHomeRoamGardenEntry({estate,model,preferredPoint}={}){
  const land=estate?.land;
  if(typeof estate?.group?.traverse!=='function'||!land||![land.minX,land.minZ,land.maxX,land.maxZ].every(Number.isFinite)||land.maxX-land.minX<=GARDEN_EDGE_MARGIN*2||land.maxZ-land.minZ<=GARDEN_EDGE_MARGIN*2)return null;
  estate.group.updateWorldMatrix(true,true);let lawn=null;
  estate.group.traverse(node=>{if(!lawn&&node.isMesh&&node.userData.roamWalkSurface)lawn=node;});
  if(!lawn)return null;
  const lawnBounds=new THREE.Box3().setFromObject(lawn);if(!finiteBox(lawnBounds))return null;
  const obstacles=[];
  const add=box=>{if(finiteBox(box))obstacles.push({minX:box.min.x-GARDEN_RADIUS,maxX:box.max.x+GARDEN_RADIUS,minZ:box.min.z-GARDEN_RADIUS,maxZ:box.max.z+GARDEN_RADIUS});};
  if(finiteBox(model?.buildingBounds))add(model.buildingBounds);
  else{
    const rects=model?.floorModels?.flatMap(row=>row.rects??[])??[];
    if(!rects.length)return null;
    for(const rect of rects)if([rect.minX,rect.minZ,rect.maxX,rect.maxZ].every(Number.isFinite))add(new THREE.Box3(new THREE.Vector3(rect.minX,0,rect.minZ),new THREE.Vector3(rect.maxX,1,rect.maxZ)));
    if(!obstacles.length)return null;
  }
  for(const id of estate.placedIds??[]){const item=estate.group.getOwned?.(id);if(item)add(new THREE.Box3().setFromObject(item));}
  const minX=land.minX+GARDEN_EDGE_MARGIN,maxX=land.maxX-GARDEN_EDGE_MARGIN,minZ=land.minZ+GARDEN_EDGE_MARGIN,maxZ=land.maxZ-GARDEN_EDGE_MARGIN;
  const entry=model?.entrance,front=finitePoint(entry?.center)&&finitePoint(entry?.outward)?{x:entry.center.x+entry.outward.x*2.8,z:entry.center.z+entry.outward.z*2.8}:null;
  const requested=finitePoint(preferredPoint)?preferredPoint:front??{x:(minX+maxX)/2,z:(minZ+maxZ)/2};
  const origin={x:THREE.MathUtils.clamp(requested.x,minX,maxX),z:THREE.MathUtils.clamp(requested.z,minZ,maxZ)};
  const clear=point=>point.x>=minX&&point.x<=maxX&&point.z>=minZ&&point.z<=maxZ&&!obstacles.some(box=>point.x>box.minX-1e-7&&point.x<box.maxX+1e-7&&point.z>box.minZ-1e-7&&point.z<box.maxZ+1e-7);
  const point=site=>new THREE.Vector3(site.x,lawnBounds.max.y,site.z);
  if(clear(origin))return point(origin);
  const sites=[],addSite=(x,z)=>sites.push({x:THREE.MathUtils.clamp(x,minX,maxX),z:THREE.MathUtils.clamp(z,minZ,maxZ)});
  // Exact face/corner candidates preserve narrow gaps that a coarse scan can
  // miss, and normally move a blocked pool click only as far as its pool edge.
  for(const box of obstacles){
    for(const x of [box.minX-.01,box.maxX+.01]){addSite(x,origin.z);for(const z of [box.minZ-.01,box.maxZ+.01])addSite(x,z);}
    for(const z of [box.minZ-.01,box.maxZ+.01])addSite(origin.x,z);
  }
  for(const x of [minX,maxX]){addSite(x,origin.z);for(const z of [minZ,maxZ])addSite(x,z);}
  for(const z of [minZ,maxZ])addSite(origin.x,z);
  // Bound the CPU fallback even for unusually large legal floor plans. The
  // scan has at least half-metre spacing and never exceeds65² grid sites.
  const step=Math.max(.5,(maxX-minX)/64,(maxZ-minZ)/64);
  for(let z=minZ;z<=maxZ+1e-7;z+=step)for(let x=minX;x<=maxX+1e-7;x+=step)addSite(x,z);
  sites.sort((a,b)=>(a.x-origin.x)**2+(a.z-origin.z)**2-((b.x-origin.x)**2+(b.z-origin.z)**2)||a.z-b.z||a.x-b.x);
  const selected=sites.find(clear);return selected?point(selected):null;
}
