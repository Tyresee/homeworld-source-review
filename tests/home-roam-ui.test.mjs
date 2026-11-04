import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomeRoamUI} from '../public/js/home-roam-ui.js';
import {getHomeRoamCopy} from '../public/js/home-roam-copy.js';

function fixture({locale,search,floorCount=1,readOnly=false,hasOutdoor=false}={}){
  let document;
  class Node{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.className='';this.dataset={};this.style={};this.attributes={};this.events=new Map();this.hidden=false;this.textContent='';this.ownerDocument=document;this.classList={add:name=>{this.className+=' '+name;}};}
    append(...nodes){for(const node of nodes){this.children.push(node);node.parentNode=this;}}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    setAttribute(key,value){this.attributes[key]=String(value);}
    getAttribute(key){return this.attributes[key]??null;}
    addEventListener(type,callback){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(callback);}
    removeEventListener(type,callback){this.events.get(type)?.delete(callback);}
    dispatch(type,event={}){for(const callback of [...this.events.get(type)??[]])callback(event);}
    all(){return [this,...this.children.flatMap(node=>node.all())];}
    find(className){return this.all().find(node=>node.className.split(' ').includes(className));}
    contains(target){return this.all().includes(target);}
    focus(){document.activeElement=this;}
    getBoundingClientRect(){return {width:100,height:30};}
  }
  document=new Node('document');document.createElement=tag=>new Node(tag);document.defaultView={innerWidth:1440,innerHeight:900,location:{search:search??''}};
  const container=new Node(),calls=[],ui=createHomeRoamUI({container,document,locale,floorCount,readOnly,hasOutdoor,onFloor:index=>calls.push(['floor',index]),onDisplayMode:mode=>calls.push(['mode',mode]),onAutoRotate:value=>calls.push(['spin',value]),onOverview:()=>calls.push(['overview']),onLeave:()=>calls.push(['leave']),onWalk:()=>calls.push(['walk']),onOutdoor:()=>calls.push(['outdoor'])});
  return {ui,container,document,calls,root:ui.element,find:name=>ui.element.find(name),button:text=>ui.element.all().find(node=>node.tagName==='BUTTON'&&node.textContent===text)};
}

test('view-only chrome stays hidden until active and routes mode, spin and overview through callbacks',()=>{
  const f=fixture();assert.equal(f.root.hidden,true);f.ui.setVisible(true);assert.equal(f.root.hidden,true);f.ui.update({active:true,phase:'orbit',view:'exterior'});assert.equal(f.root.hidden,false);
  const exterior=f.button("Exterior"),spin=f.button("Slow orbit");exterior.dispatch('click');spin.dispatch('click');f.button("Overview").dispatch('click');assert.deepEqual(f.calls,[['mode','exterior'],['spin',true],['overview']]);
  assert.equal(exterior.getAttribute('aria-pressed'),'false','Only the controller acknowledgement changes the displayed mode');f.ui.update({displayMode:'exterior',autoRotate:true,view:'interior'});assert.equal(exterior.getAttribute('aria-pressed'),'true');assert.equal(f.find('home-roam-status').textContent,"Viewing: Interior");assert.equal(spin.getAttribute('aria-label'),"Stop slow orbit");assert.equal(spin.title,spin.getAttribute('aria-label'));spin.dispatch('click');assert.deepEqual(f.calls.at(-1),['spin',false]);f.ui.dispose();
});

