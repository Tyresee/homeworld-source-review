import {createCushionPresentation} from '../public/js/student-home-cushion-presentation.js';
import {createStudentHomeObjectRuntime} from '../public/js/student-home-object-runtime.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createStudentHomeRobotController} from '../public/js/student-home-robot-controller.js';
import {createStudentHome} from '../server/student-homes/profile.mjs';
import {applyChange} from '../public/js/home-engine.js';
import {getFloorHomes} from '../public/js/home-commerce.js';

test('account world clear immediately hides and cancels furniture motion, and the next account restores a fresh robot',async t=>{
  const url=new URL('../public/js/student-home-world.js',import.meta.url),code=await readFile(url,'utf8');
  const bytes=await readFile(new URL('../public/assets/asset-lab/robot-v1/models/v4/robot.glb',import.meta.url));
  const source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const old={document:globalThis.document,raf:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame},frames=new Map();let serial=0,actor,world,view='interior';
  globalThis.document=new EventTarget();document.hidden=false;
  globalThis.requestAnimationFrame=callback=>{frames.set(++serial,callback);return serial;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  t.after(()=>{world?.dispose();globalThis.document=old.document;globalThis.requestAnimationFrame=old.raf;globalThis.cancelAnimationFrame=old.cancel;});
  const canvas={hidden:false,setAttribute(){}},labels={hidden:false},statuses=[],activities=[],calls={hide:0,stand:0,cancelDrag:0,cancelPlacement:0};
  const context={createCushionPresentation,createStudentHomeObjectRuntime,URL,getFloorHomes,createStudentHomeRobotController,
    GLTFLoader:class{async loadAsync(){return {scene:source};}},
    createHomeScene(options){
      actor=options.avatarFactory({parent:new THREE.Group(),requestRender(){},onStatus:options.onAvatarStatus,onActivityChange:options.onAvatarActivityChange});
      // Only the renderer boundary is mocked. The real world adapter and real
      // robot controller must agree on immediate hide versus animated stand.
      return {
        setState(home,{floors,activeFloor}){actor.setVisible(view==='interior');actor.setWorld(home,activeFloor,{floors});},
        setAvatar:value=>actor.setAvatar(value),setOutdoorState(){},selectSurface(){},setTool(){},
        captureRobotActivity:options=>actor.captureActivity(options),clearRobotAccountBinding:()=>actor.clearAccountBinding(),
        setView(value){view=value;actor.setVisible(view==='interior');},
        cancelDrag(){calls.cancelDrag++;},cancelPlacement(){calls.cancelPlacement++;},
        standAvatar(){calls.stand++;actor.stand();},hideAvatar(){calls.hide++;actor.setVisible(false);},
        dispose(){actor.dispose();},
      };
    },
  };
  runInNewContext(code.replace(/^import[^\n]+\n/gm,'').replace('export async function createStudentHomeWorld','async function createStudentHomeWorld').replaceAll('import.meta.url',JSON.stringify(url.href))+'\nglobalThis.makeWorld=createStudentHomeWorld;',context,{filename:url.pathname});
  world=await context.makeWorld({container:{querySelector:selector=>selector==='canvas'?canvas:labels},onStatus:status=>statuses.push(status),onRobotActivityChange:activity=>activities.push(JSON.parse(JSON.stringify(activity)))});
  const first=createStudentHome('11111111-1111-4111-8111-111111111111'),next=createStudentHome('22222222-2222-4222-8222-222222222222');
  const placed=applyChange(first.commerce.home,{type:'furniture',id:'bed-fixture',kind:'bedTimber',x:0,z:0,rotation:90});assert.equal(placed.ok,true,placed.error);first.commerce.home=placed.state;
  const advance=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(performance.now()+50));};
  for(const phase of['leg-lift','lying']){
    world.setCommerce(first.commerce,first.avatar);assert.equal(canvas.hidden,false);assert.equal(actor.group.visible,true);
    assert.equal(actor.interact('furniture:bed-fixture','lie').ok,true);
    for(let n=0;n<650&&actor.getState().phase!==phase;n++)advance();assert.equal(actor.getState().phase,phase);
    world.clear();
    assert.equal(actor.getState().visible,false);assert.equal(actor.getState().scheduled,false);assert.equal(actor.getState().inTransition,false);assert.equal(actor.getState().action,'idle');
    assert.equal(actor.group.visible,false);assert.equal(canvas.hidden,true);assert.equal(labels.hidden,true);assert.equal(frames.size,0);
    const count=statuses.length;for(let n=0;n<30;n++)advance();assert.equal(statuses.length,count,'a hidden old account cannot emit deferred transition status');
    world.setCommerce(next.commerce,next.avatar);
    assert.equal(canvas.hidden,false);assert.equal(actor.group.visible,true);assert.equal(actor.getState().phase,'idle');assert.equal(actor.getState().scheduled,false);
    assert.equal(actor.interactions('furniture:bed-fixture').length,0,'old furniture actions cannot survive an account switch');
  }
  assert.equal(calls.hide,2);assert.equal(calls.stand,0,'account clear must not request the user-visible animated exit');assert.equal(calls.cancelDrag,2);assert.equal(calls.cancelPlacement,2);
  const saved={kind:'sleep',itemId:'bed-fixture',storey:0},before=activities.length;
  world.setCommerce(first.commerce,first.avatar,0,saved);assert.equal(actor.getState().action,'lie');assert.equal(actor.getState().scheduled,false);
  assert.ok(activities.slice(before).every(activity=>activity?.kind==='stand'),'world replacement captures the previous account floor point before loading sleep');
  const hydrated=activities.length;
  world.setView('estate');world.setView('interior');assert.equal(actor.getState().action,'lie','view switching restores the same saved bed');
  world.palette({shell:'#a7c7cf',accent:'#608ea6'});assert.equal(actor.getState().action,'lie','palette preview cannot wake saved sleep');
  assert.equal(activities.length,hydrated,'view switch and palette updates cannot persist a new activity after hydration');
  world.clear();world.setCommerce(next.commerce,next.avatar,0,null);assert.equal(actor.getState().action,'idle');assert.equal(activities.length,hydrated);
  world.setCommerce(first.commerce,first.avatar,0,null);assert.equal(actor.interact('furniture:bed-fixture','lie').ok,true);
  for(let n=0;n<650&&actor.getState().action!=='lie';n++)advance();assert.equal(actor.getState().action,'lie');
  assert.deepEqual(activities.at(-1),saved,'real completed lie reaches the formal account callback');
});
