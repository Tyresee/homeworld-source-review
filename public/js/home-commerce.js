import {isFloorFinishId} from './home-floor-finishes.js';
import {isWallStyleId,isWallColorId} from './home-wall-finishes.js';
/** Local demo commerce. A single serializable snapshot owns the home, wallet and inventory.
 * This is not an authoritative payment service; replace its adapter when platform points arrive.
 */
import {
  FURNITURE_ITEMS, MATERIALS, createHomeState, migrateHomeStateWithInventory, validateHomeState, applyChange,
  getFurnitureFootprint, findHomeCollision, findIntroducedBuildingCollision, findIntroducedFurnitureCollision, createFurnitureItem, validateFurnitureItem,
  getStaircaseCollision,
  getWallMountTargets,
} from './home-engine.js';

import { OUTDOOR_PRODUCTS, getOutdoorProduct } from './home-outdoor-catalog.js';
import { validateOutdoorPlacement, suggestOutdoorPlacement } from './home-outdoor-placement.js';
import { getEstateOutdoorDefinition, getEstateForRoomCount } from './home-estate-outdoor.js';
export { OUTDOOR_PRODUCTS, getOutdoorProduct, validateOutdoorPlacement, suggestOutdoorPlacement };
import { EXTRA_SHOP_ITEMS } from './home-shop-catalog.js';
import { ROOM_PRODUCTS } from './home-room-products.js';
import { STOREY_PRODUCTS, FLOOR_CONSTRUCTION_RATES } from './home-storey-products.js';
import { AVATAR_CLOTHING_PRODUCTS, getClothingProduct } from './home-avatar-catalog.js';
import { AVATAR_EQUIPMENT_SLOTS, createAvatarState, validateAvatarAppearance, validateAvatarState } from './home-avatar-state.js';
import { STAIR_WIDTH, STAIR_DEPTH, getHomeStairs } from './home-staircase.js';
import { getStaircaseEntrances } from './home-staircase-shape.js';
import { ELEVATOR_UPGRADE_PRODUCT } from './home-elevator-products.js';
import { planAvatarWalk } from './home-avatar-navigation.js';
import {validateObjectStates,reconcileObjectStates,applyOwnedObjectState} from './home-object-state.js';
import { unionRectangles, getUnionArea, rectDifferenceArea, rectangleUnionContains, isRectangleUnionConnected, constructionCellsToRects } from './home-construction-grid.js';
import { getRoomKind, isRoomId, roomRect, getRoomSlots, createRoom, getFloorRects, floorContainsRect, getFloorBounds, getRoomAutoFit, LAYOUT_TECH_LIMITS } from './home-layout.js';
export { ROOM_PRODUCTS, STOREY_PRODUCTS, FLOOR_CONSTRUCTION_RATES, AVATAR_CLOTHING_PRODUCTS, getClothingProduct };
export { ELEVATOR_UPGRADE_PRODUCT };
export const COMMERCE_VERSION = 6;
const EXTRA_BY_KIND = new Map(EXTRA_SHOP_ITEMS.map(item=>[item.id,item]));
const DESIGNS = {
  bed: { name: "DisplayText0488", category: 'bedroom', price: 1800, description: "DisplayText0489, DisplayText0490, DisplayText0491.", color: '#c6b6d9', material: 'linen' },
  sofa: { name: "DisplayText0492", category: 'living', price: 1800, description: "DisplayText0493, DisplayText0494.", color: '#f7ead7', material: 'velvet' },
  cabinet: { name: "DisplayText0495", category: 'storage', price: 1000, description: "DisplayText0496, DisplayText0497.", color: '#c99362', material: 'oak' },
  bookcase: { name: "DisplayText0498", category: 'storage', price: 1400, description: "DisplayText0499, DisplayText0500.", color: '#78533e', material: 'walnut' },
  rug: { name: "DisplayText0501", category: 'decor', price: 600, description: "DisplayText0502, DisplayText0503.", color: '#a6cbb6', material: 'wool' },
  plant: { name: "DisplayText0504", category: 'decor', price: 300, description: "DisplayText0505, DisplayText0506.", color: '#91ac77', material: 'ceramic' },
  chandelier: { name: "DisplayText0507", category: 'lighting', price: 1800, description: "DisplayText0508, DisplayText0509.", color: '#d4b26a', material: 'gold' },
  statue: { name: "DisplayText0510", category: 'decor', price: 300, description: "DisplayText0511, DisplayText0512.", color: '#dadbd1', material: 'ceramic' },
};
export const SHOP_CATALOG = Object.freeze([...FURNITURE_ITEMS.map(item => Object.freeze({
  productType: 'furniture', tier: item.tier ?? 'comfort', family: item.family ?? item.id,
  skuId: `${item.id}-classic`, kind: item.id, ...(DESIGNS[item.id] ?? EXTRA_BY_KIND.get(item.id)), color:DESIGNS[item.id]?.color ?? item.defaultColor, level: 1,
  placement:item.placement ?? (item.id === 'chandelier' ? 'ceiling' : 'floor'), tags:item.tags ?? [], width: item.width, depth: item.depth, height:item.height,
})), ...ROOM_PRODUCTS, ...STOREY_PRODUCTS, ...OUTDOOR_PRODUCTS, ...AVATAR_CLOTHING_PRODUCTS]);
const BY_SKU = new Map(SHOP_CATALOG.map(item => [item.skuId, item]));
const SKU_FOR_KIND = new Map(SHOP_CATALOG.map(item => [item.kind, item.skuId]));
const MAX_QUANTITY = 99;
const MAX_OWNED = 1024;
const copy = value => JSON.parse(JSON.stringify(value));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keysAre = (value, keys) => record(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const idIsValid = value => typeof value === 'string' && /^[a-z\d_.:-]{1,96}$/i.test(value);
const moneyIsValid = value => Number.isSafeInteger(value) && value >= 0;
const fail = (state, error) => ({ ok: false, state, error });
const pass = (state, extra = {}) => ({ ok: true, state, ...extra });
const same = (a, b) => {
  if (a === b) return true;
  if (!record(a) || !record(b)) return false;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => same(a[key], b[key]));
};

/** Home remains the ground floor for old scene consumers; all upper floors use local coordinates. */
export function getFloorHomes(state) { return state?.home ? [state.home, ...(Array.isArray(state.upperFloors) ? state.upperFloors : [])] : []; }
export function getFloorHome(state, storey = 0) { return Number.isInteger(storey) && storey >= 0 ? getFloorHomes(state)[storey] ?? null : null; }
const writeFloorHome = (state, storey, home) => { if (storey === 0) state.home = home; else state.upperFloors[storey - 1] = home; };
const floorOf = options => options === undefined ? 0 : record(options) && Object.keys(options).every(key => key === 'storey')
  && Number.isInteger(options.storey ?? 0) && (options.storey ?? 0) >= 0 ? options.storey ?? 0 : null;
const isOutdoorProduct = product => product?.productType === 'outdoor';
const isClothingProduct = product => product?.productType === 'clothing';
const isRoomProduct = product => product?.productType === 'room';
const isStoreyProduct = product => product?.productType === 'storey';
const isConstructionProduct = product => isRoomProduct(product) || isStoreyProduct(product);
const isResellableProduct = product => product?.productType === 'furniture' || isOutdoorProduct(product);
const resaleEntries = state => state.resaleLedger ?? [];
const settledTransactions = state => [...state.orders, ...state.areaLedger, ...state.constructionLedger, ...resaleEntries(state)];
const resaleQuote = entry => ({ownedId:entry.ownedId,skuId:entry.skuId,orderId:entry.orderId,
  paidUnitPrice:entry.paidUnitPrice,rateNumerator:1,rateDenominator:2,amount:entry.amount});

/** Original receipts and sold inventory remain available for accounting and ID uniqueness. */
function validateResaleAccounting(state, ownedById, orderById, transactionIds) {
  const entries=resaleEntries(state);
  if(Object.hasOwn(state,'resaleLedger')&&!Array.isArray(state.resaleLedger)
    ||!Array.isArray(entries)||entries.length>MAX_OWNED||state.version<6&&Object.hasOwn(state,'resaleLedger'))return null;
  const ids=new Set(),soldIds=new Set();let credited=0;
  for(const entry of entries) {
    if(!keysAre(entry,['id','transactionId','ownedId','skuId','orderId','paidUnitPrice','rateNumerator','rateDenominator','amount'])
      ||!idIsValid(entry.id)||ids.has(entry.id)||!idIsValid(entry.transactionId)||transactionIds.has(entry.transactionId)
      ||!idIsValid(entry.ownedId)||soldIds.has(entry.ownedId)||entry.rateNumerator!==1||entry.rateDenominator!==2
      ||!moneyIsValid(entry.paidUnitPrice)||entry.paidUnitPrice===0||!moneyIsValid(entry.amount)
      ||entry.amount!==Math.floor(entry.paidUnitPrice/2))return null;
    const owned=ownedById.get(entry.ownedId),order=orderById.get(entry.orderId),line=order?.lines.find(row=>row.skuId===entry.skuId);
    if(!owned||owned.status!=='sold'||owned.source!=='purchase'||!isResellableProduct(BY_SKU.get(owned.skuId))
      ||entry.skuId!==owned.skuId||entry.orderId!==owned.orderId||!order?.ownedIds.includes(owned.id)
      ||!line||entry.paidUnitPrice!==line.unitPrice)return null;
    credited+=entry.amount;if(!moneyIsValid(credited))return null;
    ids.add(entry.id);soldIds.add(owned.id);transactionIds.add(entry.transactionId);
  }
  if(state.owned.some(owned=>(owned.status==='sold')!==soldIds.has(owned.id)))return null;
  return credited;
}
const gridNumber = value => Number.isFinite(value) && Math.abs(value * 5 - Math.round(value * 5)) < 1e-7;
const validRoomSize = size => record(size) && gridNumber(size.width) && gridNumber(size.depth)
  && size.width >= 1.2 && size.width <= 8.4 && size.depth >= 1.2 && size.depth <= 7.8;
const exactSize = size => keysAre(size,['width','depth']) && validRoomSize(size);
const areaCents = size => Math.round(size.width * size.depth * 100);
const areaNumber = size => areaCents(size) / 100;
const validArea = value => Number.isFinite(value) && value > 0 && Number.isSafeInteger(Math.round(value * 100))
  && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
const roomSize = item => item.bounds ? {width:item.bounds.width,depth:item.bounds.depth}
  : {width:BY_SKU.get(SKU_FOR_KIND.get(item.kind)).width,depth:BY_SKU.get(SKU_FOR_KIND.get(item.kind)).depth};
