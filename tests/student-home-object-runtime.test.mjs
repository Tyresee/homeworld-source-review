import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLuxuryItem} from '../public/js/home-luxury-models.js';
import {createStudentHomeObjectRuntime,sampleObjectClock,drawTelevisionFrame,OBJECT_LIGHT_LIMIT} from '../public/js/student-home-object-runtime.js';
import {OBJECT_CAPABILITY_KINDS} from '../public/js/home-object-state.js';

function fixture(kinds,states={}){
  let time=0,renders=0,serial=0,date=new Date(2026,9,26,12,59,58);
  const frames=new Map(),timers=new Map(),document=new EventTarget(),draws=[];document.hidden=false;
  document.createElement=()=>({width:0,height:0,getContext:()=>new Proxy({}, {get:(target,key)=>target[key]??((...args)=>draws.push([key,...args])),set:(target,key,value)=>{target[key]=value;return true;}})});
  const models=kinds.map((kind,i)=>({itemId:`item-${i}`,group:createLuxuryItem({kind})}));
  const commerce={owned:kinds.map((kind,i)=>({id:`item-${i}`,source:'purchase',status:'placed',storey:0,item:{id:`item-${i}`,kind}})),objectStates:states};
  const runtime=createStudentHomeObjectRuntime({document,requestRender:()=>renders++,now:()=>time,dateNow:()=>date,
    requestFrame:fn=>{frames.set(++serial,fn);return serial;},cancelFrame:id=>frames.delete(id),setTimer:fn=>{timers.set(++serial,fn);return serial;},clearTimer:id=>timers.delete(id)});
  const advance=next=>{time=next;for(const[id,fn]of [...timers]){timers.delete(id);fn();}for(const[id,fn]of [...frames]){frames.delete(id);fn(time);}};
  const nodes=(index,part)=>{const found=[];models[index].group.traverse(node=>{if(node.userData.objectPart===part)found.push(node);});return found;};
  const dispose=()=>{runtime.dispose();for(const{group}of models)group.traverse(node=>{node.geometry?.dispose();for(const material of[].concat(node.material??[]))material.dispose();});};
  return {runtime,models,commerce,document,draws,advance,nodes,dispose,frames,timers,setDate(value){date=value;},renders:()=>renders};
}

test('all purchasable lamp families expose actual light emitters with off/on illumination and a four-light budget',t=>{
  const kinds=OBJECT_CAPABILITY_KINDS.lamp,f=fixture(kinds);t.after(f.dispose);
  f.runtime.sync(f.commerce,f.models,0);assert.equal(f.runtime.getStats().activePointLights,0);
  for(let i=0;i<kinds.length;i++)assert.ok(f.nodes(i,'lamp-emitter').length,`${kinds[i]} needs a real emitter`);
  for(let i=0;i<kinds.length;i++)f.commerce.objectStates[`item-${i}`]={power:true,brightness:3};
  f.runtime.sync(f.commerce,f.models,0);assert.equal(f.runtime.getStats().activePointLights,OBJECT_LIGHT_LIMIT);
  let visibleLights=0;for(const model of f.models)model.group.traverse(node=>{if(node.isPointLight&&node.visible)visibleLights++;});
  assert.equal(visibleLights,OBJECT_LIGHT_LIMIT,'unlit and excess lights must be hidden from the actual Three.js shader light list');
  for(let i=0;i<kinds.length;i++){
    let glowing=0;for(const node of f.nodes(i,'lamp-emitter'))node.traverse(mesh=>{if(mesh.material?.emissiveIntensity>1)glowing++;});assert.ok(glowing,`${kinds[i]} must visibly glow`);
  }
  f.runtime.setVisible(false);assert.equal(f.runtime.getStats().activePointLights,0);assert.equal(f.runtime.getStats().scheduled,false);
  f.runtime.setVisible(true);assert.equal(f.runtime.getStats().activePointLights,OBJECT_LIGHT_LIMIT);
});

test('brightness levels visibly change emission while ordinary state acknowledgements reuse all lamp geometry',t=>{
  const f=fixture(['hhMushroomLamp']);t.after(f.dispose);const group=f.models[0].group,geometries=[];group.traverse(n=>{if(n.geometry)geometries.push(n.geometry);});
  const levels=[];for(const brightness of[1,2,3]){f.commerce.objectStates['item-0']={power:true,brightness};f.runtime.sync(f.commerce,f.models,0);let maximum=0;f.nodes(0,'lamp-emitter').forEach(n=>n.traverse(mesh=>{maximum=Math.max(maximum,mesh.material?.emissiveIntensity??0);}));levels.push(maximum);}
  assert.ok(levels[0]<levels[1]&&levels[1]<levels[2]);const after=[];group.traverse(n=>{if(n.geometry&&!n.userData.objectRuntime)after.push(n.geometry);});assert.deepEqual(after,geometries);
});

