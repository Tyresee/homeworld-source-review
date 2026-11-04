import * as THREE from 'three';
import {getFloorRects,getFloorBoundarySegments} from './home-layout.js';
import {FLOOR_Y} from './home-staircase-shape.js';

/** Plain, disposable architecture for an uncaptured floor during a direct
 * elevator trip. No furnishings, shaft, texture or account state is created. */
export const PLACEHOLDER_COLORS=Object.freeze({floor:'#d9b48a',slab:'#b98652',wall:'#f6f1e6'});
export function createFloorPlaceholder(home,{storey}={}){
  if(!Number.isInteger(storey)||storey<0)throw new TypeError('A floor placeholder requires a real storey.');
  const group=new THREE.Group();group.name='elevator-floor-placeholder';
  const floorMaterial=new THREE.MeshStandardMaterial({color:PLACEHOLDER_COLORS.floor,roughness:.8});
  const slabMaterial=new THREE.MeshStandardMaterial({color:PLACEHOLDER_COLORS.slab,roughness:.85});
  const wallMaterial=new THREE.MeshStandardMaterial({color:PLACEHOLDER_COLORS.wall,roughness:.9});
  const geometries=[];let disposed=false;
  const add=(w,h,d,x,y,z,materials)=>{const geometry=new THREE.BoxGeometry(w,h,d);geometries.push(geometry);const mesh=new THREE.Mesh(geometry,materials);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.placeholder=true;group.add(mesh);return mesh;};
  const slabFaces=[slabMaterial,slabMaterial,floorMaterial,slabMaterial,slabMaterial,slabMaterial];
  for(const r of getFloorRects(home))add(r.maxX-r.minX,.3,r.maxZ-r.minZ,(r.minX+r.maxX)/2,FLOOR_Y-.15,(r.minZ+r.maxZ)/2,slabFaces);
  const T=.18,H=.5;
  for(const seg of getFloorBoundarySegments(home)){
    const len=seg.to-seg.from,mid=(seg.from+seg.to)/2,out=['back','left'].includes(seg.side)?-T/2:T/2;
    if(seg.side==='back'||seg.side==='front')add(len+T,H,T,mid,FLOOR_Y+H/2,seg.at+out,wallMaterial);
    else add(T,H,len,seg.at+out,FLOOR_Y+H/2,mid,wallMaterial);
  }
  group.userData={floorIndex:storey,placeholder:true,dispose(){if(disposed)return false;disposed=true;group.removeFromParent();for(const geometry of geometries)geometry.dispose();floorMaterial.dispose();slabMaterial.dispose();wallMaterial.dispose();group.clear();return true;}};
  return group;
}
