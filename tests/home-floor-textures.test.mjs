import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createFloorPatternCanvas,getFloorPatternCanvas,getFloorFinishPreview,createHomeFloorTextureManager,getFloorTextureMetrics,getFloorTextureCacheStats,FLOOR_PATTERN_SPECS} from '../public/js/home-floor-textures.js';
import {getFloorFinish} from '../public/js/home-floor-finishes.js';
import {captureHomeFloor} from '../public/js/home-house-overview.js';
import {clipFloorMeshToOpening} from '../public/js/home-staircase.js';
import {createRoomExpansion} from '../public/js/home-room-expansion.js';
import {createHomeState} from '../public/js/home-engine.js';
import {HOME_THEMES} from '../public/js/home-theme.js';
import {createRoom} from '../public/js/home-layout.js';
import {createHomeWallTextureManager} from '../public/js/home-wall-textures.js';
import {createWarmStarterFloorSurface} from '../public/js/home-scene.js';

// Fingerprint actual 2D drawing commands without requiring a browser or GPU.
// Browser screenshots separately verify the pixels produced by these commands.
function canvasFactory() {
  const canvases=[];
  const createCanvas=()=>{
    const digest=createHash('sha256'),properties={};let commands=0;
    const record=(name,...args)=>{commands++;digest.update(JSON.stringify([name,...args]));};
    const context=new Proxy(properties,{set(target,key,value){target[key]=value;record('set',key,value);return true;},get(target,key){if(key in target)return target[key];return(...args)=>record(key,...args.map(value=>value?.fingerprint?value.fingerprint():value));}});
    const canvas={width:0,height:0,getContext:()=>context,fingerprint:()=>digest.copy().digest('hex'),toDataURL:()=> 'data:image/png;base64,'+Buffer.from(digest.copy().digest('hex')).toString('base64'),get commands(){return commands;}};
    canvases.push(canvas);return canvas;
  };
  return {createCanvas,canvases};
}
const floor=(w=4.8,d=3.6)=>new THREE.Mesh(new RoundedBoxGeometry(w,.06,d,3,.008),new THREE.MeshStandardMaterial({color:'#abcdef'}));

test('the approved seeded floor patterns are deterministic and physically specified',()=>{
  const {createCanvas}=canvasFactory(),hashes=new Set();
  for(const pattern of Object.keys(FLOOR_PATTERN_SPECS)) {
    const a=createFloorPatternCanvas(pattern,{createCanvas}),b=createFloorPatternCanvas(pattern,{createCanvas});
    assert.equal(a.width,1024);assert.equal(a.height,1024);assert.equal(a.fingerprint(),b.fingerprint());assert.ok(a.commands>(pattern==='tile'?10:100));
    hashes.add(a.fingerprint());
  }
  assert.equal(hashes.size,5);assert.equal(FLOOR_PATTERN_SPECS.wide.plank,.2);assert.equal(FLOOR_PATTERN_SPECS.narrow.plank,.12);
  assert.equal(FLOOR_PATTERN_SPECS.herringbone.column,.6);assert.equal(FLOOR_PATTERN_SPECS.tile.tileMeters,1.4);
});

test('floor canvases and truthful finish thumbnails reuse a bounded pattern cache',()=>{
  const {createCanvas,canvases}=canvasFactory();
  const a=getFloorPatternCanvas('wide',{createCanvas}),b=getFloorPatternCanvas('wide',{createCanvas});assert.equal(a,b);assert.equal(canvases.length,1);
  const preview=getFloorFinishPreview('wood-light-oak',{createCanvas});assert.match(preview,/^data:image\/png;base64,/);
  assert.equal(getFloorFinishPreview('wood-light-oak',{createCanvas}),preview);assert.equal(canvases.length,2);
  getFloorFinishPreview('wood-walnut',{createCanvas});assert.equal(canvases.length,3,'the second tint shares the same real source pattern');
});

