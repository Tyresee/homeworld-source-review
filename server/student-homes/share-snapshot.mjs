import {getFloorHomes} from '../../public/js/home-commerce.js';
import {validateHomeState} from '../../public/js/home-engine.js';
import {getOutdoorProduct} from '../../public/js/home-outdoor-catalog.js';
import {getOutdoorItemBounds} from '../../public/js/home-outdoor-placement.js';
import {isRobotClothingSku} from '../../public/js/robot-wardrobe-catalog.js';
import {migrateStudentHome} from './profile.mjs';
import {exactKeys,invalid} from './errors.mjs';

export const HOME_SHARE_SCHEMA_VERSION=1;
export const HOME_SHARE_TITLE="My Learning Home";
const HOME_SHARE_TITLE_SUFFIX=" Home",HOME_SHARE_TITLE_MAX_LENGTH=60;

/** A roster display name is the only authorized personal text in a public
 * snapshot. Keep the existing visitor title limit and never split a Unicode
 * code point while shortening a long name. No account identifier is copied. */
export function createHomeShareTitle(displayName){
  if(typeof displayName!=='string')return HOME_SHARE_TITLE;
  const cleaned=displayName.replace(/\s+/gu,' ').replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu,'').trim();
  let name='';for(const character of cleaned){if(name.length+character.length>HOME_SHARE_TITLE_MAX_LENGTH-HOME_SHARE_TITLE_SUFFIX.length)break;name+=character;}
  name=name.trim();return name?name+HOME_SHARE_TITLE_SUFFIX:HOME_SHARE_TITLE;
}
const validShareTitle=title=>typeof title==='string'&&title.length<=HOME_SHARE_TITLE_MAX_LENGTH
  &&(title===HOME_SHARE_TITLE||title.endsWith(HOME_SHARE_TITLE_SUFFIX)&&title.length>HOME_SHARE_TITLE_SUFFIX.length
    &&createHomeShareTitle(title.slice(0,-HOME_SHARE_TITLE_SUFFIX.length))===title);
export const HOME_SHARE_MAX_BYTES=4*1024*1024;
const clone=value=>structuredClone(value),hex=value=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value);
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,clone(value[key])]));
const HOME_KEYS=['version','sandbox','paint','profile','slab','rooms','surfaces','decals','props','furniture','upgrades','plans','placements','table','revision','stairs','staircases'];
const OUTDOOR_KEYS=['kind','x','z','rotation','color','legacyPlans','legacyIncludedExtras','legacyFootprint'];
const safeId=value=>typeof value==='string'&&/^[a-z\d_.:-]{1,96}$/i.test(value);

/** Visual-only projection of a trusted, validated account home. Every custom
 * identifier is re-keyed, including mounting and shared stair references. No
 * source account record, transaction or financial field is copied. The only
 * personal text is an explicitly supplied trusted roster display name. */
