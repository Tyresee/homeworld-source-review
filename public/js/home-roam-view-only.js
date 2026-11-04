/** This facade owns no scene, object, audio or save reference. A public model
 * never constructs the live furniture interaction system behind hidden UI. */
export function createViewOnlyRoamInteractions(){
  let disposed=false;
  return{getTargets:()=>[],pick:()=>null,hover:()=>null,clearHover(){},activate:()=>false,tick:()=>false,unlockAudio(){},setMuted(){},getMuted:()=>true,getState:()=>({disposed,readOnly:true,hovered:null,activeAnimations:0,counts:{},targets:[],floors:[]}),dispose(){disposed=true;}};
}

/** An orbiting camera may be above every storey. Its height must never replace
 * an explicitly selected floor in a model showcase. Manual walking still uses Y. */
export function getHomeRoamDisplayFloor(model,{cameraY=0,selectedStorey=null}={}){
  const rows=model.floorModels??[];
  return rows.find(row=>row.storey===selectedStorey)??rows.findLast(row=>cameraY>=row.baseY)??rows[0];
}
