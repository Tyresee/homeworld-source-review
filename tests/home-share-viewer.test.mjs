import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';
import {createHomeState,validateHomeState} from '../public/js/home-engine.js';
import {HOME_THEMES} from '../public/js/home-theme.js';
import {getHomeShareCopy} from '../public/js/home-share-copy.js';
const source=await readFile(new URL('../public/js/home-share-page.js',import.meta.url),'utf8');
const pageUrl=new URL('../public/js/home-share-page.js',import.meta.url).href;
const id='A'.repeat(43);
function snapshot(){
  const home=createHomeState({profile:'upper'});
  return{share:{id,publishedAt:'2026-10-31T00:00:00.000Z',snapshot:{schemaVersion:1,gameId:'homeworld',theme:'warm',title:"Sample Learner Home",floors:[home],outdoor:{home:structuredClone(home),owned:[]},avatar:{kind:'robot',modelId:'robot-companion',modelVersion:'v4',colors:{shell:'#fff0d8',accent:'#7ca372'},equipped:{outfit:null,headwear:null,footwear:null}}}}};
}
function fixture({search='?share='+id,fetchImpl,loadRobot,spawn={x:1,z:1}}={}){
  const events=[],nodes=new Map(),timers=new Map();let timer=0;
  class Node{
    constructor(id){this.id=id;this.hidden=false;this.textContent='';this.attributes={};this.listeners=new Map();}
    setAttribute(name,value){this.attributes[name]=String(value);}
    addEventListener(name,fn){this.listeners.set(name,fn);}
    removeEventListener(name,fn){if(this.listeners.get(name)===fn)this.listeners.delete(name);}
  }
  for(const name of ['share-stage','share-loading','share-error','share-retry','share-error-title','share-error-detail','share-title','share-kind','share-meta-description','share-meta-title','share-meta-summary','share-published','share-loading-label'])nodes.set(name,new Node(name));
  const document={title:'',getElementById:name=>nodes.get(name),querySelector:()=>null},window={location:{search}};
  const response=(value=snapshot(),status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(value)});
  const fetches=[];const fetch=async(url,options)=>{fetches.push({url,options});return fetchImpl?fetchImpl(url,options):response();};
  const robotSource=new THREE.Group(),geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial();geometry.addEventListener('dispose',()=>events.push('source-geometry'));material.addEventListener('dispose',()=>events.push('source-material'));robotSource.add(new THREE.Mesh(geometry,material));
  let experienceOptions=null;
  const context={getHomeShareCopy,THREE,HOME_THEMES,validateHomeState:value=>validateHomeState(JSON.parse(JSON.stringify(value))),URL,URLSearchParams,AbortController,TextEncoder,structuredClone,Intl,Date,document,window,JSON:{parse(text){events.push('parse-public-json');return JSON.parse(text);},stringify:JSON.stringify},
    setTimeout(fn){const id=++timer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    GLTFLoader:class{},
    createHomeShareExperience:options=>{experienceOptions=options;events.push('experience');return{model:{robot:new THREE.Group()},scene:new THREE.Group(),estate:{},start(){events.push('start');},dispose(){events.push('viewer-dispose');},viewOverview(){events.push('overview');}};},
    createHomeMaterialMaps:()=>({maps:{oak:'actual-oak'},dispose(){events.push('maps-dispose');}}),
    createRobotAvatar:()=>new THREE.Group(),setRobotPalette:(robot,colors)=>events.push(['colors',structuredClone(colors)]),measureRobotAvatar:()=>({navigation:{radius:.3,height:1.4}}),disposeRobotAvatar:()=>events.push('robot-dispose'),
    createRobotWardrobe:()=>({setEquipment:value=>events.push(['equipment',structuredClone(value)]),dispose(){events.push('wardrobe-dispose');}}),
    findAvatarSpawn:()=>spawn,getHomeRoamGardenEntry:()=>new THREE.Vector3(10,-.02,5),
  };
  const executable=source.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(pageUrl));
  runInNewContext(executable+'\nglobalThis.api={createHomeSharePage,getHomeShareRequest,readHomeShareEnvelope};',context);
  const page=context.api.createHomeSharePage({document,window,fetchImpl:fetch,loadRobot:loadRobot??(async()=>robotSource)});
  return{page,api:context.api,nodes,events,fetches,timers,source:robotSource,response,get options(){return experienceOptions;}};
}

test('public link parsing accepts a random share ID or explicit fictional sample, never a student ID or ambiguous mode',()=>{
  const f=fixture(),parse=f.api.getHomeShareRequest;
  assert.equal(parse('?share='+id).path,'api/v1/shares/'+id);assert.equal(parse('?sample=1').path,'assets/home-share/sample.json');
  for(const search of ['', '?student=11111111-1111-4111-8111-111111111111','?share=../../private','?share='+id+'&sample=1','?share='+id+'&share='+id,'?sample=0','?share='+("☃".repeat(43))])assert.throws(()=>parse(search),error=>error.code==='invalid-link');
  f.page.dispose();
});