export function serializeHomeShareSnapshot(home,{displayName}={}){
  const source=migrateStudentHome(home),original=getFloorHomes(source.commerce);
  const roomIds=new Map(),itemIds=new Map(),stairIds=new Map();
  const alias=(map,value,prefix)=>{if(!map.has(value))map.set(value,`${prefix}-${map.size+1}`);return map.get(value);};
  for(const floor of original){
    for(const room of floor.rooms)if(room.id!=='living')alias(roomIds,room.id,'room');
    for(const item of [...floor.furniture,...floor.props,...floor.decals])alias(itemIds,item.id,'item');
    for(const stair of [...floor.staircases??[],...floor.stairs?[floor.stairs]:[]])alias(stairIds,stair.id,'stairs');
  }
  const wallId=value=>{
    for(const [old,id]of [...roomIds].sort((a,b)=>b[0].length-a[0].length))if(value.startsWith(`room:${old}:`))return`room:${id}:${value.slice(old.length+6)}`;
    return value;
  };
  const floors=original.map(floor=>{
    const value=pick(floor,HOME_KEYS);value.revision=0;value.paint=0;value.sandbox=false;
    for(const room of value.rooms)if(room.id!=='living')room.id=roomIds.get(room.id);
    for(const item of [...value.furniture,...value.props,...value.decals]){
      item.id=itemIds.get(item.id);
      if(item.mount?.parentId)item.mount.parentId=itemIds.get(item.mount.parentId)??item.mount.parentId;
      if(item.mount?.wallId)item.mount.wallId=wallId(item.mount.wallId);
    }
    for(const stair of [...value.staircases??[],...value.stairs?[value.stairs]:[]])stair.id=stairIds.get(stair.id);
    if(!validateHomeState(value))throw invalid("This home cannot be published as a showcase. Its saved data is preserved.");
    return value;
  });
  const owned=source.commerce.owned.filter(row=>row.status==='placed'&&getOutdoorProduct(row.item?.kind)).map((row,index)=>{
    const id=`outdoor-${index+1}`;return{id,status:'placed',item:{id,...pick(row.item,OUTDOOR_KEYS)}};
  });
  const snapshot={schemaVersion:HOME_SHARE_SCHEMA_VERSION,gameId:'homeworld',theme:'warm',title:createHomeShareTitle(displayName),floors,
    outdoor:{home:floors[0],owned},avatar:{kind:'robot',modelId:'robot-companion',modelVersion:'v4',colors:clone(source.avatar.colors),equipped:clone(source.commerce.avatar.equipped)}};
  if(!validateHomeShareSnapshot(snapshot))throw invalid("This home cannot be published as a showcase. Its saved data is preserved.");
  if(Buffer.byteLength(JSON.stringify(snapshot))>HOME_SHARE_MAX_BYTES)throw invalid("The showcase data is too large. Try again later.");
  return snapshot;
}

/** Validate persisted public data before serving it, without reconstructing a
 * spendable commerce record. Legacy generic titles and bounded personalized
 * titles remain compatible with the same frozen snapshot schema. */
export function validateHomeShareSnapshot(snapshot){
  try{
    if(!exactKeys(snapshot,['schemaVersion','gameId','theme','title','floors','outdoor','avatar'])||snapshot.schemaVersion!==HOME_SHARE_SCHEMA_VERSION||snapshot.gameId!=='homeworld'||snapshot.theme!=='warm'||!validShareTitle(snapshot.title)
      ||!Array.isArray(snapshot.floors)||!snapshot.floors.length||!snapshot.floors.every(validateHomeState))return false;
    if(!exactKeys(snapshot.outdoor,['home','owned'])||JSON.stringify(snapshot.outdoor.home)!==JSON.stringify(snapshot.floors[0])||!Array.isArray(snapshot.outdoor.owned)||snapshot.outdoor.owned.length>1024)return false;
    const ids=new Set();for(const row of snapshot.outdoor.owned){
      if(!exactKeys(row,['id','status','item'])||row.status!=='placed'||!safeId(row.id)||ids.has(row.id)||row.item?.id!==row.id||!getOutdoorItemBounds(row.item)||!hex(row.item.color)||Object.keys(row.item).some(key=>!['id',...OUTDOOR_KEYS].includes(key)))return false;
      ids.add(row.id);
    }
    const avatar=snapshot.avatar;if(!exactKeys(avatar,['kind','modelId','modelVersion','colors','equipped'])||avatar.kind!=='robot'||avatar.modelId!=='robot-companion'||avatar.modelVersion!=='v4'||!exactKeys(avatar.colors,['shell','accent'])||!Object.values(avatar.colors).every(hex)
      ||!exactKeys(avatar.equipped,['outfit','headwear','footwear'])||!Object.values(avatar.equipped).every(value=>value===null||isRobotClothingSku(value)))return false;
    return Buffer.byteLength(JSON.stringify(snapshot))<=HOME_SHARE_MAX_BYTES;
  }catch{return false;}
}
