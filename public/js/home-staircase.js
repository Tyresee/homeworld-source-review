import {createHomeElevator} from './home-elevator-model.js';
import * as THREE from 'three';

import { STOREY_HEIGHT, STAIR_WIDTH, STAIR_DEPTH, FLOOR_Y, HANDRAIL_HEIGHT, STAIR_FLIGHT_WIDTH, STAIR_STEP_COUNT, STAIR_FLIGHT_START, STAIR_FLIGHT_END, isStaircaseValid, getStaircaseVolume, getStaircaseEntrances, getHomeStairs, getStaircaseSurfaceId, areHomeStairsValid } from './home-staircase-shape.js';
export { STOREY_HEIGHT, STAIR_WIDTH, STAIR_DEPTH, isStaircaseValid, getStaircaseVolume, getStaircaseEntrances, getHomeStairs, getStaircaseSurfaceId, areHomeStairsValid } from './home-staircase-shape.js';
export function getStaircaseOpening(stairs) {
  return stairs?.direction === 'down' ? getStaircaseVolume(stairs) : null;
}
export function getStaircaseOpenings(stairs) { return (Array.isArray(stairs)?stairs:stairs?[stairs]:[]).map(getStaircaseOpening).filter(Boolean); }
/** Split a floor rectangle, not just its texture, so the stairs are never capped. */
export function splitFloorAroundOpening(rect, stairs) {
  if(Array.isArray(stairs))return stairs.reduce((parts,stair)=>parts.flatMap(part=>splitFloorAroundOpening(part,stair)),[{...rect}]);
  const hole = getStaircaseOpening(stairs);
  if (!hole || hole.minX >= rect.maxX || hole.maxX <= rect.minX || hole.minZ >= rect.maxZ || hole.maxZ <= rect.minZ) return [{ ...rect }];
  const x0=Math.max(rect.minX,hole.minX),x1=Math.min(rect.maxX,hole.maxX),z0=Math.max(rect.minZ,hole.minZ),z1=Math.min(rect.maxZ,hole.maxZ);
  return [
    {minX:rect.minX,maxX:x0,minZ:rect.minZ,maxZ:rect.maxZ},
    {minX:x1,maxX:rect.maxX,minZ:rect.minZ,maxZ:rect.maxZ},
    {minX:x0,maxX:x1,minZ:rect.minZ,maxZ:z0},
    {minX:x0,maxX:x1,minZ:z1,maxZ:rect.maxZ},
  ].filter(part=>part.maxX-part.minX>1e-7&&part.maxZ-part.minZ>1e-7);
}
/** Clip decorative floor meshes as well as slabs; no painted upgrade may seal the opening. */
export function clipFloorMeshToOpening(mesh, stairs) {
  if(Array.isArray(stairs)){let changed=false;for(const stair of stairs)changed=clipFloorMeshToOpening(mesh,stair)||changed;return changed;}
  const hole=getStaircaseOpening(stairs);if(!hole||!mesh?.isMesh)return false;
  mesh.updateWorldMatrix(true,false);
  const bounds=new THREE.Box3().setFromObject(mesh);
  if(bounds.max.x<=hole.minX||bounds.min.x>=hole.maxX||bounds.max.z<=hole.minZ||bounds.min.z>=hole.maxZ)return false;
  const source=mesh.geometry,index=source.index,pos=source.attributes.position,normal=source.attributes.normal,uv=source.attributes.uv;
  const result={position:[],normal:[],uv:[]},inverse=mesh.matrixWorld.clone().invert(),p=new THREE.Vector3();
  const mix=(a,b,t)=>({p:a.p.map((v,i)=>v+(b.p[i]-v)*t),n:a.n.map((v,i)=>v+(b.n[i]-v)*t),u:a.u.map((v,i)=>v+(b.u[i]-v)*t)});
  function clip(polygon,axis,limit,positive) {
    const out=[];if(!polygon.length)return out;
    const distance=v=>(v.p[axis]-limit)*(positive?1:-1);
    for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a),db=distance(b);if(da>=-1e-9)out.push(a);if((da>1e-9&&db< -1e-9)||(da< -1e-9&&db>1e-9))out.push(mix(a,b,da/(da-db)));}
    return out;
  }
  const boundaries=[[0,hole.minX,true],[0,hole.maxX,false],[2,hole.minZ,true],[2,hole.maxZ,false]];
  for(let triangle=0;triangle<(index?.count??pos.count);triangle+=3){let remaining=[];
    for(let j=0;j<3;j++){const i=index?index.getX(triangle+j):triangle+j;p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);remaining.push({p:p.toArray(),n:normal?[normal.getX(i),normal.getY(i),normal.getZ(i)]:[0,1,0],u:uv?[uv.getX(i),uv.getY(i)]:[0,0]});}
    for(const[axis,limit,positive]of boundaries){const outside=clip(remaining,axis,limit,!positive);remaining=clip(remaining,axis,limit,positive);
      for(let i=1;i<outside.length-1;i++)for(const vertex of[outside[0],outside[i],outside[i+1]]){p.fromArray(vertex.p).applyMatrix4(inverse);result.position.push(...p.toArray());result.normal.push(...vertex.n);result.uv.push(...vertex.u);}if(!remaining.length)break;
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(result.position,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(result.normal,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(result.uv,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;source.dispose();return true;
}

/** One continuous straight flight. Both levels show the same physical steps. */
export function createStaircase(stairs) {
  if(stairs?.type==='elevator')return createHomeElevator(stairs);
  if (!isStaircaseValid(stairs)) throw new TypeError('Invalid staircase');
  const root=new THREE.Group();root.name='main-staircase';
  const base=stairs.direction==='down'?-STOREY_HEIGHT:0;
  const wood='#b98958', tread='#e7c591', rail='#f6e7c9', metal='#ad8c59';
  function mesh(geometry,color,at,part) {
    const object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.65}));object.position.set(...at);
    object.castShadow=true;object.receiveShadow=true;object.name=`stairs-${part}`;
    object.userData={surfaceId:getStaircaseSurfaceId(stairs),stairId:stairs.id,stairDirection:stairs.direction,roomPart:'stairs',paintable:false};root.add(object);return object;
  }
  const box=(size,at,color,part)=>mesh(new THREE.BoxGeometry(...size),color,at,part);
  function rod(a,b,r,color,part) {const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const object=mesh(new THREE.CylinderGeometry(r,r,d.length(),8),color,av.clone().add(bv).multiplyScalar(.5).toArray(),part);object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return object;}
  const run=STAIR_FLIGHT_START-STAIR_FLIGHT_END,rise=STOREY_HEIGHT/STAIR_STEP_COUNT,stepDepth=run/STAIR_STEP_COUNT,cap=.07;
  const topY=FLOOR_Y+STOREY_HEIGHT;
  // Thin treads and short riser boards form the flight. They do not extend
  // down to the floor: two slim sloping stringers carry the steps instead.
  for(let i=0;i<STAIR_STEP_COUNT;i++) {
    const y=FLOOR_Y+(i+1)*rise,z=STAIR_FLIGHT_START-(i+.5)*stepDepth;
    const bottom=FLOOR_Y+i*rise-.004,height=y-cap-bottom;
    box([STAIR_FLIGHT_WIDTH,height,.045],[0,bottom+height/2,STAIR_FLIGHT_START-i*stepDepth-.0225],wood,'straight-riser');
    box([STAIR_FLIGHT_WIDTH+.024,cap,stepDepth+.008],[0,y-cap/2,z],tread,'straight-tread');
    if(i%2===0||i===STAIR_STEP_COUNT-1)for(const x of[-.75,.75])rod([x,y,z],[x,y+HANDRAIL_HEIGHT,z],.023,rail,'straight-baluster');
  }
  // The underside stays open. Trim each beam's lower tip at floor height,
  // rather than letting a rotated box penetrate the floor or the saved bounds.
  const slope=STOREY_HEIGHT/run,beamDepth=.18,beamWidth=.12;
  const beamFront=STAIR_FLIGHT_START-cap/slope;
  const beamBottomFront=STAIR_FLIGHT_START-(cap+beamDepth)/slope;
  for(const x of[-.64,.64]) {
    const shape=new THREE.Shape();
    shape.moveTo(-beamFront,FLOOR_Y);
    shape.lineTo(-STAIR_FLIGHT_END,topY-cap);
    shape.lineTo(-STAIR_FLIGHT_END,topY-cap-beamDepth);
    shape.lineTo(-beamBottomFront,FLOOR_Y);shape.closePath();
    const beam=mesh(new THREE.ExtrudeGeometry(shape,{depth:beamWidth,bevelEnabled:false,steps:1}),'#95704d',[x-beamWidth/2,0,0],'stringer');
    beam.rotation.y=Math.PI/2;
  }
  // Entry and exit landings meet the unchanged reserved footprint exactly.
  const lowerDepth=STAIR_DEPTH/2-STAIR_FLIGHT_START,upperDepth=STAIR_DEPTH/2+STAIR_FLIGHT_END;
  box([1.62,.018,lowerDepth],[0,FLOOR_Y-.009,STAIR_FLIGHT_START+lowerDepth/2],tread,'lower-landing');
  box([STAIR_WIDTH,.14,upperDepth],[0,topY-.07,STAIR_FLIGHT_END-upperDepth/2],tread,'upper-landing');
  const supportHeight=STOREY_HEIGHT-.14;
  for(const x of[-.94,.94]) {
    box([.10,supportHeight,.10],[x,FLOOR_Y+supportHeight/2,STAIR_FLIGHT_END-upperDepth/2],wood,'landing-support');
    box([.16,.10,.16],[x,FLOOR_Y+.05,STAIR_FLIGHT_END-upperDepth/2],metal,'support-foot');
  }
  for(const x of[-.75,.75]) {
    const firstZ=STAIR_FLIGHT_START-stepDepth/2,lastZ=STAIR_FLIGHT_END+stepDepth/2;
    rod([x,FLOOR_Y+rise+HANDRAIL_HEIGHT,firstZ],[x,topY+HANDRAIL_HEIGHT,lastZ],.031,rail,'straight-handrail');
    rod([x,topY+HANDRAIL_HEIGHT,lastZ],[x,topY+HANDRAIL_HEIGHT,-1.56],.031,rail,'exit-handrail');
    rod([x,topY,-1.56],[x,topY+HANDRAIL_HEIGHT,-1.56],.025,metal,'exit-post');
  }
  if(stairs.direction==='down') {
    // The three guarded sides sit on structural rim strips, not in empty air.
    // The -Z edge is the upper exit and has no crossbar across the walking line.
    for(const x of[-1.05,1.05]) {
      box([.10,.14,STAIR_DEPTH-upperDepth],[x,topY-.07,upperDepth/2],wood,'opening-rim');
      rod([x,topY+HANDRAIL_HEIGHT,-1.56],[x,topY+HANDRAIL_HEIGHT,1.54],.031,rail,'opening-side');
      for(const z of[-1.56,-.52,.52,1.54])rod([x,topY,z],[x,topY+HANDRAIL_HEIGHT,z],.023,metal,'opening-post');
      const sign=Math.sign(x);
      rod([x,topY+HANDRAIL_HEIGHT,-1.56],[sign*.75,topY+HANDRAIL_HEIGHT,-1.56],.031,rail,'opening-exit-return');
    }
    box([2.0,.14,.10],[0,topY-.07,1.55],wood,'opening-rim');
    rod([-1.05,topY+HANDRAIL_HEIGHT,1.54],[1.05,topY+HANDRAIL_HEIGHT,1.54],.031,rail,'opening-back');
  }
  for(const child of root.children)child.position.y+=base;
  root.position.set(stairs.x,0,stairs.z);root.rotation.y=stairs.rotation*Math.PI/180;root.userData={stairs:{...stairs},volume:getStaircaseVolume(stairs),entrances:getStaircaseEntrances(stairs)};
  return root;
}
