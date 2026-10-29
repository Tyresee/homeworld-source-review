import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createRoomExpansion} from '../public/js/home-room-expansion.js';
import {starterHouse} from '../server/student-homes/profile.mjs';
import {studentHomeMoveTarget,pickStudentHomeContext} from '../public/js/student-home-scene.js';
import {createStudentHomeContextMenu,studentHomeContextItems} from '../public/js/student-home-context-menu.js';

const rect={minX:-2.8,minZ:-2.6,width:5.6,depth:5.2};
test('movement accepts the actual room floor and keeps the full walking radius clear of walls',()=>{
  assert.deepEqual(studentHomeMoveTarget({x:1,y:.07,z:1},rect,.7),{x:1,y:.07,z:1});
  const edge=studentHomeMoveTarget({x:2.8,y:.07,z:-2.6},rect,.7);
  assert.ok(edge.x<=rect.minX+rect.width-.88);assert.ok(edge.z>=rect.minZ+.88);
  for(const point of [null,{}, {x:Infinity,y:.07,z:0},{x:0,y:NaN,z:0},{x:0,y:2,z:0},{x:2.81,y:.07,z:0},{x:0,y:.07,z:-2.61}])assert.equal(studentHomeMoveTarget(point,rect),null);
  assert.equal(studentHomeMoveTarget({x:0,y:.07,z:0},{...rect,width:.5}),null);
});

test('real starter geometry distinguishes floor, wall, exterior, and robot without picking through walls',()=>{
  const floor=starterHouse().floors[0];
  const room=createRoomExpansion({rooms:floor.rooms,slab:floor.slab,profile:'upper',includeGrid:false});room.updateMatrixWorld(true);
  const raycaster=new THREE.Raycaster(),robot=new THREE.Group();robot.userData.radius=.48;
  const body=new THREE.Mesh(new THREE.BoxGeometry(.6,1,.5),new THREE.MeshBasicMaterial());body.position.set(0,.57,0);robot.add(body);robot.updateMatrixWorld(true);
  const pick=(origin,target,withRobot=false)=>{raycaster.set(new THREE.Vector3(...origin),new THREE.Vector3(...target).sub(new THREE.Vector3(...origin)).normalize());return pickStudentHomeContext(raycaster,{room,rect,robot:withRobot?robot:null});};
  const ground=pick([1,8,1],[1,0,1]);assert.equal(ground.kind,'floor');assert.equal(ground.world.x,1);assert.equal(ground.world.z,1);
  assert.deepEqual(pick([10,8,10],[10,0,10]),{kind:'background',world:null});
  assert.deepEqual(pick([0,1.2,-5],[0,1.2,1],true),{kind:'background',world:null});
  assert.deepEqual(pick([0,8,0],[0,0,0],true),{kind:'robot',world:null});
  room.dispose();body.geometry.dispose();body.material.dispose();
});

function fixture(){
  class Emitter{
    constructor(){this.events=new Map();}
    addEventListener(type,callback){const list=this.events.get(type)??[];list.push(callback);this.events.set(type,list);}
    removeEventListener(type,callback){this.events.set(type,(this.events.get(type)??[]).filter(fn=>fn!==callback));}
    dispatch(type,fields={}){const event={type,target:this,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...fields};for(const fn of this.events.get(type)??[])fn(event);return event;}
  }
  class Element extends Emitter{
    constructor(tag){super();this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.style={};this.hidden=false;this.disabled=false;this.isConnected=true;}
    append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
    replaceChildren(...children){this.children=[];this.append(...children);}
    setAttribute(name,value){this.attributes[name]=value;}
    contains(target){return target===this||this.children.some(child=>child.contains(target));}
    focus(){doc.activeElement=this;}
    getBoundingClientRect(){return {width:Math.min(286,parseFloat(this.style.maxWidth)||286),height:Math.min(286,parseFloat(this.style.maxHeight)||286)};}
    remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
  }
  const doc=new Emitter(),view=new Emitter();view.innerWidth=800;view.innerHeight=600;doc.body=new Element('body');doc.createElement=tag=>new Element(tag);
  const canvas=new Element('canvas');doc.body.append(canvas);canvas.focus();
  const calls=[],context={kind:'floor',screen:{x:790,y:590},world:{x:1,y:.07,z:1}};
  const menu=createStudentHomeContextMenu({document:doc,window:view,onMoveTo:world=>calls.push(['move',world]),onPalette:point=>calls.push(['palette',point]),onWave:()=>calls.push(['wave']),onReset:()=>calls.push(['reset'])});
  const el=doc.body.children[1],buttons=()=>el.children.filter(item=>item.tagName==='button');
  return {doc,view,canvas,menu,el,buttons,calls,context};
}

