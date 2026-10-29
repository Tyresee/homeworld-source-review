/** Exact rectangle union for construction pricing and the editor grid. No THREE, DOM or saved state. */
const EPS=1e-7;
const clean=value=>Math.round(value*1e6)/1e6;
export const CONSTRUCTION_GRID_ORIGIN=Object.freeze({x:-2.8,z:-2.6});
export function isConstructionRect(rect) {
  return !!rect&&typeof rect==='object'&&!Array.isArray(rect)
    &&['minX','minZ','width','depth'].every(key=>Number.isFinite(rect[key]))
    &&rect.width>0&&rect.depth>0&&[rect.minX,rect.minZ,rect.width,rect.depth].every(value=>Math.abs(value*5-Math.round(value*5))<EPS);
}
/** Stable x-strips, merged vertically first and horizontally when their complete intervals match. */
export function unionRectangles(rects) {
  if(!Array.isArray(rects)||rects.some(rect=>!isConstructionRect(rect)))throw new TypeError('Invalid construction rectangles');
  if(!rects.length)return [];
  const normalized=rects.map(rect=>({minX:clean(rect.minX),minZ:clean(rect.minZ),width:clean(rect.width),depth:clean(rect.depth)}));
  const xs=[...new Set(normalized.flatMap(rect=>[rect.minX,clean(rect.minX+rect.width)]))].sort((a,b)=>a-b),out=[],active=new Map();
  for(let i=1;i<xs.length;i++) {
    const left=xs[i-1],right=xs[i],middle=(left+right)/2;
    const intervals=normalized.filter(rect=>middle>rect.minX-EPS&&middle<rect.minX+rect.width+EPS)
      .map(rect=>[rect.minZ,clean(rect.minZ+rect.depth)]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const merged=[];
    for(const interval of intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1]+EPS)last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}
    const keys=new Set();
    for(const [from,to] of merged) {
      const key=`${from}:${to}`,previous=active.get(key);keys.add(key);
      if(previous&&Math.abs(previous.minX+previous.width-left)<EPS)previous.width=clean(right-previous.minX);
      else {const rect={minX:left,minZ:from,width:clean(right-left),depth:clean(to-from)};out.push(rect);active.set(key,rect);}
    }
    for(const key of active.keys())if(!keys.has(key))active.delete(key);
  }
  return out.sort((a,b)=>a.minX-b.minX||a.minZ-b.minZ||a.width-b.width||a.depth-b.depth);
}
export function getUnionArea(rects) {return clean(unionRectangles(rects).reduce((area,rect)=>area+rect.width*rect.depth,0));}
/** Exact uncovered geometry, including a partially built grid cell. Inputs are never mutated. */
export function subtractRectangles(rects,existing=[]) {
  let pieces=unionRectangles(rects);
  for(const covered of unionRectangles(existing)) {
    const next=[];
    for(const rect of pieces) {
      const right=clean(rect.minX+rect.width),top=clean(rect.minZ+rect.depth);
      const left=Math.max(rect.minX,covered.minX),bottom=Math.max(rect.minZ,covered.minZ);
      const cutRight=Math.min(right,clean(covered.minX+covered.width)),cutTop=Math.min(top,clean(covered.minZ+covered.depth));
      if(cutRight-left<=EPS||cutTop-bottom<=EPS){next.push(rect);continue;}
      if(left-rect.minX>EPS)next.push({minX:rect.minX,minZ:rect.minZ,width:clean(left-rect.minX),depth:rect.depth});
      if(right-cutRight>EPS)next.push({minX:cutRight,minZ:rect.minZ,width:clean(right-cutRight),depth:rect.depth});
      if(bottom-rect.minZ>EPS)next.push({minX:left,minZ:rect.minZ,width:clean(cutRight-left),depth:clean(bottom-rect.minZ)});
      if(top-cutTop>EPS)next.push({minX:left,minZ:cutTop,width:clean(cutRight-left),depth:clean(top-cutTop)});
    }
    pieces=next;
  }
  return unionRectangles(pieces);
}
/** Area of `rects` which is not already covered by `existing`. */
export function rectDifferenceArea(rects,existing=[]) {return clean(getUnionArea([...existing,...rects])-getUnionArea(existing));}
export function rectangleUnionContains(existing,rects) {return rectDifferenceArea(rects,existing)<EPS;}
export function isRectangleUnionConnected(rects) {
  const union=unionRectangles(rects);if(!union.length)return false;
  const seen=new Set([0]),queue=[0];
  const adjacent=(a,b)=>{
    const overlapX=Math.min(a.minX+a.width,b.minX+b.width)-Math.max(a.minX,b.minX),overlapZ=Math.min(a.minZ+a.depth,b.minZ+b.depth)-Math.max(a.minZ,b.minZ);
    return overlapX>EPS&&overlapZ>=-EPS||overlapZ>EPS&&overlapX>=-EPS;
  };
  while(queue.length){const index=queue.pop();for(let i=0;i<union.length;i++)if(!seen.has(i)&&adjacent(union[index],union[i])){seen.add(i);queue.push(i);}}
  return seen.size===union.length;
}
export function constructionCellsToRects(cells,{origin=CONSTRUCTION_GRID_ORIGIN,cellSize=1}={}) {
  if(!Array.isArray(cells)||!origin||![origin.x,origin.z,cellSize].every(Number.isFinite)||cellSize<=0)throw new TypeError('Invalid construction cells');
  return unionRectangles(cells.map(cell=>{
    if(!cell||!Number.isInteger(cell.cx)||!Number.isInteger(cell.cz))throw new TypeError('Invalid construction cell');
    return {minX:clean(origin.x+cell.cx*cellSize),minZ:clean(origin.z+cell.cz*cellSize),width:cellSize,depth:cellSize};
  }));
}
