import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeRoamController} from '../public/js/home-roam-controller.js';
import {createHomeRoamJourney,isHomeRoamInterior} from '../public/js/home-roam-transport.js';
import {createHomeRoamUI} from '../public/js/home-roam-ui.js';
import {FLOOR_Y,STOREY_HEIGHT,getStaircaseEntrances} from '../public/js/home-staircase-shape.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
function connection(type,from){const stairs={id:`viewer-${from}`,x:0,z:0,rotation:0,direction:'up',...type==='elevator'?{type}:{}},baseY=from*STOREY_HEIGHT,p=getStaircaseEntrances(stairs);return {id:`transport:${from}`,type,from,to:from+1,baseY,stairs,landings:{lower:{storey:from,position:new THREE.Vector3(p.lower.x,p.lower.y+baseY,p.lower.z),normal:new THREE.Vector3(0,0,1)},upper:{storey:from+1,position:new THREE.Vector3(p.upper.x,p.upper.y+baseY,p.upper.z),normal:new THREE.Vector3(0,0,-1)}},getElevatorFrame:()=>({cabinY:baseY+FLOOR_Y})};}
function fixture(options={}){
  let document,time=0,controller,controlDisposed=0,exits=0;const modes=[];
  class Node{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.className='';this.dataset={};this.style={};this.attributes={};this.events=new Map();this.hidden=false;this.textContent='';this.ownerDocument=document;this.classList={add:name=>{this.className+=' '+name;}};}
    append(...nodes){for(const node of nodes){this.children.push(node);node.parentNode=this;}}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    setAttribute(key,value){this.attributes[key]=String(value);}getAttribute(key){return this.attributes[key]??null;}
    addEventListener(type,callback){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(callback);}removeEventListener(type,callback){this.events.get(type)?.delete(callback);}
    dispatch(type,event={}){event.preventDefault??=()=>{event.defaultPrevented=true;};event.stopPropagation??=()=>{};for(const callback of [...this.events.get(type)??[]])callback(event);return event;}
    all(){return [this,...this.children.flatMap(node=>node.all())];}find(name){return this.all().find(node=>node.className.split(' ').includes(name));}contains(target){return this.all().includes(target);}focus(){document.activeElement=this;}getBoundingClientRect(){return {left:0,top:0,width:1440,height:900};}
  }
  document=new Node('document');document.createElement=tag=>new Node(tag);document.defaultView={innerWidth:1440,innerHeight:900,location:{search:''}};
  const canvas=new Node('canvas'),container=new Node(),ui=createHomeRoamUI({container,document,floorCount:3,locale:'en',onLeave:()=>controller?.leave()});ui.setVisible(true);
  const controls={target:new THREE.Vector3(),update:()=>false,addEventListener(){},removeEventListener(){},dispose(){controlDisposed++;}};
  controller=createHomeRoamController({element:canvas,eventTarget:document,bounds:{min:{x:-5,y:0,z:-5},max:{x:5,y:9.3,z:5}},interiorBounds:{min:{x:-5,y:0,z:-5},max:{x:5,y:9.3,z:5}},entrance:{center:{x:0,y:0,z:5},outward:{x:0,y:0,z:1}},containsInterior:options.containsInterior,onRequestLeave:options.onRequestLeave,onExit:()=>exits++,now:()=>time,controlsFactory:()=>controls,onMode:snapshot=>{modes.push({...snapshot});ui.update({...snapshot,storey:Math.min(2,Math.max(0,Math.floor((controller?.camera.position.y??0)/STOREY_HEIGHT)))});}});
  return {controller,canvas,document,ui,controls,modes,get disposed(){return controlDisposed;},get exits(){return exits;},tick(value){time=value;return controller.tick(time);},get time(){return time;},key(code){return document.dispatch('keydown',{code,key:'Process'});},enter(){controller.start();controller.tick(time);assert.equal(controller.enterDoor(),true);time+=4750;controller.tick(time);assert.equal(controller.getState().phase,'free');},dispose(){controller.dispose();ui.dispose();}};
}

