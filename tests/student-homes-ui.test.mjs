import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createStudentHome} from '../server/student-homes/profile.mjs';
import {CATALOG_VERSION} from '../public/js/home-catalog-version.js';

const source=await readFile(new URL('../public/js/student-homes.js',import.meta.url),'utf8');
const API='/games/homeworld/api/v1';
const A={id:'11111111-1111-4111-8111-111111111111',displayName:"DisplayText4662"};
const B={id:'22222222-2222-4222-8222-222222222222',displayName:"DisplayText4663"};
const C={id:'33333333-3333-4333-8333-333333333333',displayName:"DisplayText4664"};
const D={id:'44444444-4444-4444-8444-444444444444',displayName:"DisplayText4665"};
const ACTOR='isolated-teacher-one',OTHER_ACTOR='isolated-teacher-two';
const SELECTION_KEY='homeworld:student-homes:selected-student:v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const identity=(id=ACTOR)=>({authenticated:true,actor:{id,role:'member',displayName:"DisplayText4660"}});
const wallet=(student,balance,duplicate=true)=>({wallet:{studentId:student.id,currency:'platform-points',balance},grant:{programId:'student-starter-v1',amount:50000,ledgerEntryId:'test-starter-receipt',createdAt:'2026-10-18T00:00:00.000Z'},baseline:{programId:'student-starter-baseline-v2',amount:150000,creditedAmount:150000,addedAmount:0,ledgerEntryId:null,createdAt:'2026-10-25T00:00:00.000Z',duplicate:true},duplicate});
const failure=(code,message="DisplayText4666")=>({error:{code,message}});
function savedHome(student,{revision=0,shell='#e9dfc9',accent='#869779'}={}) {
  const home=createStudentHome(student.id);home.revision=revision;home.avatar.colors={shell,accent};return home;
}
function tabStorage(value,unavailableMethod){
  const entries=new Map(value===undefined?[]:[[SELECTION_KEY,value]]);
  const available=method=>{if(method===unavailableMethod)throw new Error('Browser storage is unavailable');};
  return {
    getItem(key){available('getItem');return entries.get(key)??null;},
    setItem(key,value){available('setItem');entries.set(key,String(value));},
    removeItem(key){available('removeItem');entries.delete(key);},
    peek:()=>entries.get(SELECTION_KEY)??null,
  };
}
const savedSelection=(student=A,actorId=ACTOR)=>JSON.stringify({actorId,studentId:student.id});

// Run the production controller, not a reimplementation. Only its renderer is
// stubbed; fetch promises are completed explicitly in each test to reproduce
// out-of-order responses without timers or real student data. Passing the same
// storage to two fresh VM contexts reproduces a tab reload without retaining JS state.
function fixture({loadScene,storage=tabStorage()}={}) {
  class Element {
    constructor(tag='div') {
      this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.events={};
      this.hidden=true;this.disabled=false;this.value='';this.textContent='';this.title='';
      this.style={setProperty(name,value){this[name]=value;}};
    }
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=[...children];}
    setAttribute(name,value){this.attributes[name]=String(value);}
    addEventListener(name,callback){this.events[name]=callback;}
    focus(){}
    getBoundingClientRect(){return {width:900,height:700,top:0,left:0};}
  }
  const elements=new Map(),calls=[],events={},sceneCalls={activity:[],show:[],showOptions:[],palette:[],views:[],loads:0,clear:0,reloads:0};
  const $=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  function descendants(element){return [element,...element.children.flatMap(descendants)];}
  const document={
    getElementById:$,createElement:tag=>new Element(tag),createTextNode:text=>Object.assign(new Element('#text'),{textContent:text}),addEventListener(){},
    querySelectorAll(selector){
      const all=[...new Set([...elements.values()].flatMap(descendants))];
      if(selector==='.student')return all.filter(element=>element.className==='student');
      const data=selector.match(/^\[data-(shell|accent)\]$/)?.[1];
      assert.ok(data,`Unexpected fake DOM selector: ${selector}`);return all.filter(element=>data in element.dataset);
    },
  };
  let sceneOptions,view='interior';
  const scene={
    async show(home,options){sceneCalls.show.push(clone(home));sceneCalls.showOptions.push(clone(options??{}));sceneCalls.activity.push(clone(options?.robotActivity??null));},
    palette(colors){sceneCalls.palette.push(clone(colors));},
    clear(){sceneCalls.clear++;},wave(){},reset(){},dispose(){},
    getView:()=>view,setView(value){view=value;sceneCalls.views.push(value);sceneOptions.onViewChange(value);},
  };
  const context={document,CATALOG_VERSION,location:{reload(){sceneCalls.reloads++;}},addEventListener(name,callback){events[name]=callback;},createStudentHomeContextMenu:()=>({open(){},close(){},dispose(){}}),loadStudentHomeScene:async()=>{sceneCalls.loads++;if(loadScene)await loadScene();return (_container,options)=>{sceneOptions=options;return scene;};},
    ...(storage?{sessionStorage:storage}:{}),
    fetch(url,options){
      return new Promise((resolve,reject)=>calls.push({url,options,taken:false,
        reply(data,status=200){resolve({ok:status>=200&&status<300,status,json:async()=>clone(data)});},
        disconnect(){reject(new Error('Simulated lost response'));},
      }));
    },
  };
  assert.match(source,/^import \{loadStudentHomeScene\} from /);
  assert.match(source,/\nboot\(\);\s*$/);
  const executable=source.replace(/^import[^\n]+\n/gm,'').replace(/\nboot\(\);\s*$/,'');
  runInNewContext(executable+`
    globalThis.app={boot,selectStudent,claim,changeColor,refreshWallet,reloadIdentity,executeCommand,
      snapshot:()=>({session,students,selected,home,writing,selection}),retry:()=>retryAction?.()};
  `,context,{filename:'student-homes.js'});
  return {app:context.app,$,calls,events,sceneCalls,scene,storage,
    snapshot:()=>clone(context.app.snapshot()),
    async next(path,method=path.endsWith('/wallet/starter-grant')?'POST':'GET'){
      await flush();const call=calls.find(item=>!item.taken);assert.ok(call,`Expected ${method} ${path}`);
      assert.equal(call.url,API+path);assert.equal(call.options.method,method);
      assert.equal(call.options.credentials,'same-origin');assert.equal(call.options.cache,'no-store');
      call.taken=true;return call;
    },
    async startBoot(actor=ACTOR,students=[A,B]){
      const task=context.app.boot();(await this.next('/session')).reply(identity(actor));
      (await this.next('/students')).reply({students});return {task};
    },
    async boot(actor=ACTOR,students=[A,B]){
      const {task}=await this.startBoot(actor,students);await task;
    },
    async finishOpen(student=A,home=savedHome(student),balance=13){
      (await this.next(`/students/${student.id}/home`)).reply({home});
      (await this.next(`/students/${student.id}/wallet/starter-grant`)).reply(wallet(student,balance));
    },
    async open(student=A,home=savedHome(student),balance=13){
      const task=context.app.selectStudent(student);await this.finishOpen(student,home,balance);await task;
    },
  };
}

