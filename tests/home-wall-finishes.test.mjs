import test from 'node:test';
import assert from 'node:assert/strict';
import {WALL_STYLES,WALL_COLORS,WALL_STYLE_IDS,WALL_COLOR_IDS,STARTER_WALL_SURFACE_IDS,getWallStyle,getWallColor,isWallStyleId,isWallColorId,resolveHomeWallFinish} from '../public/js/home-wall-finishes.js';
import {SURFACES,createHomeState,validateHomeState,migrateHomeState,applyChange,getDefaultWallAppearance} from '../public/js/home-engine.js';
import {ROOM_KINDS,createRoom} from '../public/js/home-layout.js';

const copy=value=>structuredClone(value);
const style=(surfaceId='wall.inner',styleId='wall-stripe-fine')=>({type:'setWallFinish',surfaceId,styleId});
const color=(surfaceId='wall.inner',colorId='wall-mist-blue')=>({type:'setWallFinish',surfaceId,colorId});
const roomHome=()=>createHomeState({rooms:[createRoom('living'),createRoom('bedroom',1,-1,'sleep')]});

test('wall catalogs contain only the three styles and five independent colors',()=>{
  assert.deepEqual(WALL_STYLE_IDS,['wall-plain','wall-stripe-fine','wall-dots']);
  assert.deepEqual(WALL_STYLES.map(row=>row.label),["DisplayText4702","DisplayText4703","DisplayText4704"]);
  assert.deepEqual(WALL_STYLES.map(row=>row.pattern),['plain','stripe-fine','dots']);
  assert.deepEqual(WALL_COLORS.map(row=>[row.id,row.color]),[['wall-warm-white','#f4efe6'],['wall-apricot','#f1d9cc'],['wall-mist-blue','#d4dfe7'],['wall-lavender','#e1dbe8'],['wall-slate-blue','#a8b8c4']]);
  assert.equal(WALL_COLOR_IDS.length,5);
  assert.deepEqual(WALL_COLORS.map(row=>row.label),["DisplayText4705","DisplayText4706","DisplayText4693","DisplayText4707","DisplayText4708"]);
  for(const row of WALL_STYLES){assert.equal(getWallStyle(row.id),row);assert.equal(isWallStyleId(row.id),true);assert.ok(Object.isFrozen(row));assert.equal('price' in row,false);}
  for(const row of WALL_COLORS){assert.equal(getWallColor(row.id),row);assert.equal(isWallColorId(row.id),true);assert.ok(Object.isFrozen(row));assert.equal('price' in row,false);}
  for(const value of [null,undefined,'','wall-fake','__proto__',{},4]){assert.equal(getWallStyle(value),null);assert.equal(getWallColor(value),null);assert.equal(isWallStyleId(value),false);assert.equal(isWallColorId(value),false);}
});

test('legacy room and starter defaults resolve plain warm-white only in warm without rewriting state',()=>{
  for(const kind of ROOM_KINDS){
    const skin={color:kind.wall,material:'ceramic'},before=copy(skin),resolved=resolveHomeWallFinish(kind,skin,{themeId:'warm'});
    assert.equal(resolved.styleId,'wall-plain');assert.equal(resolved.pattern,'plain');assert.equal(resolved.colorId,'wall-warm-white');assert.equal(resolved.color,'#f4efe6');assert.equal(resolved.colorSource,'default');
    for(const themeId of ['default','toy','unknown'])assert.equal(resolveHomeWallFinish(kind,skin,{themeId}),null);
    assert.deepEqual(skin,before);
  }
  for(const id of STARTER_WALL_SURFACE_IDS){
    const skin=getDefaultWallAppearance(id),resolved=resolveHomeWallFinish('living',skin,{themeId:'warm',legacyDefault:getDefaultWallAppearance(id)});
    assert.equal(resolved.color,'#f4efe6');skin.color='#123456';assert.notEqual(getDefaultWallAppearance(id).color,skin.color);
  }
  assert.equal(getDefaultWallAppearance('table.top'),null);
  const home=roomHome(),before=copy(home);assert.deepEqual(migrateHomeState(home),before);assert.deepEqual(home,before);
});