test('clock sampling uses real time and smooth bounded bird-door-wing motion',()=>{
  const d=new Date(2026,9,26,6,30,15,0),closed=sampleObjectClock(d,0),open=sampleObjectClock(d,1.5),done=sampleObjectClock(d,5.1);
  assert.ok(Math.abs(closed.second+Math.PI/2)<1e-10);assert.ok(open.door>.99&&open.bird>.99);assert.equal(done.bird,0);assert.equal(done.door,0);assert.notEqual(sampleObjectClock(d,.1).wing,sampleObjectClock(d,.15).wing);
});

test('cuckoo demonstration opens actual hinges and extends a single bird within its model travel envelope, then closes',t=>{
  const f=fixture(['cuckooClock']);t.after(f.dispose);f.runtime.sync(f.commerce,f.models,0);
  const bird=f.nodes(0,'cuckoo-bird')[0],door=f.nodes(0,'cuckoo-door-left')[0],initial={z:bird.position.z,angle:door.rotation.y};
  assert.equal(bird.visible,false);assert.equal(f.runtime.demonstrate('item-0'),true);f.advance(1500);
  assert.ok(bird.visible);assert.ok(door.rotation.y<initial.angle-.5);assert.ok(bird.position.z>initial.z+.05);assert.ok(bird.position.z<=initial.z+bird.userData.objectTravel+1e-8);
  f.advance(5100);assert.equal(bird.visible,false);assert.ok(Math.abs(door.rotation.y-initial.angle)<1e-10);assert.ok(Math.abs(bird.position.z-initial.z)<1e-10);
});

test('hourly cuckoo fires once on a live hour crossing and never replays an old chime on hydration',t=>{
  const f=fixture(['cuckooClock']);t.after(f.dispose);f.runtime.sync(f.commerce,f.models,0);
  f.setDate(new Date(2026,9,26,13,0,0));f.advance(1000);f.advance(2500);assert.equal(f.nodes(0,'cuckoo-bird')[0].visible,true);
  f.advance(7000);assert.equal(f.nodes(0,'cuckoo-bird')[0].visible,false);
  f.runtime.sync(f.commerce,f.models,0);f.advance(8500);assert.equal(f.nodes(0,'cuckoo-bird')[0].visible,false);
  f.commerce.objectStates['item-0']={chime:false};f.runtime.sync(f.commerce,f.models,0);f.setDate(new Date(2026,9,26,14,0,0));f.advance(10000);f.advance(11500);assert.equal(f.nodes(0,'cuckoo-bird')[0].visible,false);
});

test('all clock families expose pivoted hands; pendulum swings and clock scheduler pauses with the document',t=>{
  const kinds=OBJECT_CAPABILITY_KINDS.clock,f=fixture(kinds);t.after(f.dispose);f.runtime.sync(f.commerce,f.models,0);
  for(let i=0;i<kinds.length;i++){assert.ok(f.nodes(i,'clock-hour').length,kinds[i]);assert.ok(f.nodes(i,'clock-minute').length,kinds[i]);}
  assert.equal(f.runtime.getStats().scheduled,true);f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
  f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.runtime.getStats().scheduled,true);
});

test('three television tiers render animated channels and restore hidden remote without duplicating it',t=>{
  const f=fixture(OBJECT_CAPABILITY_KINDS.television);t.after(f.dispose);
  f.runtime.sync(f.commerce,f.models,0);assert.equal(f.runtime.getStats().textures,3);assert.equal(f.runtime.getStats().scheduled,false);
  for(let i=0;i<3;i++){assert.equal(f.nodes(i,'tv-screen').length,1);assert.equal(f.nodes(i,'tv-remote').length,1);}
  const screen=f.nodes(0,'tv-screen')[0],material=screen.material;
  f.commerce.objectStates['item-0']={power:true,channel:2,volume:1};f.runtime.sync(f.commerce,f.models,0);assert.equal(screen.material,material);assert.ok(f.draws.some(c=>c[0]==='fillText'&&c[1]==='SPORTS'));assert.equal(f.runtime.getStats().scheduled,true);
  f.runtime.setRemoteHeld('item-0',true);assert.equal(f.nodes(0,'tv-remote')[0].visible,false);f.runtime.sync(f.commerce,f.models,0);assert.equal(f.nodes(0,'tv-remote')[0].visible,false);
  f.runtime.setRemoteHeld('item-0',false);assert.equal(f.nodes(0,'tv-remote')[0].visible,true);
});

