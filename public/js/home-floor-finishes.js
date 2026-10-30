import {getRoomKind} from './home-layout.js';

// Presentation identifiers only: no prices, ownership, geometry or GPU objects.
const wood=(id,label,pattern,color)=>({id,label,group:'wood',pattern,color,tileMeters:2.4,boardWidthMeters:['herringbone','narrow'].includes(pattern)?.12:.20,boardLengthMeters:pattern==='herringbone'?.6*Math.SQRT2:1.2,...pattern==='herringbone'?{columnMeters:.6}:{}});
const tile=(id,label,color)=>({id,label,group:'tile',pattern:'tile',color,tileMeters:1.4});
export const FLOOR_FINISHES=Object.freeze([
  wood('wood-light-oak',"DisplayText4681",'wide','#d8b58c'),
  wood('wood-walnut',"DisplayText0764",'wide','#8f6748'),
  wood('wood-washed-oak',"DisplayText4682",'washed','#cdbfac'),
  wood('wood-herringbone-oak',"DisplayText4683·DisplayText4684",'herringbone','#c29470'),
  wood('wood-cherry',"DisplayText4685",'narrow','#b17a58'),
  wood('wood-herringbone-walnut',"DisplayText4683·DisplayText4686",'herringbone','#94694a'),
  tile('tile-terracotta-deep',"DisplayText4687",'#a5624a'),
  tile('tile-terracotta',"DisplayText4688",'#b9755a'),
  tile('tile-terracotta-light',"DisplayText4689",'#c98c6c'),
  tile('tile-caramel',"DisplayText4690",'#c49a6c'),
  tile('tile-sand',"DisplayText4691",'#c9b498'),
  tile('tile-stone',"DisplayText4692",'#aea493'),
  tile('tile-blue',"DisplayText4693",'#9aabb8'),
  tile('tile-charcoal',"DisplayText4694",'#7a7671'),
].map(Object.freeze));
export const FLOOR_FINISH_IDS=Object.freeze(FLOOR_FINISHES.map(row=>row.id));
const byId=new Map(FLOOR_FINISHES.map(row=>[row.id,row]));
export const isFloorFinishId=id=>typeof id==='string'&&byId.has(id);
export const getFloorFinish=id=>isFloorFinishId(id)?byId.get(id):null;
export const DEFAULT_ROOM_FLOOR_FINISHES=Object.freeze({
  living:'wood-light-oak',bedroom:'wood-light-oak',study:'wood-light-oak',hallway:'wood-light-oak',gallery:'wood-light-oak',playroom:'wood-light-oak',
  kitchen:'tile-terracotta',bathroom:'tile-blue',sunroom:'tile-sand',
});
const hex=value=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value);
/** Resolve only the optional warm presentation. Legacy colors/materials are
 * never rewritten. Pass the engine's default floor.main appearance for a
 * public slab, rather than guessing it from a room type's different floor. */
export function resolveHomeFloorFinish(roomKind,appearance,{themeId='default',legacyDefault}={}) {
  if(themeId!=='warm'||!appearance||!hex(appearance.color)||typeof appearance.material!=='string')return null;
  const kind=typeof roomKind==='string'?getRoomKind(roomKind):roomKind;
  const baseKind=kind?.baseKind??kind?.id;
  if(!Object.hasOwn(DEFAULT_ROOM_FLOOR_FINISHES,baseKind))return null;
  const original=legacyDefault??{color:kind.floor,material:'oak'};
  const untouched=hex(original?.color)&&appearance.color.toLowerCase()===original.color.toLowerCase()&&appearance.material===original.material;
  let finish,source;
  if(Object.hasOwn(appearance,'finishId')) {
    finish=getFloorFinish(appearance.finishId);if(!finish)return null;source='explicit';
  }else if(untouched){finish=getFloorFinish(DEFAULT_ROOM_FLOOR_FINISHES[baseKind]);source='default';}
  else if(appearance.material==='oak'){finish=getFloorFinish('wood-light-oak');source='legacy-custom';}
  else if(appearance.material==='ceramic'){finish=getFloorFinish('tile-stone');source='legacy-custom';}
  else return null;
  return {...finish,color:source==='legacy-custom'?appearance.color:finish.color,source};
}
