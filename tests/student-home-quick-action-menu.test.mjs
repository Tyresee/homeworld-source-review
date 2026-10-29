import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {getObjectQuickActions,getQuickActionOwned} from '../public/js/student-home-quick-action-menu.js';
import {createCushionPresentation} from '../public/js/student-home-cushion-presentation.js';

test('actions come from real capabilities and preserve blocked-use reasons',()=>{
  const rows=getObjectQuickActions({kind:'sofa',robotActions:[{id:'sit',kind:'sit',label:"DisplayText0251"},{id:'watch',kind:'watch',disabled:true,reason:"DisplayText4585"},{id:'tidy',kind:'tidy'},{id:'admire',kind:'admire'}]});
  assert.deepEqual(rows.map(row=>row.id),['robot:sit','robot:watch','robot:tidy']);
  assert.equal(rows[1].disabled,true);assert.equal(rows[1].reason,"DisplayText4585");assert.equal(rows[2].label,"DisplayText3932");
  assert.deepEqual(getObjectQuickActions({kind:'outdoor-football-1'}),[],'no pretend football button without a controller action');
});
test('object controls change only the selected capability and follow acknowledged state',()=>{
  const lamp=getObjectQuickActions({kind:'hhTripodLamp',objectState:{power:true,brightness:3}});
  assert.deepEqual(lamp[0].command.patch,{power:false});assert.deepEqual(lamp[1].command.patch,{power:true,brightness:1});
  const tv=getObjectQuickActions({kind:'ipWideTelevision',objectState:{power:true,channel:3,volume:1}});
  assert.deepEqual(tv[1].command.patch,{power:true,channel:0});
  assert.equal(getObjectQuickActions({kind:'ipWideTelevision',objectState:{power:true,channel:0,volume:1},watching:true})[1].command.type,'robot-channel');
});
test('selection cannot leak across floors or use stored items',()=>{
  const row={id:'bed-a',status:'placed',storey:1},commerce={owned:[row,{id:'sold',status:'sold',storey:1}]};
  assert.equal(getQuickActionOwned(commerce,{furnitureId:'bed-a'},'interior',1),row);
  assert.equal(getQuickActionOwned(commerce,{surfaceId:'furniture:bed-a'},'interior',0),null);
  assert.equal(getQuickActionOwned(commerce,{furnitureId:'sold'},'interior',1),null);
  assert.equal(getQuickActionOwned(commerce,{furnitureId:'bed-a'},'building',1),null);
});
test('cushion compression holds its underside and restores on release or switch',()=>{
  const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,.4,1),new THREE.MeshBasicMaterial());mesh.position.y=1;group.add(mesh);
  const presenter=createCushionPresentation({getModels:()=>[{itemId:'a',group}]});
  presenter.apply({id:'a',cushionTidy:{partIndex:0,compression:.03}});
  assert.ok(mesh.scale.y<1);assert.ok(Math.abs(mesh.position.y-.2*mesh.scale.y-.8)<1e-9,'bottom plane stays fixed');
  presenter.apply({id:'other',cushionTidy:null});assert.ok(mesh.scale.y<1,'other objects cannot clear this contact');
  presenter.release(group);assert.equal(mesh.scale.y,1);assert.equal(mesh.position.y,1);
  presenter.apply({id:'a',cushionTidy:{partIndex:0,compression:1e6}});assert.ok(mesh.scale.y>=.86);presenter.clear();assert.equal(mesh.position.y,1);
  mesh.geometry.dispose();mesh.material.dispose();
});
