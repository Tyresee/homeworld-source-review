import {createCushionPresentation} from '../public/js/student-home-cushion-presentation.js';
import {createStudentHomeObjectRuntime} from '../public/js/student-home-object-runtime.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createStudentHome} from '../server/student-homes/profile.mjs';
import {getFloorHomes} from '../public/js/home-commerce.js';

const moduleUrl=new URL('../public/js/student-home-world.js',import.meta.url);
const source=await readFile(moduleUrl,'utf8');

// Exercise the production adapter and the callbacks wired to the 3D scene.
// Only WebGL and the robot asset loader are replaced, so these tests need no
// browser, saved home, student account, network access or GPU.
async function fixture({warmUI=false,delayRoam=false}={}) {
  const calls={views:[],notifications:[],focus:[],floors:[],dispose:0,roam:[],runtimeVisible:[],entrance:[],roamOptions:[]};
  let handlers;
  let roamActive=false,roamEpoch=0,finishEntry,previousView='interior';
  const canvas={hidden:false,setAttribute(){}};
  const robot={traverse(){}};
  const scene={
    setView(view){calls.views.push(view);},
    focusEstate(id){calls.focus.push(id);},
    dispose(){calls.dispose++;},
    setObjectContext(){},setState(){},setOutdoorState(){},setAvatar(){},selectSurface(){},setTool(){},cancelDrag(){},cancelPlacement(){},hideAvatar(){},
    async enterRoam(options){calls.roamOptions.push({...options});const epoch=++roamEpoch;previousView=calls.views.at(-1)??'interior';if(delayRoam)await new Promise(resolve=>{finishEntry=resolve;});if(epoch!==roamEpoch)return false;roamActive=true;handlers.onRoamChange({active:true,phase:'orbit',previousView});return true;},
    exitRoam(){roamEpoch++;if(roamActive){roamActive=false;handlers.onRoamChange({active:false,phase:'inactive',previousView});}},
  };
  const context={createCushionPresentation,createStudentHomeObjectRuntime:options=>{const runtime=createStudentHomeObjectRuntime(options);return {...runtime,setVisible(value){calls.runtimeVisible.push(value);runtime.setVisible(value);}};},URL,
    GLTFLoader:class {async loadAsync(){return {scene:robot};}},
    getFloorHomes,
    createStudentHomeRobotController:()=>({}),
    createHomeScene(options){handlers=options;return scene;},
  };
  const executable=source.replace(/^import[^\n]+\n/gm,'')
    .replace('export async function createStudentHomeWorld','async function createStudentHomeWorld')
    .replaceAll('import.meta.url',JSON.stringify(moduleUrl.href));
  runInNewContext(executable+'\nglobalThis.createWorld=createStudentHomeWorld;',context,{filename:'student-home-world.js'});
  const world=await context.createWorld({
    warmUI,onRoamChange:value=>calls.roam.push({...value}),onEntranceClick:request=>calls.entrance.push(request),
    container:{querySelector:selector=>selector==='canvas'?canvas:null},
    onViewChange:view=>calls.notifications.push(view),
    onStoreyChange:index=>calls.floors.push(index),
  });
  return {world,handlers,calls,finishEntry:()=>finishEntry?.()};
}

test('explicit view controls synchronize renderer, world state and selected-view notification',async()=>{
  const {world,calls}=await fixture();
  assert.equal(world.getView(),'interior');
  for(const view of ['estate','building','interior']){
    world.setView(view);
    assert.equal(world.getView(),view);
    assert.equal(calls.views.at(-1),view);
    assert.equal(calls.notifications.at(-1),view);
  }
  assert.deepEqual(calls.views,['estate','building','interior']);
  assert.deepEqual(calls.notifications,calls.views);
});

test('outdoor manor roof focus and floor hit do not enter a room',async()=>{
  const {world,handlers,calls}=await fixture();
  world.setView('estate');
  // Estate double-clicks focus a feature; roof hits can carry a storey index.
  handlers.onEstateFocus('manor');
  handlers.onStoreyChange(1);
  handlers.onEstateViewChange();
  assert.equal(world.getView(),'estate');
  assert.deepEqual(calls.views,['estate']);
  assert.deepEqual(calls.focus,['manor']);
  assert.deepEqual(calls.floors,[]);
  assert.equal(calls.notifications.at(-1),'estate');
});

test('whole-building roof and facade storey hits preserve the overview',async()=>{
  const {world,handlers,calls}=await fixture();
  world.setView('building');
  handlers.onStoreyChange(0);
  handlers.onStoreyChange(2);
  handlers.onEstateViewChange();
  assert.equal(world.getView(),'building');
  assert.deepEqual(calls.views,['building']);
  assert.deepEqual(calls.floors,[]);
  assert.deepEqual(calls.notifications,['building','building']);
});