test('clearing a student releases screens and all light/timer instances before the next student is loaded',t=>{
  const f=fixture(['ipRetroTelevision','hhMushroomLamp','cuckooClock'],{'item-0':{power:true,channel:0,volume:1},'item-1':{power:true,brightness:2}});t.after(f.dispose);
  const screen=f.nodes(0,'tv-screen')[0],original=screen.material;let textureDisposed=0;f.runtime.sync(f.commerce,f.models,0);screen.material.map.addEventListener('dispose',()=>textureDisposed++);f.runtime.setRemoteHeld('item-0',true);
  assert.notEqual(screen.material,original);f.runtime.clear();assert.equal(screen.material,original);assert.equal(textureDisposed,1);assert.equal(f.nodes(0,'tv-remote')[0].visible,true);assert.deepEqual(f.runtime.getStats(),{objects:0,activePointLights:0,textures:0,scheduled:false});assert.equal(f.timers.size,0);
  f.commerce.objectStates={};f.runtime.sync(f.commerce,f.models,0);assert.equal(f.runtime.getStats().activePointLights,0);assert.equal(f.nodes(0,'tv-remote')[0].visible,true);
});

test('models on another floor and sold units cannot create lights or media runtimes',t=>{
  const f=fixture(['hhMushroomLamp','ipRetroTelevision']);t.after(f.dispose);f.commerce.owned[0].storey=1;f.commerce.owned[1].status='sold';f.runtime.sync(f.commerce,f.models,0);assert.equal(f.runtime.getStats().objects,0);
});

test('each television channel has independently readable drawing content and a black standby state',()=>{
  const calls=[];const ctx=new Proxy({}, {get:(target,key)=>target[key]??((...args)=>calls.push([key,...args])),set:(target,key,value)=>{target[key]=value;return true;}});
  for(const[channel,title]of ['FOREST TV','WEATHER','SPORTS','MUSIC'].entries()){calls.length=0;drawTelevisionFrame(ctx,{power:true,channel},1234);assert.ok(calls.some(c=>c[0]==='fillText'&&c[1]===title));}
  calls.length=0;drawTelevisionFrame(ctx,{power:false},0);assert.ok(!calls.some(c=>c[0]==='fillText'));
});

test('model retirement restores its original screen before the scene disposes owned materials',t=>{
  const f=fixture(['ipWideTelevision']);t.after(f.dispose);const screen=f.nodes(0,'tv-screen')[0],original=screen.material;
  f.runtime.sync(f.commerce,f.models,0);let materialRetired=0,textureRetired=0;screen.material.addEventListener('dispose',()=>materialRetired++);screen.material.map.addEventListener('dispose',()=>textureRetired++);
  f.runtime.releaseModel(f.models[0].group);assert.equal(screen.material,original);assert.equal(materialRetired,1);assert.equal(textureRetired,1);assert.equal(f.runtime.getStats().objects,0);
});

test('leaving a student immediately cancels scheduled cuckoo voices so they cannot resume in another home',async t=>{
  const previous=globalThis.AudioContext,oscillators=[];
  class AudioFixture{constructor(){this.state='suspended';this.currentTime=0;this.destination={};}async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
    createOscillator(){const node={frequency:{value:0},connect(){},disconnect(){},start(){},stop(at){this.stops.push(at);},stops:[]};oscillators.push(node);return node;}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}}
  globalThis.AudioContext=AudioFixture;t.after(()=>{globalThis.AudioContext=previous;});const f=fixture(['cuckooClock']);t.after(f.dispose);f.runtime.sync(f.commerce,f.models,0);await f.runtime.unlockAudio();f.runtime.demonstrate('item-0');assert.equal(oscillators.length,2);f.runtime.clear();assert.ok(oscillators.every(node=>node.stops.at(-1)===undefined&&node.stops.length===2));
});

test('soft lamp pools clip to the actual floor perimeter instead of floating beyond an edge or inside a missing slab',t=>{
  const f=fixture(['readingLamp'],{'item-0':{power:true,brightness:3}});t.after(f.dispose);f.models[0].group.position.set(1.8,.08,0);
  f.commerce.home={rooms:[],slab:{rects:[{minX:-2,minZ:-2,width:4,depth:4}]}};f.runtime.sync(f.commerce,f.models,0);f.models[0].group.updateMatrixWorld(true);
  const pool=f.models[0].group.children.find(n=>n.isMesh&&n.userData.objectRuntime),vertices=pool.geometry.attributes.position,p=new THREE.Vector3();assert.ok(vertices.count>0);
  for(let n=0;n<vertices.count;n++){p.fromBufferAttribute(vertices,n).applyMatrix4(pool.matrixWorld);assert.ok(p.x<=2+1e-6&&p.x>=-2-1e-6);assert.ok(p.z<=2+1e-6&&p.z>=-2-1e-6);assert.ok(Math.abs(p.y-.105)<1e-6);}
  const old=pool.geometry;f.runtime.sync(f.commerce,f.models,0);assert.equal(pool.geometry,old,'steady clock/TV frames reuse the clipped pool geometry');
});
