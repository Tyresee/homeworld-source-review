import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {ROBOT_CLOTHING_PRODUCTS} from '../public/js/robot-wardrobe-catalog.js';
const source=await readFile(new URL('../public/js/student-home-wardrobe.js',import.meta.url),'utf8');
function fixture(){
  let document;
  class Element{
    constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.events={};this.className='';this.disabled=false;this._text='';}
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}set textContent(v){this._text=String(v);this.children=[];}
    setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}
    append(...children){for(const c of children){c.parent=this;this.children.push(c);}}replaceChildren(...children){this.children=[];this.append(...children);}
    addEventListener(k,fn){this.events[k]=fn;}contains(node){return this===node||this.children.some(c=>c.contains(node));}
    querySelectorAll(sel){return this.children.flatMap(c=>[c,...c.querySelectorAll('*')]).filter(c=>sel==='*'||sel==='[aria-label]'?'*'===sel||'aria-label'in c.attributes:sel.startsWith('.')?c.className.split(' ').includes(sel.slice(1)):c.tagName===sel);}
    querySelector(sel){return this.querySelectorAll(sel)[0]??null;}focus(){document.activeElement=this;}
    get isConnected(){return this===document.body||this.parent?.isConnected;}showModal(){this.open=true;}close(){if(this.open){this.open=false;this.events.close?.();}}remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  }
  document={body:new Element('body'),createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
  const outfit=ROBOT_CLOTHING_PRODUCTS.find(p=>p.slot==='outfit'),hat=ROBOT_CLOTHING_PRODUCTS.find(p=>p.slot==='headwear');
  const state={owned:[{skuId:outfit.skuId}],avatar:{equipped:{outfit:null,headwear:null,footwear:null}},cart:[]},requests=[],thumbs=[];let shops=0;
  const context={document,ROBOT_CLOTHING_PRODUCTS};runInNewContext(source.replace(/^import[^\n]+\n/gm,'').replace('export function createStudentHomeWardrobe','function createStudentHomeWardrobe')+'\nglobalThis.create=createStudentHomeWardrobe;',context);
  const wardrobe=context.create({getState:()=>state,getColors:()=>({shell:'#123456'}),getThumbnail:p=>{thumbs.push(JSON.parse(JSON.stringify(p)));return 'fixture-image';},onEquip:(sku,slot)=>new Promise(resolve=>requests.push({sku,slot,reply(ok){if(ok)state.avatar.equipped[slot]=sku;resolve(ok?{ok:true}:{ok:false,error:"DisplayText4635"});}})),onAddToCart:sku=>{state.cart.push({skuId:sku,quantity:1});return {ok:true};},onShop:()=>shops++});
  const dialog=document.body.querySelector('dialog');const click=label=>{const b=dialog.querySelectorAll('button').find(b=>b.getAttribute('aria-label')===label||b.textContent===label);assert.ok(b,`Missing button ${label}`);if(!b.disabled)return b.events.click();};
  return {wardrobe,dialog,click,state,outfit,hat,requests,thumbs,shops:()=>shops};
}
const flush=()=>new Promise(done=>setImmediate(done));
test('owned clothes wait for server acknowledgement, block repeat clicks and preserve equipment on rejection',async()=>{
  const f=fixture();f.wardrobe.open();f.click(`DisplayText3316${f.outfit.name}`);f.click(`DisplayText3316${f.outfit.name}`);assert.equal(f.requests.length,1);assert.equal(f.state.avatar.equipped.outfit,null);
  f.requests[0].reply(false);await flush();assert.match(f.dialog.textContent,/DisplayText4635/);assert.equal(f.state.avatar.equipped.outfit,null);
  f.click(`DisplayText3316${f.outfit.name}`);f.requests[1].reply(true);await flush();assert.equal(f.state.avatar.equipped.outfit,f.outfit.skuId);assert.match(f.dialog.textContent,/DisplayText4169/);
  f.click("DisplayText4636");assert.equal(f.requests[2].sku,null);assert.equal(f.requests[2].slot,'outfit');f.requests[2].reply(true);await flush();assert.equal(f.state.avatar.equipped.outfit,null);
});
test('unowned trial changes only preview and adds to the existing cart; closing never equips or pays',()=>{
  const f=fixture();f.wardrobe.open({previewSku:f.hat.skuId});assert.ok(f.thumbs.some(p=>p.equipped.headwear===f.hat.skuId));assert.equal(f.state.avatar.equipped.headwear,null);
  f.click(`DisplayText3308 · ${f.hat.price.toLocaleString('en')} DisplayText0920`);assert.equal(f.state.cart[0].skuId,f.hat.skuId);assert.equal(f.requests.length,0);f.click("DisplayText4186");assert.equal(f.shops(),1);assert.equal(f.dialog.open,false);assert.equal(f.state.avatar.equipped.headwear,null);
});
test('late equip response cannot reopen a closed wardrobe and slot controls exclude unowned SKUs',async()=>{
  const f=fixture();f.wardrobe.open();assert.equal(f.dialog.querySelectorAll('.robot-wardrobe-choice').length,2);f.click(`DisplayText3316${f.outfit.name}`);f.wardrobe.close();f.requests[0].reply(true);await flush();assert.equal(f.dialog.open,false);f.wardrobe.open();f.click("DisplayText4637");assert.equal(f.dialog.querySelectorAll('.robot-wardrobe-choice').length,1);assert.equal(f.dialog.querySelector('.robot-wardrobe-close').textContent,'');
});
