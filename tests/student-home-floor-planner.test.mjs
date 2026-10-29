import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {getFloorRects,getFloorBounds} from '../public/js/home-layout.js';
import {CONSTRUCTION_GRID_ORIGIN,getUnionArea,rectDifferenceArea,subtractRectangles} from '../public/js/home-construction-grid.js';
import {getPlanOutlineSegments} from '../public/js/home-plan-outline.js';
import {createCommerceState,getFloorHomes,quoteFloorConstruction,purchaseFloorConstruction} from '../public/js/home-commerce.js';

const source=await readFile(new URL('../public/js/home-floor-planner.js',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));

// Execute the real planner and commerce rules. The small DOM only supplies
// elements, event dispatch and grid coordinates; it does not calculate areas.
function fixture(initial=createCommerceState().state) {
  let document,state=initial;
  class Element {
    constructor(tag) {
      this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.events={};
      this.style={};this.className='';this.disabled=false;this.hidden=false;this.value='';this._text='';this.captured=new Set();
      this.classList={contains:name=>this.className.split(/\s+/).includes(name),
        toggle:(name,force)=>{const names=new Set(this.className.split(/\s+/).filter(Boolean));const on=force??!names.has(name);on?names.add(name):names.delete(name);this.className=[...names].join(' ');return on;},
        add:name=>this.classList.toggle(name,true),remove:name=>this.classList.toggle(name,false)};
    }
    get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
    set textContent(value){this._text=String(value);this.children=[];}
    setAttribute(name,value){this.attributes[name]=String(value);if(name==='class')this.className=String(value);}
    getAttribute(name){return this.attributes[name]??null;}
    append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
    prepend(...children){for(const child of children)child.parent=this;this.children.unshift(...children);}
    replaceChildren(...children){this._text='';this.children=[];this.append(...children);}
    addEventListener(name,callback){this.events[name]=callback;}
    querySelectorAll(selector){const selectors=selector.split(',');return this.children.flatMap(child=>[child,...child.querySelectorAll('*')]).filter(child=>selectors.some(s=>s==='*'||(s.startsWith('.')?child.classList.contains(s.slice(1)):child.tagName===s)));}
    querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
    focus(){document.activeElement=this;}
    get isConnected(){return this===document.body||Boolean(this.parent?.isConnected);}
    getBoundingClientRect(){return {left:0,top:0,width:1000,height:700};}
    setPointerCapture(id){this.captured.add(id);}
    hasPointerCapture(id){return this.captured.has(id);}
    releasePointerCapture(id){this.captured.delete(id);}
    showModal(){this.open=true;}
    close(){this.open=false;return this.events.close?.({});}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
  }
  document={body:new Element('body'),createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),activeElement:null};
  const quoteCalls=[],purchaseCalls=[],built=[];
  const context={document,getFloorRects,getFloorBounds,CONSTRUCTION_GRID_ORIGIN,getUnionArea,rectDifferenceArea,subtractRectangles,getPlanOutlineSegments,
    crypto:{randomUUID:()=>`isolated-construction-${purchaseCalls.length+1}`}};
  runInNewContext(source.replace(/^import[^\n]+\n/gm,'').replace('export function createFloorPlanner','function createFloorPlanner')+'\nglobalThis.makePlanner=createFloorPlanner;',context,{filename:'home-floor-planner.js'});
  const planner=context.makePlanner({getFloors:()=>getFloorHomes(state),getBalance:()=>state.wallet.balance,
    quote:selection=>{const request=clone(selection);quoteCalls.push(request);return quoteFloorConstruction(state,request);},
    purchase:async(selection,id)=>{const request=clone(selection);purchaseCalls.push({selection:request,id});const result=purchaseFloorConstruction(state,request,id);if(result.ok)state=result.state;return result;},
    onBuilt:(storey,result)=>built.push({storey,ok:result.ok})});
  const dialog=document.body.querySelector('dialog');
  const button=label=>{const found=dialog.querySelectorAll('button').find(node=>node.textContent===label);assert.ok(found,`Missing button: ${label}`);return found;};
  const emit=(node,type,values={})=>node.events[type]?.({preventDefault(){},detail:0,...values});
  const click=label=>{const node=button(label);assert.equal(node.disabled,false,`${label} is disabled`);return emit(node,'click');};
  const input=label=>dialog.querySelectorAll('input').find(node=>node.getAttribute('aria-label')===label);
  const cell=(x,z)=>dialog.querySelectorAll('.floor-plan-cell').find(node=>Number(node.dataset.cx)===x&&Number(node.dataset.cz)===z);
  const metrics=()=>{const nodes=dialog.querySelector('.floor-plan-metrics').children;return Object.fromEntries(nodes.filter((_,i)=>i%2===0).map((node,i)=>[node.textContent,nodes[i*2+1].textContent]));};
  const coordinates=(x,z)=>{const cells=dialog.querySelectorAll('.floor-plan-cell'),minX=Math.min(...cells.map(node=>Number(node.dataset.cx))),minZ=Math.min(...cells.map(node=>Number(node.dataset.cz)));return {clientX:30+(x-minX+.5)*26,clientY:26+(z-minZ+.5)*26};};
  return {planner,dialog,button,click,cell,metrics,quoteCalls,purchaseCalls,built,state:()=>state,
    quick(width,depth){input("DisplayText0910, DisplayText0650").value=String(width);input("DisplayText0911, DisplayText0650").value=String(depth);return click("DisplayText0913");},
    drag(from,to){const grid=dialog.querySelector('.floor-plan-grid');emit(grid,'pointerdown',{button:0,pointerId:1,...coordinates(...from)});emit(grid,'pointermove',{pointerId:1,...coordinates(...to)});emit(grid,'pointerup',{pointerId:1});},
    keySelect(x,z){return emit(cell(x,z),'click',{detail:0});},
    buy:()=>dialog.querySelector('.floor-plan-purchase'),report:()=>dialog.querySelector('.floor-plan-report').textContent,
  };
}