for(const lateStatus of [200,401])test(`student A late ${lateStatus} cannot replace student B or show a stale login error`,async()=>{
  const f=fixture();await f.boot();
  const old=f.app.selectStudent(A),oldRead=await f.next(`/students/${A.id}/home`);
  await f.open(B,savedHome(B,{shell:'#a7c7cf'}),29);
  const before=f.$('status').textContent;
  oldRead.reply(lateStatus===200?{home:savedHome(A)}:failure('unauthenticated'),lateStatus);await old;
  assert.equal(f.snapshot().selected.id,B.id);assert.equal(f.snapshot().home.studentId,B.id);
  assert.equal(f.$('balance').textContent,'29');assert.equal(f.$('status').textContent,before);
  assert.equal(f.$('login').hidden,true);assert.deepEqual(f.sceneCalls.show.map(home=>home.studentId),[B.id]);
  assert.equal(f.calls.some(call=>call.url===API+`/students/${A.id}/wallet/starter-grant`),false);
});

test('changing students invalidates a pending wallet request',async()=>{
  const f=fixture();await f.boot();await f.open();
  const old=f.app.refreshWallet(),oldRead=await f.next(`/students/${A.id}/wallet/starter-grant`);
  await f.open(B,savedHome(B),42);oldRead.reply(wallet(A,999));await old;
  assert.equal(f.snapshot().selected.id,B.id);assert.equal(f.$('balance').textContent,'42');
  assert.equal(f.$('refresh-wallet').disabled,false);
});

for(const lateStatus of [200,401])test(`same-student wallet refresh ignores an older ${lateStatus} after the newest reply`,async()=>{
  const f=fixture();await f.boot();await f.open();
  const old=f.app.refreshWallet(),oldRead=await f.next(`/students/${A.id}/wallet/starter-grant`);
  const current=f.app.refreshWallet(),currentRead=await f.next(`/students/${A.id}/wallet/starter-grant`);
  currentRead.reply(wallet(A,32));await current;const before=f.$('status').textContent;
  oldRead.reply(lateStatus===200?wallet(A,7):failure('unauthenticated'),lateStatus);await old;
  assert.equal(f.$('balance').textContent,'32');assert.equal(f.$('login').hidden,true);
  assert.equal(f.$('status').textContent,before);assert.equal(f.$('refresh-wallet').disabled,false);
});

