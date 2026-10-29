import {createCushionPresentation} from '../public/js/student-home-cushion-presentation.js';
import {createStudentHomeObjectRuntime} from '../public/js/student-home-object-runtime.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const moduleUrl=new URL('../public/js/student-home-world.js',import.meta.url);
const source=await readFile(moduleUrl,'utf8');

// Exercise the production adapter and the callbacks wired to the 3D scene.
// Only WebGL and the robot asset loader are replaced, so these tests need no
// browser, saved home, student account, network access or GPU.
async function fixture() {
  const calls={views:[],notifications:[],focus:[],floors:[],dispose:0};
  let handlers;
  const canvas={hidden:false,setAttribute(){}};
  const robot={traverse(){}};
  const scene={
    setView(view){calls.views.push(view);},
    focusEstate(id){calls.focus.push(id);},
    dispose(){calls.dispose++;},
  };
  const context={createCushionPresentation,createStudentHomeObjectRuntime,URL,
    GLTFLoader:class {async loadAsync(){return {scene:robot};}},
    getFloorHomes:()=>[],
    createStudentHomeRobotController:()=>({}),
    createHomeScene(options){handlers=options;return scene;},
  };
  const executable=source.replace(/^import[^\n]+\n/gm,'')
    .replace('export async function createStudentHomeWorld','async function createStudentHomeWorld')
    .replaceAll('import.meta.url',JSON.stringify(moduleUrl.href));
  runInNewContext(executable+'\nglobalThis.createWorld=createStudentHomeWorld;',context,{filename:'student-home-world.js'});
  const world=await context.createWorld({
    container:{querySelector:selector=>selector==='canvas'?canvas:null},
    onViewChange:view=>calls.notifications.push(view),
    onStoreyChange:index=>calls.floors.push(index),
  });
  return {world,handlers,calls};
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