function paidAreaValue(basis, size) {
  return Math.round(Math.max(0,areaCents(size)-Math.round(basis.freeArea*100))*basis.unitPrice/Math.round(basis.referenceArea*100));
}
function initializeRoomAreaBases(state) {
  for(const owned of state.owned) if(isRoomProduct(BY_SKU.get(owned.skuId)) && !owned.areaBasis) {
    const product=BY_SKU.get(owned.skuId), initialSize=roomSize(owned.item);
    const price=owned.source==='purchase' ? state.orders.find(order=>order.id===owned.orderId)?.lines.find(line=>line.skuId===owned.skuId)?.unitPrice : product.price;
    owned.areaBasis={unitPrice:price,referenceArea:product.area,freeArea:owned.source==='gift'?areaNumber(initialSize):0,
      initialSize,initialPaid:owned.source==='purchase'?price:0};
  }
}
/** Replay a separate signed area ledger. Historical purchase receipts are never rewritten. */
function validateAreaAccounting(state, ownedById, orderById, transactionIds) {
  if(!Array.isArray(state.areaLedger)||state.areaLedger.length>10000)return null;
  const sizes=new Map(),paid=new Map(),ids=new Set();let adjustment=0;
  for(const owned of state.owned) if(isRoomProduct(BY_SKU.get(owned.skuId))) {
    const basis=owned.areaBasis;
    if(!keysAre(basis,['unitPrice','referenceArea','freeArea','initialSize','initialPaid'])||!moneyIsValid(basis.unitPrice)||basis.unitPrice===0
      ||!validArea(basis.referenceArea)||!Number.isFinite(basis.freeArea)||basis.freeArea<0
      ||!exactSize(basis.initialSize)||!moneyIsValid(basis.initialPaid))return null;
    if(owned.source==='purchase') {
      const receipt=orderById.get(owned.orderId)?.lines.find(line=>line.skuId===owned.skuId);
      if(!receipt||basis.unitPrice!==receipt.unitPrice||basis.initialPaid!==receipt.unitPrice||basis.freeArea!==0
        ||basis.referenceArea!==areaNumber(basis.initialSize))return null;
    } else if(basis.initialPaid!==0||basis.freeArea!==areaNumber(basis.initialSize))return null;
    if(paidAreaValue(basis,basis.initialSize)!==basis.initialPaid)return null;
    sizes.set(owned.id,basis.initialSize);paid.set(owned.id,basis.initialPaid);
  }
  for(const entry of state.areaLedger) {
    if(!keysAre(entry,['id','transactionId','roomId','storey','from','to','charge'])||!idIsValid(entry.id)||ids.has(entry.id)
      ||!idIsValid(entry.transactionId)||transactionIds.has(entry.transactionId)||!sizes.has(entry.roomId)
      ||!Number.isInteger(entry.storey)||entry.storey<0||!getFloorHome(state,entry.storey)||!exactSize(entry.from)||!exactSize(entry.to)
      ||same(entry.from,entry.to)||!same(sizes.get(entry.roomId),entry.from)||!Number.isSafeInteger(entry.charge))return null;
    const owned=ownedById.get(entry.roomId),value=paidAreaValue(owned.areaBasis,entry.to),previous=paid.get(entry.roomId);
    if(!moneyIsValid(value)||entry.charge!==value-previous)return null;
    adjustment+=entry.charge;if(!Number.isSafeInteger(adjustment))return null;
    sizes.set(entry.roomId,entry.to);paid.set(entry.roomId,value);ids.add(entry.id);transactionIds.add(entry.transactionId);
  }
  for(const [id,size] of sizes)if(!same(size,roomSize(ownedById.get(id).item)))return null;
  return adjustment;
}
const sameRects=(a,b)=>JSON.stringify(unionRectangles(a))===JSON.stringify(unionRectangles(b));
function initializeConstructionBasis(state) {
  state.constructionBasis={floors:getFloorHomes(state).map(home=>unionRectangles(getFloorRects(home)))};
  state.constructionLedger=[];
}
function validateConstructionAccounting(state,transactionIds) {
  if(!keysAre(state.constructionBasis,['floors'])||!Array.isArray(state.constructionBasis.floors)||!state.constructionBasis.floors.length
    ||!Array.isArray(state.constructionLedger)||state.constructionLedger.length>10000)return null;
  try {
    const homes=getFloorHomes(state),floors=state.constructionBasis.floors.map(rects=>unionRectangles(rects)),ids=new Set(),usedKits=new Set(),upgradedConnections=new Set();let paid=0;
    if(floors.length>homes.length||floors.some((rects,i)=>!isRectangleUnionConnected(rects)||i>0&&!rectangleUnionContains(floors[i-1],rects)))return null;
    for(const entry of state.constructionLedger) {
      if(entry?.type==='elevator-upgrade') {
        if(!keysAre(entry,['type','id','transactionId','lowerStorey','upperStorey','stairId','skuId','unitPrice','total'])
          ||!idIsValid(entry.id)||ids.has(entry.id)||!idIsValid(entry.transactionId)||transactionIds.has(entry.transactionId)
          ||!Number.isInteger(entry.lowerStorey)||entry.lowerStorey<0||entry.upperStorey!==entry.lowerStorey+1||entry.upperStorey>=floors.length
          ||entry.skuId!==ELEVATOR_UPGRADE_PRODUCT.skuId||!moneyIsValid(entry.unitPrice)||entry.unitPrice===0||entry.total!==entry.unitPrice)return null;
        const lower=getHomeStairs(homes[entry.lowerStorey]).find(stair=>stair.direction==='up'&&stair.id===entry.stairId),
          upper=getHomeStairs(homes[entry.upperStorey]).find(stair=>stair.direction==='down'&&stair.id===entry.stairId),connection=`${entry.lowerStorey}:${entry.stairId}`;
        if(!lower||!upper||lower.type!=='elevator'||upper.type!=='elevator'||upgradedConnections.has(connection))return null;
        paid+=entry.total;if(!moneyIsValid(paid))return null;
        upgradedConnections.add(connection);ids.add(entry.id);transactionIds.add(entry.transactionId);continue;
      }
      if(!keysAre(entry,['id','transactionId','storey','selectedRects','beforeRects','afterRects','addedArea','areaRate','areaCost','stairCost','total','stairId','kitId'])
        ||!idIsValid(entry.id)||ids.has(entry.id)||!idIsValid(entry.transactionId)||transactionIds.has(entry.transactionId)
        ||!Number.isInteger(entry.storey)||entry.storey<0||entry.storey>floors.length)return null;
      const isNew=entry.storey===floors.length,before=floors[entry.storey]??[],after=unionRectangles([...before,...entry.selectedRects]);
      const addedArea=rectDifferenceArea(entry.selectedRects,before);
      if(!sameRects(before,entry.beforeRects)||!sameRects(after,entry.afterRects)||addedArea<=0||entry.addedArea!==addedArea
        ||!isRectangleUnionConnected(after)||entry.storey>0&&!rectangleUnionContains(floors[entry.storey-1],after)
        ||![entry.areaRate,entry.areaCost,entry.stairCost,entry.total].every(moneyIsValid))return null;
      if(entry.kitId!==null) {
        const kit=state.owned.find(row=>row.id===entry.kitId);
        if(!isNew||entry.storey!==1||!kit||!isStoreyProduct(BY_SKU.get(kit.skuId))||kit.source!=='purchase'||kit.status!=='placed'
          ||kit.storey!==1||usedKits.has(kit.id)||entry.total!==0||entry.areaRate!==0||entry.areaCost!==0||entry.stairCost!==0)return null;
        usedKits.add(kit.id);
      } else if(entry.areaRate===0||entry.areaCost!==Math.round(addedArea*entry.areaRate)
        ||(isNew?entry.stairCost===0:entry.stairCost!==0)||entry.total!==entry.areaCost+entry.stairCost)return null;
      if(isNew) {
        const upper=getHomeStairs(homes[entry.storey]).find(stair=>stair.direction==='down');
        if(!upper||entry.stairId!==upper.id)return null;
      } else if(entry.stairId!==null)return null;
      paid+=entry.total;if(!moneyIsValid(paid))return null;
      floors[entry.storey]=after;ids.add(entry.id);transactionIds.add(entry.transactionId);
    }
    if(floors.length!==homes.length||homes.some((home,i)=>!sameRects(getFloorRects(home),floors[i])))return null;
    if(homes.some((home,i)=>getHomeStairs(home).some(stair=>stair.direction==='up'&&stair.type==='elevator'&&!upgradedConnections.has(`${i}:${stair.id}`))))return null;
    return paid;
  } catch {return null;}
}
/** Complete physical support, including custom dimensions and concave floor outlines. */
export function isUpperFloorSupported(ground, upper) {
  if (!Array.isArray(ground?.rooms) || !Array.isArray(upper?.rooms)) return false;
  const rects = getFloorRects(upper);
  return rects.length > 0 && rects.every(rect => floorContainsRect(ground, rect));
}
export function getStoreyRoomSlots(state, kind, storey = 0, dimensions = {}) {
  const home = getFloorHome(state, storey); if (!home) return [];
  return getRoomSlots(home.rooms, kind, { slab:home.slab, profile:home.profile, ...dimensions });
}
function validCart(cart) {
  if (!Array.isArray(cart) || cart.length > SHOP_CATALOG.length) return false;
  const seen = new Set();
  return cart.every(line => {
    if (!keysAre(line, ['skuId', 'quantity']) || !BY_SKU.has(line.skuId) || seen.has(line.skuId)
      || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY
      || ((isStoreyProduct(BY_SKU.get(line.skuId)) || isClothingProduct(BY_SKU.get(line.skuId))) && line.quantity !== 1)) return false;
    seen.add(line.skuId); return true;
  });
}
const MATERIAL_IDS = new Set(MATERIALS.map(material => material.id));
function validOutdoorItem(item,product) {
  if (!keysAre(item,['id','kind','x','z','rotation','color',...item?.legacyPlans?['legacyPlans']:[],
    ...item?.legacyIncludedExtras!==undefined?['legacyIncludedExtras']:[],...item?.legacyFootprint?['legacyFootprint']:[]])
    || !idIsValid(item.id) || item.kind!==product.kind || ![item.x,item.z].every(Number.isFinite)
    || ![0,90,180,270].includes(item.rotation) || !/^#[a-f\d]{6}$/i.test(item.color)) return false;
  if(item.legacyPlans && (!keysAre(item.legacyPlans,['structure','material','decor','detail'])
    || !Object.values(item.legacyPlans).every(value=>[1,2,3].includes(value)) || item.legacyPlans.structure!==product.level)) return false;
  if(item.legacyIncludedExtras!==undefined && item.legacyIncludedExtras!==true) return false;
  if(item.legacyFootprint && (!keysAre(item.legacyFootprint,['width','depth'])
    || !Object.values(item.legacyFootprint).every(value=>Number.isFinite(value)&&value>0&&value<=200))) return false;
  return true;
}
function validRoomItem(item) {
  if (!record(item) || !isRoomId(item.id) || !getRoomKind(item.kind) || getRoomKind(item.kind).core) return false;
  if (keysAre(item, ['id', 'kind'])) return true;
  if (!keysAre(item, ['id', 'kind', 'cx', 'cz', 'floor', 'wall', ...item.bounds ? ['bounds'] : []]) || !Number.isInteger(item.cx) || !Number.isInteger(item.cz)) return false;
  if (item.bounds && (!keysAre(item.bounds,['minX','minZ','width','depth']) || ![item.bounds.minX,item.bounds.minZ].every(gridNumber) || !validRoomSize(item.bounds))) return false;
  return ['floor', 'wall'].every(part => record(item[part]) && keysAre(item[part], ['color', 'material', ...(part==='floor'&&Object.hasOwn(item[part],'finishId')?['finishId']:[]),
    ...(part==='wall'&&Object.hasOwn(item[part],'styleId')?['styleId']:[]),...(part==='wall'&&Object.hasOwn(item[part],'colorId')?['colorId']:[])])
    && /^#[a-f\d]{6}$/i.test(item[part].color) && MATERIAL_IDS.has(item[part].material)
    && (!Object.hasOwn(item[part],'finishId')||part==='floor'&&isFloorFinishId(item[part].finishId))
    && (!Object.hasOwn(item[part],'styleId')||part==='wall'&&isWallStyleId(item[part].styleId))
    && (!Object.hasOwn(item[part],'colorId')||part==='wall'&&isWallColorId(item[part].colorId)));
}
function validOwnedItem(item, product) {
  if (isClothingProduct(product)) return keysAre(item, ['id', 'kind']) && idIsValid(item.id) && item.kind === product.kind;
  if (isOutdoorProduct(product)) return validOutdoorItem(item, product);
  if (isRoomProduct(product)) return validRoomItem(item);
  if (isStoreyProduct(product)) return keysAre(item, ['id', 'kind']) && idIsValid(item.id) && item.kind === product.kind;
  // Stored goods preserve appearance and old mount data; placement revalidates the target floor.
  return record(item) && Number.isFinite(item.x) && Number.isFinite(item.z) && validateFurnitureItem(item);
}
const orderLines = cart => cart.map(line => ({ ...line, unitPrice: BY_SKU.get(line.skuId).price })).sort((a, b) => a.skuId.localeCompare(b.skuId));
const cartFingerprint = cart => JSON.stringify(cart.map(({ skuId, quantity }) => ({ skuId, quantity })).sort((a, b) => a.skuId.localeCompare(b.skuId)));
function validStoreyStructure(state, legacy) {
  if(state.home.profile!==undefined&&state.home.profile!=='account')return false;
  const homes=getFloorHomes(state);
  if(legacy)return getHomeStairs(state.home).length===0;
  if(!Array.isArray(state.upperFloors)||state.version<4&&state.upperFloors.length>1)return false;
  for(const [index,home] of homes.entries()) {
    if(!validateHomeState(home)||index>0&&home.profile!=='upper'||state.version>=3&&index>0&&!home.slab||state.version>=4&&!home.slab)return false;
    if(index>0&&!isUpperFloorSupported(homes[index-1],home))return false;
    const stairs=getHomeStairs(home),up=stairs.filter(value=>value.direction==='up'),down=stairs.filter(value=>value.direction==='down');
    if(up.length!==(index<homes.length-1?1:0)||down.length!==(index>0?1:0))return false;
    for(const item of stairs)if(getStaircaseCollision(home,item))return false;
    if(index<homes.length-1) {
      const peer=getHomeStairs(homes[index+1]).find(value=>value.direction==='down');
      if(!peer||!['id','x','z','rotation','type'].every(key=>up[0][key]===peer[key]))return false;
    }
  }
  return true;
}
/** Historical readers plus v6 shared-wallet indoor, outdoor and wardrobe ownership. */
export function validateCommerceState(state) {
  const legacy = state?.version === 1, areaEnabled = state?.version >= 3, constructionEnabled = state?.version >= 4;
  if (!keysAre(state, ['version', 'revision', 'home', 'wallet', 'cart', 'owned', 'orders', ...legacy ? [] : ['upperFloors'], ...areaEnabled ? ['areaLedger'] : [], ...constructionEnabled ? ['constructionBasis','constructionLedger'] : [], ...state?.version >= 6 ? ['avatar'] : [], ...Object.hasOwn(state??{},'resaleLedger') ? ['resaleLedger'] : [], ...Object.hasOwn(state??{},'objectStates') ? ['objectStates'] : []])
    || ![1,2,3,4,5,6].includes(state.version) || !moneyIsValid(state.revision) || !validateHomeState(state.home)
    || !validStoreyStructure(state, legacy)
    || !keysAre(state.wallet, ['balance', 'initialBalance']) || !moneyIsValid(state.wallet.balance)
    || !moneyIsValid(state.wallet.initialBalance) || state.wallet.balance > state.wallet.initialBalance
    || !validCart(state.cart) || state.version<5&&state.cart.some(line=>isOutdoorProduct(BY_SKU.get(line.skuId)))
    || state.version<6&&state.cart.some(line=>isClothingProduct(BY_SKU.get(line.skuId)))
    || !Array.isArray(state.owned) || state.owned.length > MAX_OWNED || !Array.isArray(state.orders)) return false;
  const homes = getFloorHomes(state), ownedById = new Map(), orderById = new Map(), transactionIds = new Set(), orderedIds = new Set();
  const otherHomeIds = new Set();
  for (const home of homes) for (const item of [...home.decals, ...home.props]) {
    if (otherHomeIds.has(item.id) || item.id === 'living') return false;
    otherHomeIds.add(item.id);
  }
  const ownedClothing = new Set();
  for (const owned of state.owned) {
    const product = BY_SKU.get(owned?.skuId);
    if (!keysAre(owned, ['id', 'skuId', 'source', 'orderId', 'status', 'item', ...legacy ? [] : ['storey'], ...areaEnabled && isRoomProduct(product) ? ['areaBasis'] : []]) || !idIsValid(owned.id)
      || owned.id === 'living' || ownedById.has(owned.id) || otherHomeIds.has(owned.id) || !product
      || !['gift', 'purchase'].includes(owned.source) || !['stored', 'placed', 'sold'].includes(owned.status)
      || (owned.status === 'sold' && (state.version<6 || owned.source!=='purchase' || !isResellableProduct(product)))
      || !validOwnedItem(owned.item, product) || owned.id !== owned.item.id || product.kind !== owned.item.kind
      || (owned.source === 'gift' ? owned.orderId !== null : !idIsValid(owned.orderId))
      || (isOutdoorProduct(product) && (state.version<5 || owned.storey!==null || owned.source!=='gift' && (owned.item.legacyPlans || owned.item.legacyFootprint || owned.item.legacyIncludedExtras)))
      || (isClothingProduct(product) && (state.version<6 || owned.source!=='purchase' || owned.status!=='stored' || owned.storey!==null || ownedClothing.has(owned.skuId)))
      || (!legacy && !isOutdoorProduct(product) && (owned.status !== 'placed' ? owned.storey !== null : !Number.isInteger(owned.storey) || !homes[owned.storey]))
      || (isStoreyProduct(product) && (legacy || owned.source !== 'purchase'))) return false;
    ownedById.set(owned.id, owned);
    if (isClothingProduct(product)) ownedClothing.add(owned.skuId);
  }
  if (state.version >= 6 && (!validateAvatarState(state.avatar, state.owned)
    || state.cart.some(line => ownedClothing.has(line.skuId)))) return false;
  const storeyKits = state.owned.filter(owned => isStoreyProduct(BY_SKU.get(owned.skuId)));
  const storeyCart = state.cart.some(line => isStoreyProduct(BY_SKU.get(line.skuId)));
  if (storeyKits.length > 1 || storeyKits.length && storeyCart || legacy && storeyCart) return false;
  let spent = 0;
  for (const order of state.orders) {
    if (!keysAre(order, ['id', 'transactionId', 'lines', 'total', 'ownedIds']) || !idIsValid(order.id)
      || !idIsValid(order.transactionId) || orderById.has(order.id) || transactionIds.has(order.transactionId)
      || !Array.isArray(order.lines) || !order.lines.length || !moneyIsValid(order.total) || !Array.isArray(order.ownedIds)) return false;
    const simpleLines = [], countBySku = new Map(); let total = 0, quantity = 0;
    for (const line of order.lines) {
      if (!keysAre(line, ['skuId', 'quantity', 'unitPrice']) || !BY_SKU.has(line.skuId)
        || !moneyIsValid(line.unitPrice) || line.unitPrice === 0 || legacy && isStoreyProduct(BY_SKU.get(line.skuId))
        || state.version<6&&isClothingProduct(BY_SKU.get(line.skuId))) return false;
      simpleLines.push({ skuId: line.skuId, quantity: line.quantity }); total += line.quantity * line.unitPrice; quantity += line.quantity;
      countBySku.set(line.skuId, line.quantity);
    }
    if (!validCart(simpleLines) || total !== order.total || !moneyIsValid(total) || quantity !== order.ownedIds.length) return false;
    for (const id of order.ownedIds) {
      const owned = ownedById.get(id);
      if (!owned || orderedIds.has(id) || owned.source !== 'purchase' || owned.orderId !== order.id) return false;
      orderedIds.add(id); countBySku.set(owned.skuId, (countBySku.get(owned.skuId) ?? 0) - 1);
    }
    if ([...countBySku.values()].some(count => count !== 0)) return false;
    spent += total; if (!moneyIsValid(spent)) return false;
    orderById.set(order.id, order); transactionIds.add(order.transactionId);
  }
  const adjustment = areaEnabled ? validateAreaAccounting(state, ownedById, orderById, transactionIds) : 0;
  const constructionCost=constructionEnabled?validateConstructionAccounting(state,transactionIds):0;
  const resaleCredit=validateResaleAccounting(state,ownedById,orderById,transactionIds);
  if (adjustment === null || constructionCost===null || resaleCredit===null || state.wallet.initialBalance - spent - adjustment - constructionCost + resaleCredit !== state.wallet.balance
    || state.owned.some(owned => owned.source === 'purchase' && !orderedIds.has(owned.id))) return false;
  const placed = new Map();
  for (const [storey, home] of homes.entries()) {
    for (const item of home.furniture) {
      const owned = ownedById.get(item.id);
      if (placed.has(item.id) || !owned || BY_SKU.get(owned.skuId)?.productType !== 'furniture' || owned.status !== 'placed'
        || !same(item, owned.item) || !legacy && owned.storey !== storey) return false;
      placed.set(item.id, {item, storey});
    }
    for (const room of home.rooms) {
      if (room.id === 'living') continue;
      if (placed.has(room.id) || otherHomeIds.has(room.id)) return false;
      const owned = ownedById.get(room.id);
      if (!owned && legacy) continue;
      if (!owned || !isRoomProduct(BY_SKU.get(owned.skuId)) || owned.status !== 'placed'
        || !same(room, owned.item) || !legacy && owned.storey !== storey) return false;
      placed.set(room.id, {item:room, storey});
    }
  }
  if (!legacy && state.upperFloors.length) {
    const kit = storeyKits[0];
    if(state.version<4&&!kit)return false;
    if(kit?.status==='placed') {if(kit.storey!==1||placed.has(kit.id))return false;placed.set(kit.id,{item:kit.item,storey:1});}
    else if(state.version<4)return false;
  }
  for (const owned of state.owned) if (isOutdoorProduct(BY_SKU.get(owned.skuId)) && owned.status==='placed') {
    // Older saves could place objects over the previously buried entrance
    // steps. Keep those records readable and movable without changing them;
    // placement, movement and construction still use the strict default.
    if (placed.has(owned.id) || !validateOutdoorPlacement(state,owned.item,{excludeId:owned.id,checkEntrance:false}).ok) return false;
    placed.set(owned.id,{item:owned.item,storey:null});
  }
  return state.owned.every(owned => (owned.status === 'placed') === placed.has(owned.id))&&validateObjectStates(state);
}
function importLegacyRooms(state) {
  const existing = new Set(state.owned.map(item => item.id));
  for (const [storey, home] of getFloorHomes(state).entries()) for (const room of home.rooms) {
    if (room.id === 'living' || existing.has(room.id)) continue;
    state.owned.push({ id:room.id, skuId:SKU_FOR_KIND.get(room.kind), source:'gift', orderId:null,
      status:'placed', storey, item:copy(room) }); existing.add(room.id);
  }
  return state;
}
/** Old wall ids embedded unrounded JS coordinates. Only recognize the exact
 * same existing wall segment; this is not permission to reattach missing walls. */
function wallReferenceParts(id) {
  if (typeof id !== 'string') return null;
  const parts = id.split(':'), count = parts[0] === 'room' ? 2 : parts[0] === 'slab' ? 3 : 0;
  if (!count || parts.length <= count) return null;
  const coordinates = parts.slice(-count);
  if (!coordinates.every(value => /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) && Number.isFinite(Number(value)))) return null;
  return { prefix:parts.slice(0,-count).join(':'), coordinates:coordinates.map(Number) };
}
function repairLegacyWallReferences(saved) {
  if (![1,2,3,4].includes(saved?.version) || !record(saved) || !Array.isArray(saved.owned)) return saved;
  const replacements = [];
  try {
    for (const [storey, home] of getFloorHomes(saved).entries()) {
      if (!record(home) || !Array.isArray(home.furniture)) return saved;
      const targets = getWallMountTargets(home), exact = new Set(targets.map(target => target.wallId));
      const resolve = item => {
        if (item?.mount?.type !== 'wall' || exact.has(item.mount.wallId)) return null;
        const old = wallReferenceParts(item.mount.wallId); if (!old) return null;
        const matches = targets.filter(target => {
          const next = wallReferenceParts(target.wallId);
          return next && next.prefix === old.prefix && next.coordinates.length === old.coordinates.length
            && next.coordinates.every((value,index) => Math.abs(value-old.coordinates[index]) < 1e-8);
        });
        return matches.length === 1 ? matches[0].wallId : null;
      };
      for (const [index,item] of (home.furniture ?? []).entries()) {
        if (item?.mount?.type === 'wall') {
          const owned = saved.owned.find(row => row?.id === item.id);
          // A repair must not erase an already divergent scene/inventory pair.
          if (!owned || !same(item,owned.item)) return saved;
        }
        const wallId = resolve(item); if (wallId) replacements.push({storey,index,wallId});
      }
      for (const [index,owned] of (saved.owned ?? []).entries()) {
        if (owned.status !== 'placed' || (saved.version === 1 ? 0 : owned.storey) !== storey) continue;
        const wallId = resolve(owned.item); if (wallId) replacements.push({owned:index,wallId});
      }
    }
  } catch { return saved; }
  if (!replacements.length) return saved;
  // Preserve unknown fields and invalid values until strict validation rejects
  // them. JSON copying here could silently remove undefined metadata.
  const cloneRecord = value => Object.assign(Object.create(Object.getPrototypeOf(value)),value);
  const next = cloneRecord(saved), homes = getFloorHomes(saved).map(home => {
    const cloned = cloneRecord(home); cloned.furniture = home.furniture.slice(); return cloned;
  });
  next.home = homes[0]; if (Array.isArray(saved.upperFloors)) next.upperFloors = homes.slice(1);
  next.owned = saved.owned.slice();
  for (const replacement of replacements) {
    if (replacement.owned !== undefined) {
      const owned = cloneRecord(next.owned[replacement.owned]), item = cloneRecord(owned.item);
      item.mount = cloneRecord(item.mount); item.mount.wallId = replacement.wallId;
      owned.item = item; next.owned[replacement.owned] = owned;
    } else {
      const furniture = homes[replacement.storey].furniture, item = cloneRecord(furniture[replacement.index]);
      item.mount = cloneRecord(item.mount); item.mount.wallId = replacement.wallId; furniture[replacement.index] = item;
    }
  }
  return next;
}
/** v1 never gains free storeys. Legacy room gifts, payments, appearances and instance ids survive exactly. */
export function migrateCommerceState(saved) {
  const compatible = repairLegacyWallReferences(saved), repairedWallReferences = compatible !== saved;
  if (!validateCommerceState(compatible)) return fail(saved, "DisplayText0513, DisplayText0514.");
  if (compatible.version === COMMERCE_VERSION) return pass(compatible, {migrated:repairedWallReferences, repairedWallReferences, needsOutdoorMigration:false, avatarMigrated:false});
  const next = copy(compatible); next.version = COMMERCE_VERSION; next.avatar = createAvatarState();
  // v5 already has complete paid construction and outdoor records. Do not
  // normalize or rewrite any of those fields while introducing a character.
  if (compatible.version < 5) {
    next.areaLedger ??= [];
    if(saved.version === 1) { next.upperFloors = []; for (const owned of next.owned) owned.storey = owned.status === 'placed' ? 0 : null; }
    for(const home of getFloorHomes(next)) home.slab = {rects:unionRectangles(getFloorRects(home))};
    importLegacyRooms(next); initializeRoomAreaBases(next); if(compatible.version<4) initializeConstructionBasis(next);
  }
  return validateCommerceState(next) ? pass(next, {migrated:true, repairedWallReferences, needsOutdoorMigration:compatible.version<5, avatarMigrated:true}) : fail(saved, "DisplayText0515, DisplayText0516.");
}
/** One-time legacy import. Later reconciliations never grant unknown furniture. */
export function createCommerceState(savedHome = createHomeState()) {
  const migrated = migrateHomeStateWithInventory(savedHome);
  if (!migrated || migrated.home.profile !== undefined || getHomeStairs(migrated.home).length) return fail(null, "DisplayText0517, DisplayText0518.");
  const {home, unplacedFurniture} = migrated; home.slab={rects:unionRectangles(getFloorRects(home))};
  const owned = home.furniture.map(item => ({id:item.id,skuId:SKU_FOR_KIND.get(item.kind),source:'gift',orderId:null,status:'placed',storey:0,item:copy(item)}));
  for (const item of unplacedFurniture) owned.push({id:item.id,skuId:SKU_FOR_KIND.get(item.kind),source:'gift',orderId:null,status:'stored',storey:null,item:copy(item)});
  const state = {version:COMMERCE_VERSION,revision:0,home,upperFloors:[],areaLedger:[],wallet:{balance:1_000_000,initialBalance:1_000_000},cart:[],owned,orders:[],avatar:createAvatarState()};
  importLegacyRooms(state); initializeRoomAreaBases(state); initializeConstructionBasis(state);
  return validateCommerceState(state) ? pass(state) : fail(null, "DisplayText0519, DisplayText0518.");
}

