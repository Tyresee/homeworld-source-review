import * as THREE from 'three';
import {getCookingStation} from './home-cooking-stations.js';

/** Attach only after the original appliance has finished its normalization.
 * This pot belongs to the rendered stove, never to a student's inventory. */
export function attachDefaultCookingPot(root,item){
  const station=getCookingStation(item?.kind??root?.userData?.kind);
  if(!station||!root?.isObject3D)return root;
  if(root.children.some(child=>child.userData.cookingStationAccessory))return root;
  const pot=new THREE.Group();pot.name='cooking-station-pot';
  pot.position.set(station.center.x,station.baseY,station.center.z);
  pot.userData={cookingStationPart:true,cookingStationAccessory:true,stationId:station.id};
  function mesh(geometry,name,color,metalness=.3,roughness=.38){
    const material=new THREE.MeshStandardMaterial({color,metalness,roughness});
    const part=new THREE.Mesh(geometry,material);part.name=name;
    part.castShadow=part.receiveShadow=true;
    part.userData={part:name,paintable:false,cookingStationPart:true};pot.add(part);return part;
  }
  // A closed wall profile gives the pot a real hollow interior and a solid
  // bottom. The flat underside rests on the existing ring or pan supports.
  const profile=[[0,0],[.116,0],[.118,.012],[.12,.135],[.119,.146],
    [.110,.146],[.108,.133],[.103,.028],[.096,.022],[0,.022]];
  mesh(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),28),'cooking-pot-body','#79a5a0');
  const rim=mesh(new THREE.TorusGeometry(station.radius,.004,6,28),'cooking-pot-rim','#d5e0d8',.65,.25);
  rim.rotation.x=Math.PI/2;rim.position.y=station.height-.004;
  for(const sign of[-1,1]){
    const points=[[.112,.078,-.035],[.137,.095,-.035],[.142,.095,0],[.137,.095,.035],[.112,.078,.035]]
      .map(([x,y,z])=>new THREE.Vector3(x*sign,y,z));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.008,6,false),
      `cooking-pot-handle-${sign<0?'left':'right'}`,'#405e60',.2,.55);
  }
  const food=mesh(new THREE.CylinderGeometry(.103,.103,.004,28),'cooking-pot-food','#d9ab57',0,.62);
  food.position.y=.111;
  for(const[index,[x,z,color]]of[[-.045,-.028,'#c3784f'],[.036,-.025,'#71975c'],[-.014,.044,'#eee0ae'],[.053,.032,'#c3784f']].entries()){
    const ingredient=mesh(new THREE.SphereGeometry(1,8,6),`cooking-pot-ingredient-${index}`,color,0,.7);
    ingredient.position.set(x,.113,z);ingredient.scale.set(.016,.006,.012);
  }
  root.add(pot);
  // Three's cloning and serialization can safely copy these plain values.
  root.userData.cookingStation=JSON.parse(JSON.stringify(station));
  root.updateMatrixWorld(true);return root;
}
