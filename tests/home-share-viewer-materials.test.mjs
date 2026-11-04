import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createHomeMaterialMaps} from '../public/js/home-material-maps.js';

// Captured by executing the original home-scene.js paint code at19506df before
// extraction. These fingerprints include every draw call and style assignment,
// not copied sample pixels or a separate approximate furniture texture.
const golden={
  oak:'774faed8d617467259a792f8d798d1a3ad8e58a7c5f5099f17c00869e9f19ae2',stone:'99e977eb332edf45da9d6b433d31a528dd98f2f161f494140394e1231429c369',ceramic:'63937bb72216b065897c5d28498cf188d1bdfb3e18b046ca61a6ffe2d71ca737',
  walnut:'774faed8d617467259a792f8d798d1a3ad8e58a7c5f5099f17c00869e9f19ae2',marble:'99e977eb332edf45da9d6b433d31a528dd98f2f161f494140394e1231429c369',wool:'2ea9c81673bfb1f77747e7766f8618aec1f2a16f4793720edcedd5dbf7ec8fdc',linen:'32369365ff71bd98b4ad0b2e34806a5c12dfcd2ce627446cbc2baf427c175909',velvet:'0890f37c6814a565dd441f95332c63cadf86e409ef17060b66ec49a1c2b52362',
  'sofa-cotton':'9a52599367cb8f321785e7d3f9ebf6cb47a349ea95dd8e4d23b6d0aefbc75904','sofa-linen':'b31b6c52bf3b7ff51617d3a230d8cd7c1eb2dcdb38b2c383045eaa5beeaaa3d7','sofa-velvet':'b354256cecfb00d58a438e2a30d33f01193be3ff2fdc80e7ef7d66bc48778ef4',
};
function canvas(){const calls=[];let gradient=0;const ctx=new Proxy({},{set(t,k,v){calls.push(['set',k,v]);t[k]=v;return true;},get(t,k){if(k in t)return t[k];if(k==='createLinearGradient')return(...args)=>{const id=++gradient;calls.push([k,id,...args]);return{gradient:id,addColorStop(...value){calls.push(['stop',id,...value]);}};};return(...args)=>calls.push([k,...args]);}});return{width:0,height:0,calls,getContext:()=>ctx};}

test('shared material maps retain all eleven original classroom paint fingerprints, size and color-space contracts',()=>{
  const previous=globalThis.document;globalThis.document={createElement:canvas};let library;
  try{
    library=createHomeMaterialMaps();assert.deepEqual(Object.keys(library.maps),Object.keys(golden));assert.equal(library.textures.length,11);assert.equal(new Set(library.textures).size,11);
    for(const[key,texture]of Object.entries(library.maps)){
      assert.equal(createHash('sha256').update(JSON.stringify(texture.image.calls)).digest('hex'),golden[key],key+' changed the existing classroom texture');assert.equal(texture.image.width,key.startsWith('sofa-')?512:256);assert.equal(texture.image.height,texture.image.width);assert.equal(texture.colorSpace,THREE.SRGBColorSpace);assert.equal(texture.wrapS,THREE.RepeatWrapping);assert.equal(texture.wrapT,THREE.RepeatWrapping);
    }
    const retired=new Map(library.textures.map(value=>[value,0]));for(const texture of library.textures)texture.addEventListener('dispose',()=>retired.set(texture,retired.get(texture)+1));library.dispose();library.dispose();assert.ok([...retired.values()].every(count=>count===1));
  }finally{library?.dispose();globalThis.document=previous;}
});

test('separate share and classroom map owners release independently without disposing borrowed textures',()=>{
  const previous=globalThis.document;globalThis.document={createElement:canvas};let a,b;
  try{a=createHomeMaterialMaps();b=createHomeMaterialMaps();let disposed=0;b.maps.oak.addEventListener('dispose',()=>disposed++);assert.notEqual(a.maps.oak,b.maps.oak);a.dispose();assert.equal(disposed,0);b.dispose();assert.equal(disposed,1);}finally{a?.dispose();b?.dispose();globalThis.document=previous;}
});
