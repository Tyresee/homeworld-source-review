import * as THREE from 'three';

/** Small presentation effects driven by the controller's existing clock.
 * Station coordinates belong to the enclosing floor, including its pot height. */
export function createRobotCookingEffects(parent){
  const root=new THREE.Group();root.name='robot-cooking-effects';root.visible=false;
  root.userData.robotActionProp=true;root.userData.cookingEffect=true;parent?.add(root);
  const geometries=new Set(),materials=new Set(),flames=[],steam=[];
  let disposed=false;
  function mesh(group,geometry,material,name,effect){
    geometries.add(geometry);materials.add(material);
    const node=new THREE.Mesh(geometry,material);node.name=name;
    node.userData.robotActionProp=true;node.userData.cookingEffect=effect;
    node.castShadow=node.receiveShadow=false;node.raycast=()=>{};group.add(node);return node;
  }
  const gas=new THREE.Group(),induction=new THREE.Group(),plume=new THREE.Group();
  gas.name='cooking-gas';induction.name='cooking-induction';plume.name='cooking-steam';root.add(gas,induction,plume);
  const flameMaterial=new THREE.MeshStandardMaterial({color:'#65a9ed',emissive:'#1877df',emissiveIntensity:.45,roughness:.75,transparent:true,opacity:.74,depthWrite:false});
  const ring=mesh(gas,new THREE.TorusGeometry(1.03,.028,5,40),flameMaterial,'cooking-gas-ring','gas');ring.rotation.x=Math.PI/2;ring.position.y=.018;
  const cone=new THREE.ConeGeometry(.070,.27,5);
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6,node=mesh(gas,cone,flameMaterial,`cooking-gas-flame-${i}`,'gas');
    node.position.set(Math.cos(angle)*1.03,.115,Math.sin(angle)*1.03);flames.push(node);
  }
  const heatMaterial=new THREE.MeshStandardMaterial({color:'#a8483c',emissive:'#e44b35',emissiveIntensity:.45,roughness:.8,transparent:true,opacity:.7,depthWrite:false});
  const heat=mesh(induction,new THREE.TorusGeometry(1.07,.03,6,40),heatMaterial,'cooking-induction-heat','induction');heat.rotation.x=Math.PI/2;heat.position.y=.028;
  const puffGeometry=new THREE.SphereGeometry(1,10,7);
  for(let i=0;i<4;i++)steam.push(mesh(plume,puffGeometry,new THREE.MeshBasicMaterial({color:'#e4edf0',transparent:true,opacity:0,depthWrite:false}),`cooking-steam-puff-${i}`,'steam'));
  function update(station=null,time=0,intensity=0){
    const strength=Number.isFinite(intensity)?THREE.MathUtils.clamp(intensity,0,1):0;
    if(disposed||!strength||!station||![station.center?.x,station.center?.z,station.baseY,station.rimY,station.radius].every(Number.isFinite)||station.radius<=0||station.rimY<station.baseY){root.visible=false;return;}
    const radius=station.radius,seconds=Number.isFinite(time)?time%28:0;
    root.visible=true;root.position.set(station.center.x,station.baseY,station.center.z);
    gas.visible=station.heatType==='gas';induction.visible=station.heatType==='induction';
    gas.scale.setScalar(radius);induction.scale.setScalar(radius);
    const pulse=.9+.1*Math.sin(seconds*4);
    flameMaterial.opacity=.74*strength;flameMaterial.emissiveIntensity=(.34+.16*pulse)*strength;
    heatMaterial.opacity=.7*strength;heatMaterial.emissiveIntensity=(.3+.2*pulse)*strength;
    for(let i=0;i<flames.length;i++)flames[i].scale.y=.8+.2*Math.sin(seconds*5+i*1.7);
    for(let i=0;i<steam.length;i++){
      const puff=steam[i],phase=((seconds/2.8+i/4)%1+1)%1,angle=i*2.4+phase*.6;
      puff.position.set(Math.cos(angle)*radius*(.18+.22*phase),station.rimY-station.baseY+.04+phase*.32,Math.sin(angle)*radius*(.18+.22*phase));
      puff.scale.set(radius*(.19+.22*phase),radius*(.24+.26*phase),radius*(.19+.22*phase));
      puff.material.opacity=.13*strength*Math.sin(phase*Math.PI);
    }
  }
  function dispose(){
    if(disposed)return;disposed=true;root.visible=false;root.removeFromParent();
    for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();root.clear();
  }
  return {root,update,dispose};
}
