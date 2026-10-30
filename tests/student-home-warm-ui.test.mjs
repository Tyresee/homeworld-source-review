import {getHomeRoamCopy,formatHomeRoamTitle} from '../public/js/home-roam-copy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {isWarmTypingTarget,resolveWarmShortcut,createWarmBalanceAnimator,createWarmToast,createStudentHomeWarmUI,WARM_BALANCE_MS} from '../public/js/student-home-warm-ui.js';

const key=(key,target)=>({key,target});

test('teacher shortcuts resolve only unmodified keys outside text editing and menus',()=>{
  assert.deepEqual(resolveWarmShortcut(key('1')),{type:'view',view:'interior'});
  assert.deepEqual(resolveWarmShortcut(key('2')),{type:'view',view:'estate'});
  assert.deepEqual(resolveWarmShortcut(key('3')),{type:'view',view:'building'});
  assert.deepEqual(resolveWarmShortcut(key('4')),{type:'view',view:'roam'});
  assert.deepEqual(resolveWarmShortcut(key('0')),{type:'reset'});
  assert.deepEqual(resolveWarmShortcut(key('P')),{type:'present'});
  for(const tagName of ['INPUT','TEXTAREA','SELECT','OPTION'])for(const char of ['1','2','3','4','0','P'])assert.equal(resolveWarmShortcut(key(char,{tagName})),null);
  assert.equal(resolveWarmShortcut(key('1',{isContentEditable:true})),null);
  assert.equal(resolveWarmShortcut(key('P'),{activeElement:{tagName:'INPUT'}}),null);
  assert.equal(resolveWarmShortcut(key('1'),{modalOpen:true}),null);
  for(const flag of ['ctrlKey','metaKey','altKey','repeat','defaultPrevented'])assert.equal(resolveWarmShortcut({...key('P'),[flag]:true}),null);
  assert.equal(resolveWarmShortcut(key('ArrowLeft')),null);
  assert.equal(resolveWarmShortcut({...key('1'),composedPath:()=>[{tagName:'SPAN'},{tagName:'INPUT'}]}),null,'shadow/input descendants keep their native keys');
  assert.equal(isWarmTypingTarget({tagName:'SPAN',closest:()=>({})}),true);
});

function frames(){let nextId=0,time=0;const callbacks=new Map(),rendered=[];const animator=createWarmBalanceAnimator({render:value=>rendered.push(value),requestFrame:fn=>{callbacks.set(++nextId,fn);return nextId;},cancelFrame:id=>callbacks.delete(id),now:()=>time});return{animator,rendered,callbacks,tick(t){time=t;const list=[...callbacks.values()];callbacks.clear();for(const fn of list)fn(t);}};}

test('authoritative points animate for 600ms and land exactly on the received integer',()=>{
  const f=frames();f.animator.set(150000,'teacher:A');assert.deepEqual(f.rendered,[150000]);f.animator.set(147451,'teacher:A');f.tick(150);assert.ok(f.rendered.at(-1)<150000&&f.rendered.at(-1)>147451);f.tick(WARM_BALANCE_MS);assert.equal(f.rendered.at(-1),147451);assert.equal(f.callbacks.size,0);
  f.animator.set(149900,'teacher:A');f.tick(900);assert.ok(f.rendered.at(-1)<149900);f.tick(1200);assert.equal(f.rendered.at(-1),149900);
});

test('switching students or teacher identity cancels old point frames instead of leaking the old balance',()=>{
  const f=frames();f.animator.set(150000,'teacher:A');f.animator.set(120000,'teacher:A');const stale=[...f.callbacks.values()][0];f.animator.clear();assert.equal(f.rendered.at(-1),null);f.animator.set(35000,'teacher:B');stale(600);assert.equal(f.rendered.at(-1),35000);assert.equal(f.callbacks.size,0);
  f.animator.set(9999,'new-teacher:B');assert.equal(f.rendered.at(-1),9999,'a new teacher scope is immediate');f.animator.set(-1,'new-teacher:B');assert.equal(f.rendered.at(-1),null);
});

test('reduced motion disables number interpolation and disposal cancels future paints',()=>{
  let scheduled=0;const rendered=[];const a=createWarmBalanceAnimator({render:value=>rendered.push(value),requestFrame:()=>++scheduled,reducedMotion:()=>true});a.set(100,'A');a.set(500,'A');assert.deepEqual(rendered,[100,500]);assert.equal(scheduled,0);
  const f=frames();f.animator.set(100,'A');f.animator.set(500,'A');const stale=[...f.callbacks.values()][0];f.animator.dispose();stale(600);assert.deepEqual(f.rendered,[100]);
});