test('interior stairs still change floors after leaving and returning indoors',async()=>{
  const {world,handlers,calls}=await fixture();
  handlers.onStoreyChange(1);
  world.setView('estate');
  handlers.onStoreyChange(2);
  world.setView('interior');
  handlers.onStoreyChange(0);
  assert.deepEqual(calls.floors,[1,0]);
  assert.equal(world.getView(),'interior');
});

test('reset keeps the current view and invalid view names cannot change it',async()=>{
  const {world,calls}=await fixture();
  world.setView('estate');
  world.setView('roof');
  world.setView(undefined);
  world.reset();
  assert.equal(world.getView(),'estate');
  assert.deepEqual(calls.views,['estate','estate']);
  assert.deepEqual(calls.notifications,['estate']);
});

test('disposed world ignores late view-control changes',async()=>{
  const {world,calls}=await fixture();
  world.setView('building');
  world.dispose();
  world.setView('interior');
  assert.equal(world.getView(),'building');
  assert.deepEqual(calls.views,['building']);
  assert.deepEqual(calls.notifications,['building']);
  assert.equal(calls.dispose,1);
});

test('Warm roaming suspends the object runtime and returns to the exact prior view without resetting its camera',async()=>{
  const {world,calls}=await fixture({warmUI:true});const home=createStudentHome('11111111-1111-4111-8111-111111111111');world.setCommerce(home.commerce,home.avatar);world.setView('estate');const before=JSON.stringify(home);
  assert.equal(await world.enterRoam(),true);assert.equal(world.getView(),'roam');assert.equal(world.isRoaming(),true);assert.equal(calls.runtimeVisible.at(-1),false);assert.equal(calls.notifications.at(-1),'roam');
  world.exitRoam();assert.equal(world.getView(),'estate');assert.deepEqual(calls.views,['estate'],'Exit must not call the normal camera-resetting setView');assert.equal(calls.runtimeVisible.at(-1),false);assert.equal(calls.notifications.at(-1),'estate');assert.equal(JSON.stringify(home),before);
  world.setView('interior');await world.enterRoam();world.exitRoam();assert.equal(calls.runtimeVisible.at(-1),true);world.dispose();
});

test('read-only entry is Warm-only and an identity clear cancels an asynchronous load before it can reopen',async()=>{
  const legacy=await fixture(),home=createStudentHome('11111111-1111-4111-8111-111111111111');legacy.world.setCommerce(home.commerce,home.avatar);assert.equal(await legacy.world.enterRoam(),false);assert.equal(legacy.world.getView(),'interior');legacy.world.dispose();
  const f=await fixture({warmUI:true,delayRoam:true});f.world.setCommerce(home.commerce,home.avatar);const loading=f.world.enterRoam();f.world.clear();f.finishEntry();assert.equal(await loading,false);assert.equal(f.world.isRoaming(),false);assert.equal(f.calls.roam.some(value=>value.active),false);f.world.dispose();
});

test('only a ready Warm estate can forward the actual entrance click; roof focus remains separate',async()=>{
  const home=createStudentHome('11111111-1111-4111-8111-111111111111'),request={entrance:true};
  for(const warmUI of[false,true]){
    const f=await fixture({warmUI});f.world.setView('estate');f.handlers.onEntranceClick(request);assert.equal(f.calls.entrance.length,0,'unbound homes cannot enter');
    f.world.setCommerce(home.commerce,home.avatar);f.world.setView('interior');f.handlers.onEntranceClick(request);assert.equal(f.calls.entrance.length,0);
    f.world.setView('estate');f.handlers.onEstateFocus('manor');assert.equal(f.calls.entrance.length,0,'roof focus is not an entrance click');
    f.handlers.onEntranceClick(request);assert.equal(f.calls.entrance.length,warmUI?1:0);
    f.world.clear();f.handlers.onEntranceClick(request);assert.equal(f.calls.entrance.length,warmUI?1:0);
    f.world.setCommerce(home.commerce,home.avatar);f.world.dispose();f.handlers.onEntranceClick(request);assert.equal(f.calls.entrance.length,warmUI?1:0);
  }
});

test('door entry forwards its explicit option and preserves the ordinary Visit orbit entry',async()=>{
  const f=await fixture({warmUI:true}),home=createStudentHome('11111111-1111-4111-8111-111111111111');f.world.setCommerce(home.commerce,home.avatar);
  assert.equal(await f.world.enterRoam({enterDoor:true}),false,'an interior event cannot act as an outdoor doorway');assert.equal(f.calls.roamOptions.length,0);
  assert.equal(await f.world.enterRoam(),true);assert.deepEqual(f.calls.roamOptions.at(-1),{enterDoor:false});f.world.exitRoam();
  f.world.setView('estate');assert.equal(await f.world.enterRoam({enterDoor:true}),true);assert.deepEqual(f.calls.roamOptions.at(-1),{enterDoor:true});f.world.exitRoam();assert.equal(f.world.getView(),'estate');f.world.dispose();
});