test('controller sequences a real elevator then stairs with disabled input, per-sample frames, UI phases and a single final acknowledgement',()=>{
  const f=fixture(),c=f.controller,samples=[];let complete=0;
  try{
    assert.equal(c.travel([]),false);f.enter();const first=createHomeRoamJourney(connection('elevator',0),0,c.camera.position.clone()),second=createHomeRoamJourney(connection('stairs',1),1,first.position.clone()),journeys=[first,second];
    f.key('KeyW');assert.equal(c.travel(journeys,{onSample:(journey,pose)=>{samples.push({journey,pose});},onComplete:()=>{complete++;assert.equal(c.getState().phase,'free');}}),true);
    assert.equal(c.getState().transition,true);assert.equal(c.controls.enabled,false);assert.equal(f.ui.element.find('home-roam-bar').hidden,true);assert.equal(f.ui.element.dataset.phase,'travel-approach');
    const frozen=c.camera.position.clone();f.key('KeyW');f.key('ShiftLeft');f.key('Escape');f.canvas.dispatch('wheel',{deltaY:-1});f.canvas.dispatch('pointerdown',{button:0,pointerId:7,clientX:0,clientY:0});f.canvas.dispatch('pointermove',{pointerId:7,clientX:100,clientY:100});
    assert.deepEqual(c.camera.position.toArray(),frozen.toArray());assert.equal(c.moveTo({x:99,y:0,z:0},{floor:true}),false);assert.equal(c.travel(journeys),false);assert.equal(c.leave(),false);assert.equal(c.setDisplayMode('exterior'),false);assert.equal(c.setAutoRotate(true),false);
    let elapsed=f.time;
    for(const journey of journeys)for(const step of journey.steps){
      f.tick(elapsed+step.duration/2);assert.equal(c.getState().phase,step.name);assert.equal(c.getState().transition,true);assert.equal(f.ui.element.dataset.phase,step.name);assert.equal(f.ui.element.find('home-roam-bar').hidden,true);
      elapsed+=step.duration;f.tick(elapsed);
    }
    assert.equal(complete,1);assert.equal(c.getState().phase,'free');assert.equal(c.getState().transition,false);assert.equal(f.ui.element.dataset.phase,'free');assert.equal(f.ui.element.find('home-roam-floors').hidden,false);assert.equal(f.ui.element.find('home-roam-bar').hidden,false);
    near(c.camera.position.distanceTo(second.position),0);near(c.camera.position.y,2*STOREY_HEIGHT+FLOOR_Y+1.45);near(c.camera.fov,68);
    const ride=samples.filter(row=>row.pose.elevatorFrame?.phase==='elevator-ride');assert.ok(ride.length);for(const row of ride){assert.equal(row.journey,first);near(row.pose.position.y,row.pose.elevatorFrame.cabinY+1.45);assert.deepEqual(row.pose.elevatorFrame.doors,{lower:0,upper:0});}
    assert.ok(samples.some(row=>row.journey===second));for(const name of new Set(journeys.flatMap(journey=>journey.steps.map(step=>step.name))))assert.ok(f.modes.some(mode=>mode.phase===name));
    const settled=c.camera.position.clone();f.tick(elapsed+100);assert.deepEqual(c.camera.position.toArray(),settled.toArray(),'keys pressed before or during travel cannot leak into free movement');f.tick(elapsed+200);assert.equal(complete,1);
  }finally{f.dispose();assert.equal(f.disposed,1);}
});

test('stopping a ride cancels future frames and completion, and restarting creates a clean viewing session',()=>{
  const f=fixture(),c=f.controller;let samples=0,complete=0;
  try{
    f.enter();const journey=createHomeRoamJourney(connection('elevator',0),0,c.camera.position.clone());assert.equal(c.travel([journey],{onSample:()=>samples++,onComplete:()=>complete++}),true);
    f.tick(f.time+600);assert.ok(samples>0);const count=samples;c.stop();const frozen=c.camera.position.clone();assert.equal(f.tick(100_000),false);assert.equal(samples,count);assert.equal(complete,0);assert.deepEqual(c.camera.position.toArray(),frozen.toArray());assert.equal(f.ui.element.hidden,true);
    assert.equal(c.start(),true);assert.equal(c.getState().phase,'orbit');assert.equal(c.getState().transition,false);assert.equal(c.travel([journey]),false,'travel is unavailable until the visitor enters again');
    c.enterDoor();f.tick(f.time+4750);assert.equal(c.getState().phase,'free');assert.equal(c.travel([]),false);assert.equal(c.travel([{steps:[]}]),false);
  }finally{f.dispose();}
});

