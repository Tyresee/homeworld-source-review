import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {zipFiles} from '../scripts/qa/look-dev-zip.mjs';
import {HOME_THEMES} from '../public/js/home-theme.js';
import {assertSafePresetKeys,MAX_LOOK_DEV_PRESET_BYTES} from '../scripts/qa/look-dev-preset-safety.mjs';

const preset=async id=>JSON.parse(await readFile(new URL('../scripts/qa/look-dev-presets/'+id+'.json',import.meta.url),'utf8'));
test('look-development default keeps original per-part colors and sun direction inherited',async()=>{
  const value=await preset('default');
  assert.equal(value.schemaVersion,1);assert.equal(value.render.toneMapping,'aces');assert.equal(value.render.exposure,1.1);
  assert.deepEqual(value.build.theme.surfaceRemap,{});
  assert.ok(Object.values(value.build.theme.shell).every(color=>color===null));
  for(const kind of Object.values(value.build.theme.rooms)){
    assert.deepEqual(kind,{floor:null,wall:null,trim:null,floorMaterial:null,wallMaterial:null});
  }
  assert.equal(value.render.sun.azimuth,null);assert.equal(value.render.sun.altitude,null);
  assert.deepEqual(value.build.furniture,{mode:'default',examples:{}});
});
test('toy-v1 starts with the exact existing toy colors and lights, without inventing material changes',async()=>{
  const value=await preset('toy-v1'),theme=value.build.theme;
  for(const[id,room]of Object.entries(HOME_THEMES.toy.rooms)){
    assert.equal(theme.rooms[id].floor,room.floor);assert.equal(theme.rooms[id].wall,room.wall);assert.equal(theme.rooms[id].trim,room.trim);
    assert.equal(theme.rooms[id].floorMaterial,null);assert.equal(theme.rooms[id].wallMaterial,null);
  }
  assert.deepEqual(theme.shell,HOME_THEMES.toy.shell);
  for(const key of ['hemisphere','fill'])assert.deepEqual(value.render[key],HOME_THEMES.toy.lighting.editor[key]);
  assert.equal(value.render.sun.color,HOME_THEMES.toy.lighting.editor.sun.color);
  assert.equal(value.render.sun.intensity,HOME_THEMES.toy.lighting.editor.sun.intensity);
  assert.equal(value.render.exposure,1);assert.deepEqual(value.build.furniture,{mode:'default',examples:{}});
});
test('a single archive contains every named view with valid ZIP headers, byte payloads and central-directory offsets',async()=>{
  const views=['living','bedroom','kitchen','bathroom','exterior'],encoder=new TextEncoder();
  const files=views.map(view=>({name:'toy-v1--'+view+'.png',bytes:encoder.encode('123456789')}));
  const bytes=new Uint8Array(await zipFiles(files).arrayBuffer()),data=new DataView(bytes.buffer),decoder=new TextDecoder();
  let offset=0;const offsets=[];
  for(const file of files){
    offsets.push(offset);assert.equal(data.getUint32(offset,true),0x04034b50);
    assert.equal(data.getUint16(offset+6,true),0x800);assert.equal(data.getUint16(offset+8,true),0);
    assert.equal(data.getUint32(offset+14,true),0xcbf43926,'known CRC32 test vector');
    assert.equal(data.getUint32(offset+18,true),file.bytes.length);assert.equal(data.getUint32(offset+22,true),file.bytes.length);
    const nameLength=data.getUint16(offset+26,true);assert.equal(decoder.decode(bytes.subarray(offset+30,offset+30+nameLength)),file.name);
    assert.deepEqual(bytes.subarray(offset+30+nameLength,offset+30+nameLength+file.bytes.length),file.bytes);
    offset+=30+nameLength+file.bytes.length;
  }
  const centralOffset=offset;
  files.forEach((file,index)=>{assert.equal(data.getUint32(offset,true),0x02014b50);assert.equal(data.getUint32(offset+42,true),offsets[index]);const length=data.getUint16(offset+28,true);assert.equal(decoder.decode(bytes.subarray(offset+46,offset+46+length)),file.name);offset+=46+length;});
  assert.equal(data.getUint32(offset,true),0x06054b50);assert.equal(data.getUint16(offset+8,true),5);assert.equal(data.getUint16(offset+10,true),5);assert.equal(data.getUint32(offset+16,true),centralOffset);assert.equal(offset+22,bytes.length);
});

test('look-development rejects unsafe preset keys at any nesting depth before editable overlays',()=>{
  assert.equal(MAX_LOOK_DEV_PRESET_BYTES,1024*1024);
  for(const key of ['__proto__','constructor','prototype']){
    const value=JSON.parse('{"build":{"theme":{"rooms":[{"'+key+'":{"polluted":true}}]}}}');
    assert.throws(()=>assertSafePresetKeys(value),/Unsafe preset key/);
  }
  assert.doesNotThrow(()=>assertSafePresetKeys({build:{theme:{rooms:{living:{wall:'#123456',floorMaterial:null}}}}}));
  assert.equal({}.polluted,undefined);
});
