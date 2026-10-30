import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';

const source=await readFile(new URL('../public/js/home-scene.js',import.meta.url),'utf8');
function callback(name,next){
  const start=source.indexOf(`  function ${name}(`),end=source.indexOf(`  function ${next}(`,start);
  assert.ok(start>=0&&end>start);return source.slice(start,end);
}
// Execute the real gesture callbacks. Only model-ray results and rendering are
// supplied at their boundaries; click/drag ownership is not reimplemented.
function fixture({theme='warm',door=true,view='estate',callbackEnabled=true}={}){
  const captures=new Set(),events={entry:[],object:[],estate:[],pan:0},canvas={style:{},
    setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
  const context={THREE,theme:{id:theme},view,presentationPaused:false,state:{},dragging:null,spaceHeld:false,spaceUsedForPan:false,
    touchPoints:new Map(),pinchDistance:null,lastPointerEvent:null,lastPanAt:-Infinity,furniturePlacement:null,
    stageCamera:null,floorClickWalk:false,outdoorState:null,DRAG_THRESHOLD:4,performance:{now:()=>100},
    avatarActor:{supportsOutdoor:false},renderer:{domElement:canvas},container:{focus(){}},
    eventRay(){},floorPoint:()=>new THREE.Vector3(),setDragQuality(){},syncPointerCursor(){},hideCollisionGuide(){},
    onCancel:undefined,onPanStart(){},interruptCameraMotion(){},panCamera(){events.pan++;},
    estateHit:()=>({object:{userData:{estateFeature:'manor',...door?{estateEntranceDoor:true}:{}}}}),
    onObjectClick:request=>events.object.push(request),onEstateSelect:id=>events.estate.push(id),
    cancelDrag(){context.dragging=null;captures.clear();},
    onEntranceClick:callbackEnabled?request=>{
      assert.equal(context.dragging,null,'gesture must be released before the adapter starts loading');
      assert.equal(captures.size,0,'pointer capture must not leak into the new viewing canvas');
      events.entry.push(request);
    }:undefined,
  };
  runInNewContext([callback('beginPan','pointerDown'),callback('pointerDown','pointerMove'),callback('pointerMove','pointerUp'),callback('pointerUp','cancelDrag')].join('\n'),context,{filename:'actual-home-scene-door-gesture.js'});
  const event=patch=>({pointerType:'mouse',pointerId:1,button:0,ctrlKey:false,clientX:200,clientY:200,...patch});
  return {context,events,captures,down:patch=>context.pointerDown(event(patch)),move:patch=>context.pointerMove(event(patch)),up:patch=>context.pointerUp(event(patch))};
}

test('an ordinary Warm exterior door click requests entry exactly once after releasing its editor gesture',()=>{
  const f=fixture();f.down();assert.equal(f.events.entry.length,0);assert.ok(f.captures.has(1));f.up();
  assert.equal(f.events.entry.length,1);assert.equal(f.events.entry[0].view,'estate');
  assert.equal(f.events.object.length,0);assert.equal(f.events.estate.length,0);f.up();assert.equal(f.events.entry.length,1);
});

test('roof, wall and non-door house clicks keep their existing selection path',()=>{
  const f=fixture({door:false});f.down();f.up();assert.equal(f.events.entry.length,0);
  assert.deepEqual(f.events.estate,['manor']);assert.equal(f.events.object.length,1);
});

test('the new door shortcut is absent in Default, Toy and an unconnected scene',()=>{
  for(const options of[{theme:'default'},{theme:'toy'},{callbackEnabled:false}]){
    const f=fixture(options);f.down();f.up();assert.equal(f.events.entry.length,0);
    assert.deepEqual(f.events.estate,['manor']);assert.equal(f.events.object.length,1);
  }
});

test('a door drag, Space hand-pan and a pinch never become a door click',()=>{
  const drag=fixture();drag.down();drag.move({clientX:260});drag.up({clientX:260});
  assert.equal(drag.events.pan,1);assert.equal(drag.events.entry.length,0);
  const hand=fixture();hand.context.spaceHeld=true;hand.down();hand.up();assert.equal(hand.events.entry.length,0);
  const pinch=fixture();pinch.down({pointerType:'touch'});pinch.down({pointerType:'touch',pointerId:2,clientX:300});
  pinch.up({pointerType:'touch',pointerId:2,clientX:300});pinch.up({pointerType:'touch'});assert.equal(pinch.events.entry.length,0);
});

test('right-click and macOS Control-click do not launch entry',()=>{
  for(const patch of[{button:2},{ctrlKey:true}]){const f=fixture();f.down(patch);f.up(patch);assert.equal(f.events.entry.length,0);}
  const f=fixture();f.down();f.up({button:2});assert.equal(f.events.entry.length,0);
});

test('a release on another surface or an unrelated pointer cannot launch the saved door target',()=>{
  const f=fixture();f.down();f.up({pointerId:2});assert.equal(f.events.entry.length,0);
  f.context.estateHit=()=>({object:{userData:{estateFeature:'manor'}}});f.up();assert.equal(f.events.entry.length,0);
});

test('the old canvas cannot trigger entry while a viewing transition owns the presentation',()=>{
  const f=fixture();f.context.presentationPaused=true;f.down();f.up();assert.equal(f.events.entry.length,0);
});
