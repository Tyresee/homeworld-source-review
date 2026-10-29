import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createStageLighting} from '../public/js/student-home-stage-lighting.js';

function setup(){
  const scene=new THREE.Scene(),sun=new THREE.DirectionalLight('#fff',2.6),lamp=new THREE.PointLight('#ffd28b',9);
  sun.castShadow=true;
  const glowing=new THREE.MeshStandardMaterial({emissive:'#ffcc55',emissiveIntensity:2.4}),screen=new THREE.MeshBasicMaterial({color:'#defacd'});
  const cube=new THREE.Mesh(new THREE.BoxGeometry(),glowing),tv=new THREE.Mesh(new THREE.PlaneGeometry(),screen);scene.add(sun,lamp,cube,tv);
  let frames=0;const stage=createStageLighting({scene,requestRender:()=>frames++});
  const begin=(now=0)=>{stage.update({active:true,point:{x:1,y:.08,z:2}},now);stage.update({active:true,point:{x:1,y:.08,z:2}},now+1000);};
  return{scene,sun,lamp,glowing,screen,stage,begin,frames:()=>frames};
}

test('stage illumination is temporary and original lamp settings survive every frame',()=>{
  const x=setup(),color=x.screen.color.clone();x.begin();
  x.scene.onBeforeRender();assert.ok(x.sun.intensity>.08&&x.sun.intensity<.3);assert.ok(x.lamp.intensity>.1&&x.lamp.intensity<.8);assert.ok(x.glowing.emissiveIntensity>.1&&x.glowing.emissiveIntensity<.4);assert.ok(x.screen.color.r>color.r*.08&&x.screen.color.r<color.r*.2);assert.ok(x.scene.background.isColor);
  x.scene.onAfterRender();assert.equal(x.sun.intensity,2.6);assert.equal(x.lamp.intensity,9);assert.equal(x.glowing.emissiveIntensity,2.4);assert.ok(x.screen.color.equals(color));assert.equal(x.scene.background,null);
  // An ordinary object-runtime tick remains the authority for new brightness.
  x.lamp.intensity=4;x.glowing.emissiveIntensity=1.2;x.scene.onBeforeRender();x.scene.onAfterRender();assert.equal(x.lamp.intensity,4);assert.equal(x.glowing.emissiveIntensity,1.2);x.stage.dispose();
});

test('soft spotlight and bounded bounce follow the dancer without another shadow render',()=>{
  const x=setup();x.begin();x.stage.update({active:true,point:{x:4,y:.08,z:-3}},1100);
  const group=x.scene.getObjectByName('robot-dance-stage'),spot=group.getObjectByName('robot-stage-spotlight');
  assert.equal(group.children.filter(n=>n.isLight).length,2);assert.equal(spot.castShadow,false);assert.equal(spot.target.position.x,4);assert.equal(spot.target.position.z,-3);assert.ok(spot.position.y>4);
  x.scene.onBeforeRender();assert.equal(spot.intensity,60);assert.equal(spot.penumbra,1);const bounce=group.getObjectByName('robot-stage-reflected-light');assert.ok(bounce.intensity>0&&bounce.intensity<2);assert.equal(bounce.castShadow,false);assert.ok(bounce.position.distanceTo(spot.target.position)<1.1);x.scene.onAfterRender();assert.equal(x.stage.getState().shadowLights,0);x.stage.dispose();
});

test('fade-in and fade-out are monotonic, bounded and stop requesting frames',()=>{
  const x=setup(),state={active:true,point:{x:0,z:0}};x.stage.update(state,0);const entering=[];
  for(let t=0;t<=1000;t+=50){x.stage.update(state,t);entering.push(x.stage.getState().amount);}
  assert.equal(entering[0],0);assert.equal(entering.at(-1),1);assert.ok(entering.every((v,i)=>v>=0&&v<=1&&(!i||v>=entering[i-1])));
  x.stage.update({active:false},1100);const leaving=[];for(let t=1100;t<=2100;t+=50){x.stage.update({active:false},t);leaving.push(x.stage.getState().amount);}
  assert.equal(leaving.at(-1),0);assert.ok(leaving.every((v,i)=>!i||v<=leaving[i-1]));const frames=x.frames();assert.equal(x.stage.update({},2200),false);assert.equal(x.frames(),frames);assert.equal(x.stage.getState().visible,false);x.stage.dispose();
});