for(const lostResponse of ['network','503'])test(`ambiguous ${lostResponse} after a successful color write confirms the saved revision without another PATCH`,async()=>{
  const f=fixture();await f.boot();await f.open();
  const task=f.app.changeColor('shell','#a7c7cf'),write=await f.next(`/students/${A.id}/home/avatar`,'PATCH');
  const body=JSON.parse(write.options.body);assert.equal(body.expectedUserId,ACTOR);assert.equal(body.expectedRevision,0);
  if(lostResponse==='network')write.disconnect();else write.reply(failure('storage_unavailable'),503);
  const saved=savedHome(A,{revision:1,shell:'#a7c7cf'});
  (await f.next(`/students/${A.id}/home`)).reply({home:saved});await task;
  assert.deepEqual(f.snapshot().home,saved);assert.equal(f.snapshot().writing,false);
  assert.match(f.$('status').textContent,/DisplayText4667.*DisplayText4668/);
  assert.deepEqual(f.sceneCalls.palette.at(-1),saved.avatar.colors);
  assert.equal(f.calls.filter(call=>call.options.method==='PATCH').length,1);
});

test('unknown write result followed by failed read stays explicitly unconfirmed, then retry reads instead of writing',async()=>{
  const f=fixture();await f.boot();await f.open();
  const task=f.app.changeColor('shell','#a7c7cf');(await f.next(`/students/${A.id}/home/avatar`,'PATCH')).disconnect();
  (await f.next(`/students/${A.id}/home`)).reply(failure('storage_unavailable'),503);await task;
  assert.match(f.$('status').textContent,/DisplayText4266/);assert.equal(f.$('retry').hidden,false);
  assert.doesNotMatch(f.$('status').textContent,/DisplayText4669|DisplayText4670/);
  const retry=f.app.retry(),saved=savedHome(A,{revision:1,shell:'#a7c7cf'});
  (await f.next(`/students/${A.id}/home`)).reply({home:saved});
  (await f.next(`/students/${A.id}/wallet/starter-grant`)).reply(wallet(A,13));await retry;
  assert.deepEqual(f.snapshot().home,saved);assert.equal(f.calls.filter(call=>call.options.method==='PATCH').length,1);
});

test('revision conflict restores server colors and sends the new revision only on a new user choice',async()=>{
  const f=fixture();await f.boot();await f.open();
  const task=f.app.changeColor('shell','#a7c7cf');(await f.next(`/students/${A.id}/home/avatar`,'PATCH')).reply(failure('revision_conflict'),409);
  const latest=savedHome(A,{revision:4,shell:'#d4c5dd',accent:'#906e82'});
  (await f.next(`/students/${A.id}/home`)).reply({home:latest});await task;
  assert.deepEqual(f.snapshot().home,latest);assert.match(f.$('status').textContent,/DisplayText4262/);
  assert.equal(f.calls.filter(call=>call.options.method==='PATCH').length,1);
  const next=f.app.changeColor('shell','#a7c7cf'),write=await f.next(`/students/${A.id}/home/avatar`,'PATCH');
  assert.deepEqual(JSON.parse(write.options.body),{expectedUserId:ACTOR,expectedRevision:4,colors:{shell:'#a7c7cf',accent:'#906e82'}});
  write.reply({home:savedHome(A,{revision:5,shell:'#a7c7cf',accent:'#906e82'})});await next;
});

for(const operation of ['claim','color'])test(`${operation} identity mismatch discards the old roster and never replays a write under the new account`,async()=>{
  const f=fixture();await f.boot();await f.open(A,operation==='claim'?null:savedHome(A));
  const task=operation==='claim'?f.app.claim():f.app.changeColor('shell','#a7c7cf');
  const path=operation==='claim'?'init':'avatar',method=operation==='claim'?'POST':'PATCH';
  const write=await f.next(`/students/${A.id}/home/${path}`,method);
  assert.equal(JSON.parse(write.options.body).expectedUserId,ACTOR);
  write.reply(failure('identity_changed'),409);
  const login=await f.next('/session');
  assert.equal(f.snapshot().home,null);assert.equal(f.snapshot().selected,null);assert.deepEqual(f.snapshot().students,[]);
  assert.equal(f.$('balance').textContent,'—');assert.equal(f.$('palette').hidden,true);
  login.reply(identity(OTHER_ACTOR));(await f.next('/students')).reply({students:[C,D]});await task;
  assert.equal(f.snapshot().session.actor.id,OTHER_ACTOR);assert.deepEqual(f.snapshot().students,[C,D]);
  assert.equal(f.snapshot().selected,null);assert.equal(f.snapshot().home,null);assert.equal(f.snapshot().writing,false);
  assert.equal(f.calls.filter(call=>call.options.method!=='GET'&&!call.url.endsWith('/wallet/starter-grant')).length,1);
  await f.open(C);const next=f.app.changeColor('accent','#608ea6'),newWrite=await f.next(`/students/${C.id}/home/avatar`,'PATCH');
  assert.equal(JSON.parse(newWrite.options.body).expectedUserId,OTHER_ACTOR);
  newWrite.reply({home:savedHome(C,{revision:1,accent:'#608ea6'})});await next;
  assert.equal(f.snapshot().home.studentId,C.id);
});

