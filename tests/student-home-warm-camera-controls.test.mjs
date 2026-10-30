import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {frameHomeCamera} from '../public/js/home-scene-framing.js';
import {boundedZoom,HOME_ZOOM_LIMITS} from '../public/js/home-camera-input.js';

const source=await readFile(new URL('../public/js/home-scene.js',import.meta.url),'utf8');
function method(name){
  const from=source.indexOf('    '+name+'(');assert.ok(from>0,'Production camera method exists: '+name);
  const body=source.indexOf('{',from);let depth=0;
  for(let i=body;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&!--depth)return source.slice(from, i+1).trim();}
  throw new Error('Unclosed production method: '+name);
}
const frameStart=source.indexOf('  function frameCamera('),frameEnd=source.indexOf('  function stopCameraMotion()',frameStart);
assert.ok(frameStart>0&&frameEnd>frameStart);
function fixture(view='interior',size={width:1440,height:900}){
  const bounds=new THREE.Box3(new THREE.Vector3(-6,0,-4),new THREE.Vector3(8,view==='building'?9:3,7));
  const camera=new THREE.OrthographicCamera(),pan=new THREE.Vector3();let renders=0,exits=0,interruptions=0;
  const context={THREE,frameHomeCamera,boundedZoom,camera,container:{clientWidth:size.width,clientHeight:size.height},view,houseMode:'exterior',houseOverview:null,outdoorState:null,
    zoom:1,angle:Math.PI/4,cameraPan:pan,lastCameraBounds:null,cameraBounds:()=>bounds,presentationPaused:false,
    renderer:{domElement:{width:0,height:0},getPixelRatio:()=>1,setSize(w,h){this.domElement.width=w;this.domElement.height=h;}},
    requestRender:()=>renders++,stageCamera:{exit(options){assert.deepEqual({...options},{restore:false});exits++;}},interruptCameraMotion:()=>interruptions++,
  };
  runInNewContext(source.slice(frameStart,frameEnd)+'\nglobalThis.controls={'+method('zoom')+','+method('refit')+'};',context);
  context.controls.refit();return {context,bounds,camera,pan,controls:context.controls,counts:()=>({renders,exits,interruptions})};
}
const ndc=(camera,point)=>point.clone().project(camera);
const screenDistance=f=>{const a=ndc(f.camera,new THREE.Vector3(1,0,0)),b=ndc(f.camera,new THREE.Vector3(2,0,0));return a.distanceTo(b);};

test('actual scene zoom buttons enlarge all three views and respect the same manual camera limits',()=>{
  for(const view of ['interior','estate','building']){
    const f=fixture(view),before=screenDistance(f);f.controls.zoom(1);assert.ok(screenDistance(f)>before,'The real projection must enlarge, not just a UI counter');
    assert.ok(Math.abs(f.context.zoom-1.1)<1e-12);f.controls.zoom(-1);assert.ok(Math.abs(screenDistance(f)-before)<1e-12);
    const limits=HOME_ZOOM_LIMITS[view]??HOME_ZOOM_LIMITS.estate;
    for(let i=0;i<100;i++)f.controls.zoom(1);assert.equal(f.context.zoom,limits.max);
    for(let i=0;i<200;i++)f.controls.zoom(-1);assert.equal(f.context.zoom,limits.min);
    assert.deepEqual(f.pan.toArray(),[0,0,0]);assert.equal(f.context.angle,Math.PI/4);assert.equal(f.counts().exits,302);assert.equal(f.counts().interruptions,302);
  }
});

test('actual frame method refits resized viewports without resetting current zoom, pan or dance camera',()=>{
  for(const view of ['interior','estate','building']){
    const f=fixture(view);f.controls.zoom(1);f.pan.set(2,0,-1);const zoom=f.context.zoom,pan=f.pan.toArray(),before=f.counts();
    Object.assign(f.context.container,{clientWidth:1920,clientHeight:1080});f.controls.refit();
    assert.equal(f.context.zoom,zoom);assert.deepEqual(f.pan.toArray(),pan);assert.equal(f.counts().exits,before.exits,'Resize must not exit an active performance camera');
    assert.equal(f.context.renderer.domElement.width,1920);assert.equal(f.context.renderer.domElement.height,1080);assert.ok(f.counts().renders>before.renders);
    for(const x of [f.bounds.min.x,f.bounds.max.x])for(const y of [f.bounds.min.y,f.bounds.max.y])for(const z of [f.bounds.min.z,f.bounds.max.z])assert.ok(Math.abs(ndc(f.camera,new THREE.Vector3(x,y,z)).z)<=1,'Depth range stays valid after resize');
  }
});

test('a paused presentation ignores hidden-main resize without changing its camera or canvas',()=>{
  for(const view of ['interior','estate','building']){
    const f=fixture(view);f.controls.zoom(1);f.pan.set(2,0,-1);f.controls.refit();
    const pose=JSON.stringify(f.camera.toJSON()),counts=f.counts(),canvas={...f.context.renderer.domElement},bounds=f.context.lastCameraBounds.clone();
    f.context.presentationPaused=true;Object.assign(f.context.container,{clientWidth:1920,clientHeight:1080});f.controls.refit();
    assert.equal(JSON.stringify(f.camera.toJSON()),pose,'The hidden orthographic camera must retain its complete saved projection and pose');assert.deepEqual(f.context.renderer.domElement,canvas);assert.deepEqual(f.counts(),counts);assert.ok(f.context.lastCameraBounds.equals(bounds));
    f.context.presentationPaused=false;f.controls.refit();assert.equal(f.context.renderer.domElement.width,1920);assert.equal(f.context.renderer.domElement.height,1080);assert.ok(f.counts().renders>counts.renders);
  }
});