test('account clear and dispose restore state, remove stage objects, and preserve prior hooks',()=>{
  const scene=new THREE.Scene(),sun=new THREE.DirectionalLight('#fff',3);scene.add(sun);let before=0,after=0;
  const onBefore=()=>before++,onAfter=()=>after++;scene.onBeforeRender=onBefore;scene.onAfterRender=onAfter;
  const stage=createStageLighting({scene});stage.update({active:true,point:{x:0,z:0}},0);stage.update({active:true,point:{x:0,z:0}},1000);
  scene.onBeforeRender();stage.reset();assert.equal(sun.intensity,3);assert.equal(scene.background,null);assert.equal(stage.getState().visible,false);scene.onAfterRender();assert.equal(before,1);assert.equal(after,1);
  stage.dispose();stage.dispose();assert.equal(scene.children.length,1);assert.equal(scene.onBeforeRender,onBefore);assert.equal(scene.onAfterRender,onAfter);assert.equal(stage.update({active:true,point:{x:0,z:0}},2000),false);
});

test('robot face illumination is retained and invalid stage points never turn the room black',()=>{
  const x=setup(),faceMaterial=new THREE.MeshStandardMaterial({emissive:'#55cfff',emissiveIntensity:1});const face=new THREE.Mesh(new THREE.BoxGeometry(),faceMaterial);face.userData.avatar=true;x.scene.add(face);
  x.stage.update({active:true,point:{x:NaN,z:0}},0);assert.equal(x.stage.getState().active,false);
  x.begin(100);x.scene.onBeforeRender();assert.equal(faceMaterial.emissiveIntensity,1);x.scene.onAfterRender();x.stage.dispose();
});

test('model discovery is bounded and newly added lamps are included without rescanning every frame',()=>{
  const x=setup(),state={active:true,point:{x:0,z:0}};x.begin();const baseline=x.stage.getState().scans;
  for(let t=1016;t<1250;t+=16){x.stage.update(state,t);x.scene.onBeforeRender();x.scene.onAfterRender();}
  assert.equal(x.stage.getState().scans,baseline);
  const added=new THREE.PointLight('#fff',7);x.scene.add(added);x.stage.update(state,1260);assert.equal(x.stage.getState().scans,baseline+1);
  x.scene.onBeforeRender();assert.ok(added.intensity>.1&&added.intensity<.6);x.scene.onAfterRender();assert.equal(added.intensity,7);x.stage.dispose();
});

// The visual regression was caused by zeroing all indirect light. A stage
// must still retain ambient/fill contributions at a lower level than daylight.
test('ambient and fill preserve dark-side detail while the main daylight stays dim',()=>{
  const x=setup(),hemi=new THREE.HemisphereLight('#fff','#888',2.1),fill=new THREE.DirectionalLight('#fff',1);
  x.scene.environmentIntensity=.8;x.scene.add(hemi,fill);x.begin();x.scene.onBeforeRender();
  assert.ok(hemi.intensity>.2&&hemi.intensity<.4);assert.ok(fill.intensity>.1&&fill.intensity<.25);
  assert.ok(hemi.intensity/2.1>x.sun.intensity/2.6*2,'ambient contribution is not flattened with the key light');
  assert.ok(x.scene.environmentIntensity>.05&&x.scene.environmentIntensity<.15);
  x.scene.onAfterRender();assert.equal(hemi.intensity,2.1);assert.equal(fill.intensity,1);assert.equal(x.scene.environmentIntensity,.8);x.stage.dispose();
});