test('each rounded or clipped floor uses actual physical bounds rather than missing geometry parameters',()=>{
  const mesh=floor();mesh.position.set(-1.2,.03,.6);mesh.scale.set(1.5,1,2);
  const metrics=getFloorTextureMetrics(mesh,2.4);assert.ok(Math.abs(metrics.repeat[0]-3)<1e-6);assert.ok(Math.abs(metrics.repeat[1]-3)<1e-6);
  mesh.scale.set(1,1,1);clipFloorMeshToOpening(mesh,{id:'stairs',x:0,z:0,rotation:0,direction:'down'});
  assert.equal(mesh.geometry.parameters,undefined,'clipped geometry really has no constructor width/depth');
  const clipped=getFloorTextureMetrics(mesh,2.4);assert.ok(clipped);assert.ok(Math.abs(clipped.repeat[0]-2)<1e-6);assert.ok(Math.abs(clipped.repeat[1]-1.5)<1e-6);
  mesh.geometry.dispose();mesh.material.dispose();
});

test('independent per-floor repeats share one source and leave unrelated furniture oak unchanged',()=>{
  const {createCanvas}=canvasFactory(),manager=createHomeFloorTextureManager({createCanvas}),a=floor(),b=floor(2.4,1.2),furnitureMap=new THREE.Texture();
  a.material.map=furnitureMap;const originalUV=a.geometry.attributes.uv.array.slice();
  manager.apply(a,getFloorFinish('wood-light-oak'));manager.apply(b,getFloorFinish('wood-walnut'));
  assert.notEqual(a.material.map,b.material.map);assert.equal(a.material.map.source,b.material.map.source);
  assert.ok(Math.abs(a.material.map.repeat.x-2)<1e-6);assert.ok(Math.abs(b.material.map.repeat.x-1)<1e-6);
  assert.equal(a.material.map.userData.worldTileMetres,2.4);assert.equal(a.material.map.name,'floor:wide');assert.equal(furnitureMap.version,0);
  assert.deepEqual(getFloorTextureCacheStats({createCanvas}),{canvases:1,sources:1,clones:2});
  const shader={vertexShader:'#include <beginnormal_vertex>',fragmentShader:'#include <map_fragment>'};a.material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader,/mix\(warmFloorBase, diffuseColor, vWarmFloorTop\)/,'vertical plinth faces retain a clean solid color');
  manager.release(a);assert.equal(a.material.map,furnitureMap);assert.deepEqual(a.geometry.attributes.uv.array,originalUV);
  manager.dispose();manager.dispose();assert.deepEqual(getFloorTextureCacheStats({createCanvas}),{canvases:1,sources:0,clones:0});
  for(const mesh of[a,b]){mesh.geometry.dispose();mesh.material.dispose();}furnitureMap.dispose();
});

test('multi-storey captures retain live floor texture leases until their own disposal',()=>{
  const {createCanvas}=canvasFactory(),manager=createHomeFloorTextureManager({createCanvas}),mesh=floor(),root=new THREE.Group();root.add(mesh);
  manager.apply(mesh,getFloorFinish('wood-light-oak'));const texture=mesh.material.map;let disposed=0;texture.addEventListener('dispose',()=>disposed++);
  const snapshot=captureHomeFloor(root);assert.equal(snapshot.children[0].material.map,texture);
  manager.dispose();assert.equal(disposed,0);assert.equal(getFloorTextureCacheStats({createCanvas}).clones,1);
  snapshot.userData.dispose();assert.equal(disposed,1);assert.equal(getFloorTextureCacheStats({createCanvas}).clones,0);
  mesh.geometry.dispose();mesh.material.dispose();
});

