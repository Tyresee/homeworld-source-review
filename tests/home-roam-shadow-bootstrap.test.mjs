import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script,createContext} from 'node:vm';
import * as THREE from 'three';
import {createRoom,roomRect} from '../public/js/home-layout.js';

const worldSource=await readFile(new URL('../public/js/home-roam-world.js',import.meta.url),'utf8');
const sceneSource=await readFile(new URL('../public/js/home-scene.js',import.meta.url),'utf8');
// Execute the actual nested lighting function with real Three lights. Only
// its renderer/scene boundary is substituted: no WebGL context or browser is
// needed to verify the allocation contract which caused the blank canvas.
const start=worldSource.indexOf('  function applyLighting(state)'),end=worldSource.indexOf('\n  function renderNow',start);
assert.ok(start>=0&&end>start,'the real experience lighting function must be available');
const applySource=worldSource.slice(start,end);
function harness() {
  const sun=new THREE.DirectionalLight('#fff0d8',3.4),fill=new THREE.DirectionalLight('#dde7f2',.9),hemisphere=new THREE.HemisphereLight('#fff6ea','#e2dbcf',1.7),master=new THREE.PointLight('#ffe1b8',0,11,2);master.castShadow=true;master.shadow.autoUpdate=false;
  const descriptor={id:'ceiling:living',roomId:'living',enabled:true,disc:{visible:false,material:{emissiveIntensity:.8}},light:new THREE.PointLight('#ffe1b8',0,11,2)};descriptor.light.position.set(0,2.6,0);
  const renderer={toneMappingExposure:1.03,shadowMap:{autoUpdate:false,needsUpdate:false}},model={manor:{visible:true},doorway:new THREE.Group(),interior:{visible:false},ceilings:[{visible:false}],ceilingLights:[descriptor],entrance:{roomId:'living'},setOrbitCut:()=>false};
  const context=createContext({THREE,model,renderer,sun,fill,hemisphere,master,home:{rooms:[createRoom('living')]},roomRect,baseline:{sun:3.4,fill:.9,hemi:1.7,exposure:1.03},controller:{camera:{position:new THREE.Vector3(0,1.45,0)},controls:{target:new THREE.Vector3()}}});
  new Script(`let lastMode='',lastLight='';${applySource}\nglobalThis.apply=applyLighting;globalThis.refreshLighting=()=>{lastLight='';};`,{filename:'home-roam-world.js:applyLighting'}).runInContext(context);
  return {sun,fill,hemisphere,master,descriptor,renderer,model,apply:mode=>context.apply({sceneMode:mode}),refresh:()=>context.refreshLighting()};
}

test('first exterior lighting bootstraps the zero-intensity point shadow map before sampler reuse',()=>{
  const h=harness();assert.equal(h.master.shadow.map,null);h.apply('ext');
  assert.equal(h.master.intensity,0);assert.equal(h.master.shadow.autoUpdate,false);assert.equal(h.master.shadow.needsUpdate,true,'a null point-shadow map must be allocated even outside');assert.equal(h.renderer.shadowMap.needsUpdate,true);
});

test('an allocated point shadow is not refreshed outside, but indoor lighting owns its ongoing updates',()=>{
  const h=harness();h.apply('ext');
  h.master.shadow.map={dispose(){}};h.master.shadow.needsUpdate=false;h.refresh();h.apply('ext');
  assert.equal(h.master.shadow.needsUpdate,false);assert.equal(h.master.shadow.autoUpdate,false);assert.equal(h.renderer.shadowMap.autoUpdate,false);assert.equal(h.master.intensity,0);
  h.apply('in');assert.equal(h.master.shadow.needsUpdate,true);assert.equal(h.master.shadow.autoUpdate,true);assert.equal(h.renderer.shadowMap.autoUpdate,true);assert.equal(h.master.intensity,24);assert.equal(h.sun.shadow.autoUpdate,false);assert.equal(h.sun.shadow.needsUpdate,false);assert.equal(h.sun.intensity,0);assert.equal(h.fill.intensity,0);assert.equal(h.hemisphere.intensity,1.05);assert.equal(h.renderer.toneMappingExposure,1.22);
  h.master.shadow.needsUpdate=false;h.apply('ext+in');assert.equal(h.master.shadow.autoUpdate,false);assert.equal(h.master.shadow.needsUpdate,false);assert.equal(h.master.intensity,0);assert.equal(h.sun.shadow.autoUpdate,true);assert.equal(h.sun.shadow.needsUpdate,true);assert.equal(h.sun.intensity,3.4);assert.equal(h.fill.intensity,.9);assert.equal(h.hemisphere.intensity,1.7);assert.equal(h.renderer.toneMappingExposure,1.03);
});

test('a shadow map lost after initialization is bootstrapped again on the next lighting refresh',()=>{
  const h=harness();h.master.shadow.map={dispose(){}};h.apply('ext');assert.equal(h.master.shadow.needsUpdate,false);
  h.master.shadow.map=null;h.refresh();h.apply('ext');assert.equal(h.master.shadow.needsUpdate,true);assert.equal(h.master.shadow.autoUpdate,false);
});

test('the independent real doorway stays visible inside and through the entrance, but hides in orbit cutaway',()=>{
  const h=harness();assert.equal(h.model.doorway.isGroup,true);
  h.apply('ext');assert.equal(h.model.doorway.visible,true);
  h.apply('in');assert.equal(h.model.manor.visible,false);assert.equal(h.model.doorway.visible,true,'hiding the exterior shell cannot hide the open door behind the viewer');
  h.apply('orbit-in');assert.equal(h.model.manor.visible,false);assert.equal(h.model.doorway.visible,false,'cutaway orbit hides the independent full-height door');
  h.apply('ext+in');assert.equal(h.model.manor.visible,true);assert.equal(h.model.doorway.visible,true,'the door remains visible during entry/exit peek');
});

test('the original canvas pointercancel cannot cancel or sync edits during a presentation freeze',()=>{
  const marker="renderer.domElement.addEventListener('pointercancel', ",begin=sceneSource.indexOf(marker),finish=sceneSource.indexOf('});',begin)+1;assert.ok(begin>=0&&finish>begin);
  const handler=sceneSource.slice(begin+marker.length,finish),counters={cancel:0,sync:0},touchPoints=new Map([[9,{x:1,y:2}]]),context=createContext({presentationPaused:true,touchPoints,pinchDistance:12,cancelDrag:()=>counters.cancel++,onCancel:()=>counters.sync++});
  new Script(`globalThis.handler=${handler};`).runInContext(context);context.handler({pointerId:9});assert.equal(touchPoints.has(9),true);assert.equal(context.pinchDistance,12);assert.deepEqual(counters,{cancel:0,sync:0});
  context.presentationPaused=false;context.handler({pointerId:9});assert.equal(touchPoints.has(9),false);assert.equal(context.pinchDistance,null);assert.deepEqual(counters,{cancel:1,sync:1},'ordinary editor cancellation is unchanged');
});