test('routine messages expire, while a later error/login/retry message cancels the expiry',()=>{
  let next=0;const timers=new Map(),events=[];const toast=createWarmToast({show:p=>events.push(['show',p]),hide:()=>events.push(['hide']),setTimer:fn=>{timers.set(++next,fn);return next;},clearTimer:id=>timers.delete(id)});
  toast.notify();assert.equal(timers.size,1);toast.notify({persistent:true});assert.equal(timers.size,0);assert.deepEqual(events,[['show',false],['show',true]]);toast.notify();const fn=[...timers.values()][0];timers.clear();fn();assert.deepEqual(events.at(-1),['hide']);toast.notify();toast.dispose();assert.equal(timers.size,0);
});

test('Default and Toy do not create a controller, event handler or presentation DOM',()=>{
  const document={querySelector(){throw Error('Unselected theme must not query the page');}};for(const themeId of ['default','toy',null])assert.equal(createStudentHomeWarmUI({document,themeId}),null);
});

// A minimal eventful DOM exercises the production controller without introducing
// an independent UI implementation or account/network mocks into production.
function shell({search='?theme=warm',selectStudent=()=>Promise.resolve()}={}){
  class Node{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.events=new Map();this.attributes={};this.dataset={};this.className='';this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.id='';this.classList={add:(...names)=>this.change(names,true),remove:(...names)=>this.change(names,false),toggle:(name,force)=>this.change([name],force??!this.classes().includes(name)),contains:name=>this.classes().includes(name)};}
    classes(){return this.className.split(' ').filter(Boolean);}
    change(names,value){const all=new Set(this.classes());for(const name of names)value?all.add(name):all.delete(name);this.className=[...all].join(' ');return value;}
    append(...children){for(const child of children){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(item=>item!==child);child.parentElement=this;this.children.push(child);}}
    insertBefore(child,before){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(item=>item!==child);child.parentElement=this;this.children.splice(this.children.indexOf(before),0,child);}
    replaceChildren(...children){this.children=[];this.append(...children);}
    setAttribute(key,value){this.attributes[key]=String(value);}
    getAttribute(key){return this.attributes[key]??null;}
    addEventListener(name,callback){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(callback);}
    removeEventListener(name,callback){this.events.set(name,(this.events.get(name)??[]).filter(fn=>fn!==callback));}
    async dispatch(name,event={}){for(const fn of this.events.get(name)??[])await fn(event);}
    all(){return[this,...this.children.flatMap(child=>child.all())];}
    contains(node){return this.all().includes(node);}
    querySelector(selector){return this.all().find(node=>selector[0]==='.'?node.classes().includes(selector.slice(1)):selector[0]==='#'?node.id===selector.slice(1):node.tagName===selector.toUpperCase())??null;}
    focus(){doc.activeElement=this;}
    getClientRects(){return this.hidden?[]:[{}];}
  }
  const body=new Node('body'),home=new Node(),heading=new Node(),titleGroup=new Node(),title=new Node('h2'),stage=new Node(),feedback=new Node(),balance=new Node('strong'),wallet=new Node(),skip=new Node('a');home.className='home';feedback.className='feedback';skip.className='skip';title.id='home-title';stage.id='stage';balance.id='balance';wallet.append(balance);titleGroup.append(title);heading.append(titleGroup,wallet);home.append(heading,stage,feedback);body.append(skip,home);
  const doc=new Node('document');doc.body=body;doc.append(body);doc.createElement=tag=>new Node(tag);doc.getElementById=id=>doc.querySelector('#'+id);doc.querySelectorAll=()=>[];doc.activeElement=null;
  let next=0,refits=0;const queued=new Map(),window=new Node('window');window.location={search,href:'http://127.0.0.1/home'+search};window.history={replaceState(_a,_b,url){window.replaced=url;}};window.requestAnimationFrame=fn=>{queued.set(++next,fn);return next;};window.cancelAnimationFrame=id=>queued.delete(id);window.performance={now:()=>0};window.matchMedia=()=>({matches:false});
  const state={ready:true,busy:false,view:'interior',stageActive:false,students:[{id:'A',displayName:'A'},{id:'B',displayName:'B'}],selectedId:'A'},actions=[],errors=[];
  const ui=createStudentHomeWarmUI({document:doc,window,themeId:'warm',getState:()=>state,onView:v=>actions.push(['view',v]),onZoom:d=>actions.push(['zoom',d]),onReset:()=>actions.push(['reset']),onRefit:()=>refits++,onSelectStudent:selectStudent,onError:error=>errors.push(error.message)});
  return{ui,body,doc,window,state,actions,errors,getRefits:()=>refits,flushFrames(){const frames=[...queued.values()];queued.clear();for(const fn of frames)fn(0);},picker:doc.getElementById('warm-student-select')};
}