test('floor planner exposes two selection actions and an accessible SVG close control',()=>{
  const f=fixture();f.planner.open();
  assert.deepEqual(f.dialog.querySelector('.floor-plan-tools').querySelectorAll('button').map(node=>node.textContent),["DisplayText0887","DisplayText0891"]);
  const close=f.dialog.querySelector('.floor-plan-close');assert.equal(close.getAttribute('aria-label'),"DisplayText0880");
  assert.equal(close.textContent,'');assert.equal(close.querySelector('svg').getAttribute('viewBox'),'0 0 24 24');
  assert.equal(close.querySelector('svg').getAttribute('aria-hidden'),'true');
});

test('covering the starter house with a 100 square metre rectangle visibly deducts the 29.12 already built',()=>{
  const f=fixture(),before=clone(f.state());f.planner.open();f.quick(10,10);
  const m=f.metrics();assert.equal(m["DisplayText0956"],"100 sqm");assert.equal(m["DisplayText0957"],"− 29.12 sqm");
  assert.equal(m["DisplayText0958"],"70.88 sqm");assert.equal(m["DisplayText0959"],"100 sqm");assert.equal(m["DisplayText0960"],"21,264 DisplayText0920");
  assert.equal(f.buy().textContent,"DisplayText0970 21,264 DisplayText0971");assert.equal(f.buy().disabled,false);
  assert.match(f.report(),/DisplayText0966 29.12 sqmDisplayText0967, DisplayText0968 70.88 sqm/);
  assert.equal(f.cell(0,0).getAttribute('aria-pressed'),'false','owned floor must not be shown as a paid selection');
  assert.equal(f.cell(9,9).getAttribute('aria-pressed'),'true');assert.deepEqual(f.state(),before,'draft selection must not mutate the house or wallet');
  assert.equal(getUnionArea(f.quoteCalls.at(-1).rects),70.88);
});

test('dragging repeatedly over the same bigger rectangle never accumulates duplicate area or cost',()=>{
  const f=fixture();f.planner.open();f.drag([0,0],[9,9]);const first=f.metrics();
  assert.equal(first["DisplayText0958"],"70.88 sqm");assert.equal(first["DisplayText0960"],"21,264 DisplayText0920");
  f.drag([0,0],[9,9]);assert.deepEqual(f.metrics(),first);
  f.quick(10,10);assert.deepEqual(f.metrics(),first);
  assert.equal(getUnionArea(f.quoteCalls.at(-1).rects),70.88);
});

