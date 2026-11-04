import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudentHomeShareDialog} from '../public/js/student-home-share-dialog.js';

const ID='A'.repeat(43),SECOND='B'.repeat(43),THIRD='C'.repeat(43),url=id=>`https://example.test/games/homeworld/home-share.html?share=${id}`;
const metadata=(id=ID)=>({id,status:'active',createdAt:'2026-10-31T10:00:00.000Z',url:url(id)});
const pending=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({onCreate=async()=>({share:metadata()}),onRevoke=async()=>({share:{id:ID,status:'revoked'}}),onList,clipboard=async()=>{},warm=true}={}){
  let doc;
  class Node{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.className='';this.attributes={};this.events=new Map();this.hidden=false;this.disabled=false;this.textContent='';this.value='';this.open=false;this.tabIndex=0;this.id='';this.selected=false;this.classList={toggle:(name,on)=>{const classes=new Set(this.className.split(' ').filter(Boolean));if(on??!classes.has(name))classes.add(name);else classes.delete(name);this.className=[...classes].join(' ');}};}
    append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
    replaceChildren(...nodes){for(const node of this.children)node.parentElement=null;this.children=[];this.append(...nodes);}
    setAttribute(name,value){this.attributes[name]=String(value);}
    getAttribute(name){return this.attributes[name]??null;}
    removeAttribute(name){delete this.attributes[name];if(name==='href')this.href='';}
    addEventListener(name,callback){if(!this.events.has(name))this.events.set(name,new Set());this.events.get(name).add(callback);}
    removeEventListener(name,callback){this.events.get(name)?.delete(callback);}
    async dispatch(name,event={}){for(const callback of [...this.events.get(name)??[]])await callback(event);}
    all(){return[this,...this.children.flatMap(node=>node.all())];}
    querySelector(selector){return this.all().find(node=>selector[0]==='.'?node.className.split(' ').includes(selector.slice(1)):selector[0]==='#'?node.id===selector.slice(1):node.tagName===selector.toUpperCase())??null;}
    focus(){doc.activeElement=this;}
    select(){this.selected=true;}
    setSelectionRange(from,to){this.selection=[from,to];}
    showModal(){this.open=true;}
    close(){this.open=false;void this.dispatch('close');}
    getBoundingClientRect(){return{left:100,right:600,top:100,bottom:700};}
    get isConnected(){let node=this;while(node.parentElement)node=node.parentElement;return node===doc;}
  }
  doc=new Node('document');doc.body=new Node('body');doc.append(doc.body);doc.createElement=tag=>new Node(tag);doc.createElementNS=(_ns,tag)=>new Node(tag);doc.activeElement=null;
  const heading=new Node(),tools=new Node();heading.className='home-heading';tools.className='warm-display-tools';doc.body.append(heading);if(warm)heading.append(tools);
  const state={ready:true,busy:false,scope:'actor-1:student-A'},calls=[],errors=[],copied=[];
  const window={location:{href:'https://example.test/games/homeworld/student-homes.html?theme=warm'},navigator:{clipboard:{async writeText(value){copied.push(value);return clipboard(value);}}}};
  const ui=createStudentHomeShareDialog({document:doc,window,getState:()=>state,onCreate:async value=>{calls.push(['create',value]);return onCreate(value);},onRevoke:async value=>{calls.push(['revoke',value]);return onRevoke(value);},...(onList?{onList:async value=>{calls.push(['list',value]);return onList(value);}}:{}),onError:error=>errors.push(error.message)});
  const find=name=>doc.querySelector('.student-home-share-'+name);
  return{doc,window,state,calls,errors,copied,ui,heading,tools,find,flush:settle};
}

