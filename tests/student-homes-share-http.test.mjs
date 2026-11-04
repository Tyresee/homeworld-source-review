import {getHomeShareCopy} from '../public/js/home-share-copy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStudentHomesService,API_PREFIX} from '../server/student-homes/app.mjs';
import {PlatformClient} from '../server/student-homes/platform-client.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const TENANT='share-http-isolated',ACTOR='share-teacher-one',PUBLIC='http://127.0.0.1:18803';
async function fixture(t){
  const dataDir=await mkdtemp(join(tmpdir(),'home-share-http-')),control={requests:[],authenticated:true,actor:ACTOR,students:[A],displayNames:{[A]:'Sample Learner A',[B]:'Sample Learner B'}};
  const client=new PlatformClient({origin:PUBLIC,publicOrigin:PUBLIC,fetchImpl:async(url,options)=>{
    control.requests.push({path:url.pathname,method:options.method??'GET',cookie:options.headers.cookie});
    const answer=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
    if(url.pathname==='/api/auth/me')return answer({authenticated:control.authenticated&&options.headers.cookie==='fictional=owner',user:{id:control.actor,role:'owner'}});
    if(url.pathname==='/api/game-points/v1/context')return answer({schemaVersion:'game-points-context.v1',tenantId:TENANT,currency:'platform-points',actor:{id:control.actor,role:'owner'}});
    if(url.pathname==='/api/student-profiles/v1')return answer({schemaVersion:'student-profile-store.v1',students:control.students.map(id=>({id,status:'active',displayName:control.displayNames[id],email:'private-roster@example.test',billingAccount:'private-billing-profile'}))});
    throw Error('Unexpected platform request '+url.pathname);
  }});
  const service=await createStudentHomesService({platformOrigin:PUBLIC,publicOrigin:PUBLIC,dataDir,platformClient:client});
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${service.server.address().port}`;
  t.after(async()=>{await service.close();await rm(dataDir,{recursive:true,force:true});});
  const {home}=await service.store.initializeHome(TENANT,A,ACTOR);
  async function request(path,{method='GET',body,cookie='fictional=owner',headers={}}={}){
    const response=await fetch(origin+API_PREFIX+path,{method,headers:{...(cookie?{cookie}:{}),...body?{'content-type':'application/json',origin:PUBLIC}:{},...headers},...body?{body:JSON.stringify(body)}:{}});const text=await response.text();return{response,data:text?JSON.parse(text):null};
  }
  const body={expectedUserId:ACTOR,expectedRevision:home.revision,commandId:'share-http-publish-0001'};
  return{service,control,home,request,body,origin};
}

test('public achievement GET and HEAD work without login or upstream calls and expose only the sanitized snapshot',async t=>{
  const f=await fixture(t),created=await f.request(`/students/${A}/shares`,{method:'POST',body:f.body});assert.equal(created.response.status,201);const id=created.data.share.id;
  assert.equal(created.data.share.url,`${PUBLIC}/games/homeworld/home-share.html?share=${id}`);assert.equal(created.data.duplicate,false);
  const file=f.service.shares.fileFor(id),before=await readFile(file),time=(await stat(file)).mtimeMs;f.control.requests=[];f.control.authenticated=false;
  const result=await f.request(`/shares/${id}`,{cookie:null});assert.equal(result.response.status,200);assert.equal(result.response.headers.get('cache-control'),'no-store');assert.equal(result.response.headers.get('referrer-policy'),'no-referrer');assert.equal(result.response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  const text=JSON.stringify(result.data);for(const secret of[A,TENANT,ACTOR,'private-roster@example.test','private-billing-profile','wallet','inventory','orders','commerce'])assert.equal(text.includes(secret),false,secret);assert.equal(result.data.share.snapshot.title,"Sample Learner A Home");assert.equal(result.data.share.snapshot.floors.length,1);assert.deepEqual(f.control.requests,[]);
  const head=await f.request(`/shares/${id}`,{method:'HEAD',cookie:null});assert.equal(head.response.status,200);assert.equal(head.data,null);
  for(const method of['POST','PATCH','DELETE','PUT']){const rejected=await f.request(`/shares/${id}`,{method,cookie:null});assert.equal(rejected.response.status,405);assert.equal(rejected.response.headers.get('allow'),'GET, HEAD');}
  assert.deepEqual(f.control.requests,[]);assert.deepEqual(await readFile(file),before);assert.equal((await stat(file)).mtimeMs,time);
});


test('publication uses the selected authorized roster name, freezes it per capability, and rejects caller-supplied title or name fields',async t=>{
  const f=await fixture(t);f.control.students=[A,B];await f.service.store.initializeHome(TENANT,B,ACTOR);
  const beforeA=await f.service.store.readRecord(TENANT,A),beforeB=await f.service.store.readRecord(TENANT,B);
  const a=await f.request(`/students/${A}/shares`,{method:'POST',body:f.body}),b=await f.request(`/students/${B}/shares`,{method:'POST',body:{...f.body,commandId:'share-http-other-0002'}});
  assert.equal(a.response.status,201);assert.equal(b.response.status,201);
  assert.equal((await f.request(`/shares/${a.data.share.id}`,{cookie:null})).data.share.snapshot.title,"Sample Learner A Home");assert.equal((await f.request(`/shares/${b.data.share.id}`,{cookie:null})).data.share.snapshot.title,"Sample Learner B Home");
  f.control.displayNames[A]='Renamed Learner A';const duplicate=await f.request(`/students/${A}/shares`,{method:'POST',body:f.body});assert.equal(duplicate.data.duplicate,true);assert.equal(duplicate.data.share.id,a.data.share.id);
  assert.equal((await f.request(`/shares/${a.data.share.id}`,{cookie:null})).data.share.snapshot.title,"Sample Learner A Home",'an existing frozen share never changes when the roster is renamed');
  const fresh=await f.request(`/students/${A}/shares`,{method:'POST',body:{...f.body,commandId:'share-http-renamed-0003'}});assert.equal((await f.request(`/shares/${fresh.data.share.id}`,{cookie:null})).data.share.snapshot.title,"Renamed Learner A Home");
  for(const extra of [{displayName:'Forged Name'},{studentName:'Forged Name'},{title:"Forged Name Home"}]){const rejected=await f.request(`/students/${A}/shares`,{method:'POST',body:{...f.body,...extra}});assert.equal(rejected.response.status,422);assert.equal(rejected.data.error.code,'invalid_request');}
  assert.deepEqual(await f.service.store.readRecord(TENANT,A),beforeA);assert.deepEqual(await f.service.store.readRecord(TENANT,B),beforeB);
  assert.ok(f.control.requests.every(request=>request.method==='GET'),'roster lookup and publication have no upstream financial writes');
});

test('authenticated teacher create, reload/list and revoke are scoped and idempotent without changing the home',async t=>{
  const f=await fixture(t),before=await f.service.store.readRecord(TENANT,A),a=await f.request(`/students/${A}/shares`,{method:'POST',body:f.body}),id=a.data.share.id;
  const duplicate=await f.request(`/students/${A}/shares`,{method:'POST',body:f.body});assert.equal(duplicate.response.status,200);assert.equal(duplicate.data.duplicate,true);assert.equal(duplicate.data.share.id,id);
  const listed=await f.request(`/students/${A}/shares`);assert.equal(listed.response.status,200);assert.equal(listed.data.shares.length,1);assert.equal(listed.data.shares[0].id,id);assert.equal(listed.data.shares[0].status,'active');assert.equal(Object.hasOwn(listed.data.shares[0],'snapshot'),false);
  f.control.actor='share-teacher-two';const other=await f.request(`/students/${A}/shares`);assert.deepEqual(other.data.shares,[]);const denied=await f.request(`/students/${A}/shares/${id}/revoke`,{method:'POST',body:{expectedUserId:f.control.actor}});assert.equal(denied.response.status,404);
  f.control.actor=ACTOR;const revoked=await f.request(`/students/${A}/shares/${id}/revoke`,{method:'POST',body:{expectedUserId:ACTOR}});assert.equal(revoked.response.status,200);assert.equal(revoked.data.share.status,'revoked');
  const stopped=await f.request(`/shares/${id}`,{cookie:null}),unknown=await f.request(`/shares/${'A'.repeat(43)}`,{cookie:null});assert.equal(stopped.response.status,404);assert.equal(stopped.data.error.code,'share_not_found');assert.deepEqual(stopped.data,unknown.data,'revoked and missing capabilities share the same response');
  assert.equal((await f.request(`/students/${A}/shares`)).data.shares[0].status,'revoked');assert.deepEqual(await f.service.store.readRecord(TENANT,A),before);
  assert.ok(f.control.requests.every(r=>r.method==='GET'),'no wallet or payment writes exist in a share request');
});

test('HTTP200 authenticated:false cannot create, list or revoke shares and does not advance to context or profile access',async t=>{
  const f=await fixture(t),created=await f.request(`/students/${A}/shares`,{method:'POST',body:f.body}),id=created.data.share.id;f.control.authenticated=false;f.control.requests=[];
  for(const[path,method,body]of[[`/students/${A}/shares`,'GET'],[`/students/${A}/shares`,'POST',f.body],[`/students/${A}/shares/${id}/revoke`,'POST',{expectedUserId:ACTOR}]]){
    const result=await f.request(path,{method,body});assert.equal(result.response.status,401);assert.equal(result.data.authenticated,false);assert.equal(result.data.error.code,'authentication_required');
  }
  assert.equal(f.control.requests.length,3);assert.ok(f.control.requests.every(r=>r.path==='/api/auth/me'));
  f.control.authenticated=true;for(const[path,method,body]of[[`/students/${A}/shares`,'GET'],[`/students/${A}/shares`,'POST',f.body],[`/students/${A}/shares/${id}/revoke`,'POST',{expectedUserId:ACTOR}]])assert.equal((await f.request(path,{method,body,cookie:null})).response.status,401);
  assert.equal((await f.request(`/shares/${id}`,{cookie:null})).response.status,200,'anonymous read remains separate from teacher authority');
});

test('teacher endpoints reject cross-origin writes, identity drift, stale revisions, unowned students and extra fields',async t=>{
  const f=await fixture(t),path=`/students/${A}/shares`;
  for(const headers of[{origin:'https://other.example'},{'sec-fetch-site':'cross-site'}]){const result=await f.request(path,{method:'POST',body:f.body,headers});assert.equal(result.response.status,403);assert.equal(result.data.error.code,'origin_forbidden');}
  for(const[body,status,code]of[[{...f.body,expectedUserId:'other'},409,'identity_changed'],[{...f.body,expectedRevision:1},409,'revision_conflict'],[{...f.body,expectedRevision:-1},422,'invalid_request'],[{...f.body,commandId:'bad'},422,'invalid_request'],[{...f.body,studentName:'hidden'},422,'invalid_request']]){
    const result=await f.request(path,{method:'POST',body});assert.equal(result.response.status,status);assert.equal(result.data.error.code,code);
  }
  assert.equal((await f.request(`/students/${B}/shares`,{method:'POST',body:f.body})).response.status,404);assert.equal((await f.request(`/students/${B}/shares`)).response.status,404);
  assert.equal((await f.request(path,{method:'PATCH'})).response.status,405);assert.equal((await f.request(path+'?other=1')).response.status,422);
  assert.deepEqual((await f.request(path)).data.shares,[]);assert.equal((await f.service.store.readRecord(TENANT,A)).home.revision,0);
});


test('anonymous share HTML renders the frozen name and description before JavaScript, escapes markup and never accesses the platform',async t=>{
  const f=await fixture(t);f.control.displayNames[A]='Sample <tag> & "Name"';
  const created=await f.request(`/students/${A}/shares`,{method:'POST',body:f.body}),id=created.data.share.id,path='/games/homeworld/home-share.html?share='+id;
  const file=f.service.shares.fileFor(id),before=await readFile(file);f.control.requests=[];f.control.authenticated=false;
  const response=await fetch(f.origin+path,{headers:{'accept-encoding':'br','if-none-match':'*'}}),html=await response.text();
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('content-encoding'),null);
  assert.match(html,/<title>Sample &lt;tag&gt; &amp; &quot;Name&quot; Home<\/title>/);assert.ok(html.includes(`content="${escapeShareExpected(getHomeShareCopy(f.control.displayNames[A]+" Home").description)}"`));
  assert.equal(html.includes('<tag>'),false);for(const secret of [A,TENANT,ACTOR,'private-roster@example.test','private-billing-profile'])assert.equal(html.includes(secret),false,secret);
  const head=await fetch(f.origin+path,{method:'HEAD'});assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),String(Buffer.byteLength(html)));assert.deepEqual(f.control.requests,[]);assert.deepEqual(await readFile(file),before);
  f.control.authenticated=true;await f.request(`/students/${A}/shares/${id}/revoke`,{method:'POST',body:{expectedUserId:ACTOR}});f.control.requests=[];
  const revoked=await (await fetch(f.origin+path)).text();assert.equal(revoked.includes('Sample &lt;tag&gt;'),false);assert.match(revoked,/<title>My Home<\/title>/);assert.deepEqual(f.control.requests,[]);
});

function escapeShareExpected(value){return String(value).replace(/[&<>\"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[char]));}
