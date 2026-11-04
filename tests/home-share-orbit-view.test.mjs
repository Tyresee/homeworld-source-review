import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHomeShareController} from '../public/js/home-share-controller.js';
import {handleHomeSharePick} from '../public/js/home-share-world.js';
import {createHomeShareUI} from '../public/js/home-share-ui.js';

const surface=()=>({style:{},addEventListener(){},removeEventListener(){}});
function model(){return {bounds:new THREE.Box3(new THREE.Vector3(-12,-.4,-10),new THREE.Vector3(18,7,20)),houseBounds:new THREE.Box3(new THREE.Vector3(0,0,0),new THREE.Vector3(8,7,5)),storeyHeight:3.15,
  floors:[0,1].map(index=>({index,baseY:index*3.15,rooms:[{id:'room-'+index,name:index?"Bedroom":"Living room",center:{x:2,z:2}},{id:'study-'+index,name:"Study",center:{x:5,z:2}}]})),spots:[{id:'house',name:"House",house:true,center:new THREE.Vector3(4,0,2)},{id:'garden',name:"Garden",center:new THREE.Vector3(13,0,12),dist:19}],
  elevator:{served:[0,1],landings:[{floor:0,roomId:'room-0',door:new THREE.Vector3(0,.08,2),cabin:new THREE.Vector3(-1,.08,2)},{floor:1,roomId:'room-1',door:new THREE.Vector3(0,3.23,2),cabin:new THREE.Vector3(-1,3.23,2)}]}};}
function controller(home,onStateChange=()=>{}){return createHomeShareController({element:surface(),eventTarget:surface(),model:home,reducedMotion:true,onStateChange});}
const settle=c=>c.tick(.01);

test('scene hits stop at the exterior floor view even for rooms, furniture, robots and elevator meshes',()=>{
  const home=model(),original=JSON.stringify(home),c=controller(home),messages=[];c.start();settle(c);
  assert.equal(handleHomeSharePick(c,{type:'house',floor:0}),true);settle(c);assert.equal(c.getState().name,'EXPLODED');
  assert.equal(handleHomeSharePick(c,{type:'house',floor:1,roof:true}),true);settle(c);assert.equal(c.getState().name,'FOCUS');assert.equal(c.getState().floor,1);
  const pose=c.getCameraPose();
  for(const info of [{type:'house',floor:1,roomId:'room-1'},{type:'furniture',floor:1,roomId:'room-1'},{type:'robot',floor:1},{type:'house',floor:1,name:"Elevator"}]){
    assert.equal(handleHomeSharePick(c,info,message=>messages.push(message)),false);assert.equal(c.getState().name,'FOCUS');assert.deepEqual(c.getCameraPose(),pose);
  }
  assert.equal(handleHomeSharePick(c,{type:'house',floor:0}),true);settle(c);assert.equal(c.getState().floor,0);assert.equal(c.getState().controller,'orbit');assert.equal(c.camera.fov,42);
  assert.equal(messages.length,0);assert.equal(JSON.stringify(home),original);c.dispose();
});

test('outdoor picks preserve the existing overview, spot and house routes without interior actions',()=>{
  const c=controller(model()),messages=[];c.start();settle(c);assert.equal(handleHomeSharePick(c,{type:'spot',spotId:'garden'}),true);settle(c);assert.equal(c.getState().name,'SPOT');
  const pose=c.getCameraPose();assert.equal(handleHomeSharePick(c,{type:'spot',spotId:'garden'},message=>messages.push(message)),false);assert.deepEqual(c.getCameraPose(),pose);assert.equal(messages.length,1);
  assert.equal(handleHomeSharePick(c,{type:'furniture',floor:0}),true);assert.equal(handleHomeSharePick(c,{type:'house',floor:1}),false,'A second pick cannot bypass the transition lock');settle(c);assert.equal(c.getState().name,'EXPLODED');c.dispose();
});

class Element {
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentNode=null;this.style={};this.dataset={};this.attributes={};this.events=new Map();this.textContent='';this.className='';}
  append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const node of this.children)node.parentNode=null;this.children=[];this.append(...nodes);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(fn);}
  querySelectorAll(selector){return flatten(this).filter(node=>selector==='button'&&node.tagName==='BUTTON');}
  click(){for(const fn of this.events.get('click')??[])fn();}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}
}
const flatten=root=>root.children.flatMap(node=>[node,...flatten(node)]);

test('focused room names are passive text and no elevator panel or first-person action is mounted',()=>{
  const document={createElement:tag=>new Element(tag,document)},container=new Element('section',document),home=model();let ui;
  const c=controller(home,state=>ui?.update(state));ui=createHomeShareUI({container,model:home,controller:c});c.start();settle(c);
  const all=()=>flatten(container),byClass=name=>all().find(node=>node.className===name);
  assert.equal(byClass('share-view-badge').textContent,"Read-only view");assert.equal(byClass('share-view-badge').attributes['aria-label'],"Read-only view");
  assert.ok(byClass('share-view-actions').querySelectorAll('button').some(button=>button.textContent==="Explode house"));
  c.goFocus(0);settle(c);const labels=byClass('share-view-labels'),pose=c.getCameraPose();assert.equal(labels.children.length,2);assert.ok(labels.children.every(node=>node.tagName==='SPAN'&&node.style.pointerEvents==='none'));assert.equal(labels.querySelectorAll('button').length,0);
  for(const label of labels.children)label.click();assert.deepEqual(c.getCameraPose(),pose);assert.equal(c.getState().name,'FOCUS');assert.equal(byClass('share-view-hint').textContent,"Drag to look around this floor");
  assert.ok(!all().some(node=>/share-view-elevator|share-view-hotspot-label/.test(node.className)));
  assert.ok(all().filter(node=>node.tagName==='BUTTON').every(node=>!["Take elevator","Exit elevator","Back to this floor"].includes(node.textContent)));
  const upper=byClass('share-view-actions').querySelectorAll('button').find(button=>button.textContent==='2F');upper.click();settle(c);assert.equal(c.getState().floor,1);assert.equal(c.getState().controller,'orbit');assert.equal(byClass('share-view-labels').querySelectorAll('button').length,0);
  c.dispose();ui.dispose();assert.equal(container.children.length,0);
});
