/** Pure ground-plane placement. Outdoor ownership is held only by commerce.owned. */
import { getFloorBounds, getFloorRects } from './home-layout.js';
import { getOutdoorProduct } from './home-outdoor-catalog.js';
import { getManorEntranceStepBounds } from './home-manor-layout.js';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const epsilon = 1e-7;
export const OUTDOOR_HOUSE_CLEARANCE = .65;
const rectangle = (minX,minZ,width,depth) => ({minX,minZ,maxX:minX+width,maxZ:minZ+depth,width,depth,x:minX+width/2,z:minZ+depth/2});
const overlaps = (a,b) => a.minX < b.maxX-epsilon && a.maxX > b.minX+epsilon && a.minZ < b.maxZ-epsilon && a.maxZ > b.minZ+epsilon;

export function getOutdoorLandBounds(state) {
  const house = getFloorBounds(state.home);
  return rectangle(house.minX-14,house.minZ-8,house.width+30,house.depth+28);
}

export function getOutdoorItemBounds(item) {
  const product = getOutdoorProduct(item?.kind);
  if (!product || !finite(item.x) || !finite(item.z) || ![0,90,180,270].includes(item.rotation)) return null;
  const size = item.legacyFootprint ?? product, rotated = item.rotation % 180 !== 0;
  const width = rotated ? size.depth : size.width, depth = rotated ? size.width : size.depth;
  if (!finite(width) || !finite(depth) || width <= 0 || depth <= 0) return null;
  return {...rectangle(item.x-width/2,item.z-depth/2,width,depth),minY:0,maxY:product.height,height:product.height};
}

/** Returns an actionable reason; touching edges are allowed, intersecting volumes are not. */
export function validateOutdoorPlacement(state,item,{excludeId=item?.id,checkEntrance=true}={}) {
  const product=getOutdoorProduct(item?.kind), bounds=getOutdoorItemBounds(item);
  if (!state?.home || !product || !bounds) return {ok:false,error:"DisplayText2221.",code:'invalid'};
  const land=getOutdoorLandBounds(state);
  if (bounds.minX<land.minX-epsilon || bounds.maxX>land.maxX+epsilon || bounds.minZ<land.minZ-epsilon || bounds.maxZ>land.maxZ+epsilon)
    return {ok:false,error:"DisplayText2222, DisplayText2223.",code:'land'};
  for (const floor of getFloorRects(state.home)) {
    const house=rectangle(floor.minX-OUTDOOR_HOUSE_CLEARANCE,floor.minZ-OUTDOOR_HOUSE_CLEARANCE,
      floor.width+OUTDOOR_HOUSE_CLEARANCE*2,floor.depth+OUTDOOR_HOUSE_CLEARANCE*2);
    if (overlaps(bounds,house)) return {ok:false,error:"DisplayText2224, DisplayText2225, DisplayText2226.",code:'house'};
  }
  if (checkEntrance && getManorEntranceStepBounds(state.home).some(step => overlaps(bounds, step)))
    return {ok:false,error:"DisplayText2227, DisplayText2228.",code:'entrance'};
  for (const row of state.owned ?? []) {
    if (row.id===excludeId || row.status!=='placed') continue;
    const other=getOutdoorProduct(row.item?.kind); if (!other) continue;
    if (product.role==='facility' && product.feature && other.role==='facility' && other.feature===product.feature)
      return {ok:false,error:`DisplayText2229${other.name}, DisplayText2230, DisplayText2231.`,code:'duplicate-feature',blockingId:row.id};
    const occupied=getOutdoorItemBounds(row.item);
    if (occupied && overlaps(bounds,occupied)) return {ok:false,error:`DisplayText0614${other.name}DisplayText0595, DisplayText0615.`,code:'object',blockingId:row.id};
  }
  return {ok:true,bounds};
}

/** Suggests a nearby clear pose, never purchases, replaces, or mutates anything. */
export function suggestOutdoorPlacement(state,ownedId,anchor) {
  const owned=state?.owned?.find(row=>row.id===ownedId), product=getOutdoorProduct(owned?.item?.kind);
  if (!product) return {ok:false,error:"DisplayText0524."};
  const land=getOutdoorLandBounds(state),house=getFloorBounds(state.home);
  const origin={x:finite(anchor?.x)?anchor.x:house.minX+house.width+product.width/2+1.2,
    z:finite(anchor?.z)?anchor.z:house.minZ+house.depth/2};
  const rotation=anchor?.rotation??owned.item.rotation;
  if (![0,90,180,270].includes(rotation)) return {ok:false,error:"DisplayText2232."};
  const candidate={...owned.item,...origin,rotation};
  const first=validateOutdoorPlacement(state,candidate,{excludeId:ownedId});
  if (first.ok) return {ok:true,pose:{...origin,rotation},item:candidate};
  if (first.code==='duplicate-feature') return first;
  const bounds=getOutdoorItemBounds(candidate),sites=[];
  for(let z=land.minZ+bounds.depth/2;z<=land.maxZ-bounds.depth/2+epsilon;z+=.5)
    for(let x=land.minX+bounds.width/2;x<=land.maxX-bounds.width/2+epsilon;x+=.5)
      sites.push({x:Number(x.toFixed(4)),z:Number(z.toFixed(4)),distance:(x-origin.x)**2+(z-origin.z)**2});
  sites.sort((a,b)=>a.distance-b.distance);
  for(const {x,z} of sites) {
    const item={...owned.item,x,z,rotation};
    if(validateOutdoorPlacement(state,item,{excludeId:ownedId}).ok) return {ok:true,pose:{x,z,rotation},item};
  }
  return {ok:false,error:"DisplayText2233, DisplayText2234."};
}