export function getCartTotal(state) {
  if (!validCart(state?.cart)) return null;
  return state.cart.reduce((sum, line) => sum + BY_SKU.get(line.skuId).price * line.quantity, 0);
}

export function getPlacedOutdoorItems(state) {
  return (state?.owned ?? []).filter(owned=>owned.status==='placed' && isOutdoorProduct(BY_SKU.get(owned.skuId)));
}

/** The caller invokes this only when migrateCommerceState reports needsOutdoorMigration.
 * Old free scenery becomes an explicit one-time gift; receipts and balances stay intact. */
export function migrateLegacyOutdoor(state,estateState) {
  const error=editable(state); if(error)return fail(state,error);
  const tier=getEstateForRoomCount(state.home.rooms.length);
  if(!tier) return pass(state,{importedOutdoorIds:[],storedOutdoorIds:[]});
  const bounds=getFloorBounds(state.home),definition=getEstateOutdoorDefinition(tier.id,{width:bounds.width,depth:bounds.depth});
  const features=[...definition.features,...tier.id==='estate'?['treehouse','gazebo']:[]],next=copy(state);
  const importedOutdoorIds=[],storedOutdoorIds=[];
  for(const feature of features) {
    if(next.owned.some(owned=>owned.source==='gift'&&owned.item.legacyIncludedExtras===true&&getOutdoorProduct(owned.item.kind)?.feature===feature)) continue;
    let id=`legacy-outdoor-${feature}`,serial=1;
    const occupiedIds=new Set([...next.owned,...getFloorHomes(next).flatMap(home=>[...home.props,...home.decals,...home.rooms])].map(row=>row.id));
    while(occupiedIds.has(id))id=`legacy-outdoor-${feature}-${serial++}`;
    if(next.owned.length>=MAX_OWNED)return fail(state,"DisplayText0520, DisplayText0514.");
    const level=estateState?.plans?.[feature]?.structure??estateState?.levels?.[feature]??3;
    const product=OUTDOOR_PRODUCTS.find(item=>item.role==='facility'&&item.feature===feature&&item.level===level);
    if(!product)return fail(state,"DisplayText0521, DisplayText0522.");
    const region=definition.regions[feature],plans=estateState?.plans?.[feature]??{structure:level,material:3,decor:3,detail:3};
    const item={id,kind:product.kind,x:region.x,z:region.z,rotation:0,color:estateState?.colors?.[feature]??product.color,
      legacyPlans:copy(plans),legacyIncludedExtras:true,legacyFootprint:{width:region.width,depth:region.depth}};
    if(!validOutdoorItem(item,product))return fail(state,"DisplayText0523, DisplayText0522.");
    const valid=validateOutdoorPlacement(next,item,{excludeId:id});
    next.owned.push({id,skuId:product.skuId,source:'gift',orderId:null,status:valid.ok?'placed':'stored',storey:null,item});
    importedOutdoorIds.push(id); if(!valid.ok)storedOutdoorIds.push(id);
  }
  return importedOutdoorIds.length?finish(next,state,{importedOutdoorIds,storedOutdoorIds}):pass(state,{importedOutdoorIds,storedOutdoorIds});
}

