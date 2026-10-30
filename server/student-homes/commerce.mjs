import {createHash} from 'node:crypto';
import {createHomeState,applyChange,getFloorRects,roomRect} from '../../public/js/home-engine.js';
import {createAvatarState} from '../../public/js/home-avatar-state.js';
import {COMMERCE_VERSION,SHOP_CATALOG,validateCommerceState,getFloorHomes,getFloorHome,setCartQuantity,checkoutCart,equipAvatarClothing,placeOwnedItem,storeOwnedItem,setOwnedObjectState,reconcileHome,placeOwnedRoom,resizeOwnedRoom,purchaseFloorConstruction,upgradeStaircase,placeOwnedStorey,placeOwnedOutdoor,updateOwnedOutdoor,storeOwnedOutdoor,sellOwnedItem} from '../../public/js/home-commerce.js';
import {ROBOT_CLOTHING_PRODUCTS,isRobotClothingSku} from '../../public/js/robot-wardrobe-catalog.js';
import {exactKeys,isRecord,invalid,HomeServiceError} from './errors.mjs';

export {CATALOG_VERSION,LEGACY_CATALOG_VERSION} from '../../public/js/home-catalog-version.js';
const CALCULATOR_CAP=1_000_000_000;
const clone=value=>structuredClone(value);
const productById=new Map(SHOP_CATALOG.map(product=>[product.skuId,product]));
const robotClothingById=new Map(ROBOT_CLOTHING_PRODUCTS.map(product=>[product.skuId,product]));
const isAccountProduct=product=>!!product&&product.productType!=='storey'
  &&(product.productType!=='clothing'||isRobotClothingSku(product.skuId));