test('the actual controller remains indoors while the elevator eye passes through the intermediate slab gap',()=>{
  const transport=connection('elevator',0),model={transports:[transport],floorModels:[0,1].map(storey=>({baseY:storey*STOREY_HEIGHT,rects:[{minX:-5,maxX:5,minZ:-5,maxZ:5}]}))},f=fixture({containsInterior:p=>isHomeRoamInterior(model,p)}),c=f.controller;
  try{
    f.enter();const journey=createHomeRoamJourney(transport,0,c.camera.position.clone()),begin=f.time,total=journey.steps.reduce((sum,step)=>sum+step.duration,0);let gapSamples=0;
    c.travel([journey]);for(let elapsed=0;elapsed<=total;elapsed+=25){f.tick(begin+elapsed);if(c.getState().phase==='elevator-ride'){assert.equal(c.getState().sceneMode,'in');if(c.camera.position.y>=2.91&&c.camera.position.y<STOREY_HEIGHT)gapSamples++;}}
    assert.ok(gapSamples>0,'the test must actually sample the formerly excluded gap');
  }finally{f.dispose();}
});

test('Escape and the visible Leave button both request the real downstairs route before the final door sequence',()=>{
  for(const trigger of ['Escape','button']){
    const transport=connection('elevator',0);let f,requests=0,journey,downComplete=0;
    f=fixture({onRequestLeave:()=>{requests++;journey=createHomeRoamJourney(transport,1,f.controller.camera.position.clone());return f.controller.travel([journey],{onComplete:()=>{downComplete++;near(f.controller.camera.position.y,FLOOR_Y+1.45);f.controller.leave({direct:true});}});}});
    const c=f.controller;
    try{
      f.enter();c.camera.position.copy(transport.landings.upper.position).addScaledVector(transport.landings.upper.normal,.7).add(new THREE.Vector3(0,1.45,0));
      if(trigger==='Escape')assert.equal(f.key('Escape').defaultPrevented,true);else f.ui.element.find('home-roam-leave').dispatch('click');
      assert.equal(requests,1);assert.equal(c.getState().phase,'travel-approach');assert.equal(downComplete,0);assert.equal(f.exits,0);
      let elapsed=f.time;for(const step of journey.steps){f.tick(elapsed+step.duration/2);assert.equal(c.getState().phase,step.name);elapsed+=step.duration;f.tick(elapsed);}
      assert.equal(downComplete,1);assert.equal(requests,1,'direct ground-floor exit cannot recursively request another route');assert.equal(c.getState().phase,'leaving');
      near(c.camera.position.distanceTo(journey.position),0);f.tick(elapsed+600);assert.ok(c.camera.position.y<=FLOOR_Y+1.45,'door exit starts from the ground, never diagonally through upstairs slabs');
      f.tick(elapsed+2000);assert.equal(c.getState().phase,'orbit');f.tick(elapsed+2700);f.key('Escape');assert.equal(c.active,false);assert.equal(f.exits,1);
    }finally{f.dispose();}
  }
});

test('a refused leave route cannot silently fall back to flying through the building',()=>{
  let requests=0;const f=fixture({onRequestLeave:()=>{requests++;return false;}}),c=f.controller;
  try{f.enter();c.camera.position.set(0,STOREY_HEIGHT+FLOOR_Y+1.45,0);const before=c.camera.position.clone();assert.equal(c.leave(),false);f.key('Escape');assert.equal(requests,2);assert.equal(c.getState().phase,'free');f.tick(f.time+1000);assert.deepEqual(c.camera.position.toArray(),before.toArray());}finally{f.dispose();}
});

test('the arrival turn rotates the real perspective camera in place and settles facing the room centre',()=>{
  const f=fixture(),c=f.controller;
  try{
    f.enter();const centre=new THREE.Vector3(0,0,0),journey=createHomeRoamJourney(connection('elevator',0),0,c.camera.position.clone(),{arrivalLookAt:centre}),turn=journey.steps.at(-1),begin=f.time+journey.steps.slice(0,-1).reduce((sum,step)=>sum+step.duration,0);
    assert.equal(turn.name,'travel-look');assert.equal(c.travel([journey]),true);let previous=null;
    for(let index=0;index<=100;index++){
      f.tick(begin+turn.duration*index/100);near(c.camera.position.distanceTo(journey.position),0);const direction=c.camera.getWorldDirection(new THREE.Vector3());
      if(previous)assert.ok(direction.dot(previous)>.99,'camera quaternion must not flip when the room centre is directly behind the arrival direction');previous=direction;
    }
    assert.equal(c.getState().phase,'free');near(c.camera.position.y,STOREY_HEIGHT+FLOOR_Y+1.45);const expected=centre.clone().setY(c.camera.position.y).sub(c.camera.position).normalize();near(c.camera.getWorldDirection(new THREE.Vector3()).distanceTo(expected),0);
  }finally{f.dispose();}
});