test('the public envelope rejects raw account fields, mismatched floors and unsupported robot assets before allocating a viewer',()=>{
  const f=fixture(),read=f.api.readHomeShareEnvelope,good=snapshot();assert.equal(read(good).snapshot.title,"Sample Learner Home");
  const attacks=[value=>{value.share.snapshot.studentId='private';},value=>{value.share.wallet={balance:42};},value=>{value.share.snapshot.outdoor.home.sandbox=!value.share.snapshot.outdoor.home.sandbox;},value=>{value.share.snapshot.avatar.modelVersion='remote';},value=>{value.share.snapshot.avatar.colors.shell='url(secret)';},value=>{value.share.snapshot.floors=[];}];
  for(const mutate of attacks){const input=snapshot();mutate(input);assert.throws(()=>read(input),error=>error.code==='invalid-snapshot');}
  const normalized=read(good);normalized.snapshot.floors[0].sandbox=!normalized.snapshot.floors[0].sandbox;assert.notEqual(normalized.snapshot.floors[0].sandbox,good.share.snapshot.floors[0].sandbox,'the rendering copy never aliases parsed public data');f.page.dispose();
});

test('the snapshot viewer introduces no extra storey cap beyond the existing legal shape and public byte budget',()=>{
  const f=fixture(),many=snapshot();many.share.snapshot.floors=Array.from({length:33},()=>structuredClone(many.share.snapshot.floors[0]));assert.equal(f.api.readHomeShareEnvelope(many).snapshot.floors.length,33);f.page.dispose();
});

test('an anonymous share performs one credential-free GET and uses the real spectator scene with saved materials and outfit',async()=>{
  const f=fixture();assert.equal(await f.page.start(),true);assert.equal(f.fetches.length,1);const request=f.fetches[0];assert.ok(request.url.endsWith('/api/v1/shares/'+id));assert.equal(request.options.method,'GET');assert.equal(request.options.credentials,'omit');assert.equal(request.options.referrerPolicy,'no-referrer');assert.equal(request.options.cache,'no-store');
  assert.equal(f.options.readOnly,true);assert.equal(f.options.theme,HOME_THEMES.warm);assert.equal(f.options.maps.oak,'actual-oak');assert.equal(Object.hasOwn(f.options,'lighting'),false,'the share renderer owns its independently calibrated lighting preset');assert.equal(f.options.robotStorey,0);assert.deepEqual(f.options.robot.position.toArray(),[1,.08,1]);
  assert.equal(f.events.find(value=>Array.isArray(value)&&value[0]==='colors')[1].accent,'#7ca372');assert.ok(f.events.some(value=>Array.isArray(value)&&value[0]==='equipment'));
  assert.equal(f.nodes.get('share-loading').hidden,true);assert.equal(f.nodes.get('share-error').hidden,true);assert.equal(f.nodes.get('share-kind').hidden,true);assert.equal(f.nodes.get('share-title').textContent,"Sample Learner Home");assert.equal(f.nodes.get('share-meta-description').attributes.content,"Every small effort can be seen.");assert.equal(f.nodes.get('share-stage').attributes['aria-busy'],'false');f.options.onExit();assert.ok(f.events.includes('overview'));
  assert.equal(Object.keys(f.options).some(key=>/save|wallet|student|account|checkout/i.test(key)),false,'no account command capability reaches the public viewer');
  f.page.dispose();f.page.dispose();for(const name of ['viewer-dispose','wardrobe-dispose','robot-dispose','maps-dispose','source-geometry','source-material'])assert.equal(f.events.filter(value=>value===name).length,1,name);assert.equal(f.timers.size,0);assert.equal(f.nodes.get('share-retry').listeners.size,0);
});

test('the fictional sample is a bundled GET-only preview with an honest label and no publication date',async()=>{
  const f=fixture({search:'?sample=1'});assert.equal(await f.page.start(),true);assert.ok(f.fetches[0].url.endsWith('/assets/home-share/sample.json'));assert.equal(f.nodes.get('share-kind').textContent,"fictional sample");assert.equal(f.nodes.get('share-kind').hidden,false);assert.equal(f.nodes.get('share-published').hidden,true);f.page.dispose();
});

test('unavailable or revoked shares never mount a scene and do not reveal an account or redirect to login',async()=>{
  for(const status of[404,410]){const f=fixture({fetchImpl:async()=>({ok:false,status,text:async()=>'{"private":"never read"}'})});assert.equal(await f.page.start(),false);assert.equal(f.options,null);assert.equal(f.nodes.get('share-error').hidden,false);assert.match(f.nodes.get('share-error-detail').textContent,/teacher for a new showcase link/);assert.equal(f.nodes.get('share-retry').hidden,true);assert.equal(f.fetches.length,1);f.page.dispose();}
  const invalid=fixture({search:'?student=private'});assert.equal(await invalid.page.start(),false);assert.equal(invalid.fetches.length,0);assert.match(invalid.nodes.get('share-error-detail').textContent,/complete showcase link/);invalid.page.dispose();
});

