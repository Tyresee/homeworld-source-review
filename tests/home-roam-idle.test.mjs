import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomeRoamController} from '../public/js/home-roam-controller.js';

class Surface {
  constructor(){this.listeners=new Map();this.style={};this.clientWidth=1440;this.clientHeight=900;this.ownerDocument=this;this.activeElement=null;this.captured=new Set();}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  getRootNode(){return this.ownerDocument;}
  getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  setPointerCapture(id){this.captured.add(id);}
  releasePointerCapture(id){this.captured.delete(id);}
  emit(type,props={}){const event={type,...props,preventDefault(){this.defaultPrevented=true;},stopPropagation(){}};for(const fn of [...(this.listeners.get(type)??[])])fn(event);return event;}
  count(){return [...this.listeners.values()].reduce((sum,set)=>sum+set.size,0);}
}
function fixture(){
  const canvas=new Surface(),events=new Surface();canvas.ownerDocument=events;let clock=0,invalidations=0;
  const controller=createHomeRoamController({element:canvas,eventTarget:events,bounds:{min:{x:-4,y:0,z:-5},max:{x:4,y:3,z:5}},entrance:{center:{x:0,y:.9,z:5},outward:{x:0,y:0,z:1}},now:()=>clock,onChange:()=>invalidations++});
  return {controller,canvas,events,invalidations:()=>invalidations,tick(delta=16){clock+=delta;return controller.tick(clock);}};
}
function settle(f,limit=1000){let quiet=0;for(let i=0;i<limit;i++){quiet=f.tick()?0:quiet+1;if(quiet>=32)return i;}assert.fail('real OrbitControls damping never became idle');}

test('a real damped orbit drag reaches idle, then produces neither render demand nor change events',()=>{
  const f=fixture(),c=f.controller;c.start();settle(f);const before=c.getCameraPose();
  f.canvas.emit('pointerdown',{button:0,pointerType:'mouse',pointerId:1,clientX:700,clientY:400});
  f.events.emit('pointermove',{pointerType:'mouse',pointerId:1,clientX:970,clientY:510});f.events.emit('pointerup',{button:0,pointerType:'mouse',pointerId:1,clientX:970,clientY:510});
  assert.notDeepEqual(c.getCameraPose(),before);assert.ok(settle(f)<1000);const settled=c.getCameraPose(),changes=f.invalidations();
  for(let i=0;i<40;i++)assert.equal(f.tick(),false);const later=c.getCameraPose();for(const key of['position','quaternion','target'])later[key].forEach((value,i)=>assert.ok(Math.abs(value-settled[key][i])<(key==='quaternion'?1e-4:1e-3),'only sub-pixel damping residue is allowed'));assert.equal(f.invalidations(),changes);c.dispose();assert.equal(f.canvas.count(),0);assert.equal(f.events.count(),0);
});

test('resizing an already idle perspective controller explicitly demands one fresh frame, then settles again',()=>{
  const f=fixture(),c=f.controller;c.start();settle(f);const before=c.camera.position.toArray(),changes=f.invalidations();
  c.resize(1920,1080);assert.ok(f.invalidations()>changes,'renderer resizing must not leave a cleared drawing buffer without an invalidation');assert.equal(f.tick(),true);assert.equal(f.tick(),false);assert.equal(c.camera.aspect,16/9);assert.deepEqual(c.camera.position.toArray(),before);c.dispose();
});

test('stopping a moving or auto-rotating camera ends all render demand and removes input listeners',()=>{
  const f=fixture(),c=f.controller;c.start();c.setAutoRotate(true);assert.equal(f.tick(),true);c.stop();const before=c.getCameraPose(),changes=f.invalidations();
  f.events.emit('keydown',{code:'KeyW',key:'Process'});f.canvas.emit('wheel',{deltaY:1});for(let i=0;i<10;i++)assert.equal(f.tick(),false);assert.deepEqual(c.getCameraPose(),before);assert.equal(f.invalidations(),changes);c.dispose();assert.equal(f.canvas.count(),0);assert.equal(f.events.count(),0);
});
