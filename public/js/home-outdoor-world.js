import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getOutdoorProduct } from './home-outdoor-catalog.js';
import { createOutdoorProductModel } from './home-outdoor-models.js';
import { getOutdoorLandBounds } from './home-outdoor-placement.js';

/** One stable instance per owned item. Dragging only changes the pose. */
export function createOutdoorWorld() {
  const root = new THREE.Group(); root.name = 'owned-outdoor-world';
  const records = new Map(); let ground = null, groundKey = '';
  const disposeModel = group => { group.userData.dispose?.(); group.removeFromParent(); };
  root.setState = state => {
    const land = getOutdoorLandBounds(state), key = JSON.stringify(land);let changed=key!==groundKey;
    if (key !== groundKey) {
      if (ground) {ground.geometry.dispose();ground.material.dispose();ground.removeFromParent();}
      ground = new THREE.Mesh(new RoundedBoxGeometry(land.width,.32,land.depth,3,.14), new THREE.MeshStandardMaterial({color:'#a7c776',roughness:1}));
      ground.position.set(land.x,-.18,land.z);ground.receiveShadow=true;ground.userData.estateFeature='lawn'; root.add(ground); groundKey=key;
    }
    const alive = new Set();
    for (const owned of state.owned) {
      const product = getOutdoorProduct(owned.item?.kind);
      if (!product || owned.status !== 'placed') continue;
      alive.add(owned.id);
      const {x,z,rotation,...appearance}=owned.item, style=JSON.stringify(appearance);
      let record=records.get(owned.id);
      if (!record || record.style!==style) {
        if (record) disposeModel(record.group);
        const group=createOutdoorProductModel(product,owned.item);
        group.traverse(node=>{if(node.isMesh)Object.assign(node.userData,{outdoorOwnedId:owned.id,estateFeature:product.feature});});
        root.add(group); record={group,style,feature:product.feature}; records.set(owned.id,record);changed=true;
      }
      if(record.group.position.x!==x || record.group.position.z!==z || record.group.rotation.y!==rotation*Math.PI/180)changed=true;
      record.group.position.set(x,0,z);record.group.rotation.y=rotation*Math.PI/180;
    }
    for(const [id,record] of records)if(!alive.has(id)){disposeModel(record.group);records.delete(id);changed=true;}
    root.updateMatrixWorld(true); return changed;
  };
  root.getOwned = id => records.get(id)?.group ?? null;
  root.getFeature = id => [...records.values()].find(record=>record.feature===id)?.group ?? null;
  root.getPlacedBounds = () => {const bounds=new THREE.Box3();for(const record of records.values())bounds.expandByObject(record.group);return bounds;};
  root.dispose = () => {for(const record of records.values())disposeModel(record.group);records.clear();if(ground){ground.geometry.dispose();ground.material.dispose();ground=null;groundKey='';}root.clear();};
  return root;
}