test('warm room rendering uses finish maps while default and toy never allocate a new pattern',()=>{
  const {createCanvas}=canvasFactory(),manager=createHomeFloorTextureManager({createCanvas}),home=createHomeState({profile:'account'}),maps={oak:new THREE.Texture()};
  for(const theme of[HOME_THEMES.default,HOME_THEMES.toy]){
    const group=createRoomExpansion({...home,maps,theme,floorTextureManager:manager,wallTextureManager:createHomeWallTextureManager({createCanvas})});assert.equal(getFloorTextureCacheStats({createCanvas}).canvases,0);group.dispose();
  }
  const group=createRoomExpansion({...home,maps,theme:{...HOME_THEMES.default,id:'warm'},floorTextureManager:manager,wallTextureManager:createHomeWallTextureManager({createCanvas})});
  assert.ok(group.userData.roomParts.floor.some(mesh=>mesh.material.map?.name==='floor:wide'));
  assert.equal(maps.oak.version,0);group.dispose();manager.dispose();assert.equal(getFloorTextureCacheStats({createCanvas}).clones,0);maps.oak.dispose();
});

test('warm playrooms and bathrooms omit all old floor mosaics and geometric seams',()=>{
  const {createCanvas}=canvasFactory(),manager=createHomeFloorTextureManager({createCanvas});
  for(const kind of['playroom','bathroom']) {
    const rooms=[createRoom('living'),createRoom(kind,1,-1,'finish-room')];
    for(const theme of[HOME_THEMES.default,HOME_THEMES.toy]) {
      const old=createRoomExpansion({rooms,includeGrid:true,theme,floorTextureManager:manager,wallTextureManager:createHomeWallTextureManager({createCanvas})});
      assert.ok(old.userData.roomParts.zones.length>0,theme.id+' retains its original grid and room accents');old.dispose();
    }
    const warm={...HOME_THEMES.default,id:'warm'};
    const legacy=createRoomExpansion({rooms,includeGrid:true,theme:warm,floorTextureManager:manager,wallTextureManager:createHomeWallTextureManager({createCanvas})});
    assert.equal(legacy.userData.roomParts.zones.length,0);legacy.dispose();
    const rect={minX:-2.8,minZ:-2.6,width:5.6,depth:5.2};
    const floor=createHomeState({profile:'upper',slab:{rects:[rect]},rooms:[createRoom(kind,undefined,undefined,'finish-room',rect)]});
    const standalone=createRoomExpansion({...floor,includeGrid:true,theme:warm,floorTextureManager:manager,wallTextureManager:createHomeWallTextureManager({createCanvas})});
    assert.equal(standalone.userData.roomParts.zones.length,0,'slab path also has no old colored accent overlays');
    assert.ok(standalone.userData.roomParts.floor.some(mesh=>mesh.userData.floorPattern===(kind==='playroom'?'wide':'tile')));standalone.dispose();
  }
  manager.dispose();assert.equal(getFloorTextureCacheStats({createCanvas}).clones,0);
});

test('the warm starter finish is one 5.6 by 5.2 metre surface with an actual staircase hole',()=>{
  const plain=createWarmStarterFloorSurface(),upper=createWarmStarterFloorSurface({id:'opening',x:0,z:0,rotation:0,direction:'down'});
  try {
    const dimensions=getFloorTextureMetrics(plain,2.4);assert.ok(Math.abs(dimensions.width-5.6)<1e-6);assert.ok(Math.abs(dimensions.depth-5.2)<1e-6);
    assert.equal(plain.children.length,0,'no retained forty-centimetre plank meshes');
    upper.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-1,0));
    assert.equal(ray.intersectObject(upper).length,0,'the finish never caps the actual stair opening');
    ray.set(new THREE.Vector3(2.2,2,0),new THREE.Vector3(0,-1,0));assert.ok(ray.intersectObject(upper).length>0);
    const clipped=getFloorTextureMetrics(upper,2.4);assert.ok(Math.abs(clipped.width-5.6)<1e-6);assert.ok(Math.abs(clipped.depth-5.2)<1e-6);
  }finally{for(const mesh of[plain,upper]){mesh.geometry.dispose();mesh.material.dispose();}}
});