test('a failed initial home read cannot display the free-claim affordance or create a replacement save',async()=>{
  const f=fixture();await f.boot();
  const task=f.app.selectStudent(A);(await f.next(`/students/${A.id}/home`)).reply(failure('save_unavailable'),503);
  (await f.next(`/students/${A.id}/wallet/starter-grant`)).reply(wallet(A,13));await task;
  assert.equal(f.$('welcome').hidden,true);assert.equal(f.$('home-tools').hidden,true);
  assert.equal(f.snapshot().home,null);assert.equal(f.calls.every(call=>call.options.method==='GET'||call.url.endsWith('/wallet/starter-grant')),true);
  assert.match(f.$('scene-message').textContent,/DisplayText4671/);assert.equal(f.$('retry').hidden,false);
});

test('HTTP 200 with authenticated false does not fetch students or allow a claim',async()=>{
  const f=fixture(),task=f.app.boot();(await f.next('/session')).reply({authenticated:false,actor:{id:ACTOR}});await task;
  await f.app.claim();assert.equal(f.calls.length,1);assert.deepEqual(f.snapshot().students,[]);
  assert.match(f.$('status').textContent,/DisplayText4672/);
});


test('starter gift is a fixed server program and displays current balance without replacing earned points',async()=>{
  const f=fixture();await f.boot();const opening=f.app.selectStudent(A);
  (await f.next(`/students/${A.id}/home`)).reply({home:savedHome(A)});
  const grant=await f.next(`/students/${A.id}/wallet/starter-grant`);
  assert.deepEqual(JSON.parse(grant.options.body),{expectedUserId:ACTOR});
  grant.reply(wallet(A,50013,false));await opening;
  assert.equal(f.$('balance').textContent,'50,013');assert.match(f.$('starter-note').textContent,/150,000/);
  const refresh=f.app.refreshWallet();(await f.next(`/students/${A.id}/wallet/starter-grant`)).reply(wallet(A,50013));await refresh;
  assert.equal(f.$('balance').textContent,'50,013');assert.match(f.$('starter-note').textContent,/DisplayText4245/);
});

test('lost starter reply shows an unconfirmed outcome and retries the same fixed program',async()=>{
  const f=fixture();await f.boot();const opening=f.app.selectStudent(A);
  (await f.next(`/students/${A.id}/home`)).reply({home:savedHome(A)});
  (await f.next(`/students/${A.id}/wallet/starter-grant`)).disconnect();await opening;
  assert.equal(f.$('balance').textContent,'—');assert.match(f.$('starter-note').textContent,/DisplayText4673/);
  const retry=f.app.retry();const grant=await f.next(`/students/${A.id}/wallet/starter-grant`);grant.reply(wallet(A,50000));await retry;
  assert.equal(f.$('balance').textContent,'50,000');assert.match(f.$('starter-note').textContent,/DisplayText4245/);
});

test('starter identity mismatch clears the previous teacher and never replays that student write',async()=>{
  const f=fixture();await f.boot();await f.open(A,savedHome(A),50000);
  const task=f.app.refreshWallet();(await f.next(`/students/${A.id}/wallet/starter-grant`)).reply(failure('identity_changed'),409);
  (await f.next('/session')).reply(identity(OTHER_ACTOR));(await f.next('/students')).reply({students:[C,D]});await task;
  assert.equal(f.snapshot().selected,null);assert.equal(f.$('balance').textContent,'—');
  assert.equal(f.snapshot().session.actor.id,OTHER_ACTOR);assert.match(f.$('starter-note').textContent,/DisplayText4674/);
});

test('commerce command binds student actor and revision, blocks switching, and publishes acknowledged wallet',async()=>{
  const f=fixture();await f.boot();await f.open(A,savedHome(A),50000);
  const command={type:'checkout',lines:[{skuId:'bed-essential',quantity:1}]};
  const task=f.app.executeCommand(command,'qa-order-123'),write=await f.next(`/students/${A.id}/home/commands`,'POST');
  assert.deepEqual(JSON.parse(write.options.body),{expectedUserId:ACTOR,expectedRevision:0,commandId:'qa-order-123',command,expectedCatalogVersion:CATALOG_VERSION});
  await f.app.selectStudent(B);assert.equal(f.snapshot().selected.id,A.id);assert.equal(f.snapshot().writing,true);
  write.reply({home:savedHome(A,{revision:1}),wallet:{studentId:A.id,currency:'platform-points',balance:48500},receipt:{status:'delivered'}});await task;
  assert.equal(f.snapshot().home.revision,1);assert.equal(f.$('balance').textContent,'48,500');assert.equal(f.snapshot().writing,false);
});

