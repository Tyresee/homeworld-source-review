/** Local elastic response only: never modify the owned furniture record or
 * collision volume. All original transforms are restored before replacement. */
export function createCushionPresentation({getModels,requestRender=()=>{}}){
  let active=null;
  function clear(){if(!active)return;active.mesh.position.y=active.y;active.mesh.scale.y=active.scaleY;active=null;requestRender();}
  function apply({id,cushionTidy}){
    if(!cushionTidy){if(active?.id===id)clear();return;}
    const group=getModels().find(row=>row.itemId===id)?.group;if(!group){clear();return;}
    const meshes=[];group.traverse(node=>{if(node.isMesh)meshes.push(node);});
    const mesh=meshes[cushionTidy.partIndex];if(!mesh)return;
    if(active?.mesh!==mesh){clear();mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox;
      active={id,group,mesh,y:mesh.position.y,scaleY:mesh.scale.y,minY:bounds.min.y,height:(bounds.max.y-bounds.min.y)*mesh.scale.y};}
    const a=active,compression=Math.max(0,Math.min(Number(cushionTidy.compression)||0,a.height*.14));
    a.mesh.scale.y=a.scaleY*(1-compression/Math.max(a.height,.001));
    a.mesh.position.y=a.y+a.minY*(a.scaleY-a.mesh.scale.y);requestRender();
  }
  return {apply,clear,release(group){if(active?.group===group)clear();}};
}