/** Outdoor items share the wallet and warehouse but never enter an interior floor. */
export function placeOwnedOutdoor(state,id,pose) {
  const error=editable(state);if(error)return fail(state,error);
  const owned=state.owned.find(row=>row.id===id),product=BY_SKU.get(owned?.skuId);
  if(!isOutdoorProduct(product))return fail(state,"DisplayText0524.");
  if(owned.status==='sold')return fail(state,"DisplayText0525, DisplayText0526.");
  if(!record(pose)||Object.keys(pose).some(key=>!['x','z','rotation'].includes(key))||![pose.x,pose.z].every(Number.isFinite))
    return fail(state,"DisplayText0527.");
  const item={...copy(owned.item),...pose};
  if(!validOutdoorItem(item,product))return fail(state,"DisplayText0528.");
  const result=validateOutdoorPlacement(state,item,{excludeId:id});if(!result.ok)return fail(state,result.error);
  if(owned.status==='placed'&&same(item,owned.item))return pass(state);
  const next=copy(state),target=next.owned.find(row=>row.id===id);target.item=item;target.status='placed';target.storey=null;
  return finish(next,state);
}
export function updateOwnedOutdoor(state,id,patch) {
  const error=editable(state);if(error)return fail(state,error);
  const owned=state.owned.find(row=>row.id===id),product=BY_SKU.get(owned?.skuId);
  if(!isOutdoorProduct(product))return fail(state,"DisplayText0524.");
  if(owned.status==='sold')return fail(state,"DisplayText0525, DisplayText0529.");
  if(!record(patch)||!Object.keys(patch).length||Object.keys(patch).some(key=>!['x','z','rotation','color'].includes(key)))
    return fail(state,"DisplayText0530, DisplayText0531.");
  const item={...copy(owned.item),...patch};if(!validOutdoorItem(item,product))return fail(state,"DisplayText0532.");
  if(owned.status==='placed') {const valid=validateOutdoorPlacement(state,item,{excludeId:id});if(!valid.ok)return fail(state,valid.error);}
  if(same(item,owned.item))return pass(state);
  const next=copy(state);next.owned.find(row=>row.id===id).item=item;return finish(next,state);
}
export const moveOwnedOutdoor=(state,id,pose)=>updateOwnedOutdoor(state,id,pose);
export const paintOwnedOutdoor=(state,id,color)=>updateOwnedOutdoor(state,id,{color});
export function storeOwnedOutdoor(state,id) {
  const error=editable(state);if(error)return fail(state,error);
  const owned=state.owned.find(row=>row.id===id);
  if(!owned||!isOutdoorProduct(BY_SKU.get(owned.skuId)))return fail(state,"DisplayText0524.");
  if(owned.status==='sold')return fail(state,"DisplayText0525, DisplayText0533.");
  if(owned.status==='stored')return pass(state);
  const next=copy(state),target=next.owned.find(row=>row.id===id);target.status='stored';target.storey=null;
  return finish(next,state);
}

