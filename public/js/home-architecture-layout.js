import {roomRect,roomEdges,getFloorBoundarySegments,hasStarterRoom} from './home-layout.js';
import {getHomeStairs,getStaircaseVolume,STAIR_DEPTH} from './home-staircase-shape.js';

const freezeBlocks = blocks => Object.freeze(blocks.map(block => Object.freeze({ ...block, size: Object.freeze(block.size), position: Object.freeze(block.position) })));
/** Shared with the living-room renderer; floor slabs are not obstructions. */
export const STARTER_WALL_BLOCKS = freezeBlocks([
  { id: 'back-body', objectId: 'wall', surfaceId: null, color: '#ccbca4', size: [5.78, 2.95, .23], position: [0, 1.44, -2.63], radius: .07 },
  { id: 'back-cornice', objectId: 'wall', surfaceId: null, color: '#e0cfad', size: [5.82, .11, .29], position: [0, 2.91, -2.63], radius: .025 },
  { id: 'back-skirting', objectId: 'wall', surfaceId: null, color: '#fbf0d8', size: [5.63, .14, .06], position: [0, .15, -2.46], radius: .02 },
  { id: 'side-body', objectId: 'sidewall', surfaceId: 'wall.side', color: '#d0dcca', size: [.22, 2.95, 5.36], position: [-2.81, 1.44, -.08], radius: .065 },
  { id: 'side-skirting', objectId: 'sidewall', surfaceId: null, color: '#f8edd7', size: [.06, .14, 5.25], position: [-2.67, .15, -.08], radius: .018 },
  { id: 'side-cornice', objectId: 'sidewall', surfaceId: null, color: '#dce4d2', size: [.28, .11, 5.45], position: [-2.81, 2.91, -.08], radius: .025 },
]);

const E=1e-7;
const axisOf=edge=>edge.side==='back'||edge.side==='front'?'x':'z';
export const HOME_PARTITION_HEIGHT=.98;
/** A single data-only definition of the actual editor partitions. A room
 * label is not permission for a viewing mode to invent four new tall walls. */
export function getHomeInteriorPartitions(home){
  const result=[],rooms=home?.rooms??[];
  if(!home?.slab){
    for(const room of rooms.filter(row=>row.id!=='living')){
      const rect=roomRect(room),edges=roomEdges(rooms,room);
      for(const side of ['back','left'])for(const edge of edges[side].filter(row=>row.shared)){
        result.push({...edge,side,at:(side==='back'?rect.minZ:rect.minX)+.085,axis:side==='back'?'x':'z',roomId:room.id,height:HOME_PARTITION_HEIGHT});
      }
    }
    return result;
  }
  const boundary=getFloorBoundarySegments(home),starter=hasStarterRoom(home)?rooms.find(row=>row.id==='living'):null,r=starter&&roomRect(starter);
  const drawn=r?[{side:'back',at:r.minZ,from:r.minX,to:r.maxX},{side:'left',at:r.minX,from:r.minZ,to:r.maxZ}]:[];
  for(const room of rooms.filter(row=>row.id!=='living'))for(const edge of getFloorBoundarySegments({rooms:[room]})){
    const axis=axisOf(edge);let intervals=[{from:edge.from,to:edge.to}];
    for(const other of [...boundary,...drawn])if(axis===axisOf(other)&&Math.abs(edge.at-other.at)<E)intervals=subtractIntervals(intervals,other);
    for(const interval of intervals){const part={...edge,...interval};result.push({...part,axis,roomId:room.id,height:HOME_PARTITION_HEIGHT});drawn.push(part);}
  }
  return result;
}
export function subtractIntervals(intervals,cut){return intervals.flatMap(row=>cut.to<=row.from+E||cut.from>=row.to-E?[row]:[{from:row.from,to:Math.min(row.to,cut.from)},{from:Math.max(row.from,cut.to),to:row.to}].filter(row=>row.to-row.from>E));}
/** Exact local-floor access reserve: the actual shaft plus its usable landing.
 * Only interior walls use it; a facade is never punched through into thin air. */
export function getHomeStairAccessRects(home){
  return getHomeStairs(home).flatMap(stair=>{
    const shaft=getStaircaseVolume(stair);if(!shaft)return[];
    const angle=stair.rotation*Math.PI/180,sign=stair.direction==='down'?-1:1;
    const z0=sign>0?STAIR_DEPTH/2-.18:-STAIR_DEPTH/2-1.05,z1=sign>0?STAIR_DEPTH/2+1.05:-STAIR_DEPTH/2+.18;
    const points=[];for(const x of[-.72,.72])for(const z of[z0,z1])points.push({x:stair.x+x*Math.cos(angle)+z*Math.sin(angle),z:stair.z-x*Math.sin(angle)+z*Math.cos(angle)});
    return[{minX:shaft.minX,maxX:shaft.maxX,minZ:shaft.minZ,maxZ:shaft.maxZ,stairId:stair.id},{minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z)),stairId:stair.id}];
  });
}
export function clearStairAccessIntervals(home,from,to,fixed,axis,{thickness=.17}={}){
  let intervals=[{from,to}];
  for(const rect of getHomeStairAccessRects(home)){
    const cross=axis==='x'?['minZ','maxZ']:['minX','maxX'];
    if(fixed+thickness/2<=rect[cross[0]]+E||fixed-thickness/2>=rect[cross[1]]-E)continue;
    intervals=subtractIntervals(intervals,{from:axis==='x'?rect.minX:rect.minZ,to:axis==='x'?rect.maxX:rect.maxZ});
  }
  return intervals;
}
export function getPartitionSolidIntervals(home,{from,to,at,axis}){
  const door=Math.min(1.45,(to-from)*.5),stub=(to-from-door)/2;
  return stub>.12?[[from,from+stub],[to-stub,to]].flatMap(([a,b])=>clearStairAccessIntervals(home,a,b,at,axis)):[];
}

/** Legacy starter walls are real structure even when a purchased slab now
 * extends behind or to their left. Only their newly interior spans are listed. */
export function getRetainedStarterWallRuns(home){
  if(!home?.slab||!hasStarterRoom(home))return[];
  const room=home.rooms.find(row=>row.id==='living'),rect=roomRect(room),boundary=getFloorBoundarySegments(home),result=[];
  for(const side of ['back','left']){
    const axis=side==='back'?'x':'z',at=side==='back'?rect.minZ:rect.minX;let runs=[{from:axis==='x'?rect.minX:rect.minZ,to:axis==='x'?rect.maxX:rect.maxZ}];
    for(const edge of boundary)if(axis===axisOf(edge)&&Math.abs(at-edge.at)<E)runs=subtractIntervals(runs,edge);
    for(const run of runs)result.push({...run,axis,at,side,roomId:room.id});
  }
  return result;
}