test('the menu clamps to all viewport edges and invokes the exact original point without a second click',()=>{
  const f=fixture();f.menu.open(f.context);assert.equal(f.menu.isOpen,true);
  assert.equal(f.el.style.left,'504px');assert.equal(f.el.style.top,'304px');assert.equal(f.doc.activeElement,f.buttons()[0]);
  f.buttons()[0].dispatch('click');assert.deepEqual(f.calls,[['move',f.context.world]]);assert.equal(f.menu.isOpen,false);assert.equal(f.doc.activeElement,f.canvas);
  f.menu.open({...f.context,screen:{x:-40,y:-90}});assert.equal(f.el.style.left,'10px');assert.equal(f.el.style.top,'10px');
  f.menu.open(f.context);f.doc.dispatch('keydown',{key:'Escape'});assert.equal(f.doc.activeElement,f.canvas);
  f.menu.open({screen:{x:NaN,y:0}});assert.equal(f.menu.isOpen,false);assert.doesNotThrow(()=>f.menu.open(null));
  f.menu.dispose();
});

test('background has a usable menu, disables floor movement, and retains robot palette action',()=>{
  const f=fixture();f.menu.open({...f.context,kind:'background',world:null});
  const [move,palette]=f.buttons();assert.equal(move.disabled,true);assert.equal(f.doc.activeElement,palette);
  move.dispatch('click');assert.equal(f.calls.length,0);assert.equal(f.menu.isOpen,true);
  palette.dispatch('click');assert.deepEqual(f.calls,[['palette',f.context.screen]]);assert.equal(f.menu.isOpen,false);
  f.menu.dispose();
});

test('keyboard navigation wraps across enabled commands and Escape restores focus',()=>{
  const f=fixture();f.menu.open({...f.context,kind:'background',world:null});const [,palette,wave,reset]=f.buttons();
  assert.equal(f.doc.dispatch('keydown',{key:'ArrowUp'}).prevented,true);assert.equal(f.doc.activeElement,reset);
  f.doc.dispatch('keydown',{key:'ArrowDown'});assert.equal(f.doc.activeElement,palette);
  f.doc.dispatch('keydown',{key:'ArrowDown'});assert.equal(f.doc.activeElement,wave);
  f.doc.dispatch('keydown',{key:'End'});assert.equal(f.doc.activeElement,reset);
  f.doc.dispatch('keydown',{key:'Home'});assert.equal(f.doc.activeElement,palette);
  f.doc.dispatch('keydown',{key:'Escape'});assert.equal(f.menu.isOpen,false);assert.equal(f.doc.activeElement,f.canvas);f.menu.dispose();
});

test('outside click, Tab, scroll and viewport changes close the menu without stealing focus',()=>{
  const f=fixture();
  for(const [emitter,type,extra]of[[f.doc,'pointerdown',{target:f.canvas}],[f.doc,'keydown',{key:'Tab'}],[f.doc,'scroll',{target:f.canvas}],[f.view,'resize',{}],[f.view,'blur',{}]]){
    f.menu.open(f.context);const focused=f.doc.activeElement;emitter.dispatch(type,extra);assert.equal(f.menu.isOpen,false);assert.equal(f.doc.activeElement,focused);
  }
  f.menu.open(f.context);f.doc.dispatch('pointerdown',{target:f.buttons()[1]});assert.equal(f.menu.isOpen,true);
  f.menu.dispose();assert.equal(f.el.isConnected,false);assert.equal([...f.doc.events.values()].flat().length,0);assert.equal([...f.view.events.values()].flat().length,0);
});

test('callers may supply real future commands; an all-disabled menu is keyboard safe',()=>{
  const f=fixture();f.menu.open(f.context,[{id:'owned',label:"DisplayText3869",action:context=>f.calls.push(['custom',context.world])}]);
  f.buttons()[0].dispatch('click');assert.deepEqual(f.calls,[['custom',f.context.world]]);
  f.menu.open(f.context,[{id:'unavailable',label:"DisplayText4581",disabled:true}]);assert.equal(f.doc.activeElement,f.el);
  for(const key of ['Home','End','ArrowDown','ArrowUp'])assert.doesNotThrow(()=>f.doc.dispatch('keydown',{key}));
  f.menu.dispose();f.menu.open(f.context);assert.equal(f.menu.isOpen,false);
  assert.equal(studentHomeContextItems(f.context).every(item=>Boolean(item.disabled)),true);
});

test('scene keeps right click out of camera controls and only uses the unified menu handler for contextmenu',async()=>{
  const source=await readFile(new URL('../public/js/student-home-scene.js',import.meta.url),'utf8');
  assert.match(source,/mouseButtons=\{LEFT:null,MIDDLE:THREE\.MOUSE\.PAN,RIGHT:null\}/);
  assert.match(source,/event\.button===2\|\|\(event\.button===0&&event\.ctrlKey\)/);
  assert.match(source,/addEventListener\('pointerdown',pointerDown,true\)/);
  assert.match(source,/addEventListener\('contextmenu',contextMenu\)/);
  assert.match(source,/if\(onContextMenu\)onContextMenu\(context\);else if\(context\.kind==='robot'\)onRobot\(context\.screen\)/);
  const pointerUp=source.slice(source.indexOf('function pointerUp('),source.indexOf('function releaseSpace('));
  assert.doesNotMatch(pointerUp,/onContextMenu|contextMenu\(/);
});