test('style-only selection preserves old custom paint; explicit color overrides display without erasing raw fields',()=>{
  const original={color:'#123456',material:'velvet'},before=copy(original);
  const plain=resolveHomeWallFinish('bedroom',original,{themeId:'warm'});
  assert.equal(plain.styleId,'wall-plain');assert.equal(plain.colorId,null);assert.equal(plain.color,original.color);assert.equal(plain.source,'legacy-custom');
  for(const row of WALL_STYLES){const resolved=resolveHomeWallFinish('bedroom',{...original,styleId:row.id},{themeId:'warm'});assert.equal(resolved.pattern,row.pattern);assert.equal(resolved.color,original.color);assert.equal(resolved.styleSource,'explicit');}
  for(const row of WALL_COLORS){const skin={...original,styleId:'wall-dots',colorId:row.id},resolved=resolveHomeWallFinish('bedroom',skin,{themeId:'warm'});assert.equal(resolved.color,row.color);assert.equal(resolved.pattern,'dots');assert.equal(resolved.colorSource,'explicit');assert.equal(skin.color,original.color);}
  for(const themeId of ['default','toy'])assert.equal(resolveHomeWallFinish('bedroom',{...original,styleId:'wall-dots',colorId:'wall-apricot'},{themeId}),null);
  const kind=ROOM_KINDS.find(row=>row.id==='bedroom');assert.equal(resolveHomeWallFinish(kind,{color:kind.wall.toUpperCase(),material:'gold'},{themeId:'warm'}).color,'#f4efe6','old unpainted color matching is case-insensitive and independent of old material');
  for(const skin of [null,{color:'invalid',material:'ceramic'},{...original,styleId:'unknown'},{...original,colorId:'unknown'}])assert.equal(resolveHomeWallFinish('bedroom',skin,{themeId:'warm'}),null);
  assert.equal(resolveHomeWallFinish('missing',original,{themeId:'warm'}),null);assert.deepEqual(original,before);
});

test('wall identifiers are optional and accepted only on wall skins',()=>{
  const home=roomHome(),before=copy(home),valid=copy(home);
  for(const id of STARTER_WALL_SURFACE_IDS){valid.surfaces[id].styleId='wall-dots';valid.surfaces[id].colorId='wall-apricot';}
  valid.rooms[1].wall.styleId='wall-stripe-fine';valid.rooms[1].wall.colorId='wall-lavender';assert.equal(validateHomeState(valid),true);
  for(const field of ['styleId','colorId']){
    for(const bad of [null,undefined,'unknown','__proto__',{},4]){const invalid=copy(home);invalid.rooms[1].wall[field]=bad;assert.equal(validateHomeState(invalid),false);}
    for(const target of ['floor.main','table.top','rug.main','window.frame']){const invalid=copy(home);invalid.surfaces[target][field]=field==='styleId'?'wall-dots':'wall-apricot';assert.equal(validateHomeState(invalid),false,target);}
    const floor=copy(home);floor.rooms[1].floor[field]=field==='styleId'?'wall-dots':'wall-apricot';assert.equal(validateHomeState(floor),false);
    const furnished=applyChange(createHomeState(),{type:'furniture',id:'wall-fixture-rug',kind:'rug'});assert.equal(furnished.ok,true);furnished.state.furniture[0][field]=field==='styleId'?'wall-dots':'wall-apricot';assert.equal(validateHomeState(furnished.state),false);
  }
  assert.deepEqual(home,before);
});

test('historical v1/v2 schema boundaries reject new identifiers instead of silently accepting or erasing metadata',()=>{
  const home=createHomeState(),v2={...copy(home),version:2,roomTier:'starter'};delete v2.rooms;
  const v1={version:1,paint:home.paint,surfaces:Object.fromEntries(SURFACES.slice(0,5).map(({id})=>[id,copy(home.surfaces[id])])),decals:[],props:[],table:copy(home.table),revision:0};
  for(const legacy of [v1,v2]){
    const before=copy(legacy),migrated=migrateHomeState(legacy);assert.equal(validateHomeState(migrated),true);assert.deepEqual(legacy,before);
    for(const [field,value] of [['styleId','wall-dots'],['colorId','wall-apricot']]){const invalid=copy(legacy);invalid.surfaces['wall.inner'][field]=value;const original=copy(invalid);assert.equal(migrateHomeState(invalid),null);assert.deepEqual(invalid,original);}
  }
});

