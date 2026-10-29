import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {createHomeState} from '../public/js/home-engine.js';
import {createLuxuryItem} from '../public/js/home-luxury-models.js';

let source,previousDocument,previousRaf,previousCancel,frames,serial=0;
before(async()=>{
  const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  previousDocument=globalThis.document;previousRaf=globalThis.requestAnimationFrame;previousCancel=globalThis.cancelAnimationFrame;
  globalThis.document=new EventTarget();document.hidden=false;frames=new Map();
  globalThis.requestAnimationFrame=callback=>{frames.set(++serial,callback);return serial;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
});
after(()=>{globalThis.document=previousDocument;globalThis.requestAnimationFrame=previousRaf;globalThis.cancelAnimationFrame=previousCancel;});

function actor(t){const c=createStudentHomeRobotController({source,parent:new THREE.Group(),requestRender(){}});t.after(()=>c.dispose());return c;}
function homeFor(kind,rotation){
  const home=createHomeState({profile:'upper',slab:{rects:[{minX:-5,minZ:-5,width:10,depth:10}]}});
  home.furniture=[{id:'orientation-fixture',kind,x:.4,z:-.3,rotation,level:1,color:'#f7ead7',material:'ceramic'}];
  return home;
}
function finish(c,action){
  for(let n=0;n<1000;n++){
    const state=c.getState();if(state.action===action&&!state.inTransition)return;
    const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(performance.now()+50);
  }
  assert.fail(`Robot never reached ${action}: ${JSON.stringify(c.getState())}`);
}
function furnitureLocalPoint(c,home,name){
  const robot=c.group.getObjectByName('robot-avatar');robot.updateWorldMatrix(true,true);
  const item=home.furniture[0],point=robot.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  return point.sub(new THREE.Vector3(item.x,.08,item.z)).applyAxisAngle(new THREE.Vector3(0,1,0),-item.rotation*Math.PI/180);
}
function authoredRear(kind,part){
  const model=createLuxuryItem({kind}),bounds=new THREE.Box3();model.updateMatrixWorld(true);
  model.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.part===part)bounds.union(new THREE.Box3().setFromObject(mesh));});
  assert.equal(bounds.isEmpty(),false,`${kind} needs an actual ${part} reference`);
  const geometries=new Set(),materials=new Set();model.traverse(mesh=>{if(mesh.isMesh){geometries.add(mesh.geometry);for(const material of [].concat(mesh.material))materials.add(material);}});
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
  return bounds.getCenter(new THREE.Vector3());
}
function assertFacing(c,home){
  const head=furnitureLocalPoint(c,home,'Head'),hip=furnitureLocalPoint(c,home,'HipRoot'),foot=furnitureLocalPoint(c,home,'AnkleL');
  if(home.furniture[0].kind==='bedCanopy'){
    const headboard=authoredRear('bedCanopy','wide-headboard');
    assert.ok(headboard.z<0,'authored headboard must be at the negative Z end');
    assert.ok(head.z<hip.z-.4&&hip.z<foot.z-.3,'head, torso and feet must run from the headboard toward the foot of the bed');
    assert.ok(Math.abs(head.z-headboard.z)<Math.abs(foot.z-headboard.z),'head must be closer to the headboard than the feet');
  }else{
    const tank=authoredRear('compactToilet','cistern'),eye=furnitureLocalPoint(c,home,'EyeL');
    assert.ok(tank.z<0,'authored tank must be behind the bowl');
    assert.ok(eye.z>head.z+.1&&foot.z>hip.z+.15,'face and knees must point away from the toilet tank');
    assert.ok(hip.z>tank.z+.3,'the seated torso remains in front of the tank');
  }
}

for(const rotation of [0,90,180,270])for(const [kind,id,action]of [['bedCanopy','lie','lie'],['compactToilet','toilet','sit']]){
  test(`${kind} ${rotation} degrees faces the authored furniture correctly after interaction and repeated hydration`,t=>{
    const home=homeFor(kind,rotation),c=actor(t);c.setWorld(home);c.setAvatar({activity:null,equipped:{}});
    assert.equal(c.interact('furniture:orientation-fixture',id).ok,true);finish(c,action);assertFacing(c,home);
    const saved=c.captureActivity({emit:false}),fresh=actor(t);fresh.setWorld(home);fresh.setAvatar({activity:saved,equipped:{}});assertFacing(fresh,home);
    for(let n=0;n<3;n++){
      fresh.setWorld(structuredClone(home));fresh.setAvatar({activity:structuredClone(saved),equipped:{}});assertFacing(fresh,home);
      fresh.setVisible(false);fresh.setVisible(true);assertFacing(fresh,home);
    }
    fresh.clearAccountBinding();fresh.setWorld(createHomeState({profile:'account'}));fresh.setAvatar({activity:null,equipped:{}});
    fresh.clearAccountBinding();fresh.setWorld(home);fresh.setAvatar({activity:saved,equipped:{}});assertFacing(fresh,home);
  });
}
