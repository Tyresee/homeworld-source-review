import test from 'node:test';
import assert from 'node:assert/strict';
import {FLOOR_FINISHES,FLOOR_FINISH_IDS,DEFAULT_ROOM_FLOOR_FINISHES,getFloorFinish,isFloorFinishId,resolveHomeFloorFinish} from '../public/js/home-floor-finishes.js';
import {createHomeState,validateHomeState,applyChange,getDefaultFloorAppearance} from '../public/js/home-engine.js';
import {ROOM_KINDS,createRoom} from '../public/js/home-layout.js';

const copy=value=>structuredClone(value);
const command=(surfaceId,finishId)=>({type:'setFloorFinish',surfaceId,finishId});
const roomHome=()=>createHomeState({rooms:[createRoom('living'),createRoom('bedroom',1,-1,'sleep')]});

test('the free finish catalogue has six named wood and eight named tile finishes',()=>{
  assert.equal(FLOOR_FINISHES.length,14);assert.equal(new Set(FLOOR_FINISH_IDS).size,14);
  assert.equal(FLOOR_FINISHES.filter(row=>row.group==='wood').length,6);assert.equal(FLOOR_FINISHES.filter(row=>row.group==='tile').length,8);
  for(const row of FLOOR_FINISHES){assert.equal(getFloorFinish(row.id),row);assert.equal(isFloorFinishId(row.id),true);assert.ok(Object.isFrozen(row));assert.ok(/^#[a-f\d]{6}$/.test(row.color));assert.equal('price' in row,false);assert.ok(row.tileMeters>0);}
  for(const invalid of [null,undefined,'','wood-fake','__proto__',{},1]){assert.equal(isFloorFinishId(invalid),false);assert.equal(getFloorFinish(invalid),null);}
});

test('legacy room defaults resolve warm finishes without rewriting old color, material or revision',()=>{
  for(const kind of ROOM_KINDS){
    const skin={color:kind.floor,material:'oak'},before=copy(skin);
    const resolved=resolveHomeFloorFinish(kind,skin,{themeId:'warm'});
    assert.equal(resolved.id,DEFAULT_ROOM_FLOOR_FINISHES[kind.baseKind]);assert.equal(resolved.source,'default');assert.equal(resolved.color,getFloorFinish(resolved.id).color);
    for(const themeId of ['default','toy','unknown'])assert.equal(resolveHomeFloorFinish(kind,skin,{themeId}),null);
    assert.deepEqual(skin,before);
  }
  const original=getDefaultFloorAppearance(),resolved=resolveHomeFloorFinish('living',original,{themeId:'warm',legacyDefault:getDefaultFloorAppearance()});
  assert.equal(resolved.id,'wood-light-oak');original.color='#123456';assert.notEqual(getDefaultFloorAppearance().color,original.color,'legacy default caller receives a copy');
});

test('custom legacy oak and ceramic colors keep their chosen color and use bounded fallback patterns',()=>{
  const custom={color:'#345678',material:'oak'};
  let result=resolveHomeFloorFinish('kitchen',custom,{themeId:'warm'});assert.equal(result.id,'wood-light-oak');assert.equal(result.pattern,'wide');assert.equal(result.color,custom.color);assert.equal(result.source,'legacy-custom');
  result=resolveHomeFloorFinish('bedroom',{...custom,material:'ceramic'},{themeId:'warm'});assert.equal(result.id,'tile-stone');assert.equal(result.pattern,'tile');assert.equal(result.color,custom.color);
  assert.equal(resolveHomeFloorFinish('living',{...custom,material:'gold'},{themeId:'warm'}),null);
  assert.equal(resolveHomeFloorFinish('missing',custom,{themeId:'warm'}),null);
  assert.equal(resolveHomeFloorFinish('living',null,{themeId:'warm'}),null);
  assert.equal(resolveHomeFloorFinish('living',{...custom,finishId:'invalid'},{themeId:'warm'}),null);
});

test('explicit finishes use the selected catalogue tint over legacy paint only in warm',()=>{
  const normal=getDefaultFloorAppearance(),options={themeId:'warm',legacyDefault:normal};
  for(const row of FLOOR_FINISHES){
    const plain={...normal,finishId:row.id},custom={...plain,color:'#123456'};
    assert.equal(resolveHomeFloorFinish('living',plain,options).color,row.color);
    assert.equal(resolveHomeFloorFinish('living',custom,options).color,row.color);assert.equal(custom.color,'#123456','explicit display selection does not erase earlier saved paint');
    assert.equal(resolveHomeFloorFinish('living',plain,{themeId:'toy',legacyDefault:normal}),null);
  }
});

test('only floor skins accept a known optional finishId; old states remain valid and untouched',()=>{
  const home=roomHome(),before=copy(home);assert.equal(validateHomeState(home),true);
  const floor=copy(home);floor.surfaces['floor.main'].finishId='wood-walnut';floor.rooms[1].floor.finishId='tile-sand';assert.equal(validateHomeState(floor),true);
  for(const target of ['wall.inner','wall.outer','wall.side','table.top','rug.main']){const invalid=copy(home);invalid.surfaces[target].finishId='wood-walnut';assert.equal(validateHomeState(invalid),false,target);}
  for(const value of [null,undefined,'invalid','__proto__',{},4]){const invalid=copy(home);invalid.rooms[1].floor.finishId=value;assert.equal(validateHomeState(invalid),false);}
  const wall=copy(home);wall.rooms[1].wall.finishId='tile-sand';assert.equal(validateHomeState(wall),false);
  const living=copy(home);living.rooms[0].floor={color:'#123456',material:'oak',finishId:'wood-walnut'};assert.equal(validateHomeState(living),false,'starter living finish belongs to floor.main');
  assert.deepEqual(home,before);
});

test('finish changes are free immutable floor-only operations; null clears without changing legacy fields',()=>{
  const home=roomHome();home.sandbox=false;home.paint=0;const before=copy(home);
  for(const surfaceId of ['floor.main','room:sleep.floor']){
    const result=applyChange(home,command(surfaceId,'wood-herringbone-oak'));assert.equal(result.ok,true,result.error);assert.equal(result.cost,0);assert.equal(result.state.paint,0);assert.equal(result.state.revision,home.revision+1);
    const target=surfaceId==='floor.main'?result.state.surfaces[surfaceId]:result.state.rooms[1].floor;
    const original=surfaceId==='floor.main'?home.surfaces[surfaceId]:home.rooms[1].floor;
    assert.deepEqual(target,{...original,finishId:'wood-herringbone-oak'});assert.equal(validateHomeState(result.state),true);
    const again=applyChange(result.state,command(surfaceId,'wood-herringbone-oak'));assert.equal(again.ok,true);assert.equal(again.changed,false);assert.equal(again.state,result.state);
    const clear=applyChange(result.state,command(surfaceId,null));assert.equal(clear.ok,true);assert.equal(clear.cost,0);assert.equal(clear.state.revision,result.state.revision+1);
    assert.deepEqual(surfaceId==='floor.main'?clear.state.surfaces[surfaceId]:clear.state.rooms[1].floor,original);
  }
  assert.deepEqual(home,before);
});

test('malformed finish writes cannot reach walls, unknown rooms, furniture or client pricing fields',()=>{
  const home=roomHome(),before=copy(home);
  for(const surfaceId of ['room:sleep.wall','room:living.floor','room:missing.floor','wall.inner','table.top','furniture:missing',''])assert.equal(applyChange(home,command(surfaceId,'wood-walnut')).ok,false,surfaceId);
  for(const change of [command('floor.main','invalid'),{type:'setFloorFinish',surfaceId:'floor.main'},{...command('floor.main','wood-walnut'),price:0},command('floor.main',{}),command('floor.main',undefined)])assert.equal(applyChange(home,change).ok,false);
  assert.deepEqual(home,before);
});
