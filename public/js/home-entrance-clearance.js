import {getManorFacadeLayout,getManorDoorWidth} from './home-manor-layout.js';
import {roomRect} from './home-layout.js';

// Matches the authored inward door (20 cm wall, 6 cm leaf, 0..1.8 rad)
// and the visitor's 20 cm radius / 1.70 m body / 2 m inside arrival.
// Rendering keeps its own Three objects; these are data-only placement bounds.
export const HOME_ENTRANCE_CLEARANCE=Object.freeze({wallThickness:.20,doorThickness:.06,doorBottom:.08,
  maxSwing:1.8,sliceDepth:.08,bodyRadius:.20,bodyHeight:1.70,floorY:.06,insideDistance:2,
  // Floor underlays up to 12 cm remain usable; raised furniture is solid.
  minY:.12});
const NORMALS={front:[0,1],back:[0,-1],right:[1,0],left:[-1,0]};
const identity=n=>Number(n.toFixed(8));

/** Both currently supported entrance selectors are physical layouts, not
 * decoration preferences. Reserve their union so switching Warm / Toy cannot
 * move a door through furniture. Coincident actual doorways are counted once.
 * The normal visit builder uses structure 1; callers constructing an explicit
 * manor variant can supply 2/3. Furniture upgrades never imply a wider door.
 * Upper floors have stairs/lift landings, but no ground-floor front entrance. */
export function getHomeEntranceClearanceVolumes(home,{structure=1}={}){
  if(!home||home.profile==='upper')return Object.freeze([]);
  if(![1,2,3].includes(structure))throw new RangeError('Unknown entrance structure.');
  const width=getManorDoorWidth(structure),height=structure===3?2.45:structure===2?2.05:1.76;
  const config=HOME_ENTRANCE_CLEARANCE,inset=config.wallThickness+config.doorThickness/2;
  const entries=new Map(),result=[];
  for(const theme of['warm','default']){
    const selected=getManorFacadeLayout(home,{theme,structure}).entrance;if(!selected)continue;
    const {face,room}=selected,rect=room&&roomRect(room),normal=NORMALS[face.side];if(!normal)continue;
    const at=face.at??(face.side==='back'?rect?.minZ:face.side==='front'?rect?.maxZ:face.side==='left'?rect?.minX:rect?.maxX);
    const mid=(face.from+face.to)/2;if(![at,mid].every(Number.isFinite))continue;
    const x=normal[0]===0?mid:at,z=normal[1]===0?mid:at;
    const key=[face.side,identity(x),identity(z),width].join(':');
    entries.set(key,{x,z,normal,side:face.side});
  }
  for(const [key,entry]of entries){
    const [nx,nz]=entry.normal,lx=nz,lz=-nx;
    // u runs along the facade, v points indoors from the actual leaf plane.
    const add=(part,u0,u1,v0,v1,maxY)=>{
      const points=[u0,u1].flatMap(u=>[v0,v1].map(v=>({x:entry.x+lx*u-nx*(inset+v),z:entry.z+lz*u-nz*(inset+v)})));
      result.push(Object.freeze({id:`building:entrance:${key}:${part}`,objectId:'entrance',label:"DisplayText4864",
        roomPart:'entrance',placementOnly:true,entrancePart:part,side:entry.side,
        minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
        minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z)),minY:config.minY,maxY}));
    };
    const half=width/2,pad=config.doorThickness/2,top=config.doorBottom+height;
    // The leaf sweeps a sector about its left jamb. Across a depth strip its
    // left edge is the stricter of the final-angle ray and the outer circle.
    // Splitting that sector avoids claiming the whole rectangular room corner.
    const cot=Math.cos(config.maxSwing)/Math.sin(config.maxSwing),turn=width*Math.sin(config.maxSwing);
    const left=v=>Math.max(v*cot,-Math.sqrt(Math.max(0,width*width-v*v)));
    const count=Math.ceil(width/config.sliceDepth);
    for(let i=0;i<count;i++){
      const v0=width*i/count,v1=width*(i+1)/count;
      const minima=[left(v0),left(v1),...(v0<=turn&&turn<=v1?[left(turn)]:[])];
      add(`swing-${i}`,Math.min(...minima)-half-pad,Math.sqrt(Math.max(0,width*width-v0*v0))-half+pad,
        v0-pad,v1+pad,top);
    }
    // The existing pull handles protrude at most 13 cm outside the leaf.
    // Their rotated radii are shorter than the leaf, so the sector covers all
    // other handle poses; only this closed-side band needs an extra reserve.
    add('doorway',-half-pad,half+pad,-.13,pad,top);
    const radius=config.bodyRadius;
    add('landing',-radius,radius,-radius,config.insideDistance+radius,config.floorY+config.bodyHeight);
  }
  return Object.freeze(result);
}
