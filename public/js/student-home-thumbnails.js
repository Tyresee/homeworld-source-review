import * as THREE from 'three';
import {createLuxuryItem} from './home-luxury-models.js';
import {createOutdoorProductModel} from './home-outdoor-models.js';
import {createRoomExpansion} from './home-room-expansion.js';
import {createRoom} from './home-layout.js';
import {createEstateManor} from './home-estate-manor.js';
import {createRobotAvatar,disposeRobotAvatar,setRobotPalette,poseRobotAvatar} from './robot-avatar.js';
import {createRobotWardrobe} from './robot-wardrobe.js';
export function createStudentHomeThumbnails(){
  let renderer,robot,wardrobe;const cache=new Map();
  function setRobotSource(source){if(robot)return;robot=createRobotAvatar(source);wardrobe=createRobotWardrobe(robot);}
  function image(product){
    const key=JSON.stringify(product);if(cache.has(key))return cache.get(key);
    renderer??=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(300,210,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-3,3,2,-2,.01,200),item=product.item??product,rank=item.level??1;
    const clothing=product.productType==='clothing';
    if(clothing){if(!robot)throw new Error('Robot source has not loaded');poseRobotAvatar(robot,{action:'idle',time:0});setRobotPalette(robot,product.colors??{shell:'#e9dfc9',accent:'#869779'});wardrobe.setEquipment(product.equipped??{[product.slot]:product.skuId});}
    const model=clothing?robot:product.productType==='outdoor'?createOutdoorProductModel(product,item):product.productType==='room'?createRoomExpansion({rooms:[createRoom(product.kind,0,0,'preview')],includeGrid:false}):product.productType==='storey'?createEstateManor({floors:[{rooms:[createRoom('living')]},{rooms:[createRoom('living')]}]}):createLuxuryItem({...item,plans:item.plans??{structure:rank,material:1,decor:rank,detail:rank}});
    scene.add(model,new THREE.HemisphereLight('#fff8e6','#9daa98',2.1));const sun=new THREE.DirectionalLight('#fff4d9',3.4);sun.position.set(3,8,6);scene.add(sun);
    try{model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),r=Math.max(size.x,size.y,size.z,.5);camera.position.copy(center).add(clothing?new THREE.Vector3(r*.8,r*.6,r*3):new THREE.Vector3(r*1.8,r*1.45,r*2));camera.lookAt(center);camera.updateMatrixWorld(true);const projected=new THREE.Box3();for(let k=0;k<8;k++)projected.expandByPoint(new THREE.Vector3(k&1?bounds.max.x:bounds.min.x,k&2?bounds.max.y:bounds.min.y,k&4?bounds.max.z:bounds.min.z).applyMatrix4(camera.matrixWorldInverse));const h=Math.max(projected.max.y-projected.min.y,(projected.max.x-projected.min.x)/(300/210),.01)*.57;camera.left=-h*300/210;camera.right=h*300/210;camera.top=h;camera.bottom=-h;camera.updateProjectionMatrix();renderer.render(scene,camera);const url=renderer.domElement.toDataURL('image/webp',.88);cache.set(key,url);if(cache.size>100)cache.delete(cache.keys().next().value);return url;}
    finally{model.removeFromParent();if(!clothing)model.traverse(child=>{child.geometry?.dispose();for(const mat of(Array.isArray(child.material)?child.material:[child.material]))mat?.dispose();});}
  }
  return {image,setRobotSource,dispose(){wardrobe?.dispose();if(robot)disposeRobotAvatar(robot);renderer?.dispose();renderer?.forceContextLoss();cache.clear();}};
}
