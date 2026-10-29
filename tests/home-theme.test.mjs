import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {HOME_THEMES,resolveHomeTheme,getHomeTheme,getHomeSwatches,getRoomTheme,getHomeSurfaceAppearance,preserveHomeTheme} from '../public/js/home-theme.js';
import {ROOM_KINDS,getRoomKind} from '../public/js/home-layout.js';
import {createHomeState,applyChange,validateHomeState,PALETTE} from '../public/js/home-engine.js';
import {createStageLighting} from '../public/js/student-home-stage-lighting.js';

test('candidate is opt-in, whitelisted and cannot change Node defaults',()=>{
  for(const query of ['', '?theme=default','?theme=unknown','?theme=constructor','?theme=__proto__','?theme=toString','?theme=TOY'])assert.equal(resolveHomeTheme(query),HOME_THEMES.default);
  assert.equal(resolveHomeTheme('?student=fictional&theme=toy'),HOME_THEMES.toy);
  assert.equal(getHomeTheme('?theme=toy'),HOME_THEMES.default);
  assert.equal(HOME_THEMES.default.rooms.bedroom,getRoomKind('bedroom'));
  assert.equal(getHomeSwatches(PALETTE),PALETTE);
  assert.equal(getHomeSwatches(PALETTE,HOME_THEMES.toy).length,8);
  assert.ok(Object.isFrozen(HOME_THEMES.toy.rooms.living));
});

test('room personalization survives both themes and room-size variants share a palette',()=>{
  for(const kind of ROOM_KINDS){
    const custom={floor:{color:'#4c8c64',material:'stone'},wall:{color:'#dc684c',material:'ceramic'}};
    const before=JSON.stringify(custom);
    for(const theme of Object.values(HOME_THEMES)){
      const actual=getRoomTheme(kind,custom,theme);assert.equal(actual.floor,custom.floor.color);assert.equal(actual.wall,custom.wall.color);
      assert.equal(actual.cols,kind.cols);assert.equal(actual.rows,kind.rows);
    }
    assert.equal(JSON.stringify(custom),before);
    const untouched=getRoomTheme(kind,null,HOME_THEMES.default);assert.equal(untouched.floor,kind.floor);assert.equal(untouched.wall,kind.wall);
    const toy=getRoomTheme(kind,null,HOME_THEMES.toy),base=HOME_THEMES.toy.rooms[kind.baseKind];
    assert.equal(toy.floor,base.floor);assert.equal(toy.wall,base.wall);assert.equal(toy.trim,base.trim);
  }
});

test('legacy surface display changes never mutate a valid home or increase its revision',()=>{
  const home=createHomeState({profile:'account'}),snapshot=JSON.stringify(home);
  for(const [id,appearance]of Object.entries(home.surfaces)){
    assert.equal(getHomeSurfaceAppearance(id,appearance,HOME_THEMES.default),appearance);
    const themed=getHomeSurfaceAppearance(id,appearance,HOME_THEMES.toy);
    assert.equal(themed.material,appearance.material);assert.equal(themed.color,HOME_THEMES.toy.surfaceRemap[id].to);
    const custom={...appearance,color:'#123abc'};assert.equal(getHomeSurfaceAppearance(id,custom,HOME_THEMES.toy),custom);
  }
  // A bought sofa can have the same cream as an old wall. Its own id must never
  // activate a legacy-surface remap, and its stored color keeps full ownership.
  const furniture={color:'#f7ead7',material:'linen'};assert.equal(getHomeSurfaceAppearance('furniture:fictional-sofa',furniture,HOME_THEMES.toy),furniture);
  assert.equal(JSON.stringify(home),snapshot);assert.equal(validateHomeState(home),true);
});

test('old and new swatches remain legal colors in unchanged save validation',()=>{
  const home=createHomeState();
  for(const row of [...PALETTE,...HOME_THEMES.toy.swatches]){
    const result=applyChange(home,{type:'paint',surfaceId:'wall.inner',color:row.color});
    assert.equal(result.ok,true,row.color);assert.equal(validateHomeState(result.state),true);
  }
});

test('unowned slab walls use their room display skin while existing global paint stays authoritative',()=>{
  const roomState={id:'fictional-bedroom',kind:'bedroom',wall:{color:getRoomKind('bedroom').wall,material:'ceramic'}};
  const original={color:'#f7ead7',material:'ceramic'},before=JSON.stringify(roomState);
  assert.equal(getHomeSurfaceAppearance('wall.inner',original,HOME_THEMES.toy,roomState).color,'#eef3fb');
  const painted={color:'#8b4ba6',material:'ceramic'};
  assert.equal(getHomeSurfaceAppearance('wall.inner',painted,HOME_THEMES.toy,roomState),painted);
  roomState.wall.color='#31a477';assert.equal(getHomeSurfaceAppearance('wall.inner',original,HOME_THEMES.toy,roomState).color,'#31a477');
  assert.equal(getHomeSurfaceAppearance('wall.inner',original,HOME_THEMES.default,roomState),original);
  assert.equal(JSON.stringify({...roomState,wall:{...roomState.wall,color:getRoomKind('bedroom').wall}}),before);
});

test('navigation keeps only a recognized presentation parameter and preserves target state',()=>{
  assert.equal(preserveHomeTheme('/games/homeworld/student-homes.html?student=a#room','?theme=toy&token=never-copy'),'/games/homeworld/student-homes.html?student=a&theme=toy#room');
  assert.equal(preserveHomeTheme('/games/homeworld/student-homes.html','?theme=unknown'),'/games/homeworld/student-homes.html');
  assert.equal(preserveHomeTheme('/home?theme=toy','?theme=default'),'/home?theme=default');
  assert.equal(preserveHomeTheme('/home','?theme=constructor'),'/home');
});

test('chosen Three.js version supports Neutral tone mapping and the two lighting roles',()=>{
  assert.equal(THREE.REVISION,'186');assert.equal(typeof THREE.NeutralToneMapping,'number');
  assert.equal(HOME_THEMES.toy.lighting.editor.exposure,1);assert.equal(HOME_THEMES.toy.lighting.student.sun.intensity,2.9);
  assert.equal(HOME_THEMES.toy.lighting.editor.sun.intensity,3.8);assert.deepEqual(HOME_THEMES.default.lighting,{});
});

test('toy stage starts from its own backdrop and restores the transparent daylight scene',()=>{
  const scene=new THREE.Scene(),key=new THREE.DirectionalLight('#fff1d6',3.8);scene.add(key);
  const stage=createStageLighting({scene,backdropColor:HOME_THEMES.toy.backdrop.inner});
  stage.update({active:true,point:{x:0,z:0}},0);stage.update({active:true,point:{x:0,z:0}},425);
  scene.onBeforeRender();const expected=new THREE.Color('#bfe6f5').lerp(new THREE.Color('#151b29'),.5);
  assert.ok(scene.background.equals(expected));scene.onAfterRender();assert.equal(scene.background,null);assert.equal(key.intensity,3.8);
  stage.dispose();
});