test('entry hides controls, free movement exposes only instructions plus leave/help, returning restores orbit controls',()=>{
  const f=fixture();f.ui.setVisible(true);f.ui.update({active:true,phase:'opening',transition:true});assert.equal(f.find('home-roam-bar').hidden,true);assert.equal(f.find('home-roam-status').hidden,true);
  f.ui.update({phase:'free',walking:true,transition:false,view:'interior'});assert.equal(f.find('home-roam-bar').hidden,false);assert.equal(f.find('home-roam-modes').hidden,true);assert.equal(f.button("Slow orbit").hidden,true);assert.equal(f.button("Overview").hidden,true);assert.equal(f.find('home-roam-instructions').hidden,false);assert.equal(f.button("Leave").hidden,false);f.button("Leave").dispatch('click');assert.deepEqual(f.calls,[['leave']]);
  f.ui.update({phase:'orbit',walking:false,view:'exterior'});assert.equal(f.find('home-roam-modes').hidden,false);assert.equal(f.button("Leave").hidden,true);assert.equal(f.find('home-roam-instructions').hidden,true);f.ui.setVisible(false);assert.equal(f.root.hidden,true);f.ui.dispose();
});

test('help uses accessible reversible controls, traps only its Escape, clamps hover and cleans up all listeners',()=>{
  const f=fixture();f.ui.setVisible(true);f.ui.update({active:true,phase:'orbit'});const help=f.find('home-roam-help'),toggle=f.button('?');toggle.dispatch('click');assert.equal(help.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(toggle.getAttribute('aria-controls'),help.id);
  let prevented=0,stopped=0;f.document.dispatch('keydown',{code:'Escape',preventDefault(){prevented++;},stopPropagation(){stopped++;}});assert.equal(help.hidden,true);assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(f.document.activeElement,toggle);f.document.dispatch('keydown',{code:'Escape',preventDefault(){prevented++;}});assert.equal(prevented,1,'Closed help does not consume the camera exit key');
  f.ui.setHover({text:"Click the door to enter",x:1439,y:899});const hover=f.find('home-roam-hover');assert.equal(hover.hidden,false);assert.equal(hover.style.left,'1332px');assert.equal(hover.style.top,'862px');f.ui.update({phase:'opening',transition:true});assert.equal(hover.hidden,true);f.ui.setHover({text:"Click the door to enter",x:20,y:30});assert.equal(hover.hidden,true);
  f.ui.update({phase:'free',transition:false});toggle.dispatch('click');assert.equal(f.find('home-roam-help-title').textContent,"Explore the home and garden");f.document.dispatch('pointerdown',{target:f.container});assert.equal(help.hidden,true);
  f.ui.dispose();assert.equal(f.container.children.length,0);for(const callbacks of f.document.events.values())assert.equal(callbacks.size,0);for(const node of f.root.all())for(const callbacks of node.events.values())assert.equal(callbacks.size,0);
});


test('the shared locale configures all controls and both help modes without changing their actions',()=>{
  for(const options of [{locale:'en'},{locale:'en'},{search:'?theme=warm&locale=en'}]){
    const f=fixture(options),copy=getHomeRoamCopy(options.locale,{search:options.search??''});f.ui.setVisible(true);f.ui.update({active:true,phase:'orbit'});
    assert.equal(f.root.getAttribute('aria-label'),copy.viewLabel);assert.equal(f.find('home-roam-status').textContent,copy.statusExterior);
    assert.ok(f.button(copy.auto));assert.ok(f.button(copy.exterior));assert.ok(f.button(copy.interior));assert.ok(f.button(copy.spin));
    f.button('?').dispatch('click');assert.equal(f.find('home-roam-help-note').textContent,copy.helpNoteExterior);
    assert.deepEqual(f.find('home-roam-help-keys').children.map(n=>n.textContent),copy.outsideHelp.flat());
    f.ui.update({phase:'free',view:'interior'});f.button('?').dispatch('click');
    assert.equal(f.find('home-roam-instructions').textContent,copy.instructions);assert.equal(f.find('home-roam-help-note').textContent,copy.helpNoteInterior);
    assert.deepEqual(f.find('home-roam-help-keys').children.map(n=>n.textContent),copy.insideHelp.flat());
    f.button(copy.leave).dispatch('click');assert.deepEqual(f.calls,[['leave']]);f.ui.dispose();
  }
});


test('actual purchased floor buttons stay hidden outside walking, acknowledge the current storey and disable during travel',()=>{
  const f=fixture({locale:'en',floorCount:2});f.ui.setVisible(true);f.ui.update({active:true,phase:'orbit'});
  assert.equal(f.find('home-roam-floors').hidden,true);
  f.ui.update({phase:'free',storey:0});assert.equal(f.find('home-roam-floors').hidden,false);assert.equal(f.button('1F').disabled,true);assert.equal(f.button('2F').disabled,false);
  f.button('2F').dispatch('click');assert.deepEqual(f.calls,[['floor',1]]);assert.equal(f.button('1F').getAttribute('aria-pressed'),'true','a request does not optimistically change floors');
  f.ui.update({phase:'elevator-ride',transition:true});assert.equal(f.find('home-roam-bar').hidden,true);assert.equal(f.button('2F').disabled,true);
  f.ui.update({phase:'free',transition:false,storey:1});assert.equal(f.button('2F').getAttribute('aria-pressed'),'true');assert.equal(f.button('1F').disabled,false);f.ui.dispose();
});

test('garden entry stays available indoors and exposes an unambiguous house return outdoors',()=>{
  const f=fixture(),doc=f.document,container=doc.createElement('div'),calls=[];
  const ui=createHomeRoamUI({container,document:doc,locale:'en',hasOutdoor:true,floorCount:2,onOutdoor:()=>calls.push('outdoor'),onHouse:()=>calls.push('house')});
  const walk=ui.element.all().find(node=>node.dataset.roamAction==='outdoor');ui.setVisible(true);ui.update({active:true,phase:'orbit'});
  assert.ok(walk);assert.equal(walk.textContent,'Garden walk');assert.equal(walk.hidden,false);walk.dispatch('click');assert.deepEqual(calls,['outdoor']);
  const house=ui.element.all().find(node=>node.dataset.roamAction==='house'),floors=ui.element.find('home-roam-floors');assert.equal(house.hidden,true);
  ui.update({phase:'free',view:'interior',sceneMode:'in'});assert.equal(walk.hidden,false);assert.equal(walk.disabled,false);assert.equal(floors.hidden,false);walk.dispatch('click');assert.deepEqual(calls,['outdoor','outdoor']);
  ui.update({phase:'entering-garden-out',transition:true});assert.equal(ui.element.find('home-roam-bar').hidden,true);
  ui.update({phase:'free',transition:false,view:'exterior',sceneMode:'ext+in'});assert.equal(walk.hidden,false);assert.equal(walk.disabled,true);assert.equal(walk.getAttribute('aria-pressed'),'true');assert.equal(house.hidden,false);assert.equal(floors.hidden,true);house.dispatch('click');assert.deepEqual(calls,['outdoor','outdoor','house']);
  ui.update({phase:'free',view:'interior',sceneMode:'in'});assert.equal(house.hidden,true);assert.equal(walk.disabled,false);assert.equal(floors.hidden,false);ui.dispose();f.ui.dispose();
});

test('a refused route has a visible accessible explanation without changing the selected floor',()=>{
  const f=fixture({locale:'en',floorCount:2}),copy=getHomeRoamCopy('en');f.ui.setVisible(true);f.ui.update({active:true,phase:'free',storey:0});
  const status=f.find('home-roam-status');assert.equal(status.hidden,true);
  f.ui.setMessage(copy.travelDestinationBlocked);assert.equal(status.hidden,false);assert.equal(status.textContent,copy.travelDestinationBlocked);assert.equal(status.getAttribute('role'),'status');assert.equal(status.getAttribute('aria-live'),'polite');
  assert.equal(f.button('1F').getAttribute('aria-pressed'),'true');assert.equal(f.button('2F').disabled,false);
  f.ui.update({phase:'free',walking:true});assert.equal(status.textContent,copy.travelDestinationBlocked,'render acknowledgements do not erase the refusal');
  f.ui.setMessage('');assert.equal(status.hidden,true);
  f.ui.update({phase:'orbit',view:'exterior'});f.ui.setMessage(copy.gardenUnavailable);assert.equal(status.hidden,false);assert.equal(status.textContent,copy.gardenUnavailable,'an unavailable garden also has a visible explanation before entering');
  f.ui.setMessage('');assert.equal(status.textContent,copy.statusExterior);f.ui.update({phase:'free'});
  f.ui.setMessage(copy.travelBlocked);f.ui.setVisible(false);f.ui.setVisible(true);assert.equal(status.hidden,true,'a later visit does not inherit the previous route warning');f.ui.dispose();
});

test('public model controls expose floor and camera navigation without editor exits or furniture interaction instructions',()=>{
  const f=fixture({locale:'en',readOnly:true,hasOutdoor:true,floorCount:2}),copy=getHomeRoamCopy('en');f.ui.setVisible(true);f.ui.update({active:true,phase:'orbit',view:'exterior',sceneMode:'ext',storey:1});
  assert.equal(f.root.getAttribute('aria-label'),copy.showcaseLabel);assert.equal(f.find('home-roam-floors').hidden,false);assert.equal(f.button('1F').disabled,false);assert.equal(f.button('2F').disabled,false);assert.equal(f.button('2F').getAttribute('aria-pressed'),'false');assert.equal(f.button('Leave').hidden,true);assert.equal(f.button('Auto').hidden,true);
  f.button('1F').dispatch('click');assert.deepEqual(f.calls,[['floor',0]]);f.ui.update({phase:'orbit',view:'interior',sceneMode:'orbit-in',storey:0});assert.equal(f.button('1F').disabled,true);assert.equal(f.button('2F').disabled,false);
  f.ui.update({phase:'free',view:'exterior',sceneMode:'ext+in'});assert.equal(f.root.all().find(n=>n.dataset.roamAction==='overview').hidden,false);assert.equal(f.find('home-roam-instructions').textContent,copy.showcaseInstructions);f.button('?').dispatch('click');assert.equal(f.find('home-roam-help-note').textContent,copy.showcaseNote);assert.deepEqual(f.find('home-roam-help-keys').children.map(n=>n.textContent),copy.showcaseHelp.flat());f.ui.dispose();
});

test('public indoor walking is an acknowledged camera mode with visible floor, model and garden controls',()=>{
  for(const locale of['en','en']){
    const f=fixture({locale,readOnly:true,hasOutdoor:true,floorCount:2}),copy=getHomeRoamCopy(locale);f.ui.setVisible(true);
    f.ui.update({active:true,phase:'orbit',view:'exterior',sceneMode:'ext',storey:0,displayMode:'exterior'});
    const walk=f.button(copy.showcaseWalk),model=f.button(copy.showcaseModel),garden=f.button(copy.outdoorWalk),floor=index=>f.root.all().find(node=>node.dataset.roamFloor===String(index));
    assert.ok(walk);assert.equal(walk.dataset.roamAction,'walk');assert.equal(f.find('home-roam-modes').hidden,false);assert.equal(walk.disabled,false);assert.equal(walk.getAttribute('aria-pressed'),'false');
    walk.dispatch('click');assert.deepEqual(f.calls,[['walk']]);assert.equal(walk.getAttribute('aria-pressed'),'false','a request cannot claim that the camera is already indoors');
    f.ui.update({phase:'entering-interior-out',transition:true});assert.equal(f.find('home-roam-bar').hidden,true);assert.equal(walk.disabled,true);assert.equal(model.disabled,true);assert.equal(garden.disabled,true);
    f.ui.update({phase:'free',transition:false,view:'interior',sceneMode:'in',storey:0});
    assert.equal(f.find('home-roam-modes').hidden,false);assert.equal(walk.disabled,true);assert.equal(walk.getAttribute('aria-pressed'),'true');assert.equal(model.disabled,false);assert.equal(model.getAttribute('aria-pressed'),'false');assert.equal(garden.hidden,false);assert.equal(garden.disabled,false);
    assert.equal(f.find('home-roam-floors').hidden,false);assert.equal(floor(0).disabled,true);assert.equal(floor(0).getAttribute('aria-pressed'),'true');assert.equal(floor(1).disabled,false);assert.equal(floor(1).getAttribute('aria-pressed'),'false');
    floor(1).dispatch('click');assert.deepEqual(f.calls.at(-1),['floor',1]);assert.equal(floor(0).getAttribute('aria-pressed'),'true','floor buttons wait for the completed camera relocation');
    f.ui.update({storey:1});assert.equal(floor(1).disabled,true);assert.equal(floor(1).getAttribute('aria-pressed'),'true');assert.equal(floor(0).disabled,false);assert.equal(walk.getAttribute('aria-pressed'),'true');
    model.dispatch('click');garden.dispatch('click');assert.deepEqual(f.calls.slice(-2),[['mode','interior'],['outdoor']]);
    f.ui.update({phase:'orbit',view:'interior',sceneMode:'orbit-in',displayMode:'interior'});assert.equal(walk.disabled,false);assert.equal(walk.getAttribute('aria-pressed'),'false');assert.equal(model.getAttribute('aria-pressed'),'true');assert.equal(f.button(copy.leave).hidden,true);f.ui.dispose();
  }
});

test('public garden walking keeps indoor entry and floor-model navigation available without a physical door action',()=>{
  const f=fixture({locale:'en',readOnly:true,hasOutdoor:true,floorCount:2}),copy=getHomeRoamCopy('en');f.ui.setVisible(true);f.ui.update({active:true,phase:'free',view:'exterior',sceneMode:'ext+in',storey:0});
  const walk=f.button(copy.showcaseWalk),garden=f.button(copy.outdoorWalk),house=f.root.all().find(node=>node.dataset.roamAction==='house');
  assert.equal(f.find('home-roam-modes').hidden,false);assert.equal(walk.disabled,false);assert.equal(walk.getAttribute('aria-pressed'),'false');assert.equal(garden.disabled,true);assert.equal(garden.getAttribute('aria-pressed'),'true');assert.equal(house.hidden,true);assert.equal(f.find('home-roam-floors').hidden,false);
  for(const floor of['1F','2F']){assert.equal(f.button(floor).disabled,false);assert.equal(f.button(floor).getAttribute('aria-pressed'),'false');}
  walk.dispatch('click');f.button(copy.showcaseModel).dispatch('click');f.button(copy.exterior).dispatch('click');assert.deepEqual(f.calls,[['walk'],['mode','interior'],['mode','exterior']]);assert.equal(f.find('home-roam-leave').hidden,true);f.ui.dispose();
});

test('ordinary teacher visits retain physical entry, exit and garden controls without a public walk shortcut',()=>{
  const f=fixture({locale:'en',hasOutdoor:true,floorCount:2}),copy=getHomeRoamCopy('en');f.ui.setVisible(true);f.ui.update({active:true,phase:'orbit',view:'exterior',sceneMode:'ext'});
  assert.equal(f.root.all().some(node=>node.dataset.roamAction==='walk'),false);assert.equal(f.button(copy.showcaseWalk),undefined);assert.ok(f.button(copy.interior));assert.equal(f.find('home-roam-modes').hidden,false);
  f.ui.update({phase:'free',view:'interior',sceneMode:'in',storey:1});assert.equal(f.find('home-roam-modes').hidden,true);assert.equal(f.button(copy.leave).hidden,false);assert.equal(f.button(copy.outdoorWalk).disabled,false);assert.equal(f.button('2F').disabled,true);
  f.button(copy.leave).dispatch('click');assert.deepEqual(f.calls,[['leave']]);
  f.ui.update({phase:'free',view:'exterior',sceneMode:'ext+in'});assert.equal(f.root.all().find(node=>node.dataset.roamAction==='house').hidden,false);assert.equal(f.find('home-roam-floors').hidden,true);assert.equal(f.button(copy.outdoorWalk).disabled,true);f.ui.dispose();
});
