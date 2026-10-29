/** Small owned-object settings shared by the authoritative service and scene.
 * Animated transforms, sounds, media URLs and robot poses never enter this map. */
const LAMPS=Object.freeze(['lamp','candelabra','chandelier','taskLamp','readingLamp','hhTripodLamp','hhArcLamp','hhLanternLamp','hhMushroomLamp','hhTaskLamp','hhPleatedLamp','hhWallSconce','hhFlowerSconce','decorLavaLamp','decorOrbLamp']);
const CLOCKS=Object.freeze(['cuckooClock','wallClock','deskClock','wallPendulum','wallDaisyClock']);
const TELEVISIONS=Object.freeze(['ipRetroTelevision','ipWideTelevision','ipCinemaTelevision']);
export const OBJECT_CAPABILITY_KINDS=Object.freeze({lamp:LAMPS,clock:CLOCKS,television:TELEVISIONS});
export const TELEVISION_CHANNELS=Object.freeze(["DisplayText1993","DisplayText1994","DisplayText1995","DisplayText1996"]);
const capabilities=new Map(Object.entries(OBJECT_CAPABILITY_KINDS).flatMap(([type,kinds])=>kinds.map(kind=>[kind,Object.freeze({type})])));
const defaults=Object.freeze({lamp:Object.freeze({power:false,brightness:2}),television:Object.freeze({power:false,channel:0,volume:1}),clock:Object.freeze({chime:true})});
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const forbidden=new Set(['__proto__','prototype','constructor']);
const safeId=id=>typeof id==='string'&&/^[a-z\d_.:-]{1,96}$/i.test(id)&&!forbidden.has(id);
const member=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const ownedObject=(commerce,id)=>safeId(id)&&Array.isArray(commerce?.owned)?commerce.owned.find(row=>row?.id===id):null;
const activeObject=owned=>owned&&['purchase','gift'].includes(owned.source)&&owned.status==='placed'&&Number.isSafeInteger(owned.storey)&&owned.storey>=0&&owned.item?.id===owned.id;
const isValue=(type,key,value)=>type==='lamp'?(key==='power'?typeof value==='boolean':key==='brightness'&&member(value,1,3))
  :type==='television'?(key==='power'?typeof value==='boolean':key==='channel'?member(value,0,3):key==='volume'&&member(value,0,2))
    :type==='clock'&&key==='chime'&&typeof value==='boolean';
const isState=(type,value)=>record(value)&&Object.keys(value).length===Object.keys(defaults[type]).length
  &&Object.keys(value).every(key=>Object.hasOwn(defaults[type],key)&&isValue(type,key,value[key]));

export const getObjectCapabilities=kind=>capabilities.get(kind)??null;
export function getObjectState(commerce,id){
  const owned=ownedObject(commerce,id),type=getObjectCapabilities(owned?.item?.kind)?.type;
  if(!activeObject(owned)||!type)return null;
  const stored=record(commerce.objectStates)&&Object.hasOwn(commerce.objectStates,id)?commerce.objectStates[id]:null;
  return {...(isState(type,stored)?stored:defaults[type])};
}
export function validateObjectStates(commerce){
  if(!Object.hasOwn(commerce??{},'objectStates'))return true;
  if(commerce.version!==6||!record(commerce.objectStates)||!Array.isArray(commerce.owned))return false;
  const entries=Object.entries(commerce.objectStates);
  if(entries.length>commerce.owned.length||entries.length>1024)return false;
  return entries.every(([id,value])=>{
    const owned=ownedObject(commerce,id),type=getObjectCapabilities(owned?.item?.kind)?.type;
    return activeObject(owned)&&!!type&&isState(type,value);
  });
}
/** Remove settings only when their owned object stops being placed. Other
 * malformed settings remain invalid rather than being silently repaired. */
export function reconcileObjectStates(commerce){
  if(!record(commerce?.objectStates))return commerce;
  for(const id of Object.keys(commerce.objectStates)){
    const owned=ownedObject(commerce,id);
    if(!activeObject(owned)||!getObjectCapabilities(owned.item.kind))delete commerce.objectStates[id];
  }
  if(Object.keys(commerce.objectStates).length===0)delete commerce.objectStates;
  return commerce;
}
/** A bounded setting edit. The commerce facade validates the full snapshot and
 * advances its revision; this helper neither accesses nor computes a wallet. */
export function applyOwnedObjectState(commerce,id,patch,{storey}={}){
  const fail=error=>({ok:false,state:commerce,error});
  if(!safeId(id)||!Number.isSafeInteger(storey)||storey<0)return fail("DisplayText1997.");
  const owned=ownedObject(commerce,id),type=getObjectCapabilities(owned?.item?.kind)?.type;
  if(!activeObject(owned)||owned.storey!==storey||!type)return fail("DisplayText1998.");
  if(!record(patch)||!Object.keys(patch).length||!Object.keys(patch).every(key=>Object.hasOwn(defaults[type],key)&&isValue(type,key,patch[key])))
    return fail("DisplayText1999.");
  const before=getObjectState(commerce,id),value={...before,...patch};
  if(Object.keys(value).every(key=>value[key]===before[key]))return {ok:true,state:commerce};
  const next=structuredClone(commerce);
  next.objectStates??={};next.objectStates[id]=value;
  return {ok:true,state:next};
}