test('mount and ordinary opening never publish; only an explicit generation creates a generic read-only result',async()=>{
  const f=fixture();assert.deepEqual(f.calls,[]);assert.equal(f.ui.button.parentElement,f.tools);assert.equal(f.ui.button.hidden,false);assert.equal(f.ui.button.getAttribute('aria-haspopup'),'dialog');assert.equal(f.find('close').getAttribute('aria-label'),"DisplayText4979");
  const note=f.find('note').querySelector('p').textContent;assert.match(note,/DisplayText4984, DisplayText4985/);assert.doesNotMatch(note,/DisplayText5053|DisplayText5054[^.]*DisplayText5055/);
  f.ui.button.focus();await f.ui.button.dispatch('click');assert.equal(f.ui.element.open,true);assert.equal(f.doc.activeElement,f.find('close'));assert.deepEqual(f.calls,[]);
  assert.equal(f.ui.element.getAttribute('aria-labelledby'),f.ui.element.id+'-title');assert.equal(f.ui.element.getAttribute('role'),'dialog','the app keyboard shortcut guard can identify the active modal');assert.equal(f.ui.element.getAttribute('aria-modal'),'true');assert.equal(f.find('result').hidden,true);
  await f.find('create').dispatch('click');await f.flush();assert.deepEqual(f.calls,[['create',{scope:'actor-1:student-A'}]]);assert.equal(f.find('url').value,url(ID));assert.equal(f.find('result').hidden,false);assert.equal(f.find('open').href,url(ID));assert.equal(f.find('open').target,'_blank');assert.equal(f.find('open').rel,'noopener noreferrer');assert.equal(f.find('open').referrerPolicy,'no-referrer');assert.equal(f.find('url').readOnly,true);
  assert.match(f.find('status').textContent,/DisplayText5014/);assert.equal(f.find('status').getAttribute('role'),'status');assert.equal(f.find('status').getAttribute('aria-live'),'polite');
  f.ui.close();assert.equal(f.doc.activeElement,f.ui.button);assert.equal(f.ui.element.open,false);assert.equal(f.ui.open(),true);assert.equal(f.find('url').value,url(ID),'closing does not lose the current student link');assert.equal(f.calls.length,1);f.ui.dispose();
});

test('header fallback and selection readiness never expose sharing for an unselected or busy home',async()=>{
  const f=fixture({warm:false});assert.equal(f.ui.button.parentElement,f.heading);f.state.ready=false;f.ui.refresh();assert.equal(f.ui.button.hidden,true);assert.equal(f.ui.open(),false);assert.equal(f.calls.length,0);
  f.state.ready=true;f.state.busy=true;f.ui.refresh();assert.equal(f.ui.button.hidden,false);assert.equal(f.ui.button.disabled,true);assert.equal(f.ui.open(),false);
  f.state.busy=false;f.ui.refresh();f.ui.open();f.state.ready=false;f.ui.refresh();assert.equal(f.ui.element.open,false);assert.equal(f.find('url').value,'');f.ui.dispose();
});

test('listing old shares happens only on opening and lets a teacher select, copy and revoke an old link',async()=>{
  const f=fixture({onList:async()=>({shares:[metadata(ID),metadata(SECOND),{...metadata(THIRD),status:'revoked'}]})});assert.deepEqual(f.calls,[]);f.ui.open();await f.flush();assert.deepEqual(f.calls,[['list',{scope:'actor-1:student-A'}]]);assert.equal(f.find('history').hidden,false);const picker=f.find('history').querySelector('select');assert.equal(picker.children.length,2);assert.equal(f.find('url').value,url(ID));
  picker.value=SECOND;await picker.dispatch('change');assert.equal(f.find('url').value,url(SECOND));await f.find('copy').dispatch('click');assert.deepEqual(f.copied,[url(SECOND)]);assert.match(f.find('status').textContent,/DisplayText5020/);
  await f.find('revoke').dispatch('click');await f.flush();assert.equal(f.calls.at(-1)[0],'revoke');assert.equal(f.calls.at(-1)[1].share.id,SECOND);assert.equal(f.calls.at(-1)[1].scope,'actor-1:student-A');assert.equal(f.find('url').value,url(ID));assert.equal(f.find('history').hidden,true);assert.match(f.find('status').textContent,/DisplayText5012/);f.ui.dispose();
});

test('clipboard denial falls back to selecting the full URL without claiming it was copied',async()=>{
  const f=fixture({clipboard:async()=>{throw Error('denied');}});f.ui.open();await f.find('create').dispatch('click');await f.flush();await f.find('copy').dispatch('click');assert.equal(f.find('url').selected,true);assert.deepEqual(f.find('url').selection,[0,url(ID).length]);assert.equal(f.doc.activeElement,f.find('url'));assert.match(f.find('status').textContent,/DisplayText5022/);assert.doesNotMatch(f.find('status').textContent,/DisplayText5020/);f.ui.dispose();
});