function editable(state) {
  if (!validateCommerceState(state)) return "DisplayText0513, DisplayText0514.";
  if (state.version !== COMMERCE_VERSION) return "DisplayText0534.";
  if (state.revision === Number.MAX_SAFE_INTEGER) return "DisplayText0535.";
  return null;
}
function finish(next, before, extra = {}) {
  reconcileObjectStates(next);
  next.revision = before.revision + 1;
  return validateCommerceState(next) ? pass(next, extra) : fail(before, "DisplayText0536, DisplayText0537.");
}

/** Using an owned fixture spends no points and never changes its paid price. */
export function setOwnedObjectState(state,id,patch,options={storey:0}){
  const error=editable(state);if(error)return fail(state,error);
  const result=applyOwnedObjectState(state,id,patch,options);
  if(!result.ok||result.state===state)return result;
  return finish(result.state,state);
}

/** The buyback price always uses the paid unit price, never today's catalog price. */
export function quoteOwnedResale(state,id) {
  const error=editable(state);if(error)return fail(state,error);
  return prepareOwnedResaleQuote(state,id);
}
function prepareOwnedResaleQuote(state,id) {
  const owned=state.owned.find(row=>row.id===id),product=BY_SKU.get(owned?.skuId);
  if(!owned)return fail(state,"DisplayText0538.");
  if(owned.status==='sold')return fail(state,"DisplayText0525, DisplayText0539.");
  if(!isResellableProduct(product))return fail(state,"Room, DisplayText0540, DisplayText0541.");
  if(owned.source!=='purchase')return fail(state,"DisplayText0542.");
  if(getFloorHomes(state).some(home=>home.furniture.some(item=>item.mount?.type==='table'&&item.mount.parentId===id)))
    return fail(state,"DisplayText0543, DisplayText0544.");
  const order=state.orders.find(row=>row.id===owned.orderId),line=order?.lines.find(row=>row.skuId===owned.skuId);
  if(!line||!order.ownedIds.includes(id)||!moneyIsValid(line.unitPrice)||line.unitPrice===0)
    return fail(state,"DisplayText0545, DisplayText0546.");
  return pass(state,{quote:resaleQuote({ownedId:id,skuId:owned.skuId,orderId:order.id,paidUnitPrice:line.unitPrice,amount:Math.floor(line.unitPrice/2)})});
}

/** Shop rendering can validate one snapshot once instead of once per inventory card. */
export function listOwnedResaleQuotes(state) {
  const error=editable(state);if(error)return fail(state,error);
  const quotes=[],unavailable=[];
  for(const owned of state.owned) {
    if(owned.status==='sold')continue;
    const result=prepareOwnedResaleQuote(state,owned.id);
    if(result.ok)quotes.push(result.quote);else unavailable.push({ownedId:owned.id,error:result.error});
  }
  return pass(state,{quotes,unavailable});
}

/** A retried transaction returns its original receipt and never credits twice. */
export function sellOwnedItem(state,id,transactionId) {
  const error=editable(state);if(error)return fail(state,error);
  if(!idIsValid(transactionId))return fail(state,"DisplayText0547, DisplayText0548.");
  const previous=resaleEntries(state).find(entry=>entry.transactionId===transactionId);
  if(previous) {
    if(previous.ownedId!==id)return fail(state,"DisplayText0549, DisplayText0550.");
    return pass(state,{repeated:true,resale:previous,quote:resaleQuote(previous)});
  }
  if(settledTransactions(state).some(entry=>entry.transactionId===transactionId))
    return fail(state,"DisplayText0551, DisplayText0550.");
  const quoted=prepareOwnedResaleQuote(state,id);if(!quoted.ok)return quoted;
  const next=copy(state),owned=next.owned.find(row=>row.id===id),{quote}=quoted;
  if(owned.status==='placed'&&!isOutdoorProduct(BY_SKU.get(owned.skuId))) {
    const home=getFloorHome(next,owned.storey),removed=applyChange(home,{type:'removeFurniture',id});
    if(!removed.ok)return fail(state,removed.error);
    writeFloorHome(next,owned.storey,removed.state);
  }
  owned.status='sold';owned.storey=null;
  next.resaleLedger??=[];
  let serial=next.resaleLedger.length+1;while(next.resaleLedger.some(entry=>entry.id===`resale-${serial}`))serial++;
  const resale={id:`resale-${serial}`,transactionId,...quote};
  next.resaleLedger.push(resale);next.wallet.balance+=quote.amount;
  return finish(next,state,{quote,resale});
}

export function isOwnedClothing(state, skuId) {
  const product = getClothingProduct(skuId);
  return !!product && product.skuId === skuId && Array.isArray(state?.owned)
    && state.owned.some(owned => owned.skuId === skuId && owned.item?.kind === product.kind
      && owned.status === 'stored' && owned.storey === null);
}

/** Equipping spends nothing. Null restores the free default for the specified slot. */
export function equipAvatarClothing(state, skuId, slot) {
  const error = editable(state); if (error) return fail(state, error);
  const product = skuId === null ? null : getClothingProduct(skuId);
  const targetSlot = slot ?? product?.slot;
  if (!AVATAR_EQUIPMENT_SLOTS.includes(targetSlot)) return fail(state, "DisplayText0552.");
  if (skuId !== null && (!product || product.skuId !== skuId || product.slot !== targetSlot))
    return fail(state, "DisplayText0553.");
  if (skuId !== null && !isOwnedClothing(state, skuId)) return fail(state, "DisplayText0554, DisplayText0555.");
  if (state.avatar.equipped[targetSlot] === skuId) return pass(state);
  const next = copy(state); next.avatar.equipped[targetSlot] = skuId;
  return finish(next, state);
}

export function updateAvatarAppearance(state, patch) {
  const error = editable(state); if (error) return fail(state, error);
  if (!record(patch) || Object.keys(patch).some(key => !['skinTone', 'hairStyle', 'hairColor'].includes(key)))
    return fail(state, "DisplayText0556, DisplayText0557.");
  const appearance = { ...state.avatar.appearance, ...patch };
  if (!validateAvatarAppearance(appearance)) return fail(state, "DisplayText0558, DisplayText0557.");
  if (same(appearance, state.avatar.appearance)) return pass(state);
  const next = copy(state); next.avatar.appearance = appearance;
  return finish(next, state);
}

export function setCartQuantity(state, skuId, quantity) {
  const error = editable(state); if (error) return fail(state, error);
  if (!BY_SKU.has(skuId) || !Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY)
    return fail(state, `DisplayText0559, DisplayText0560 0 DisplayText0561 ${MAX_QUANTITY}.`);
  if (quantity > 0 && isClothingProduct(BY_SKU.get(skuId))) {
    if (quantity !== 1) return fail(state, "DisplayText0562, DisplayText0563.");
    if (isOwnedClothing(state, skuId)) return fail(state, "DisplayText0564, DisplayText0565, DisplayText0566.");
  }
  if (quantity > 0 && isStoreyProduct(BY_SKU.get(skuId))) {
    if(state.version>=4)return fail(state,"DisplayText0567, DisplayText0568.");
    if (quantity !== 1) return fail(state, "DisplayText0569.");
    if (state.owned.some(owned => isStoreyProduct(BY_SKU.get(owned.skuId)))) return fail(state, "DisplayText0570, DisplayText0571, DisplayText0566.");
  }
  if ((state.cart.find(line => line.skuId === skuId)?.quantity ?? 0) === quantity) return pass(state);
  const next = copy(state); next.cart = next.cart.filter(line => line.skuId !== skuId);
  if (quantity > 0) next.cart.push({ skuId, quantity });
  return finish(next, state);
}

function createPurchasedItem(product, id) {
  // Purchasing creates inventory; actual room availability is checked when placed.
  if (isConstructionProduct(product) || isClothingProduct(product)) return { id, kind: product.kind };
  if (isOutdoorProduct(product)) return {id,kind:product.kind,x:0,z:0,rotation:0,color:product.color};
  return createFurnitureItem({ id, kind: product.kind, color: product.color, material: product.material, level: product.level });
}

/** transactionId is caller-generated and must be reused for a retry of the same purchase. */
export function checkoutCart(state, transactionId) {
  const error = editable(state); if (error) return fail(state, error);
  if (!idIsValid(transactionId)) return fail(state, "DisplayText0572, DisplayText0573.");
  if ([...state.areaLedger,...state.constructionLedger,...resaleEntries(state)].some(entry=>entry.transactionId===transactionId)) return fail(state, "DisplayText0551, DisplayText0550.");
  const previous = state.orders.find(order => order.transactionId === transactionId);
  if (previous) {
    if (state.cart.length && cartFingerprint(state.cart) !== cartFingerprint(previous.lines))
      return fail(state, "DisplayText0574, DisplayText0575.");
    return pass(state, { order: previous, repeated: true });
  }
  if (!state.cart.length) return fail(state, "DisplayText0576.");
  if(state.cart.some(line=>isStoreyProduct(BY_SKU.get(line.skuId))))return fail(state,"DisplayText0577, DisplayText0578.");
  const total = getCartTotal(state), count = state.cart.reduce((sum, line) => sum + line.quantity, 0);
  if (total > state.wallet.balance) return fail(state, "DisplayText0579, DisplayText0580.");
  if (state.owned.length + count > MAX_OWNED) return fail(state, "DisplayText0581.");
  const next = copy(state), lines = orderLines(state.cart);
  let orderSerial = state.orders.length + 1;
  while (state.orders.some(order => order.id === `order-${orderSerial}`)) orderSerial += 1;
  const order = { id: `order-${orderSerial}`, transactionId, lines, total, ownedIds: [] };
  const occupied = new Set([...state.owned, ...getFloorHomes(state).flatMap(home => [...home.props, ...home.decals, ...home.rooms])].map(item => item.id));
  let serial = 1;
  for (const line of lines) for (let index = 0; index < line.quantity; index += 1) {
    let id; do { id = `owned-${orderSerial}-${serial++}`; } while (occupied.has(id));
    const item = createPurchasedItem(BY_SKU.get(line.skuId), id);
    if (!item) return fail(state, "DisplayText0582, DisplayText0583.");
    occupied.add(id); order.ownedIds.push(id);
    next.owned.push({ id, skuId: line.skuId, source: 'purchase', orderId: order.id, status: 'stored', storey: null, item });
  }
  next.wallet.balance -= total; next.cart = []; next.orders.push(order); initializeRoomAreaBases(next);
  return finish(next, state, { order });
}