test('a selection entirely on built floor costs zero and clearing only removes the draft',()=>{
  const f=fixture(),before=clone(f.state());f.planner.open();f.quick(5,5);
  assert.equal(f.metrics()["DisplayText0956"],"25 sqm");assert.equal(f.metrics()["DisplayText0957"],"− 25 sqm");
  assert.equal(f.metrics()["DisplayText0958"],"0 sqm");assert.equal(f.metrics()["DisplayText0960"],"0 DisplayText0920");
  assert.equal(f.metrics()["DisplayText0959"],"29.12 sqm");assert.equal(f.buy().disabled,true);assert.equal(f.quoteCalls.length,0);
  assert.match(f.report(),/DisplayText4584, DisplayText0949 0 sqm, DisplayText0965/);
  f.quick(10,10);f.click("DisplayText0891");
  assert.equal(f.metrics()["DisplayText0956"],"0 sqm");assert.equal(f.metrics()["DisplayText0958"],"0 sqm");assert.equal(f.metrics()["DisplayText0959"],"29.12 sqm");
  assert.equal(f.cell(0,0).classList.contains('is-owned'),true);assert.deepEqual(f.state(),before);assert.equal(f.purchaseCalls.length,0);
});

test('a partially built one-metre boundary cell pays and highlights only its 0.4 square metre remainder',()=>{
  const f=fixture();f.planner.open();f.keySelect(5,0);
  assert.equal(f.metrics()["DisplayText0956"],"1 sqm");assert.equal(f.metrics()["DisplayText0957"],"− 0.6 sqm");
  assert.equal(f.metrics()["DisplayText0958"],"0.4 sqm");assert.equal(f.metrics()["DisplayText0960"],"120 DisplayText0920");
  const rects=f.quoteCalls.at(-1).rects;assert.equal(getUnionArea(rects),.4);
  assert.equal(rectDifferenceArea(rects,getFloorRects(f.state().home)),.4);
  const fills=f.dialog.querySelector('.floor-plan-outline').querySelectorAll('.floor-plan-new-area');
  const fillArea=fills.reduce((area,node)=>area+Number(node.getAttribute('width'))*Number(node.getAttribute('height'))/(26*26),0);
  assert.ok(Math.abs(fillArea-.4)<1e-8,'grid overlay must highlight only the unpaid fragment');
  f.keySelect(5,0);assert.equal(f.metrics()["DisplayText0958"],"0 sqm");assert.equal(f.buy().disabled,true);
});

test('checkout submits only net new rectangles, then reopening the same outline cannot charge again',async()=>{
  const f=fixture();f.planner.open();f.quick(10,10);const before=clone(f.state()),owned=getFloorRects(before.home);
  await f.click("DisplayText0970 21,264 DisplayText0971");
  assert.equal(f.purchaseCalls.length,1);const submitted=f.purchaseCalls[0].selection;
  assert.equal(submitted.storey,0);assert.equal(getUnionArea(submitted.rects),70.88);
  assert.equal(rectDifferenceArea(submitted.rects,owned),70.88,'the submitted geometry contains no previously purchased floor');
  assert.equal(f.state().wallet.balance,before.wallet.balance-21264);assert.equal(getUnionArea(getFloorRects(f.state().home)),100);
  assert.equal(f.dialog.open,false);assert.deepEqual(f.built,[{storey:0,ok:true}]);
  f.planner.open();f.quick(10,10);assert.equal(f.metrics()["DisplayText0957"],"− 100 sqm");
  assert.equal(f.metrics()["DisplayText0958"],"0 sqm");assert.equal(f.metrics()["DisplayText0960"],"0 DisplayText0920");assert.equal(f.buy().disabled,true);
});

test('upper-storey selection clips to the lower footprint and deducts its own already-built area',()=>{
  const rect=(width,depth)=>({minX:-2.8,minZ:-2.6,width,depth});
  let state=createCommerceState().state;
  for(const [storey,width,depth]of[[0,10,10],[1,8,8]]){const result=purchaseFloorConstruction(state,{storey,rects:[rect(width,depth)]},`isolated-prior-floor-${storey}`);assert.equal(result.ok,true,result.error);state=result.state;}
  const f=fixture(state),before=clone(state);f.planner.open(1);f.quick(20,20);
  assert.equal(f.metrics()["DisplayText0956"],"100 sqm");assert.equal(f.metrics()["DisplayText0957"],"− 64 sqm");
  assert.equal(f.metrics()["DisplayText0958"],"36 sqm");assert.equal(f.metrics()["DisplayText0959"],"100 sqm");
  assert.equal(f.metrics()["DisplayText0960"],"10,800 DisplayText0920");assert.equal(f.metrics()["DisplayText0961"],"0 DisplayText0920");
  assert.equal(f.cell(10,10).getAttribute('aria-pressed'),'false');assert.deepEqual(f.state(),before);
});
