import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeRoamDaylight} from '../public/js/home-roam-daylight.js';
import {createEstateManor} from '../public/js/home-estate-manor.js';
import {getFloorBounds,createRoom} from '../public/js/home-layout.js';
import {HOME_THEMES} from '../public/js/home-theme.js';

test('indoor daylight uses the actual entrance steps and no extra lighting or exposure-dependent material',()=>{
  const home={rooms:[createRoom('living')]},bounds=getFloorBounds(home),manor=createEstateManor({floors:[home],theme:HOME_THEMES.warm,roam:true});manor.position.set(bounds.x,0,bounds.z);manor.updateMatrixWorld(true);
  const before=JSON.stringify(manor.toJSON()),entry=manor.getRoamEntry(),sourceSteps=[];manor.traverse(n=>{if(n.userData.buildingPart==='entrance-step')sourceSteps.push(n);});
  const daylight=createHomeRoamDaylight({manor,bounds,entrance:entry}),resources=new Map();let lights=0;
  daylight.group.traverse(n=>{if(n.isLight)lights++;if(n.isMesh){assert.equal(n.castShadow,false);assert.equal(n.receiveShadow,false);assert.equal(n.material.toneMapped,false);for(const r of[n.geometry,n.material])if(!resources.has(r)){resources.set(r,0);r.addEventListener('dispose',()=>resources.set(r,resources.get(r)+1));}}});
  assert.equal(lights,0);assert.equal(daylight.group.visible,false);assert.ok(daylight.steps.length);assert.equal(daylight.steps.length,sourceSteps.length);
  daylight.steps.forEach((copy,i)=>{assert.notEqual(copy.geometry,sourceSteps[i].geometry);assert.ok(copy.position.distanceTo(sourceSteps[i].getWorldPosition(new THREE.Vector3()))<1e-8);assert.ok(copy.material.vertexColors);});
  daylight.setVisible(true);assert.equal(daylight.group.visible,true);daylight.setVisible(false);assert.equal(daylight.group.visible,false);assert.equal(JSON.stringify(manor.toJSON()),before);
  daylight.dispose();daylight.dispose();assert.equal(daylight.group.children.length,0);assert.ok([...resources.values()].every(n=>n===1));manor.dispose();
});
