import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLuxuryItem} from '../public/js/home-luxury-models.js';
import {createHomeRoamInteractions} from '../public/js/home-roam-interactions.js';
import {createStudentHomeObjectRuntime} from '../public/js/student-home-object-runtime.js';
import {OBJECT_CAPABILITY_KINDS} from '../public/js/home-object-state.js';

const quietAudio=()=>({unlock(){},play(){},setMuted(){}});
const canvasDocument=()=>{const calls=[],document={hidden:false,createElement(tag){assert.equal(tag,'canvas');const context=new Proxy({}, {get:(object,key)=>object[key]??((...args)=>calls.push([key,...args])),set:(object,key,value)=>(object[key]=value,true)});return{width:0,height:0,getContext:()=>context};},addEventListener(){},removeEventListener(){}};return{document,calls};};
function release(root){const geometries=new Set(),materials=new Set();root.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of[].concat(node.material??[]))materials.add(material);});for(const value of geometries)value.dispose();for(const value of materials)value.dispose();}
function fixture(kind='ipRetroTelevision',{storey=0,height=0}={}){
  const {document,calls}=canvasDocument(),root=new THREE.Group(),model=createLuxuryItem({kind});root.position.y=height;root.add(model);model.userData.furnitureId='same-tv';
  const controller=createHomeRoamInteractions({root,document,storey,audio:quietAudio(),locale:'en'}),power=controller.targets.find(target=>target.type==='television-power'),channel=controller.targets.find(target=>target.type==='television-channel');
  return{root,model,controller,power,channel,calls,document,dispose(){controller.dispose();release(root);}};
}

test('each real television tier powers its actual CanvasTexture screen and changes all four shared original channels through its remote',()=>{
  for(const kind of OBJECT_CAPABILITY_KINDS.television){
    const f=fixture(kind);try{
      assert.ok(f.power,kind);assert.ok(f.channel,kind);assert.equal(f.power.screens.length,1);const screen=f.power.screens[0];assert.equal(screen.node.userData.objectPart,'tv-screen');assert.equal(screen.node.material.isMeshBasicMaterial,true);assert.equal(screen.node.material.toneMapped,false);assert.equal(screen.node.material.map,screen.texture);assert.equal(screen.texture.isCanvasTexture,true);assert.equal(screen.canvas.width,512);assert.equal(screen.canvas.height,288);assert.equal(screen.texture.generateMipmaps,false);
      assert.equal(f.controller.tick(.1),false);assert.equal(f.power.label(),'Turn television on');
      f.calls.length=0;f.controller.activate(f.power);assert.equal(f.power.label(),'Turn television off');assert.ok(f.calls.some(call=>call[0]==='fillText'&&call[1]==='FOREST TV'));assert.equal(f.power.on,true);
      for(const[expected,title]of[[1,'WEATHER'],[2,'SPORTS'],[3,'MUSIC'],[0,'FOREST TV']]){f.calls.length=0;f.controller.activate(f.channel);assert.equal(f.channel.media.channel,expected);assert.ok(f.calls.some(call=>call[0]==='fillText'&&call[1]===title));}
      const state=f.controller.getState().targets.find(target=>target.type==='television-power');assert.equal(state.power,true);assert.equal(state.channel,0);assert.equal(state.channelName,'Forest animation');
      f.controller.activate(f.power);assert.equal(f.controller.tick(.1),false);assert.equal(f.power.on,false);f.controller.activate(f.channel);assert.equal(f.power.on,true,'a remote channel choice can wake a powered-off TV');assert.equal(f.power.media.channel,1);
    }finally{f.dispose();}
  }
});

test('TV sampling stays at eight frames per second while powered, stops when off/hidden and resumes after floor visibility returns',()=>{
  const f=fixture();try{
    const texture=f.power.screens[0].texture;f.controller.activate(f.power);const atOn=texture.version;
    assert.equal(f.controller.tick(.05),true);assert.equal(texture.version,atOn);f.controller.tick(.075);assert.equal(texture.version,atOn+1);
    f.root.visible=false;const hidden=texture.version;assert.equal(f.controller.tick(.1),false);assert.equal(texture.version,hidden);assert.equal(f.power.media.power,true,'hiding a floor cannot erase its temporary channel');
    f.root.visible=true;assert.equal(f.controller.tick(.1),true);assert.ok(texture.version>hidden);f.controller.activate(f.power);const atOff=texture.version;assert.equal(f.controller.tick(.1),false);assert.equal(texture.version,atOff);
  }finally{f.dispose();}
});

test('actual TV and remote surfaces select separate power/channel actions without a new panel or invisible pick volume',()=>{
  const f=fixture();try{
    f.root.updateMatrixWorld(true);const screen=f.power.screens[0].node,p=screen.getWorldPosition(new THREE.Vector3());
    const faceRay=new THREE.Raycaster(p.clone().add(new THREE.Vector3(0,0,2)),new THREE.Vector3(0,0,-1));assert.equal(f.controller.pick(faceRay)?.target,f.power);assert.equal(f.controller.click(faceRay),true);assert.equal(f.power.on,true);
    const button=f.channel.meshes.find(mesh=>mesh.userData.part==='remote-channel'),q=button.getWorldPosition(new THREE.Vector3()),remoteRay=new THREE.Raycaster(q.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0));assert.equal(f.controller.pick(remoteRay)?.target,f.channel);assert.equal(f.controller.click(remoteRay),true);assert.equal(f.power.media.channel,1);
    f.controller.hover(faceRay);assert.equal(f.power.screens[0].node.material.isMeshBasicMaterial,true,'hover cannot replace the live screen texture');f.controller.clearHover();
    const wall=new THREE.Mesh(new THREE.BoxGeometry(4,4,.1),new THREE.MeshStandardMaterial());wall.position.copy(p).add(new THREE.Vector3(0,0,1));f.root.add(wall);assert.equal(f.controller.pick(faceRay),null,'a wall still occludes television actions');
  }finally{f.dispose();}
});