test('presentation URL/button/key use one reversible state and a scoped student selector',async()=>{
  const f=shell({search:'?theme=warm&view=present'});assert.equal(f.body.classList.contains('warm-present'),true);const present=f.body.querySelector('.warm-present-toggle');assert.equal(present.getAttribute('aria-label'),"DisplayText4761");assert.equal(present.title,present.getAttribute('aria-label'));assert.equal(f.picker.value,'A');assert.equal(f.picker.parentElement.hidden,false);f.flushFrames();assert.equal(f.getRefits(),1);
  let prevented=0;await f.doc.dispatch('keydown',{key:'P',preventDefault(){prevented++;}});assert.equal(f.ui.getPresentation(),false);assert.equal(f.body.classList.contains('warm-present'),false);assert.equal(f.window.replaced,'/home?theme=warm');assert.equal(f.picker.parentElement.hidden,true);assert.equal(present.getAttribute('aria-label'),"DisplayText4744");assert.equal(present.title,present.getAttribute('aria-label'));
  const show=f.body.querySelector('.warm-show'),camera=f.body.querySelector('.warm-stage-camera');f.state.stageActive=true;f.state.stageCamera={available:true,active:true,returning:false};f.ui.refresh();assert.equal(show.getAttribute('aria-label'),show.querySelector('.warm-show-label').textContent);assert.equal(show.title,"DisplayText3771");assert.equal(camera.textContent,"DisplayText3761");assert.equal(camera.getAttribute('aria-label'),camera.textContent);assert.equal(camera.title,camera.textContent);
  f.state.stageCamera={available:true,active:false,returning:true};f.ui.refresh();assert.equal(camera.textContent,"DisplayText4762…");assert.equal(camera.getAttribute('aria-label'),camera.textContent);assert.equal(camera.title,camera.textContent);assert.equal(camera.disabled,true);f.state.stageActive=false;f.state.stageCamera={available:true,active:false,returning:false};f.ui.refresh();assert.equal(show.title,"Showtime");assert.equal(camera.getAttribute('aria-label'),"DisplayText3762");assert.equal(camera.title,camera.textContent);
  await f.doc.dispatch('keydown',{key:'P',target:{tagName:'INPUT'},preventDefault(){prevented++;}});assert.equal(f.ui.getPresentation(),false);assert.equal(prevented,1);
  await f.doc.dispatch('keydown',{key:'3',preventDefault(){}});assert.deepEqual(f.actions,[['view','building']]);
  f.state.busy=true;f.ui.refresh();await f.doc.dispatch('keydown',{key:'1',preventDefault(){}});assert.deepEqual(f.actions,[['view','building']]);assert.equal(f.picker.disabled,true);
  f.ui.dispose();const refits=f.getRefits();await f.window.dispatch('resize');f.flushFrames();assert.equal(f.getRefits(),refits);
});

test('student dropdown stays disabled until its existing selection handler settles and restores rejected selection',async()=>{
  let finish;const f=shell({selectStudent:()=>new Promise(resolve=>{finish=resolve;})});f.picker.value='B';const pending=f.picker.dispatch('change');assert.equal(f.picker.disabled,true);assert.equal(f.state.selectedId,'A');finish();await pending;assert.equal(f.picker.value,'A','a rejected/no-op selection cannot pretend another student is selected');assert.equal(f.picker.disabled,false);
  f.ui.dispose();const bad=shell({selectStudent:async()=>{throw Error('selection failed');}});bad.picker.value='B';await bad.picker.dispatch('change');assert.deepEqual(bad.errors,['selection failed']);assert.equal(bad.picker.value,'A');bad.ui.dispose();
});