test('commerce revision conflict reloads authoritative home without replaying purchase',async()=>{
  const f=fixture();await f.boot();await f.open();
  const task=f.app.executeCommand({type:'checkout',lines:[]},'qa-order-456');const rejection=assert.rejects(task,/DisplayText4675/);
  (await f.next(`/students/${A.id}/home/commands`,'POST')).reply(failure('revision_conflict'),409);
  (await f.next(`/students/${A.id}/home`)).reply({home:savedHome(A,{revision:4})});await rejection;
  assert.equal(f.snapshot().home.revision,4);assert.equal(f.calls.filter(c=>c.url.endsWith('/commands')).length,1);
});

test('catalog change preserves the selected house and offers a page refresh without retrying payment',async()=>{
  const f=fixture();await f.boot();await f.open();
  const before=f.sceneCalls.show.length,task=f.app.executeCommand({type:'checkout',lines:[{skuId:'bed-classic',quantity:1}]},'qa-old-catalog');
  const rejection=assert.rejects(task,/DisplayText4643/);
  (await f.next(`/students/${A.id}/home/commands`,'POST')).reply(failure('catalog_changed',"DisplayText4575, DisplayText4576; DisplayText4577."),409);
  await rejection;
  assert.equal(f.snapshot().selected.id,A.id);assert.equal(f.snapshot().writing,false);
  assert.equal(f.sceneCalls.show.length,before);assert.equal(f.$('retry').hidden,false);assert.equal(f.$('retry').textContent,"DisplayText3805");
  assert.match(f.$('status').textContent,/DisplayText4576/);
  assert.equal(f.calls.filter(row=>row.url.endsWith('/commands')).length,1);
  await f.app.retry();assert.equal(f.sceneCalls.reloads,1);
  assert.equal(f.calls.filter(row=>row.url.endsWith('/commands')).length,1);
});


test('roster and login load without fetching the 3D editor; selection starts loading alongside its save',async()=>{
  let resolveLoader;const pending=new Promise(resolve=>resolveLoader=resolve);
  const f=fixture({loadScene:()=>pending});await f.boot();assert.equal(f.sceneCalls.loads,0);
  const task=f.app.selectStudent(A);assert.equal(f.sceneCalls.loads,1);
  (await f.next(`/students/${A.id}/home`)).reply({home:savedHome(A)});
  await flush();assert.equal(f.sceneCalls.show.length,0);assert.equal(f.$('home-tools').hidden,true);
  resolveLoader();(await f.next(`/students/${A.id}/wallet/starter-grant`)).reply(wallet(A,50000));await task;
  assert.equal(f.sceneCalls.show.length,1);assert.equal(f.$('home-tools').hidden,false);
});

test('fixed view controls switch without server writes and stay synchronized with other view changes',async()=>{
  const f=fixture();await f.boot();await f.open();const requestCount=f.calls.length;
  assert.equal(f.$('view-interior').attributes['aria-pressed'],'true');
  for(const view of ['estate','building','interior']){
    f.$('view-'+view).events.click();assert.equal(f.sceneCalls.views.at(-1),view);
    for(const key of ['interior','estate','building'])assert.equal(f.$('view-'+key).attributes['aria-pressed'],String(view===key));
  }
  f.scene.setView('estate');assert.equal(f.$('view-estate').attributes['aria-pressed'],'true');
  assert.equal(f.calls.length,requestCount);
});

test('view buttons are disabled during an authoritative save and cannot interrupt it',async()=>{
  const f=fixture();await f.boot();await f.open();
  const task=f.app.changeColor('shell','#a7c7cf');const write=await f.next(`/students/${A.id}/home/avatar`,'PATCH');
  assert.equal(f.$('view-estate').disabled,true);f.$('view-estate').events.click();assert.equal(f.sceneCalls.views.length,0);
  write.reply({home:savedHome(A,{revision:1,shell:'#a7c7cf'})});await task;
  assert.equal(f.$('view-estate').disabled,false);
});

test('refresh restores the selected student only after authentication and roster, and reads the latest server home',async()=>{
  const storage=tabStorage(),first=fixture({storage});await first.boot();await first.open(A,savedHome(A,{revision:2}),50000);
  assert.deepEqual(JSON.parse(storage.peek()),{actorId:ACTOR,studentId:A.id});

  const refreshed=fixture({storage}),task=refreshed.app.boot();
  assert.equal(refreshed.snapshot().selected,null);assert.equal(refreshed.sceneCalls.loads,0);
  (await refreshed.next('/session')).reply(identity());
  const roster=await refreshed.next('/students');
  assert.equal(refreshed.calls.length,2);assert.equal(refreshed.snapshot().selected,null);
  const renamed={...A,displayName:"DisplayText4676"};roster.reply({students:[renamed,B]});
  const latest=savedHome(A,{revision:7,shell:'#a7c7cf'});
  await refreshed.finishOpen(A,latest,48500);await task;
  assert.equal(refreshed.snapshot().selected.displayName,renamed.displayName);
  assert.deepEqual(refreshed.snapshot().home,latest);assert.deepEqual(refreshed.sceneCalls.show,[latest]);
  assert.equal(refreshed.$('home-title').textContent,`${renamed.displayName}DisplayText4252`);
  assert.equal(refreshed.$('balance').textContent,'48,500');
  assert.deepEqual(JSON.parse(storage.peek()),{actorId:ACTOR,studentId:A.id});
});

