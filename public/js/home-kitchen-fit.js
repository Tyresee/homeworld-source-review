import {MODULAR_KITCHEN_COLLECTION} from './home-modular-kitchen-collection.js';
import {getLuxuryCollisionBounds} from './home-building-collision.js';

const definitions=new Map(MODULAR_KITCHEN_COLLECTION.map(row=>[row.id,row]));
export const getKitchenFit=kind=>definitions.get(kind)?.kitchenFit??null;
export function areKitchenModulesCompatible(first,second){
  const a=getKitchenFit(first?.kind),b=getKitchenFit(second?.kind);
  return !!a?.canDock&&!!b?.canDock&&a.series===b.series
    &&Math.abs(a.depth-b.depth)<.001&&Math.abs(a.worktopHeight-b.worktopHeight)<.001;
}
/** Dock complete, separately owned modules side by side. Neither product is
 * inserted inside another appliance; ordinary server placement still checks
 * room support, neighbouring furniture, walls and the staircase. */
export function getKitchenDockPose(home,anchorId,item,side){
  const anchor=home?.furniture?.find(row=>row.id===anchorId);
  if(!anchor||!['left','right'].includes(side)||!areKitchenModulesCompatible(anchor,item))
    return {ok:false,error:"DisplayText1418, DisplayText1419."};
  const a=getLuxuryCollisionBounds(anchor),b=getLuxuryCollisionBounds(item),rotation=anchor.rotation??0;
  if(!a||!b)return {ok:false,error:"DisplayText1420."};
  const x=side==='left'?a.minX-b.maxX-.015:a.maxX-b.minX+.015,z=a.minZ-b.minZ,angle=rotation*Math.PI/180;
  return {ok:true,pose:{x:anchor.x+x*Math.cos(angle)+z*Math.sin(angle),z:anchor.z-x*Math.sin(angle)+z*Math.cos(angle),rotation},
    note:`${getKitchenFit(anchor.kind).seriesLabel} · DisplayText1421, DisplayText1422`};
}