test('fourth dock and physical view shortcut open a temporary full-window view while preserving presentation preference',async()=>{
  const f=shell({search:'?theme=warm&view=present'}),dock=f.body.querySelector('.warm-view-dock'),roam=dock.children.find(node=>node.dataset.warmView==='roam');
  assert.equal(dock.children.length,4);assert.equal(roam.getAttribute('aria-label'),"Visit");assert.equal(roam.getAttribute('aria-keyshortcuts'),'4');await f.doc.dispatch('keydown',{key:'4',preventDefault(){}});assert.deepEqual(f.actions,[['view','roam']]);
  f.state.view='roam';f.state.roam={active:true,phase:'orbit',transition:false};f.ui.refresh();assert.equal(f.body.classList.contains('home-roam-active'),true);assert.equal(f.doc.querySelector('.home').dataset.roamPhase,'orbit');assert.equal(roam.getAttribute('aria-pressed'),'true');assert.equal(f.body.querySelector('.warm-camera-dock').hidden,true);assert.equal(f.body.querySelector('.warm-show').hidden,true);assert.equal(dock.hidden,false);
  for(const key of ['P','0'])await f.doc.dispatch('keydown',{key,preventDefault(){throw Error('The normal camera/presentation shortcut must be left alone while viewing');}});assert.equal(f.ui.getPresentation(),true);
  f.state.roam={active:true,phase:'opening',transition:true};f.ui.refresh();assert.equal(dock.hidden,true);const before=f.actions.length;await f.doc.dispatch('keydown',{key:'1',preventDefault(){}});assert.equal(f.actions.length,before);
  f.state.roam={active:true,phase:'free',transition:false};f.ui.refresh();assert.equal(dock.hidden,false);await f.doc.dispatch('keydown',{key:'2',preventDefault(){}});assert.deepEqual(f.actions.at(-1),['view','estate']);
  f.state.roam={active:false,phase:'inactive'};f.state.view='estate';f.ui.refresh();assert.equal(f.body.classList.contains('home-roam-active'),false);assert.equal(f.body.classList.contains('warm-present'),true);assert.equal(f.ui.getPresentation(),true);assert.equal(f.body.querySelector('.warm-camera-dock').hidden,false);f.ui.dispose();
});


test('the visit title uses the selected identity and restores only the heading owned by that visit',()=>{
  const f=shell(),title=f.doc.getElementById('home-title');title.textContent='Original A home';
  f.state.view='roam';f.state.roam={active:true,phase:'orbit',transition:false};f.ui.refresh();
  assert.equal(title.textContent,formatHomeRoamTitle('A'));f.ui.refresh();
  f.state.view='interior';f.state.roam={active:false};f.ui.refresh();assert.equal(title.textContent,'Original A home');
  f.state.view='roam';f.state.roam={active:true,phase:'orbit'};f.ui.refresh();
  title.textContent='New B home';f.state.selectedId='B';f.state.view='interior';f.state.roam={active:false};f.ui.refresh();
  assert.equal(title.textContent,'New B home','a new account heading must not be replaced with the previous identity');
  f.state.view='roam';f.state.roam={active:true,phase:'orbit'};f.ui.refresh();assert.equal(title.textContent,formatHomeRoamTitle('B'));
  f.ui.dispose();assert.equal(title.textContent,'New B home');
});

test('the optional English review locale changes only visit copy and preserves the same dock behavior',async()=>{
  const f=shell({search:'?theme=warm&locale=en'}),title=f.doc.getElementById('home-title'),copy=getHomeRoamCopy('en');title.textContent='A home';
  const visit=f.body.querySelector('.warm-view-dock').children.find(node=>node.dataset.warmView==='roam');assert.equal(visit.getAttribute('aria-label'),copy.dock);await visit.dispatch('click');assert.deepEqual(f.actions,[['view','roam']]);
  f.state.view='roam';f.state.roam={active:true,phase:'orbit'};f.ui.refresh();assert.equal(title.textContent,formatHomeRoamTitle('A','en'));f.ui.dispose();assert.equal(title.textContent,'A home');
});

test('bottom view and stage tools share one responsive flow while camera tools keep their own reserved edge',async()=>{
  const f=shell(),home=f.doc.querySelector('.home'),bottom=home.querySelector('.warm-bottom-tools'),dock=home.querySelector('.warm-view-dock'),stage=home.querySelector('.warm-stage-tools'),camera=home.querySelector('.warm-camera-dock');
  assert.ok(bottom);assert.equal(bottom.parentElement,home);assert.equal(dock.parentElement,bottom);assert.equal(stage.parentElement,bottom);assert.equal(camera.parentElement,home);
  assert.deepEqual(stage.children.map(node=>node.className),['warm-stage-camera','warm-show']);assert.equal(stage.hidden,false);
  for(const button of dock.children)await button.dispatch('click');assert.deepEqual(f.actions,[['view','interior'],['view','estate'],['view','building'],['view','roam']]);
  f.state.view='roam';f.state.roam={active:true,phase:'orbit'};f.ui.refresh();assert.equal(stage.hidden,true);assert.equal(camera.hidden,true);assert.equal(dock.hidden,false);
  f.state.roam.transition=true;f.ui.refresh();assert.equal(dock.hidden,true);
  f.state.roam={active:false};f.state.view='interior';f.ui.refresh();assert.equal(stage.hidden,false);assert.equal(camera.hidden,false);assert.equal(dock.hidden,false);
  f.state.ready=false;f.ui.refresh();assert.equal(stage.hidden,true);assert.equal(camera.hidden,true);assert.equal(dock.hidden,true);f.ui.dispose();
});