/** Reconcile one floor only. A different floor's instances never become warehouse stock. */
export function reconcileHome(state, nextHome, options = {storey:0}) {
  if ([1,2,3,4,5].includes(state?.version)) {
    const migrated = migrateCommerceState(state);
    if(!migrated.ok)return migrated;
    const storey=floorOf(options),oldHome=getFloorHome(state,storey),migratedHome=getFloorHome(migrated.state,storey);
    // A home-only undo made before v4 has no slab field. Preserve the imported
    // paid baseline rather than interpreting missing metadata as floor removal.
    const candidate=record(nextHome)&&oldHome&&!oldHome.slab&&!nextHome.slab&&migratedHome
      ? {...copy(nextHome),slab:copy(migratedHome.slab)} : nextHome;
    return reconcileHome(migrated.state,candidate,options);
  }
  const error = editable(state); if (error) return fail(state,error);
  const storey = floorOf(options), beforeHome = getFloorHome(state,storey);
  if (!beforeHome || !validateHomeState(nextHome)) return fail(state,"DisplayText0584, DisplayText0537.");
  if (beforeHome.profile !== nextHome.profile) return fail(state,"DisplayText0585.");
  if (JSON.stringify(beforeHome.slab) !== JSON.stringify(nextHome.slab)) return fail(state,"DisplayText0586, DisplayText0587.");
  if (JSON.stringify(getHomeStairs(beforeHome))!==JSON.stringify(getHomeStairs(nextHome))) return fail(state,"DisplayText0588, DisplayText0589, DisplayText0590.");
  if (storey > 0 && !isUpperFloorSupported(getFloorHome(state,storey-1),nextHome)) return fail(state,"DisplayText0591.");
  if (getFloorHome(state,storey+1) && !isUpperFloorSupported(nextHome,getFloorHome(state,storey+1))) return fail(state,"DisplayText0592, DisplayText0593.");
  const wallConflict = findIntroducedBuildingCollision(beforeHome,nextHome);
  if (wallConflict) return fail(state,`${wallConflict.label}DisplayText0594${wallConflict.candidateLabel}DisplayText0595, DisplayText0596.`);
  const itemConflict = findIntroducedFurnitureCollision(beforeHome,nextHome);
  if (itemConflict) return fail(state,`${itemConflict.candidateLabel}DisplayText0597${itemConflict.label}DisplayText0595, DisplayText0598.`);
  const ownedById = new Map(state.owned.map(owned=>[owned.id,owned]));
  for (const room of nextHome.rooms) {
    if (room.id === 'living') continue;
    const owned = ownedById.get(room.id);
    if (!owned || !isRoomProduct(BY_SKU.get(owned.skuId))) return fail(state,"DisplayText0599, DisplayText0600.");
    if (owned.item.kind !== room.kind) return fail(state,"DisplayText0601, DisplayText0602.");
    if (!same(roomSize(owned.item), roomSize(room))) return fail(state,"DisplayText0603, DisplayText0604.");
    if (owned.status === 'placed' && owned.storey !== storey) return fail(state,"DisplayText0605, DisplayText0606.");
  }
  for (const item of nextHome.furniture) {
    const owned = ownedById.get(item.id);
    if (!owned || BY_SKU.get(owned.skuId)?.productType !== 'furniture') return fail(state,"DisplayText0607, DisplayText0608.");
    if (owned.status === 'sold') return fail(state,"DisplayText0609, DisplayText0610.");
    if (owned.item.kind !== item.kind) return fail(state,"DisplayText0611.");
    if (owned.status === 'placed' && owned.storey !== storey) return fail(state,"DisplayText0612, DisplayText0613.");
    const before = beforeHome.furniture.find(previous=>previous.id===item.id);
    if (!before || ['x','z','rotation'].some(key=>before[key]!==item[key]) || !same(before.mount,item.mount)) {
      const blocker = findHomeCollision(nextHome,{id:`furniture:${item.id}`,item,kind:item.kind,x:item.x,z:item.z,
        ...getFurnitureFootprint(item.kind,item.rotation),layer:item.kind==='rug'?'underlay':item.kind==='chandelier'?'ceiling':'solid'});
      if (blocker) return fail(state,`DisplayText0614${blocker.label}DisplayText0595, DisplayText0615.`);
    }
  }
  for(const stairs of getHomeStairs(nextHome)) {
    const blocker = getStaircaseCollision(nextHome,stairs);
    if (blocker) return fail(state,`DisplayText0616${blocker.label??"DisplayText0618"}DisplayText0595, DisplayText0617.`);
  }
  const next=copy(state);writeFloorHome(next,storey,copy(nextHome));
  const placed=new Map();
  for(const [floor,home] of getFloorHomes(next).entries()) for(const item of [...home.furniture,...home.rooms.filter(room=>room.id!=='living')]) placed.set(item.id,{item,storey:floor});
  for(const owned of next.owned) {
    if(owned.status==='sold' || isStoreyProduct(BY_SKU.get(owned.skuId)) || isOutdoorProduct(BY_SKU.get(owned.skuId)) || isClothingProduct(BY_SKU.get(owned.skuId))) continue;
    const entry=placed.get(owned.id);owned.status=entry?'placed':'stored';owned.storey=entry?.storey??null;
    if(entry)owned.item=copy(entry.item);
  }
  return finish(next,state);
}
/** Placement uses the currently chosen floor and retains global ownership. */
export function placeOwnedItem(state,id,pose,options={storey:0}) {
  const error=editable(state);if(error)return fail(state,error);
  const storey=floorOf(options),home=getFloorHome(state,storey),owned=state.owned.find(item=>item.id===id);
  if(!home)return fail(state,"DisplayText0619.");
  if(!owned||BY_SKU.get(owned.skuId)?.productType!=='furniture')return fail(state,"DisplayText0620.");
  if(owned.status==='sold')return fail(state,"DisplayText0609, DisplayText0526.");
  if(owned.status==='placed'&&owned.storey!==storey)return fail(state,"DisplayText0621, DisplayText0622.");
  if(!record(pose)||Object.keys(pose).some(key=>!['x','z','rotation','mount'].includes(key))
    ||pose.x!==undefined&&!Number.isFinite(pose.x)||pose.z!==undefined&&!Number.isFinite(pose.z))return fail(state,"DisplayText0623.");
  const result=applyChange(home,{type:'furniture',...copy(owned.item),...pose});
  return result.ok?reconcileHome(state,result.state,{storey}):fail(state,result.error);
}
export function storeOwnedItem(state,id,options={storey:0}) {
  const error=editable(state);if(error)return fail(state,error);
  const storey=floorOf(options),home=getFloorHome(state,storey),owned=state.owned.find(item=>item.id===id);
  if(!home)return fail(state,"DisplayText0619.");
  if(!owned)return fail(state,"DisplayText0624.");
  if(owned.status==='sold')return fail(state,"DisplayText0525, DisplayText0533.");
  if(isClothingProduct(BY_SKU.get(owned.skuId)))return fail(state,"DisplayText0625.");
  if(isOutdoorProduct(BY_SKU.get(owned.skuId)))return storeOwnedOutdoor(state,id);
  if(owned.status==='stored')return pass(state);
  if(isStoreyProduct(BY_SKU.get(owned.skuId)))return fail(state,"DisplayText0626, DisplayText0627.");
  if(owned.storey!==storey)return fail(state,"DisplayText0628.");
  const result=applyChange(home,{type:isRoomProduct(BY_SKU.get(owned.skuId))?'removeRoom':'removeFurniture',id});
  return result.ok?reconcileHome(state,result.state,{storey}):fail(state,result.error);
}
/** Inspect one purchased room placement, including automatic paid filling of a local narrow gap. */
function prepareRoomPlacement(state,id,pose,options={storey:0}) {
  const error=editable(state);if(error)return fail(state,error);
  const storey=floorOf(options),home=getFloorHome(state,storey),owned=state.owned.find(item=>item.id===id);
  if(!home)return fail(state,"DisplayText0619.");
  if(!owned||!isRoomProduct(BY_SKU.get(owned.skuId)))return fail(state,"DisplayText0629, DisplayText0630.");
  if(owned.status!=='stored')return fail(state,"DisplayText0631, DisplayText0632.");
  if(!keysAre(pose,['cx','cz',...pose?.bounds?['bounds']:[]])||!Number.isInteger(pose.cx)||!Number.isInteger(pose.cz))return fail(state,"DisplayText0633.");
  const size=roomSize(owned.item),slots=getStoreyRoomSlots(state,owned.item.kind,storey,size);
  const slot=slots.find(slot=>pose.bounds ? same(slot.bounds,pose.bounds) : slot.cx===pose.cx&&slot.cz===pose.cz);
  if(!slot)return fail(state,"DisplayText0634, DisplayText0635.");
  const bounds=slot.bounds??{minX:slot.rect.minX,minZ:slot.rect.minZ,...size};
  if(!same({width:bounds.width,depth:bounds.depth},size))return fail(state,"DisplayText0636, DisplayText0637.");
  const candidate={...createRoom(owned.item.kind,slot.cx,slot.cz,id),bounds};
  if(owned.item.floor)candidate.floor=copy(owned.item.floor);
  if(owned.item.wall)candidate.wall=copy(owned.item.wall);
  const fitted=getRoomAutoFit(home,candidate),finalRoom=fitted.room;
  const result=applyChange(home,{type:'addRoom',id,kind:owned.item.kind,cx:finalRoom.cx,cz:finalRoom.cz,bounds:finalRoom.bounds});
  if(!result.ok)return fail(state,result.error);
  const room=result.state.rooms.find(item=>item.id===id);room.floor=copy(candidate.floor);room.wall=copy(candidate.wall);
  if(storey>0&&!isUpperFloorSupported(getFloorHome(state,storey-1),result.state))return fail(state,"DisplayText0638.");
  if(getHomeStairs(result.state).some(stairs=>getStaircaseCollision(result.state,stairs)))return fail(state,"DisplayText0639, DisplayText0615.");
  const to=roomSize(room),charge=paidAreaValue(owned.areaBasis,to)-paidAreaValue(owned.areaBasis,size);
  if(!Number.isSafeInteger(charge)||!moneyIsValid(state.wallet.balance-charge))return fail(state,charge>0?"DisplayText0579, DisplayText0640.":"DisplayText0641.");
  const changed=!same(size,to),adjustments=changed?[{roomId:id,from:size,to,bounds:copy(room.bounds),charge}]:[];
  const quote={roomId:id,storey,bounds:copy(room.bounds),baseArea:areaNumber(size),finalArea:areaNumber(to),
    addedArea:Number((areaNumber(to)-areaNumber(size)).toFixed(2)),charge,cost:Math.max(0,charge),refund:Math.max(0,-charge),
    balanceAfter:state.wallet.balance-charge,adjustments};
  return pass(state,{quote,nextHome:result.state});
}
export function quoteOwnedRoomPlacement(state,id,pose,options={storey:0}) {
  const prepared=prepareRoomPlacement(state,id,pose,options);
  if(!prepared.ok)return prepared;
  return pass(state,{quote:prepared.quote});
}
/** One atomic placement consumes its owned room and settles any automatic added area. */
export function placeOwnedRoom(state,id,pose,options={storey:0}) {
  const prepared=prepareRoomPlacement(state,id,pose,options);if(!prepared.ok)return prepared;
  const {quote,nextHome}=prepared,next=copy(state),owned=next.owned.find(item=>item.id===id);
  if(quote.adjustments.length&&state.areaLedger.length>=10000)return fail(state,"DisplayText0642, DisplayText0643.");
  writeFloorHome(next,quote.storey,nextHome);owned.status='placed';owned.storey=quote.storey;owned.item=copy(nextHome.rooms.find(room=>room.id===id));
  if(quote.adjustments.length) {
    const transactionId=`room-place:${id}:${state.revision+1}`;
    if(settledTransactions(state).some(entry=>entry.transactionId===transactionId))return fail(state,"DisplayText0644, DisplayText0645.");
    const change=quote.adjustments[0];
    next.areaLedger.push({id:`resize-${next.areaLedger.length+1}`,transactionId,roomId:id,storey:quote.storey,from:copy(change.from),to:copy(change.to),charge:quote.charge});
  }
  next.wallet.balance=quote.balanceAfter;
  return finish(next,state,{quote});
}