export const isCommandId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,95}$/.test(value);
export function canonicalJSON(value){
  if(Array.isArray(value))return `[${value.map(canonicalJSON).join(',')}]`;
  if(isRecord(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const commandHash=command=>createHash('sha256').update(canonicalJSON(command)).digest('hex');
export const paymentOrderId=(tenant,student,commandId)=>`home-${createHash('sha256').update(`${tenant}\0${student}\0${commandId}`).digest('hex')}`;
// The identity belongs to the owned unit and its original purchase. A second
// browser command cannot mint a second platform credit for the same object.
export const resaleOrderId=(tenant,student,ownedId,originalOrderId)=>`home-resale-${createHash('sha256').update(`${tenant}\0${student}\0${ownedId}\0${originalOrderId}`).digest('hex')}`;
/** These zero-available bookkeeping fields satisfy the shared geometry engine.
 * They are never a spendable wallet and never authorize purchases. */
export function normalizeAccountCommerce(state){
  const next=clone(state),spent=next.wallet.initialBalance-next.wallet.balance;
  next.wallet={balance:0,initialBalance:spent};next.cart=[];
  return next;
}
export function createAccountCommerce(){
  const home=createHomeState({sandbox:false,profile:'account',slab:{rects:[{minX:-2.8,minZ:-2.6,width:5.6,depth:5.2}]}});
  home.paint=0;
  const state={version:COMMERCE_VERSION,revision:0,home,upperFloors:[],areaLedger:[],wallet:{balance:0,initialBalance:0},cart:[],owned:[],orders:[],avatar:createAvatarState(),constructionBasis:{floors:[clone(getFloorRects(home))]},constructionLedger:[]};
  if(!validateAccountCommerce(state))throw new Error('Account commerce initialization failed.');
  return state;
}
export function validateAccountCommerce(state){
  return validateCommerceState(state)&&state.version===COMMERCE_VERSION&&state.home.profile==='account'
    &&state.wallet.balance===0&&state.cart.length===0&&getFloorHomes(state).every(home=>home.sandbox===false&&home.paint===0&&home.decals.length===0&&home.props.length===0)
    &&state.owned.every(owned=>owned.source==='purchase'&&isAccountProduct(productById.get(owned.skuId)));
}
export function houseFromCommerce(state){
  return {templateId:'starter-room-v1',floors:getFloorHomes(state).map((home,level)=>({id:`floor-${level}`,level,slab:clone(home.slab),rooms:home.rooms.map(room=>({id:room.id==='living'?'student-living':room.id,kind:room.kind,bounds:Object.fromEntries(['minX','minZ','width','depth'].map(key=>[key,roomRect(room)[key]]))})),...home.stairs?{stairs:clone(home.stairs)}:{},...home.staircases?{staircases:clone(home.staircases)}:{}})),exterior:{style:state.home.rooms.length===1&&state.upperFloors.length===0?'starter':'custom',level:getFloorHomes(state).length}};
}
function expectKeys(command,keys){if(!exactKeys(command,['type',...keys]))throw invalid("DisplayText4488, DisplayText4489.");}
function floorOptions(command){if(!Number.isSafeInteger(command.storey)||command.storey<0)throw invalid("DisplayText4490.");return {storey:command.storey};}
function checked(result){if(!result?.ok)throw invalid(result?.error??"DisplayText0716, DisplayText4491.");return result;}
/** Compute only from authenticated stored ownership + authoritative catalog. */
export function prepareCommerceCommand(current,command,commandId){
  if(!validateAccountCommerce(current))throw new HomeServiceError(503,'storage_unavailable',"DisplayText4492, DisplayText0522.");
  if(!isCommandId(commandId)||!isRecord(command)||typeof command.type!=='string')throw invalid("DisplayText4493.");
  const state=clone(current),spent=state.wallet.initialBalance;
  state.wallet={balance:CALCULATOR_CAP,initialBalance:spent+CALCULATOR_CAP};
  let result;
  switch(command.type){
    case 'checkout': {
      expectKeys(command,['lines']);
      if(!Array.isArray(command.lines)||!command.lines.length||command.lines.length>100)throw invalid("DisplayText4494 1 DisplayText0561 100 DisplayText4495.");
      const seen=new Set();let cart=state;
      for(const line of command.lines){
        if(!exactKeys(line,['skuId','quantity'])||seen.has(line.skuId)||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>99)throw invalid("DisplayText4496.");
        const product=productById.get(line.skuId);
        if(!isAccountProduct(product))throw invalid("DisplayText4497.");
        seen.add(line.skuId);cart=checked(setCartQuantity(cart,line.skuId,line.quantity)).state;
      }
      result=checkoutCart(cart,commandId);break;
    }
    case 'equipClothing':
      expectKeys(command,['skuId','slot']);
      if(!['outfit','headwear','footwear'].includes(command.slot))throw invalid("DisplayText4498.");
      if(command.skuId!==null&&!isRobotClothingSku(command.skuId))throw invalid("DisplayText4499.");
      result=equipAvatarClothing(state,command.skuId,command.slot);break;
    case 'placeItem':expectKeys(command,['id','pose','storey']);result=placeOwnedItem(state,command.id,command.pose,floorOptions(command));break;
    case 'storeItem':expectKeys(command,['id','storey']);result=storeOwnedItem(state,command.id,floorOptions(command));break;
    case 'setObjectState':expectKeys(command,['id','storey','patch']);result=setOwnedObjectState(state,command.id,command.patch,floorOptions(command));break;
    case 'updateItem':{
      expectKeys(command,['id','patch','storey']);const options=floorOptions(command),home=getFloorHome(state,options.storey),owned=state.owned.find(row=>row.id===command.id);
      if(!owned||owned.status!=='placed'||owned.storey!==options.storey||productById.get(owned.skuId)?.productType!=='furniture')throw invalid("DisplayText4500.");
      if(!isRecord(command.patch)||!Object.keys(command.patch).length||Object.keys(command.patch).some(key=>!['x','z','rotation','color','mount'].includes(key)))throw invalid("DisplayText4501, DisplayText4502.");
      const changed=checked(applyChange(home,{type:'furniture',id:command.id,...command.patch}));
      result=reconcileHome(state,changed.state,options);break;
    }
    case 'setFloorFinish':{
      expectKeys(command,['surfaceId','finishId','storey']);const options=floorOptions(command),home=getFloorHome(state,options.storey);
      const changed=checked(applyChange(home,{type:'setFloorFinish',surfaceId:command.surfaceId,finishId:command.finishId}));
      result=changed.changed?reconcileHome(state,changed.state,options):{ok:true,state};break;
    }
    case 'placeRoom':expectKeys(command,['id','pose','storey']);result=placeOwnedRoom(state,command.id,command.pose,floorOptions(command));break;
    case 'resizeRoom':expectKeys(command,['id','size','storey']);result=resizeOwnedRoom(state,command.id,command.size,commandId,floorOptions(command));break;
    case 'constructFloor':expectKeys(command,['selection']);result=purchaseFloorConstruction(state,command.selection,commandId);break;
    case 'upgradeStaircase':expectKeys(command,['id','storey']);result=upgradeStaircase(state,command.id,commandId,floorOptions(command));break;
    case 'placeStorey':expectKeys(command,['id']);result=placeOwnedStorey(state,command.id);break;
    case 'placeOutdoor':expectKeys(command,['id','pose']);result=placeOwnedOutdoor(state,command.id,command.pose);break;
    case 'updateOutdoor':expectKeys(command,['id','patch']);result=updateOwnedOutdoor(state,command.id,command.patch);break;
    case 'storeOutdoor':expectKeys(command,['id']);result=storeOwnedOutdoor(state,command.id);break;
    case 'sellItem':expectKeys(command,['id']);result=sellOwnedItem(state,command.id,commandId);break;
    default:throw invalid("DisplayText4503, DisplayText4504.");
  }
  checked(result);
  const creditAmount=command.type==='sellItem'?result.quote?.amount:0;
  const amount=command.type==='sellItem'?0:CALCULATOR_CAP-result.state.wallet.balance;
  if(!Number.isSafeInteger(amount)||amount<0)throw invalid("DisplayText4505, DisplayText4506.");
  if(command.type==='sellItem'&&(!Number.isSafeInteger(creditAmount)||creditAmount<0
    ||result.state.wallet.balance!==CALCULATOR_CAP+creditAmount))throw invalid("DisplayText4507, DisplayText4508.");
  const commerce=normalizeAccountCommerce(result.state);
  // Newly generated upper floors inherit the zero paint budget, too.
  for(const home of getFloorHomes(commerce))home.paint=0;
  if(!validateAccountCommerce(commerce))throw invalid("DisplayText4509, DisplayText4508.");
  const detail={...(result.order?{order:clone(result.order)}:{}),...(result.quote?{quote:clone(result.quote)}:{}),...(result.resale?{resale:clone(result.resale)}:{})};
  if(detail.quote)delete detail.quote.balanceAfter;
  return {commerce,amount,...command.type==='sellItem'?{creditAmount}:{},detail,changed:JSON.stringify(commerce)!==JSON.stringify(current)};
}
export function accountCatalog(){return SHOP_CATALOG.filter(isAccountProduct).map(product=>clone(robotClothingById.get(product.skuId)??product));}