test('switching students immediately replaces the remembered selection and refresh opens only the latest one',async()=>{
  const storage=tabStorage(),first=fixture({storage});await first.boot();await first.open();
  const selecting=first.app.selectStudent(B);
  assert.deepEqual(JSON.parse(storage.peek()),{actorId:ACTOR,studentId:B.id});
  await first.finishOpen(B,savedHome(B),32000);await selecting;
  const refreshed=fixture({storage}),{task}=await refreshed.startBoot();
  await refreshed.finishOpen(B,savedHome(B,{revision:3}),31500);await task;
  assert.equal(refreshed.snapshot().selected.id,B.id);
  assert.equal(refreshed.calls.some(call=>call.url.includes(`/students/${A.id}/`)),false);
});

test('a remembered student never crosses teacher accounts even when both rosters contain that student',async()=>{
  const storage=tabStorage(savedSelection()),f=fixture({storage});await f.boot(OTHER_ACTOR,[A,B]);
  assert.equal(f.snapshot().selected,null);assert.equal(f.snapshot().home,null);assert.equal(storage.peek(),null);
  assert.equal(f.sceneCalls.loads,0);assert.equal(f.calls.length,2);
  await f.open(B);assert.deepEqual(JSON.parse(storage.peek()),{actorId:OTHER_ACTOR,studentId:B.id});
});

test('a student removed from the current roster is forgotten without requesting their save',async()=>{
  const storage=tabStorage(savedSelection()),f=fixture({storage});await f.boot(ACTOR,[B,C]);
  assert.equal(storage.peek(),null);assert.equal(f.snapshot().selected,null);assert.equal(f.calls.length,2);
  assert.equal(f.sceneCalls.loads,0);
});

for(const value of ['not-json','null','[]','{}',JSON.stringify({actorId:ACTOR,studentId:23})])test(`invalid remembered selection ${value} is cleared and manual selection remains usable`,async()=>{
  const storage=tabStorage(value),f=fixture({storage});await f.boot();
  assert.equal(storage.peek(),null);assert.equal(f.snapshot().selected,null);assert.equal(f.calls.length,2);
  await f.open(B);assert.equal(f.snapshot().home.studentId,B.id);
  assert.deepEqual(JSON.parse(storage.peek()),{actorId:ACTOR,studentId:B.id});
});

for(const unavailableMethod of ['getItem','setItem','removeItem'])test(`unavailable browser storage ${unavailableMethod} does not prevent manual selection`,async()=>{
  const storage=tabStorage(unavailableMethod==='removeItem'?'not-json':undefined,unavailableMethod),f=fixture({storage});
  await f.boot();assert.equal(f.snapshot().selected,null);await f.open(B,savedHome(B),14000);
  assert.equal(f.snapshot().home.studentId,B.id);assert.equal(f.$('balance').textContent,'14,000');
  assert.deepEqual(f.sceneCalls.show.map(home=>home.studentId),[B.id]);
});

test('a browser with no storage API still opens and renders a selected home',async()=>{
  const f=fixture({storage:null});await f.boot();await f.open(B);
  assert.equal(f.snapshot().selected.id,B.id);assert.equal(f.snapshot().home.studentId,B.id);
});

test('a remembered selection is not restored for an HTTP 200 unauthenticated session',async()=>{
  const storage=tabStorage(savedSelection()),f=fixture({storage}),task=f.app.boot();
  (await f.next('/session')).reply({authenticated:false,actor:{id:ACTOR}});await task;
  await f.app.selectStudent(A);
  assert.equal(f.calls.length,1);assert.equal(f.snapshot().selected,null);assert.equal(f.snapshot().home,null);
  assert.equal(f.sceneCalls.loads,0);assert.match(f.$('status').textContent,/DisplayText4672/);
});

test('an expired session cannot restore the remembered student or start loading 3D',async()=>{
  const f=fixture({storage:tabStorage(savedSelection())}),task=f.app.boot();
  (await f.next('/session')).reply(failure('unauthenticated'),401);await task;
  assert.equal(f.calls.length,1);assert.equal(f.snapshot().selected,null);assert.equal(f.sceneCalls.loads,0);
  assert.equal(f.$('login').hidden,false);
});

test('the only current student is still automatically selected when a stale selection is discarded',async()=>{
  const storage=tabStorage(savedSelection()),f=fixture({storage}),{task}=await f.startBoot(ACTOR,[B]);
  await f.finishOpen(B,savedHome(B),18000);await task;
  assert.equal(f.snapshot().selected.id,B.id);assert.equal(f.snapshot().home.studentId,B.id);
  assert.deepEqual(JSON.parse(storage.peek()),{actorId:ACTOR,studentId:B.id});
});