/** Price a real geometry change before it is committed. Positive charge spends points; negative charge refunds paid area. */
export function quoteRoomResize(state,id,size,options={storey:0}) {
  const error=editable(state);if(error)return fail(state,error);
  const storey=floorOf(options),home=getFloorHome(state,storey),owned=state.owned.find(row=>row.id===id);
  if(!home||!owned||!isRoomProduct(BY_SKU.get(owned.skuId))||owned.status!=='placed'||owned.storey!==storey)return fail(state,"DisplayText0646.");
  if(!exactSize(size))return fail(state,"DisplayText0647 0.2 DisplayText0648, DisplayText0649 1.2–8.4 DisplayText0650, DisplayText0651 1.2–7.8 DisplayText0650.");
  const from=roomSize(owned.item),to={width:Math.round(size.width*5)/5,depth:Math.round(size.depth*5)/5};
  const result=applyChange(home,{type:'resizeRoom',roomId:id,...to});
  if(!result.ok)return fail(state,result.error);
  if(getFloorHome(state,storey+1)&&!isUpperFloorSupported(result.state,getFloorHome(state,storey+1)))return fail(state,"DisplayText0652, DisplayText0593.");
  if(storey>0&&!isUpperFloorSupported(getFloorHome(state,storey-1),result.state))return fail(state,"DisplayText0653.");
  if(getHomeStairs(result.state).some(stairs=>getStaircaseCollision(result.state,stairs)))return fail(state,"DisplayText0654, DisplayText0655.");
  const charge=paidAreaValue(owned.areaBasis,to)-paidAreaValue(owned.areaBasis,from);
  if(!Number.isSafeInteger(charge)||!moneyIsValid(state.wallet.balance-charge))return fail(state,charge>0?"DisplayText0579, DisplayText0656.":"DisplayText0641.");
  const quote={roomId:id,storey,from,to,fromArea:areaNumber(from),toArea:areaNumber(to),
    unitPricePerArea:owned.areaBasis.unitPrice/owned.areaBasis.referenceArea,charge,cost:Math.max(0,charge),refund:Math.max(0,-charge),
    balanceAfter:state.wallet.balance-charge,changed:!same(from,to)};
  return pass(state,{quote});
}
/** Commit shape, ownership and area accounting together; ordinary decoration undo cannot bypass this transaction. */
export function resizeOwnedRoom(state,id,size,transactionId,options={storey:0}) {
  const error=editable(state);if(error)return fail(state,error);
  if(!idIsValid(transactionId))return fail(state,"DisplayText0657, DisplayText0548.");
  const storey=floorOf(options),previous=state.areaLedger.find(entry=>entry.transactionId===transactionId);
  if(previous) {
    if(previous.roomId!==id||previous.storey!==storey||!exactSize(size)||!same(previous.to,{width:Math.round(size.width*5)/5,depth:Math.round(size.depth*5)/5}))return fail(state,"DisplayText0658, DisplayText0550.");
    const owned=state.owned.find(row=>row.id===id),quote={roomId:id,storey,from:copy(previous.from),to:copy(previous.to),
      fromArea:areaNumber(previous.from),toArea:areaNumber(previous.to),unitPricePerArea:owned.areaBasis.unitPrice/owned.areaBasis.referenceArea,
      charge:previous.charge,cost:Math.max(0,previous.charge),refund:Math.max(0,-previous.charge),balanceAfter:state.wallet.balance,changed:true};
    return pass(state,{quote,adjustment:previous,repeated:true});
  }
  if([...state.orders,...state.constructionLedger,...resaleEntries(state)].some(order=>order.transactionId===transactionId))return fail(state,"DisplayText0551, DisplayText0550.");
  const priced=quoteRoomResize(state,id,size,options);if(!priced.ok)return priced;
  if(!priced.quote.changed)return pass(state,{quote:priced.quote});
  if(state.areaLedger.length>=10000)return fail(state,"DisplayText0642, DisplayText0643.");
  const result=applyChange(getFloorHome(state,storey),{type:'resizeRoom',roomId:id,...priced.quote.to});
  if(!result.ok)return fail(state,result.error);
  const next=copy(state);writeFloorHome(next,storey,result.state);
  const owned=next.owned.find(row=>row.id===id);owned.item=copy(result.state.rooms.find(room=>room.id===id));
  const adjustment={id:`resize-${next.areaLedger.length+1}`,transactionId,roomId:id,storey,
    from:copy(priced.quote.from),to:copy(priced.quote.to),charge:priced.quote.charge};
  next.areaLedger.push(adjustment);next.wallet.balance=priced.quote.balanceAfter;
  return finish(next,state,{quote:priced.quote,adjustment});
}
function normalizeConstructionSelection(selection) {
  if(!record(selection)||!Number.isSafeInteger(selection.storey)||selection.storey<0
    ||Object.keys(selection).some(key=>!['storey','rects','cells'].includes(key))||!!selection.rects===!!selection.cells)throw new TypeError("DisplayText0659.");
  const raw=selection.rects??selection.cells;
  if(!Array.isArray(raw)||raw.length>2048)throw new TypeError("DisplayText0660.");
  const rects=selection.rects?unionRectangles(selection.rects):constructionCellsToRects(selection.cells);
  if(rects.some(rect=>[rect.minX,rect.minZ,rect.minX+rect.width,rect.minZ+rect.depth].some(value=>Math.abs(value)>10000)))throw new TypeError("DisplayText0661.");
  return {storey:selection.storey,rects};
}
/** Shared aperture must clear both floors, including another live staircase on a middle floor. */
function findPairedStaircaseSite(lower,upper,id) {
  const bounds=getFloorBounds(upper);if(!bounds)return null;
  for(const rotation of [0,90]) {
    const halfX=(rotation===0?STAIR_WIDTH:STAIR_DEPTH)/2,halfZ=(rotation===0?STAIR_DEPTH:STAIR_WIDTH)/2;
    const sites=[...lower.rooms.map(roomRect),...getFloorRects(upper)].map(rect=>({x:rect.minX+rect.width/2,z:rect.minZ+rect.depth/2}));
    sites.push({x:bounds.minX+bounds.width/2,z:bounds.minZ+bounds.depth/2});
    const valid=site=>{
      const stairs={id,x:Number(site.x.toFixed(4)),z:Number(site.z.toFixed(4)),rotation,direction:'up'};
      return !getStaircaseCollision(lower,stairs)&&!getStaircaseCollision(upper,{...stairs,direction:'down'})?stairs:null;
    };
    for(const site of sites){const found=valid(site);if(found)return found;}
    const minX=bounds.minX+halfX+.04,maxX=bounds.maxX-halfX-.04,minZ=bounds.minZ+halfZ+.04,maxZ=bounds.maxZ-halfZ-.04;
    let attempts=0;
    for(let z=minZ;z<=maxZ+1e-7;z+=.2)for(let x=minX;x<=maxX+1e-7;x+=.2) {
      if(++attempts>250000)return null;
      const found=valid({x,z});if(found)return found;
    }
  }
  return null;
}
function prepareFloorConstruction(state,selection,{kitId=null}={}) {
  const error=editable(state);if(error)return fail(state,error);
  let normalized;try{normalized=normalizeConstructionSelection(selection);}catch(error){return fail(state,error.message);}
  const {storey,rects:selectedRects}=normalized,homes=getFloorHomes(state),isNewStorey=storey===homes.length;
  if(storey>homes.length)return fail(state,"DisplayText0662, DisplayText0663.");
  if(!selectedRects.length)return fail(state,"DisplayText0664.");
  const beforeRects=homes[storey]?unionRectangles(getFloorRects(homes[storey])):[],finalRects=unionRectangles([...beforeRects,...selectedRects]);
  if(finalRects.length>LAYOUT_TECH_LIMITS.maxSlabRects)return fail(state,"DisplayText0665, DisplayText0666.");
  const addedArea=rectDifferenceArea(selectedRects,beforeRects);
  if(!isRectangleUnionConnected(finalRects))return fail(state,"DisplayText0667, DisplayText0668.");
  if(storey>0&&!rectangleUnionContains(getFloorRects(homes[storey-1]),finalRects))return fail(state,"DisplayText0669; DisplayText0670.");
  if(isNewStorey&&storey===1&&!kitId&&state.owned.some(row=>isStoreyProduct(BY_SKU.get(row.skuId))&&row.status==='stored'))return fail(state,"DisplayText0671, DisplayText0672, DisplayText0673.");
  const areaCost=kitId?0:Math.round(addedArea*FLOOR_CONSTRUCTION_RATES.pricePerSquareMetre),stairCost=kitId?0:isNewStorey?FLOOR_CONSTRUCTION_RATES.stairConnectionFee:0,total=areaCost+stairCost;
  if(!moneyIsValid(total)||state.wallet.balance<total)return fail(state,"DisplayText0579, DisplayText0674.");
  let nextHome,lowerHome=null,stairConnection=null;
  if(isNewStorey) {
    try { nextHome=createHomeState({sandbox:state.home.sandbox,profile:'upper',slab:{rects:finalRects}}); }
    catch { return fail(state,"DisplayText0675, DisplayText0676; DisplayText0583."); }
    const ids=new Set(homes.flatMap(home=>getHomeStairs(home).map(stair=>stair.id)));let serial=1,id=`stairs-${storey}-${storey+1}`;
    while(ids.has(id))id=`stairs-${storey}-${storey+1}-${++serial}`;
    const up=findPairedStaircaseSite(homes[storey-1],nextHome,id);
    if(!up)return fail(state,"DisplayText0677 2.2 × 3.2 DisplayText0678, DisplayText0679.");
    const down={...up,direction:'down'},lowerResult=applyChange(homes[storey-1],{type:'stairs',stairs:up}),upperResult=applyChange(nextHome,{type:'stairs',stairs:down});
    if(!lowerResult.ok||!upperResult.ok)return fail(state,lowerResult.error??upperResult.error);
    lowerHome=lowerResult.state;nextHome=upperResult.state;
    stairConnection={id,fromStorey:storey-1,toStorey:storey,lower:up,upper:down};
  } else {
    const result=applyChange(homes[storey],{type:'slab',slab:{rects:finalRects}});if(!result.ok)return fail(state,result.error);nextHome=result.state;
  }
  if(storey===0) {
    const proposed={...state,home:nextHome};
    for(const owned of getPlacedOutdoorItems(state)) {
      const collision=validateOutdoorPlacement(proposed,owned.item,{excludeId:owned.id});
      if(!collision.ok) return fail(state,`DisplayText0680${BY_SKU.get(owned.skuId).name}DisplayText0681, DisplayText0682.`);
    }
  }
  const quote={storey,isNewStorey,fromArea:getUnionArea(beforeRects),toArea:getUnionArea(finalRects),addedArea,areaCost,stairCost,total,
    pricePerSquareMetre:kitId?0:FLOOR_CONSTRUCTION_RATES.pricePerSquareMetre,balanceAfter:state.wallet.balance-total,
    selectedRects,finalRects,stairConnection,changed:addedArea>0};
  return pass(state,{quote,beforeRects,nextHome,lowerHome});
}
/** Upper purchasing eligibility always follows the live floor below; existing purchased area stays unchanged. */
export function quoteFloorConstruction(state,selection) {
  const prepared=prepareFloorConstruction(state,selection);return prepared.ok?pass(state,{quote:prepared.quote}):prepared;
}
function commitFloorConstruction(state,prepared,transactionId,kitId=null) {
  const {quote,beforeRects,nextHome,lowerHome}=prepared,next=copy(state);
  if(next.constructionLedger.length>=10000)return fail(state,"DisplayText0683, DisplayText0643.");
  if(lowerHome)writeFloorHome(next,quote.storey-1,lowerHome);writeFloorHome(next,quote.storey,nextHome);
  // Extending a slab can split or merge its exterior wall segments. The engine
  // preserves each mounted item's world pose and remaps its wall id atomically.
  // Persist that exact new mount in the shared ownership record as well.
  for(const [storey,home] of getFloorHomes(next).entries()) for(const item of home.furniture) {
    const owned=next.owned.find(row=>row.id===item.id&&row.status==='placed'&&row.storey===storey);
    if(owned)owned.item=copy(item);
  }
  if(kitId){const kit=next.owned.find(row=>row.id===kitId);kit.status='placed';kit.storey=quote.storey;}
  let serial=next.constructionLedger.length+1;while(next.constructionLedger.some(row=>row.id===`construction-${serial}`))serial++;
  const construction={id:`construction-${serial}`,transactionId,storey:quote.storey,selectedRects:copy(quote.selectedRects),beforeRects:copy(beforeRects),afterRects:copy(quote.finalRects),
    addedArea:quote.addedArea,areaRate:quote.pricePerSquareMetre,areaCost:quote.areaCost,stairCost:quote.stairCost,total:quote.total,stairId:quote.stairConnection?.id??null,kitId};
  next.constructionLedger.push(construction);next.wallet.balance=quote.balanceAfter;
  return finish(next,state,{quote,construction});
}
export function purchaseFloorConstruction(state,selection,transactionId) {
  const error=editable(state);if(error)return fail(state,error);
  if(!idIsValid(transactionId))return fail(state,"DisplayText0684.");
  const previous=state.constructionLedger.find(entry=>entry.transactionId===transactionId);
  if(previous) {
    if(previous.type==='elevator-upgrade')return fail(state,"DisplayText0685, DisplayText0550.");
    let normalized;try{normalized=normalizeConstructionSelection(selection);}catch(error){return fail(state,error.message);}
    if(previous.kitId!==null||normalized.storey!==previous.storey||!sameRects(normalized.rects,previous.selectedRects))return fail(state,"DisplayText0686, DisplayText0550.");
    return pass(state,{repeated:true,construction:previous,quote:{storey:previous.storey,isNewStorey:previous.stairId!==null,
      fromArea:getUnionArea(previous.beforeRects),toArea:getUnionArea(previous.afterRects),addedArea:previous.addedArea,areaCost:previous.areaCost,stairCost:previous.stairCost,
      total:previous.total,pricePerSquareMetre:previous.areaRate,balanceAfter:state.wallet.balance,selectedRects:previous.selectedRects,finalRects:previous.afterRects,changed:true}});
  }
  if([...state.orders,...state.areaLedger,...resaleEntries(state)].some(row=>row.transactionId===transactionId))return fail(state,"DisplayText0551, DisplayText0550.");
  const prepared=prepareFloorConstruction(state,selection);if(!prepared.ok)return prepared;
  if(!prepared.quote.changed)return pass(state,{quote:prepared.quote});
  return commitFloorConstruction(state,prepared,transactionId);
}
function elevatorDoorIsClear(home,stairs,point,sign) {
  // Rounded up from the v4 robot's measured walking envelope (.44859 × 1.50377).
  // Keep this in sync with the controller's real body, rather than the old
  // generic .29 navigation radius which would accept an unusably narrow door.
  const radius=.45,navigation={radius,height:1.51},angle=stairs.rotation*Math.PI/180,margin=radius+.08;
  const outside={x:point.x+Math.sin(angle)*sign*margin,z:point.z+Math.cos(angle)*sign*margin};
  const withoutConnection={...home,staircases:getHomeStairs(home).filter(row=>row.id!==stairs.id)};delete withoutConnection.stairs;
  // Navigation's direct-segment test checks the full swept body and exact slab
  // support, including narrow obstacles. One context measures furnishings once;
  // a one-node search budget prevents treating a detour as a clear doorway.
  const corridor=planAvatarWalk(withoutConnection,{x:stairs.x,z:stairs.z},outside,{...navigation,maxVisited:1});
  return corridor.ok&&corridor.path.length===2;
}
function prepareStaircaseUpgrade(state,id,options) {
  const error=editable(state);if(error)return fail(state,error);
  const storey=floorOf(options),home=getFloorHome(state,storey);
  if(!home||!idIsValid(id))return fail(state,"DisplayText0687.");
  const stairs=getHomeStairs(home).find(row=>row.id===id);
  if(!stairs)return fail(state,"DisplayText0688, DisplayText0689.");
  const lowerStorey=stairs.direction==='up'?storey:storey-1,upperStorey=lowerStorey+1,
    lowerHome=getFloorHome(state,lowerStorey),upperHome=getFloorHome(state,upperStorey),
    lower=getHomeStairs(lowerHome).find(row=>row.id===id&&row.direction==='up'),upper=getHomeStairs(upperHome).find(row=>row.id===id&&row.direction==='down');
  if(!lower||!upper||!['id','x','z','rotation','type'].every(key=>lower[key]===upper[key]))return fail(state,"DisplayText0690, DisplayText0691.");
  const changed=lower.type!=='elevator',amount=changed?ELEVATOR_UPGRADE_PRODUCT.price:0;
  const quote={type:'elevator',id,storey,lowerStorey,upperStorey,skuId:ELEVATOR_UPGRADE_PRODUCT.skuId,
    amount,total:amount,changed,balanceAfter:state.wallet.balance-amount};
  if(!changed)return pass(state,{quote,lowerHome,upperHome});
  const lowerStairs={...lower,type:'elevator'},upperStairs={...upper,type:'elevator'};
  for(const [index,floor,proposed] of [[lowerStorey,lowerHome,lowerStairs],[upperStorey,upperHome,upperStairs]]) {
    const collision=getStaircaseCollision(floor,proposed);
    if(collision)return fail(state,`${index+1}DisplayText0692${collision.label??"DisplayText0695"}DisplayText0693, DisplayText0694; DisplayText0583.`);
  }
  if(!elevatorDoorIsClear(lowerHome,lowerStairs,getStaircaseEntrances(lowerStairs).lower,1)
    ||!elevatorDoorIsClear(upperHome,upperStairs,getStaircaseEntrances(upperStairs).upper,-1))
    return fail(state,"DisplayText0696, DisplayText0697, DisplayText0698; DisplayText0583.");
  if(state.wallet.balance<amount)return fail(state,"DisplayText0579, DisplayText0699.");
  const lowerResult=applyChange(lowerHome,{type:'stairs',stairs:lowerStairs}),upperResult=applyChange(upperHome,{type:'stairs',stairs:upperStairs});
  if(!lowerResult.ok||!upperResult.ok)return fail(state,lowerResult.error??upperResult.error);
  return pass(state,{quote,lowerHome:lowerResult.state,upperHome:upperResult.state});
}
/** One paid installation updates both records of one adjacent-floor link. */
export function quoteStaircaseUpgrade(state,id,options) {
  const prepared=prepareStaircaseUpgrade(state,id,options);return prepared.ok?pass(state,{quote:prepared.quote}):prepared;
}
export function upgradeStaircase(state,id,transactionId,options) {
  const error=editable(state);if(error)return fail(state,error);
  if(!idIsValid(transactionId))return fail(state,"DisplayText0700.");
  const previous=state.constructionLedger.find(entry=>entry.transactionId===transactionId),storey=floorOf(options);
  if(previous) {
    if(previous.type!=='elevator-upgrade'||previous.stairId!==id||![previous.lowerStorey,previous.upperStorey].includes(storey))
      return fail(state,"DisplayText0701, DisplayText0550.");
    return pass(state,{repeated:true,construction:previous,quote:{type:'elevator',id,storey,
      lowerStorey:previous.lowerStorey,upperStorey:previous.upperStorey,skuId:previous.skuId,amount:0,total:0,changed:false,balanceAfter:state.wallet.balance}});
  }
  if([...state.orders,...state.areaLedger,...resaleEntries(state)].some(row=>row.transactionId===transactionId))return fail(state,"DisplayText0551, DisplayText0550.");
  const prepared=prepareStaircaseUpgrade(state,id,options);if(!prepared.ok)return prepared;
  if(!prepared.quote.changed)return pass(state,{quote:prepared.quote});
  if(state.constructionLedger.length>=10000)return fail(state,"DisplayText0702, DisplayText0643.");
  const next=copy(state),{quote}=prepared;
  writeFloorHome(next,quote.lowerStorey,prepared.lowerHome);writeFloorHome(next,quote.upperStorey,prepared.upperHome);
  let serial=next.constructionLedger.length+1;while(next.constructionLedger.some(row=>row.id===`elevator-${serial}`))serial++;
  const construction={type:'elevator-upgrade',id:`elevator-${serial}`,transactionId,lowerStorey:quote.lowerStorey,upperStorey:quote.upperStorey,
    stairId:id,skuId:ELEVATOR_UPGRADE_PRODUCT.skuId,unitPrice:quote.amount,total:quote.amount};
  next.constructionLedger.push(construction);next.wallet.balance=quote.balanceAfter;
  return finish(next,state,{quote,construction});
}
/** Honor already-paid legacy kits; newly purchased floors use the measured-area API. */
export function placeOwnedStorey(state,id) {
  const error=editable(state);if(error)return fail(state,error);
  const owned=state.owned.find(item=>item.id===id);
  if(!owned||!isStoreyProduct(BY_SKU.get(owned.skuId)))return fail(state,"DisplayText0703.");
  if(state.upperFloors.length||owned.status!=='stored')return fail(state,"DisplayText0704, DisplayText0705.");
  const prepared=prepareFloorConstruction(state,{storey:1,rects:unionRectangles(getFloorRects(state.home))},{kitId:id});
  if(!prepared.ok)return prepared;
  const transactionId=`legacy-floor:${id}`;
  if(settledTransactions(state).some(row=>row.transactionId===transactionId))return fail(state,"DisplayText0706.");
  return commitFloorConstruction(state,prepared,transactionId,id);
}

export function getStoredRoomQuantities(state) {
  const counts = new Map();
  for (const owned of state.owned ?? []) if (owned.status === 'stored' && isRoomProduct(BY_SKU.get(owned.skuId))) {
    counts.set(owned.item.kind, (counts.get(owned.item.kind) ?? 0) + 1);
  }
  return counts;
}