test('teacher or student changes invalidate late publication and never show another home link',async()=>{
  for(const next of['actor-1:student-B','actor-2:student-A']){
    const deferred=pending(),f=fixture({onCreate:()=>deferred.promise});f.ui.open();void f.find('create').dispatch('click');assert.equal(f.find('create').disabled,true);f.state.scope=next;f.ui.refresh();assert.equal(f.ui.element.open,false);assert.equal(f.find('url').value,'');
    deferred.resolve({share:metadata(ID)});await f.flush();assert.equal(f.find('url').value,'');assert.equal(f.find('result').hidden,true);assert.equal(f.find('status').textContent,'');assert.equal(f.ui.button.disabled,false);f.ui.open();assert.equal(f.find('result').hidden,true);f.ui.dispose();
  }
});

test('closing while generation is pending retains its result only for the same identity',async()=>{
  const deferred=pending(),f=fixture({onCreate:()=>deferred.promise});f.ui.open();void f.find('create').dispatch('click');f.ui.close();assert.equal(f.ui.element.open,false);deferred.resolve({share:metadata()});await f.flush();assert.equal(f.ui.element.open,false);f.ui.open();assert.equal(f.find('url').value,url(ID));assert.equal(f.calls.length,1);f.ui.dispose();
});

test('a failed request keeps the existing link, exposes the error and does not optimistically revoke',async()=>{
  const f=fixture({onList:async()=>({shares:[metadata()]}),onRevoke:async()=>{throw Error("DisplayText5056");}});f.ui.open();await f.flush();await f.find('revoke').dispatch('click');await f.flush();assert.equal(f.find('url').value,url(ID));assert.match(f.find('status').textContent,/DisplayText5056/);assert.match(f.find('status').className,/is-error/);assert.equal(f.find('revoke').disabled,false);assert.deepEqual(f.errors,["DisplayText5056"]);f.ui.dispose();
});

test('an expired session or identity rejection clears cached links before notifying the page',async()=>{
  for(const fields of[{status:401},{status:409,code:'identity_changed'}]){
    const f=fixture({onList:async()=>({shares:[metadata()]}),onRevoke:async()=>{throw Object.assign(new Error("DisplayText4268"),fields);}});f.ui.open();await f.flush();assert.equal(f.find('url').value,url(ID));
    await f.find('revoke').dispatch('click');await f.flush();assert.equal(f.ui.element.open,false);assert.equal(f.find('url').value,'');assert.equal(f.find('result').hidden,true);assert.equal(f.find('open').href,'');assert.deepEqual(f.errors,["DisplayText4268"]);f.ui.dispose();
  }
});

test('malformed IDs, cross-origin URLs, credential URLs and editor URLs cannot become share links',async()=>{
  for(const row of [{...metadata(),id:'student-real-id'},{...metadata(),url:'https://other.test/games/homeworld/home-share.html?share='+ID},{...metadata(),url:'https://password@example.test/games/homeworld/home-share.html?share='+ID},{...metadata(),url:'https://example.test/games/homeworld/student-homes.html?share='+ID},{...metadata(),url:url(ID)+'&studentId=private'},{...metadata(),url:url(ID)+'#secret'}]){
    const f=fixture({onCreate:async()=>({share:row})});f.ui.open();await f.find('create').dispatch('click');await f.flush();assert.equal(f.find('result').hidden,true);assert.equal(f.find('url').value,'');assert.match(f.find('status').textContent,/DisplayText5001/);f.ui.dispose();
  }
});

test('Escape, modal focus boundaries and disposal do not leak actions or stale async results',async()=>{
  const deferred=pending(),f=fixture({onCreate:()=>deferred.promise});f.ui.button.focus();f.ui.open();let prevented=0,stopped=0;
  await f.ui.element.dispatch('keydown',{key:'Tab',shiftKey:true,preventDefault(){prevented++;}});assert.equal(f.doc.activeElement,f.find('create'));await f.ui.element.dispatch('keydown',{key:'Tab',preventDefault(){prevented++;}});assert.equal(f.doc.activeElement,f.find('close'));assert.equal(prevented,2);
  await f.ui.element.dispatch('keydown',{key:'Escape',preventDefault(){prevented++;},stopPropagation(){stopped++;}});assert.equal(f.ui.element.open,false);assert.equal(f.doc.activeElement,f.ui.button);assert.equal(stopped,1);
  f.ui.open();void f.find('create').dispatch('click');const all=f.doc.all();f.ui.dispose();deferred.resolve({share:metadata()});await f.flush();assert.equal(f.ui.element.isConnected,false);assert.equal(f.ui.button.isConnected,false);for(const node of all)for(const callbacks of node.events.values())assert.equal(callbacks.size,0);
});