test('duplicate furniture and ceiling identifiers stay separate across storeys and every temporary floor effect uses its real world height',()=>{
  const a=fixture('ipRetroTelevision',{storey:0}),b=fixture('ipRetroTelevision',{storey:2,height:6.7});try{
    assert.ok(!a.power.id.startsWith('floor:'));assert.equal(b.power.id,'floor:2:'+a.power.id);b.controller.activate(b.power);b.controller.activate(b.channel);assert.equal(b.power.media.channel,1);assert.equal(a.power.media.channel,0);assert.equal(a.power.on,false);assert.equal(b.controller.getState().storey,2);assert.ok(b.controller.getState().targets.every(target=>target.storey===2&&target.id.startsWith('floor:2:')));
  }finally{a.dispose();b.dispose();}
  const document=canvasDocument().document,build=height=>{const root=new THREE.Group();root.position.y=height;root.add(createLuxuryItem({kind:'hhTripodLamp'}));const disc=new THREE.Mesh(new THREE.CircleGeometry(.26),new THREE.MeshStandardMaterial());root.add(disc);const c=createHomeRoamInteractions({root,document,storey:height?1:0,ceilingLights:[{id:'ceiling:same',disc}],audio:quietAudio()});root.updateMatrixWorld(true);return{root,c,lamp:c.targets.find(t=>t.type==='floor-lamp'),ceiling:c.targets.find(t=>t.type==='ceiling-light')};};
  const low=build(0),high=build(3.35);try{const y=scope=>scope.lamp.floorTarget.getWorldPosition(new THREE.Vector3()).y;assert.ok(Math.abs(y(high)-y(low)-3.35)<1e-7);assert.equal(high.ceiling.id,'floor:1:'+low.ceiling.id);}finally{low.c.dispose();high.c.dispose();release(low.root);release(high.root);}
});

test('a viewing copy can share borrowed live TV materials without altering the authoritative settings, robot watch record, live pixels or borrowed resources',()=>{
  const {document}=canvasDocument(),live=createLuxuryItem({kind:'ipWideTelevision'}),model={itemId:'owned-tv',group:live},commerce={owned:[{id:'owned-tv',source:'purchase',status:'placed',storey:0,item:{id:'owned-tv',kind:'ipWideTelevision'}}],objectStates:{'owned-tv':{power:true,channel:2,volume:1}},robotActivity:{kind:'watch',itemId:'owned-tv',seatId:'owned-sofa'}};
  const before=JSON.stringify(commerce),runtime=createStudentHomeObjectRuntime({document,now:()=>1000,requestRender(){},setTimer:()=>1,clearTimer(){},requestFrame:()=>1,cancelFrame(){}});runtime.sync(commerce,[model]);const liveScreen=live.getObjectByName('television-screen'),originalLiveMaterial=liveScreen.material,originalLiveTexture=liveScreen.material.map,liveVersion=originalLiveTexture.version;
  const root=new THREE.Group(),copy=live.clone(true);copy.userData.furnitureId='owned-tv';root.add(copy);let borrowedGeometryDisposals=0,borrowedMaterialDisposals=0,borrowedTextureDisposals=0;
  copy.traverse(mesh=>{mesh.geometry?.addEventListener('dispose',()=>borrowedGeometryDisposals++);for(const material of[].concat(mesh.material??[]))material.addEventListener('dispose',()=>borrowedMaterialDisposals++);});originalLiveTexture.addEventListener('dispose',()=>borrowedTextureDisposals++);
  const c=createHomeRoamInteractions({root,document,locale:'en',audio:quietAudio()}),power=c.targets.find(t=>t.type==='television-power'),channel=c.targets.find(t=>t.type==='television-channel'),privateTexture=power.screens[0].texture,privateMaterial=power.screens[0].node.material;let privateTextureDisposals=0,privateMaterialDisposals=0;privateTexture.addEventListener('dispose',()=>privateTextureDisposals++);privateMaterial.addEventListener('dispose',()=>privateMaterialDisposals++);
  try{
    assert.notEqual(privateTexture,originalLiveTexture);c.activate(power);c.activate(channel);c.tick(.1);c.tick(.1);assert.equal(JSON.stringify(commerce),before);assert.equal(liveScreen.material,originalLiveMaterial);assert.equal(originalLiveTexture.version,liveVersion);c.dispose();c.dispose();
    assert.equal(copy.getObjectByName('television-screen').material,originalLiveMaterial);assert.equal(privateTextureDisposals,1);assert.equal(privateMaterialDisposals,1);assert.equal(borrowedGeometryDisposals,0);assert.equal(borrowedMaterialDisposals,0);assert.equal(borrowedTextureDisposals,0);
  }finally{c.dispose();runtime.dispose();release(live);root.clear();}
});
