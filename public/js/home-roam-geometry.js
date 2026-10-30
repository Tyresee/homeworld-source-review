import * as THREE from 'three';
import {getFloorBounds,roomRect,findRoomAt} from './home-layout.js';
import {getManorFacadeLayout,getManorDoorWidth,MANOR_FACADE_OFFSET} from './home-manor-layout.js';

const NORMALS={back:[0,-1],front:[0,1],left:[-1,0],right:[1,0]};
export const ROAM_WALL_THICKNESS=.2;
export const ROAM_DOOR_BOTTOM=.08;
export const ROAM_DOOR_DEPTH=.06;
// Facade-local offsets: the inner wall face is at -offset - thickness.
// Keeping the leaf's outside face on that plane lets the complete inward
// 0..1.8-radian swing stay on the room side of the wall and frame.
export const ROAM_DOOR_FRAME_OFFSET=-MANOR_FACADE_OFFSET-ROAM_WALL_THICKNESS;
export const ROAM_DOOR_PANEL_OFFSET=ROAM_DOOR_FRAME_OFFSET-ROAM_DOOR_DEPTH/2;
export const ROAM_FLOOR_Y=.06;

/** Saved-home coordinates, derived from the existing authoritative facade
 * layout. A purchased slab can have an unassigned/public entrance region. */
export function getHomeRoamEntrance(home,{structure=1,theme='warm'}={}) {
  const entrance=getManorFacadeLayout(home,{structure,theme}).entrance,bounds=getFloorBounds(home);
  if(!entrance||!bounds)return null;
  const {face}=entrance,rect=entrance.room?roomRect(entrance.room):null,[nx,nz]=NORMALS[face.side];
  const at=face.at??(face.side==='back'?rect.minZ:face.side==='front'?rect.maxZ:face.side==='left'?rect.minX:rect.maxX);
  const mid=(face.from+face.to)/2,x=nx===0?mid:at,z=nz===0?mid:at;
  const room=entrance.room??findRoomAt(home.rooms??[],x-nx*.25,z-nz*.25)??null;
  const height=structure===3?2.45:structure===2?2.05:1.76,width=getManorDoorWidth(structure),panelOffset=MANOR_FACADE_OFFSET+ROAM_DOOR_PANEL_OFFSET;
  return {roomId:room?.id??null,roomKind:room?.kind??null,side:face.side,from:face.from,to:face.to,at,
    width,height,bottom:ROAM_DOOR_BOTTOM,top:ROAM_DOOR_BOTTOM+height,thresholdY:ROAM_FLOOR_Y,
    center:{x:x+nx*panelOffset,y:ROAM_DOOR_BOTTOM+height/2,z:z+nz*panelOffset},
    wallCenter:{x,y:ROAM_DOOR_BOTTOM+height/2,z},outward:{x:nx,y:0,z:nz},
    homeToModelOffset:{x:-bounds.x,y:0,z:-bounds.z}};
}

export function createRoamArchShape(width,height) {
  const radius=width/2,shape=new THREE.Shape();
  shape.moveTo(-radius,0);shape.lineTo(radius,0);shape.lineTo(radius,height-radius);
  shape.absarc(0,height-radius,radius,0,Math.PI,false);shape.closePath();return shape;
}

/** One connected U-shaped contour, so neither the frame nor wall contains a
 * hidden filled face across the opening. The arch opens down to the threshold. */
export function createRoamArchRingGeometry(width,height,{borderWidth=.18,borderHeight=.20,bottom=ROAM_DOOR_BOTTOM,depth=.24}={}) {
  const outerWidth=width+borderWidth*2,outerHeight=height+borderHeight,outerR=outerWidth/2,innerR=width/2,innerTop=height+bottom;
  const shape=new THREE.Shape();
  shape.moveTo(-innerR,0);shape.lineTo(-outerR,0);shape.lineTo(-outerR,outerHeight-outerR);
  shape.absarc(0,outerHeight-outerR,outerR,Math.PI,0,true);shape.lineTo(outerR,0);shape.lineTo(innerR,0);
  shape.lineTo(innerR,innerTop-innerR);shape.absarc(0,innerTop-innerR,innerR,0,Math.PI,false);shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:24});
}

/** A new wall built with an opening, never a runtime cut of an existing mesh.
 * local X runs along the wall, Y starts at its finished-floor datum. */
export function createRoamWallGeometry({length,height,thickness=ROAM_WALL_THICKNESS,opening=null,holes=[]}) {
  const shape=new THREE.Shape(),left=-length/2,right=length/2;
  shape.moveTo(left,0);shape.lineTo(left,height);shape.lineTo(right,height);shape.lineTo(right,0);
  if(opening) {
    const half=opening.width/2,cx=opening.center??0,top=Math.min(opening.top,height),r=opening.arch===false?0:half;
    shape.lineTo(cx+half,0);shape.lineTo(cx+half,top-r);
    if(r)shape.absarc(cx,top-r,r,0,Math.PI,false);else shape.lineTo(cx-half,top);
    shape.lineTo(cx-half,0);
  }
  shape.closePath();for(const hole of holes)shape.holes.push(hole);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:24});geometry.translate(0,0,-thickness/2);return geometry;
}

export function entryMatchesEdge(entry,edge) {
  if(!entry||entry.side!==edge.side||Math.abs(entry.at-edge.at)>1e-6)return false;
  const along=entry.side==='front'||entry.side==='back'?entry.wallCenter.x:entry.wallCenter.z;
  return along>edge.from-1e-6&&along<edge.to+1e-6;
}