test('invalid manual selections cannot overwrite a remembered student or fetch an unlisted home',async()=>{
  const storage=tabStorage(),f=fixture({storage});await f.boot();await f.open();const before=f.calls.length;
  await f.app.selectStudent(C);await f.app.selectStudent(null);
  assert.equal(f.calls.length,before);assert.equal(f.snapshot().selected.id,A.id);
  assert.deepEqual(JSON.parse(storage.peek()),{actorId:ACTOR,studentId:A.id});
});

test('saved robot sleep is passed independently of the home snapshot across student switches and a fresh page reload',async()=>{
  const f=fixture();await f.boot();const home=savedHome(A,{revision:7}),sleep={kind:'sleep',itemId:'owned-bed-isolated-a',storey:1};
  const open=async(testFixture,student,value,activity)=>{const task=testFixture.app.selectStudent(student);
    (await testFixture.next(`/students/${student.id}/home`)).reply({home:value,robotActivity:activity});
    (await testFixture.next(`/students/${student.id}/wallet/starter-grant`)).reply(wallet(student,125000));await task;};
  await open(f,A,home,sleep);assert.deepEqual(f.sceneCalls.activity.at(-1),sleep);assert.deepEqual(f.snapshot().home,home,'semantic activity must not be inserted in the authoritative home snapshot');
  await f.open(B);assert.equal(f.sceneCalls.activity.at(-1),null);
  await open(f,A,home,sleep);assert.deepEqual(f.sceneCalls.activity.at(-1),sleep);
  const reloaded=fixture({storage:f.storage}),{task}=await reloaded.startBoot();
  (await reloaded.next(`/students/${A.id}/home`)).reply({home,robotActivity:sleep});
  (await reloaded.next(`/students/${A.id}/wallet/starter-grant`)).reply(wallet(A,125000));await task;
  assert.deepEqual(reloaded.sceneCalls.activity.at(-1),sleep);assert.equal(reloaded.sceneCalls.show.at(-1).studentId,A.id);
});

test('student switching waits for the previous robot checkpoint acknowledgement before clearing A and reading B',async()=>{
  const f=fixture();await f.boot();await f.open(A,savedHome(A,{revision:3}),125000);
  const checkpoint={kind:'stand',environment:'interior',storey:0,point:{x:1,z:1},rotation:.5};
  f.scene.prepareLeave=()=>f.app.executeCommand({type:'setRobotActivity',activity:checkpoint},'isolated-leave-a',
    {actorId:ACTOR,studentId:A.id,expectedRevision:3});
  const cleared=f.sceneCalls.clear,selection=f.snapshot().selection,task=f.app.selectStudent(B);
  const save=await f.next(`/students/${A.id}/home/commands`,'POST');
  assert.deepEqual(JSON.parse(save.options.body),{expectedUserId:ACTOR,expectedRevision:3,commandId:'isolated-leave-a',command:{type:'setRobotActivity',activity:checkpoint}});
  assert.equal(f.snapshot().selected.id,A.id);assert.equal(f.snapshot().selection,selection);assert.equal(f.sceneCalls.clear,cleared);
  assert.deepEqual(JSON.parse(f.storage.peek()),{actorId:ACTOR,studentId:A.id});
  assert.equal(f.calls.some(call=>call.url===API+`/students/${B.id}/home`),false);
  save.reply({home:savedHome(A,{revision:4}),robotActivity:checkpoint,receipt:{amount:0,status:'delivered'}});
  await f.finishOpen(B,savedHome(B,{revision:8}),110000);await task;
  assert.equal(f.snapshot().selected.id,B.id);assert.equal(f.snapshot().home.revision,8);assert.equal(f.sceneCalls.clear,cleared+1);
  assert.deepEqual(JSON.parse(f.storage.peek()),{actorId:ACTOR,studentId:B.id});
});

test('an identity-bound late robot acknowledgement for A cannot overwrite the selected B snapshot or renderer',async()=>{
  const f=fixture();await f.boot();await f.open(A,savedHome(A,{revision:2}),125000);
  const checkpoint={kind:'furniture',action:'sit',itemId:'isolated-sofa-a',storey:0};
  const task=f.app.executeCommand({type:'setRobotActivity',activity:checkpoint},'isolated-delayed-a',
    {actorId:ACTOR,studentId:A.id,expectedRevision:2});
  const save=await f.next(`/students/${A.id}/home/commands`,'POST');assert.equal(f.snapshot().writing,false);
  await f.open(B,savedHome(B,{revision:7,shell:'#a7c7cf'}),140000);
  const before=f.snapshot(),showCount=f.sceneCalls.show.length,status=f.$('status').textContent;
  const acknowledged=savedHome(A,{revision:3});save.reply({home:acknowledged,robotActivity:checkpoint,wallet:wallet(A,999999).wallet});
  const result=await task;assert.deepEqual(clone(result.home),acknowledged);
  assert.deepEqual(f.snapshot(),before);assert.equal(f.sceneCalls.show.length,showCount);assert.equal(f.$('balance').textContent,'140,000');assert.equal(f.$('status').textContent,status);
});

