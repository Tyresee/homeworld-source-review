import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {APPROVED_WARM_V6,APPROVED_WARM_V6_SOURCE_SHA256} from '../public/js/home-warm-theme.js';
import {HOME_THEMES,getRoomTheme,getHomeSurfaceAppearance,resolveHomeTheme,getHomeTheme} from '../public/js/home-theme.js';
import {createHomeState} from '../public/js/home-engine.js';
import {createRoom} from '../public/js/home-layout.js';
import {createRoomExpansion} from '../public/js/home-room-expansion.js';
import {createHomeWallTextureManager} from '../public/js/home-wall-textures.js';
import {createHomeFloorTextureManager} from '../public/js/home-floor-textures.js';

const bytes=readFileSync(new URL('../scripts/qa/look-dev-presets/warm-v6.json',import.meta.url)),source=JSON.parse(bytes),warm=HOME_THEMES.warm;
const createCanvas=()=>({width:0,height:0,getContext:()=>new Proxy({},{get:(_target,key)=>()=>{}})});

test('the actual warm theme uses the approved source with root backdrop and editor lighting precedence',()=>{
  assert.equal(createHash('sha256').update(bytes).digest('hex'),APPROVED_WARM_V6_SOURCE_SHA256);assert.deepEqual(APPROVED_WARM_V6,source);
  assert.equal(warm.appearanceSource.status,'approved-source');assert.equal(warm.appearanceSource.id,'warm-v6');
  assert.deepEqual(warm.backdrop,source.backdrop);assert.notDeepEqual(warm.backdrop,source.build.theme.backdrop);
  assert.deepEqual(warm.lighting.editor,source.render);assert.equal(warm.lighting.student.sun.intensity,2.584);assert.equal(warm.lighting.student.environmentIntensity,1);
  assert.deepEqual(warm.shell,source.build.theme.shell);assert.deepEqual(warm.manor,source.build.theme.manor);
  assert.equal(resolveHomeTheme('?theme=warm'),warm);assert.equal(resolveHomeTheme('?theme=warm-v6'),HOME_THEMES.default);assert.equal(getHomeTheme(),HOME_THEMES.default);
});

test('warm rooms use current plain wall defaults and approved trim without changing saves',()=>{
  assert.equal(Object.hasOwn(warm.surfaceRemap,'floor.main'),false);
  for(const kind of['living','bedroom','study','kitchen','playroom','bathroom','gallery','sunroom','hallway']) {
    const room=createRoom(kind,-1,-1,'approved-room'),before=JSON.stringify(room),skin=getRoomTheme(kind,room,warm);
    assert.equal(skin.wall,'#f4efe6');assert.equal(skin.trim,source.build.theme.rooms[kind].trim);
    assert.equal(skin.wallMaterial,kind==='bathroom'?'ceramic':'linen');
    assert.equal(Object.hasOwn(warm.rooms[kind],'floor'),false);assert.equal(Object.hasOwn(warm.rooms[kind],'floorMaterial'),false);
    assert.equal(JSON.stringify(room),before);
  }
  const painted=createRoom('bedroom',1,-1,'painted');painted.wall={color:'#123456',material:'walnut'};
  const skin=getRoomTheme('bedroom',painted,warm);assert.equal(skin.wall,'#123456');assert.equal(skin.wallMaterial,'walnut');
  const old={color:'#f7ead7',material:'ceramic'},before=JSON.stringify(old),display=getHomeSurfaceAppearance('wall.inner',old,warm);
  assert.deepEqual(display,{color:'#f4efe6',material:'ceramic'});assert.equal(JSON.stringify(old),before);
  assert.deepEqual(getHomeSurfaceAppearance('wall.inner',{color:'#123456',material:'walnut'},warm),{color:'#123456',material:'walnut'});
});

test('real warm room wall meshes receive new plain finishes and retain authoritative input data',()=>{
  const manager=createHomeFloorTextureManager({createCanvas}),maps={oak:new THREE.Texture(),linen:new THREE.Texture(),ceramic:new THREE.Texture()};
  let borrowedDisposals=0;for(const map of Object.values(maps))map.addEventListener('dispose',()=>borrowedDisposals++);
  for(const kind of['living','bedroom','bathroom']) {
    const rect={minX:-2.8,minZ:-2.6,width:5.6,depth:5.2},room=createRoom(kind,undefined,undefined,'approved-room',rect);
    const home=createHomeState({profile:kind==='living'?'account':'upper',slab:{rects:[rect]},rooms:[room]}),before=JSON.stringify(home);
    const model=createRoomExpansion({...home,maps,theme:warm,floorTextureManager:manager,wallTextureManager:createHomeWallTextureManager({createCanvas})});
    assert.ok(model.userData.roomParts.walls.length);assert.ok(model.userData.roomParts.walls.every(mesh=>mesh.material.map?.name==='wall:plain'));
    assert.ok(model.userData.roomParts.floor.some(mesh=>mesh.material.roughness===(kind==='bathroom'?.45:.72)));
    assert.equal(JSON.stringify(home),before);model.dispose();
  }
  assert.equal(borrowedDisposals,0);manager.dispose();Object.values(maps).forEach(map=>map.dispose());
});