test('public response size measures UTF8 bytes, accepts the service budget plus envelope and rejects larger bodies before rendering',async()=>{
  const limit=4*1024*1024+4096,body=JSON.stringify(snapshot()),bytes=new TextEncoder().encode(body).byteLength;
  const accepted=fixture({fetchImpl:async()=>({ok:true,status:200,text:async()=>body+' '.repeat(limit-bytes)})});assert.equal(await accepted.page.start(),true);assert.equal(accepted.events.filter(value=>value==='parse-public-json').length,1);accepted.page.dispose();
  const rejected=fixture({fetchImpl:async()=>({ok:true,status:200,text:async()=>' '.repeat(limit+1)})});assert.equal(await rejected.page.start(),false);assert.equal(rejected.options,null);assert.equal(rejected.events.includes('experience'),false);assert.equal(rejected.events.includes('parse-public-json'),false);rejected.page.dispose();
  const unicode="♥".repeat(Math.floor(limit/3)+1);assert.ok(unicode.length<limit);assert.ok(new TextEncoder().encode(unicode).byteLength>limit);
  const rejectedUnicode=fixture({fetchImpl:async()=>({ok:true,status:200,text:async()=>unicode})});assert.equal(await rejectedUnicode.page.start(),false);assert.equal(rejectedUnicode.options,null);assert.equal(rejectedUnicode.events.includes('experience'),false);assert.equal(rejectedUnicode.events.includes('parse-public-json'),false,'a Unicode body larger in bytes is rejected before JSON parsing despite its smaller character count');rejectedUnicode.page.dispose();
});

test('late responses and assets cannot reopen a replaced or disposed snapshot and borrowed resources are retired',async()=>{
  let resolveFirst;const f=fixture({fetchImpl:async()=>{if(!resolveFirst)return new Promise(resolve=>{resolveFirst=resolve;});return f.response();}});
  const first=f.page.start();await Promise.resolve();const firstSignal=f.fetches[0].options.signal;assert.equal(await f.page.start(),true);assert.equal(firstSignal.aborted,true);resolveFirst(f.response());assert.equal(await first,false);assert.equal(f.events.filter(value=>value==='experience').length,1);f.page.dispose();
  let resolveAsset,assetStarted;const ready=new Promise(resolve=>{assetStarted=resolve;});const late=fixture({loadRobot:()=>new Promise(resolve=>{resolveAsset=resolve;assetStarted();})});const pending=late.page.start();await ready;late.page.dispose();resolveAsset(late.source);assert.equal(await pending,false);assert.equal(late.options,null);assert.equal(late.events.filter(value=>value==='source-geometry').length,1);assert.equal(late.timers.size,0);
});

test('a packed home uses actual clear estate lawn for the static companion instead of overlapping furniture',async()=>{
  const f=fixture({spawn:null});assert.equal(await f.page.start(),true);const robot=f.options.robot;assert.equal(robot.position.length(),0,'the borrowed original remains untouched');assert.equal(f.events.includes('start'),true);f.page.dispose();
});

test('the public document declares no-referrer/noindex and includes only the spectator page module',async()=>{
  const html=await readFile(new URL('../public/home-share.html',import.meta.url),'utf8');assert.match(html,/name="referrer" content="no-referrer"/);assert.match(html,/name="robots" content="noindex, nofollow, noarchive"/);assert.match(html,/\.\/js\/home-share-page\.js/);assert.match(html,/name="color-scheme" content="light dark"/);assert.match(html,/viewport-fit=cover/);assert.doesNotMatch(html,/student-homes\.js|home-shop|home-context-menu|palette|iframe|home-roam\.css/);assert.doesNotMatch(source,/localStorage|sessionStorage|\/api\/auth|\/students|platform-client|createStudentHomeWorld|createHomeRoamExperience/);assert.match(source,/import \{createHomeShareExperience\} from '\.\/home-share-world\.js'/);
});


test('the simplified share document omits promotional copy, the jump link and duplicate home icons',async()=>{
  const html=await readFile(new URL('../public/home-share.html',import.meta.url),'utf8');
  for(const copy of ["Small steps, steady progress","A little world built through learning and steady progress.","Take a closer look at this little world.","Each step of progress has a place here.","Explore my little world"])assert.equal(html.includes(copy),false,copy);
  assert.equal((html.match(/⌂/g)||[]).length,1);assert.match(html,/>Loading…</);assert.doesNotMatch(html,/share-intro|share-caption|share-seal|share-skip/);
});