test('pagehide captures synchronously before disposal and posts keepalive with the current actor student and revision',async()=>{
  const f=fixture();await f.boot();await f.open(A,savedHome(A,{revision:6}),120000);
  const checkpoint={kind:'stand',environment:'estate',storey:0,point:{x:6,z:7},rotation:-.5},order=[];let leaving;
  f.scene.prepareLeave=options=>{
    order.push('capture');assert.deepEqual(clone(options),{keepalive:true});
    return leaving=f.app.executeCommand({type:'setRobotActivity',activity:checkpoint},'isolated-pagehide-a',
      {actorId:ACTOR,studentId:A.id,expectedRevision:6,keepalive:options.keepalive});
  };
  f.scene.dispose=()=>order.push('dispose');f.events.pagehide({persisted:false});
  assert.deepEqual(order,['capture','dispose']);
  const save=await f.next(`/students/${A.id}/home/commands`,'POST');assert.equal(save.options.keepalive,true);
  assert.deepEqual(JSON.parse(save.options.body),{expectedUserId:ACTOR,expectedRevision:6,commandId:'isolated-pagehide-a',command:{type:'setRobotActivity',activity:checkpoint}});
  save.reply({home:savedHome(A,{revision:7}),robotActivity:checkpoint});await leaving;
  assert.equal(f.snapshot().session.actor.id,ACTOR);assert.equal(f.snapshot().selected.id,A.id);
});

test('opening replays the identity-bound pending robot state before showing the updated authoritative home',async()=>{
  const f=fixture();await f.boot();const initial=savedHome(A,{revision:2}),replayed=savedHome(A,{revision:5}),checkpoint={kind:'furniture',action:'read',itemId:'isolated-bookcase',storey:0,time:2,remaining:3};
  let finishReplay,input,homeDuringShow;const pending=new Promise(resolve=>finishReplay=resolve),show=f.scene.show.bind(f.scene);
  f.scene.replayRobotActivity=value=>{input=clone(value);return pending;};
  f.scene.show=async(...args)=>{homeDuringShow=f.snapshot().home;await show(...args);};
  const task=f.app.selectStudent(A);(await f.next(`/students/${A.id}/home`)).reply({home:initial,robotActivity:null});await flush();
  assert.deepEqual(input,{actorId:ACTOR,studentId:A.id,home:initial,robotActivity:null});assert.equal(f.sceneCalls.show.length,0);
  finishReplay({home:replayed,robotActivity:checkpoint});
  (await f.next(`/students/${A.id}/wallet/starter-grant`)).reply(wallet(A,120000));await task;
  assert.deepEqual(homeDuringShow,replayed);assert.deepEqual(f.snapshot().home,replayed);assert.deepEqual(f.sceneCalls.show,[replayed]);
  assert.deepEqual(f.sceneCalls.showOptions.at(-1),{robotActivity:checkpoint,actorId:ACTOR});
});

test('robot revision conflict returns its fresh snapshot without redrawing or resetting the active robot',async()=>{
  const f=fixture();await f.boot();await f.open(A,savedHome(A,{revision:1}),120000);
  const checkpoint={kind:'furniture',action:'cook',itemId:'isolated-cooker',storey:0,time:1,remaining:4},fresh={home:savedHome(A,{revision:9}),robotActivity:{kind:'stand',environment:'interior',storey:0,point:{x:0,z:1},rotation:0}};
  const shown=f.sceneCalls.show.length,task=f.app.executeCommand({type:'setRobotActivity',activity:checkpoint},'isolated-conflict-a',
    {actorId:ACTOR,studentId:A.id,expectedRevision:1});
  const rejected=assert.rejects(task,error=>{assert.equal(error.status,409);assert.equal(error.code,'revision_conflict');assert.deepEqual(clone(error.snapshot),fresh);return true;});
  (await f.next(`/students/${A.id}/home/commands`,'POST')).reply(failure('revision_conflict'),409);
  (await f.next(`/students/${A.id}/home`)).reply(fresh);await rejected;
  assert.deepEqual(f.snapshot().home,fresh.home);assert.equal(f.snapshot().session.actor.id,ACTOR);assert.equal(f.snapshot().selected.id,A.id);
  assert.equal(f.sceneCalls.show.length,shown);assert.equal(f.sceneCalls.clear,0);assert.equal(f.snapshot().writing,false);
  assert.equal(f.calls.filter(call=>call.url.endsWith('/commands')).length,1);
});