test('starter wall actions synchronize only the selected field across all three skins, free and immutable',()=>{
  for(const surfaceId of STARTER_WALL_SURFACE_IDS){
    const home=roomHome();home.sandbox=false;home.paint=0;home.surfaces['wall.side'].color='#123456';const before=copy(home);
    const first=applyChange(home,color(surfaceId));assert.equal(first.ok,true,first.error);assert.equal(first.cost,0);assert.equal(first.state.paint,0);assert.equal(first.state.revision,home.revision+1);
    for(const id of STARTER_WALL_SURFACE_IDS)assert.deepEqual(first.state.surfaces[id],{...home.surfaces[id],colorId:'wall-mist-blue'});
    const second=applyChange(first.state,style(surfaceId));assert.equal(second.ok,true,second.error);assert.equal(second.cost,0);
    for(const id of STARTER_WALL_SURFACE_IDS)assert.deepEqual(second.state.surfaces[id],{...home.surfaces[id],colorId:'wall-mist-blue',styleId:'wall-stripe-fine'});
    assert.deepEqual(second.state.rooms,home.rooms);assert.deepEqual(second.state.surfaces['floor.main'],home.surfaces['floor.main']);assert.equal(validateHomeState(second.state),true);
    const repeated=applyChange(second.state,style(surfaceId));assert.equal(repeated.changed,false);assert.equal(repeated.state,second.state);
    const recolor=applyChange(second.state,color(surfaceId,'wall-apricot'));for(const id of STARTER_WALL_SURFACE_IDS)assert.equal(recolor.state.surfaces[id].styleId,'wall-stripe-fine');
    assert.deepEqual(home,before);
  }
});

test('style-only writes retain each starter legacy color and repair an unsynchronized ID without losing the other ID',()=>{
  const home=roomHome();home.surfaces['wall.inner'].color='#123456';home.surfaces['wall.side'].color='#654321';
  home.surfaces['wall.inner'].styleId='wall-dots';home.surfaces['wall.inner'].colorId='wall-apricot';
  const result=applyChange(home,style('wall.inner','wall-dots'));assert.equal(result.ok,true);assert.equal(result.changed,true);
  for(const id of STARTER_WALL_SURFACE_IDS){assert.equal(result.state.surfaces[id].color,home.surfaces[id].color);assert.equal(result.state.surfaces[id].styleId,'wall-dots');assert.equal(result.state.surfaces[id].colorId,home.surfaces[id].colorId);}
  const resolved=resolveHomeWallFinish('living',result.state.surfaces['wall.side'],{themeId:'warm',legacyDefault:getDefaultWallAppearance('wall.side')});assert.equal(resolved.color,'#654321');
});

test('room wall choices affect only that room and preserve floor, starter skins and room geometry',()=>{
  const home=roomHome(),before=copy(home);home.rooms[1].wall.color='#123456';
  const first=applyChange(home,style('room:sleep.wall','wall-dots'));assert.equal(first.ok,true,first.error);assert.equal(first.cost,0);
  assert.deepEqual(first.state.rooms[1],{...home.rooms[1],wall:{...home.rooms[1].wall,styleId:'wall-dots'}});
  assert.deepEqual(first.state.surfaces,home.surfaces);
  const second=applyChange(first.state,color('room:sleep.wall','wall-slate-blue'));assert.equal(second.ok,true);assert.equal(second.state.rooms[1].wall.styleId,'wall-dots');assert.equal(second.state.rooms[1].wall.color,'#123456');
  assert.equal(applyChange(second.state,color('room:sleep.wall','wall-slate-blue')).changed,false);assert.equal(validateHomeState(second.state),true);
  assert.deepEqual(home.surfaces,before.surfaces);
});

test('malformed wall writes reject non-walls, both selectors, unknown identifiers and extra fields',()=>{
  const home=roomHome(),before=copy(home);
  for(const id of ['floor.main','room:sleep.floor','room:living.wall','room:missing.wall','table.top','furniture:missing',''])assert.equal(applyChange(home,style(id)).ok,false,id);
  for(const change of [{type:'setWallFinish',surfaceId:'wall.inner'},{...style(),styleId:undefined},style('wall.inner',null),color('wall.inner','unknown'),{...style(),colorId:'wall-apricot'},{...style(),price:0},{...style(),storey:0},{...style(),styleId:{}},color('wall.inner',null)])assert.equal(applyChange(home,change).ok,false);
  assert.deepEqual(home,before);
});
