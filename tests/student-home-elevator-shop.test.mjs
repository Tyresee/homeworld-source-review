import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomeShop} from '../public/js/home-shop-ui.js';
import {ELEVATOR_UPGRADE_PRODUCT} from '../public/js/home-elevator-products.js';

/** Minimal tree/event implementation for running the real shop renderer. This
 * intentionally does not replace createHomeShop or inspect its source text. */
function documentForShop(){
  const attributeKey=name=>name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
  const document={activeElement:null};
  class Node {
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.dataset={};this.attributes=new Map();this.events=new Map();this.className='';this._text='';this.open=false;this.scrollTop=0;this.scrollLeft=0;
      const change=(name,enabled)=>{const rows=new Set(this.className.split(/\s+/).filter(Boolean));enabled?rows.add(name):rows.delete(name);this.className=[...rows].join(' ');};
      this.classList={contains:name=>this.className.split(/\s+/).includes(name),add:name=>change(name,true),remove:name=>change(name,false),
        toggle:(name,force)=>{const enabled=force===undefined?!this.classList.contains(name):!!force;change(name,enabled);return enabled;}};
    }
    get isConnected(){return this===document.body||!!this.parentNode?.isConnected;}
    get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
    set textContent(value){this.replaceChildren();this._text=String(value);}
    append(...nodes){for(const value of nodes){const node=typeof value==='string'?Object.assign(new Node('#text'),{_text:value}):value;if(node.tagName==='#FRAGMENT'){this.append(...node.children.slice());continue;}node.remove();node.parentNode=this;this.children.push(node);}}
    prepend(...nodes){const previous=this.children.slice();this.replaceChildren(...nodes,...previous);}
    replaceChildren(...nodes){for(const node of this.children)node.parentNode=null;this.children=[];this._text='';this.append(...nodes);}
    remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}}
    replaceWith(node){const parent=this.parentNode;if(!parent)return;const index=parent.children.indexOf(this);node.remove();parent.children[index]=node;node.parentNode=parent;this.parentNode=null;}
    contains(node){return node===this||this.children.some(child=>child.contains(node));}
    setAttribute(name,value){if(name.startsWith('data-'))this.dataset[attributeKey(name)]=String(value);else this.attributes.set(name,String(value));}
    getAttribute(name){return name.startsWith('data-')?this.dataset[attributeKey(name)]??null:this.attributes.get(name)??null;}
    hasAttribute(name){return this.getAttribute(name)!==null;}
    matches(selector){
      if(selector.startsWith('.'))return selector.slice(1).split('.').every(name=>this.classList.contains(name));
      if(selector.startsWith('#'))return this.id===selector.slice(1);
      if(selector.startsWith('[')){const match=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);return !!match&&this.hasAttribute(match[1])&&(match[2]===undefined||this.getAttribute(match[1])===match[2]);}
      return this.tagName===selector.toUpperCase();
    }
    querySelectorAll(selector){
      const selectors=selector.split(',').map(value=>value.trim().split(/\s+/));
      const matches=node=>selectors.some(parts=>{if(!node.matches(parts.at(-1)))return false;let parent=node.parentNode;for(let index=parts.length-2;index>=0;index--){while(parent&&!parent.matches(parts[index]))parent=parent.parentNode;if(!parent)return false;parent=parent.parentNode;}return true;});
      const result=[];const visit=parent=>{for(const child of parent.children){if(matches(child))result.push(child);visit(child);}};visit(this);return result;
    }
    querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
    addEventListener(type,callback){const rows=this.events.get(type)??[];rows.push(callback);this.events.set(type,rows);}
    dispatch(type){const event={type,target:this,preventDefault(){}};for(const callback of this.events.get(type)??[])callback(event);}
    click(){if(!this.disabled)this.dispatch('click');}
    focus(){if(this.isConnected)document.activeElement=this;}
    showModal(){this.open=true;}
    close(){this.open=false;this.dispatch('close');}
  }
  document.body=new Node('body');document.activeElement=document.body;
  document.createElement=tag=>new Node(tag);document.createElementNS=(_,tag)=>new Node(tag);document.createDocumentFragment=()=>new Node('#fragment');
  return document;
}
function fixture(t,options={}){
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),document=documentForShop();
  Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:document});
  const state={wallet:{balance:150000},cart:[],owned:[],orders:[],areaLedger:[],constructionLedger:[],...options.state};
  const shop=createHomeShop({catalog:[],getState:()=>state,onCartChange:()=>({ok:true}),onCheckout:()=>({ok:true}),onPlace:()=>({ok:true}),accountMode:true,...options});
  const dialog=document.body.querySelector('dialog');
  t.after(()=>{shop.dispose();if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
  return {shop,dialog,document,state};
}

test('real room department renders a 12,000-point elevator service and closes before choosing an existing link',t=>{
  const events=[];let f;
  f=fixture(t,{onChooseElevator:()=>events.push({event:'choose',open:f.dialog.open}),onPlanConstruction:()=>events.push({event:'construction'})});
  f.shop.open('rooms');assert.equal(f.dialog.open,true);
  const service=f.dialog.querySelector(`[data-shop-service="${ELEVATOR_UPGRADE_PRODUCT.skuId}"]`);assert.ok(service);
  assert.match(service.textContent,/DisplayText0747/);assert.match(service.textContent,/12,000 DisplayText0920/);assert.match(service.textContent,/DisplayText0752/);
  const choose=service.querySelector('button');assert.equal(choose.textContent,"DisplayText3295");
  choose.click();assert.equal(f.dialog.open,false);assert.deepEqual(events,[{event:'choose',open:false}]);
  assert.deepEqual(f.state.cart,[],'installation service never adds an inventory cart line');
  f.shop.open('shop');assert.equal(f.dialog.querySelector(`[data-shop-service="${ELEVATOR_UPGRADE_PRODUCT.skuId}"]`),null,'the special service belongs to rooms and floors');
});
test('demo without an elevator callback retains normal room construction and never offers a dead service',t=>{
  let constructions=0;const f=fixture(t,{accountMode:false,onPlanConstruction:()=>constructions++});f.shop.open('rooms');
  assert.equal(f.dialog.querySelector(`[data-shop-service="${ELEVATOR_UPGRADE_PRODUCT.skuId}"]`),null);
  const build=f.dialog.querySelector('.home-shop-build-entry');assert.ok(build);assert.match(build.textContent,/DisplayText3284/);
  build.querySelector('button').click();assert.equal(constructions,1);assert.equal(f.dialog.open,false);
});
test('real purchase-history renderer distinguishes a paid elevator from ordinary floor area',t=>{
  const f=fixture(t,{state:{constructionLedger:[
    {id:'isolated-floor',transactionId:'isolated-construction',storey:1,addedArea:14.56,stairCost:6000,total:10368},
    {type:'elevator-upgrade',id:'isolated-elevator',transactionId:'isolated-lift',lowerStorey:0,upperStorey:1,stairId:'stairs-1-2',skuId:ELEVATOR_UPGRADE_PRODUCT.skuId,unitPrice:12000,total:12000},
  ]}});
  f.shop.open('orders');const records=f.dialog.querySelectorAll('.home-shop-order');assert.equal(records.length,2);
  assert.match(records[0].textContent,/1 ↔ 2 DisplayText0931 · DisplayText0747/);assert.match(records[0].textContent,/DisplayText3484 12,000 DisplayText0920/);
  assert.doesNotMatch(records[0].textContent,/NaN|DisplayText3485|DisplayText0949 0|sqm/);
  assert.match(records[1].textContent,/2 DisplayText0931 · DisplayText3485/);assert.match(records[1].textContent,/DisplayText0949 14.56 sqm/);
  assert.match(records[1].textContent,/DisplayText3486 6,000 DisplayText0920/);assert.match(records[1].textContent,/DisplayText3484 10,368 DisplayText0920/);
});
