import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {createStudentHomesService,API_PREFIX,LOGIN_PATH,readReleaseVersion} from '../server/student-homes/app.mjs';
import {PlatformClient,trustedOrigin} from '../server/student-homes/platform-client.mjs';
import {StudentHomeStore} from '../server/student-homes/store.mjs';
import {createStudentHome,validateStudentHome} from '../server/student-homes/profile.mjs';

// Fictional UUIDs. No browser storage, production origin, real students or wallet writes.
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',UNKNOWN='33333333-3333-4333-8333-333333333333';
const USER='test-teacher-one',TENANT='test-project-owner',PUBLIC='http://127.0.0.1:18803';
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
const stop=server=>new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections();});
async function fixture(t,{fsImpl}={}) {
  const directory=await fs.mkdtemp(join(tmpdir(),'homeworld-student-home-test-'));
  const control={authenticated:true,actorId:USER,role:'member',tenantId:TENANT,sessionStatus:200,contextStatus:200,
    students:[A,B].map((id,index)=>({id,displayName:`DisplayText4658 ${index+1}`,nickname:"DisplayText4659",note:"DisplayText4659",assets:{balance:1000000},status:'active'})),walletBalance:0,requests:[]};
  const platform=createServer((request,response)=>{
    control.requests.push({path:request.url,method:request.method,cookie:request.headers.cookie});
    response.setHeader('content-type','application/json');let body;
    if(request.url==='/api/auth/me'){response.statusCode=control.sessionStatus;body={authenticated:control.authenticated,user:{id:control.actorId,role:control.role,displayName:"DisplayText4660"},session:{token:'not-forwarded'}};}
    else if(request.url==='/api/game-points/v1/context'){response.statusCode=control.contextStatus;body={schemaVersion:'game-points-context.v1',tenantId:control.tenantId,currency:'platform-points',actor:{id:control.contextActor??control.actorId,role:control.role}};}
    else if(request.url==='/api/student-profiles/v1')body={schemaVersion:'student-profile-store.v1',students:control.students};
    else if(request.url.match(/^\/api\/game-points\/v1\/students\/[^/]+\/wallet$/))body={wallet:{tenantId:control.tenantId,studentId:request.url.split('/')[5],currency:'platform-points',balance:control.walletBalance,totalEarned:control.walletBalance,totalSpent:0,totalRefunded:0,revision:0}};
    else{response.statusCode=404;body={};}
    response.end(JSON.stringify(body));
  });
  const platformOrigin=await listen(platform);
  let service,origin;
  async function start(){
    service=await createStudentHomesService({platformOrigin,publicOrigin:PUBLIC,dataDir:directory,
      ...(fsImpl?{store:new StudentHomeStore({dataDir:directory,fsImpl})}:{})});origin=await listen(service.server);
  }
  await start();
  t.after(async()=>{await service.close();await stop(platform);await fs.rm(directory,{recursive:true,force:true});});
  return {control,directory,platformOrigin,get service(){return service;},
    async restart(){await service.close();await start();},
    async call(path,{method='GET',body,cookie='fixture-session=teacher',originHeader=PUBLIC}={}){
      const response=await fetch(origin+API_PREFIX+path,{method,headers:{...(cookie?{cookie}:{}),...(method!=='GET'?{'content-type':'application/json',origin:originHeader}:{})},body:body===undefined?undefined:JSON.stringify(body)});
      return {status:response.status,body:await response.json(),headers:response.headers};
    },async root(path='/'){return fetch(origin+path,{redirect:'manual'});}
  };
}
const init=(f,id=A,user=USER)=>f.call(`/students/${id}/home/init`,{method:'POST',body:{expectedUserId:user}});
const color=(f,id=A,revision=0,colors={shell:'#abc123',accent:'#ddee00'},user=USER)=>f.call(`/students/${id}/home/avatar`,{method:'PATCH',body:{expectedUserId:user,expectedRevision:revision,colors}});

test('formal starter is one 29.12 m² empty room and robot, with no wallet or demo gift inventory',()=>{
  const home=createStudentHome(A);assert.equal(validateStudentHome(home,A),true);assert.equal(home.house.floors.length,1);
  assert.equal(home.house.floors[0].rooms[0].id,'student-living');assert.ok(Math.abs(home.house.floors[0].slab.rects[0].width*home.house.floors[0].slab.rects[0].depth-29.12)<1e-9);
  assert.equal(home.avatar.kind,'robot');assert.deepEqual(home.inventory,[]);assert.equal('wallet'in home,false);assert.equal('sandbox'in home,false);
  home.wallet={balance:1000000};assert.equal(validateStudentHome(home,A),false);
});
test('A/B homes isolate, initial GET has no side effect, concurrent initialization grants only once',async t=>{
  const f=await fixture(t);assert.deepEqual((await f.call(`/students/${A}/home`)).body,{home:null,robotActivity:null});
  const replies=await Promise.all(Array.from({length:12},()=>init(f)));
  assert.equal(replies.filter(r=>r.status===201).length,1);assert.equal(replies.filter(r=>r.body.created).length,1);
  assert.equal(new Set(replies.map(r=>JSON.stringify(r.body.home))).size,1);
  await init(f,B);assert.equal((await color(f)).status,200);
  const a=(await f.call(`/students/${A}/home`)).body.home,b=(await f.call(`/students/${B}/home`)).body.home;
  assert.equal(a.avatar.colors.shell,'#abc123');assert.equal(b.avatar.colors.shell,'#e9dfc9');assert.equal(a.studentId,A);assert.equal(b.studentId,B);
  assert.equal((await init(f)).body.home.revision,1);
});
test('same project survives teacher change and graceful restart; different trusted tenant isolates',async t=>{
  const f=await fixture(t);await init(f);await color(f);await f.restart();
  assert.equal((await f.call(`/students/${A}/home`)).body.home.revision,1);
  f.control.actorId='test-teacher-two';assert.equal((await init(f,A,'test-teacher-two')).body.created,false);
  f.control.tenantId='other-test-project';const other=await init(f,A,'test-teacher-two');assert.equal(other.status,201);assert.equal(other.body.home.revision,0);
});
test('session false HTTP 200 is 401, while malformed/unavailable session and context fail 503',async t=>{
  const f=await fixture(t);f.control.authenticated=false;
  const falseSession=await init(f);assert.equal(falseSession.status,401);assert.equal(falseSession.body.loginPath,LOGIN_PATH);
  assert.equal(falseSession.body.authenticated,false);assert.equal((await fs.readdir(f.directory)).filter(v=>v.endsWith('.json')).length,0);
  f.control.authenticated='true';assert.equal((await f.call('/session')).status,503);
  f.control.authenticated=true;f.control.sessionStatus=500;assert.equal((await f.call('/session')).status,503);
  f.control.sessionStatus=401;assert.equal((await f.call('/session')).status,401);
  f.control.sessionStatus=200;f.control.contextStatus=404;assert.equal((await f.call('/session')).status,503);
  f.control.contextStatus=200;f.control.contextActor='other-teacher';assert.equal((await f.call('/session')).status,503);
});
test('only active project UUID students authorized, private profile fields never forwarded',async t=>{
  const f=await fixture(t);const list=await f.call('/students');assert.deepEqual(Object.keys(list.body.students[0]),['id','displayName']);
  assert.equal((await f.call('/students/not-a-uuid/home')).status,422);assert.equal((await init(f,UNKNOWN)).status,404);
  assert.equal((await f.call(`/students/${A}/home`,{cookie:''})).status,401);
  f.control.students=f.control.students.filter(s=>s.id!==A);assert.equal((await init(f)).status,404);
});
test('writes require correct Origin and expected user; arbitrary balances, areas and snapshot writes rejected',async t=>{
  const f=await fixture(t);
  assert.equal((await f.call(`/students/${A}/home/init`,{method:'POST',originHeader:'https://evil.invalid',body:{expectedUserId:USER}})).status,403);
  assert.equal((await init(f,A,'another-user')).status,409);
  assert.equal((await f.call(`/students/${A}/home/init`,{method:'POST',body:{expectedUserId:USER,wallet:{balance:1000000}}})).status,422);
  await init(f);
  assert.equal((await f.call(`/students/${A}/home`,{method:'PUT',body:{home:{house:'free expansion'}}})).status,405);
  assert.equal((await f.call(`/students/${A}/home/avatar`,{method:'PATCH',body:{expectedUserId:USER,expectedRevision:0,colors:{shell:'#aaaaaa',accent:'#bbbbbb'},house:{}}})).status,422);
  assert.equal((await color(f,A,0,{shell:'red',accent:'#bbbbbb'})).status,422);
  assert.equal((await color(f,A,-1)).status,422);
  assert.equal((await f.call(`/students/${A}/home`)).body.home.revision,0);
});
test('simultaneous color writes compare revision atomically, stale updates conflict',async t=>{
  const f=await fixture(t);await init(f);
  const changes=await Promise.all(Array.from({length:10},(_,i)=>color(f,A,0,{shell:`#00000${i}`,accent:'#abc123'})));
  assert.equal(changes.filter(r=>r.status===200).length,1);assert.equal(changes.filter(r=>r.status===409).length,9);
  const home=(await f.call(`/students/${A}/home`)).body.home;
  assert.equal(home.revision,1);assert.equal((await color(f,A,1,home.avatar.colors)).body.home.revision,1);
});
test('wallet is platform read-through only, no fabricated balance or duplicated local wallet',async t=>{
  const f=await fixture(t);await init(f);const before=await fs.readFile(f.service.store.fileFor(TENANT,A),'utf8');
  assert.equal((await f.call(`/students/${A}/wallet`)).body.wallet.balance,0);
  f.control.walletBalance=123;assert.equal((await f.call(`/students/${A}/wallet`)).body.wallet.balance,123);
  assert.equal(await fs.readFile(f.service.store.fileFor(TENANT,A),'utf8'),before);
  assert.equal((await f.call(`/students/${UNKNOWN}/wallet`)).status,404);
  assert.ok(f.control.requests.every(request=>request.method==='GET'));
});
test('corrupt storage rejects load and initialization without replacing original bytes',async t=>{
  const f=await fixture(t);await init(f);const file=f.service.store.fileFor(TENANT,A);await fs.writeFile(file,'{broken-original');
  assert.equal((await f.call(`/students/${A}/home`)).status,503);assert.equal((await init(f)).status,503);
  assert.equal((await color(f)).status,503);assert.equal(await fs.readFile(file,'utf8'),'{broken-original');
});
test('failed rename cannot claim success or overwrite existing student record',async t=>{
  let fail=false;const f=await fixture(t,{fsImpl:{...fs,rename:async(...args)=>{if(fail)throw Object.assign(new Error('test disk failure'),{code:'EACCES'});return fs.rename(...args);}}});
  await init(f);const before=await fs.readFile(f.service.store.fileFor(TENANT,A),'utf8');fail=true;
  assert.equal((await color(f)).status,503);assert.equal(await fs.readFile(f.service.store.fileFor(TENANT,A),'utf8'),before);
  assert.equal((await init(f,B)).status,503);assert.equal((await f.call(`/students/${B}/home`)).body.home,null);
  assert.equal((await fs.readdir(f.directory)).filter(v=>v.endsWith('.tmp')).length,0);
});
test('directory fsync failure after rename reports unknown outcome and a retry does not recreate the home',async t=>{
  let fail=false;const f=await fixture(t,{fsImpl:{...fs,open:async(...args)=>{
    const handle=await fs.open(...args);if(fail&&args[1]==='r')return {sync:async()=>{throw new Error('test directory fsync failure');},close:()=>handle.close()};return handle;
  }}});
  fail=true;assert.equal((await init(f)).status,503);fail=false;
  const existing=(await f.call(`/students/${A}/home`)).body.home;assert.equal(existing.studentId,A);
  const retry=await init(f);assert.equal(retry.status,200);assert.equal(retry.body.created,false);assert.deepEqual(retry.body.home,existing);
});
test('data directory cannot be served directly or through a symlink into a public directory',async t=>{
  const root=await fs.mkdtemp(join(tmpdir(),'homeworld-home-path-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(join(root,'public'));await fs.symlink(join(root,'public'),join(root,'private-alias'),'dir');
  for(const dataDir of [join(root,'public','data'),join(root,'private-alias','future-data')]){
    await assert.rejects(createStudentHomesService({projectRoot:root,platformOrigin:'https://fixture.invalid',publicOrigin:PUBLIC,dataDir}),/outside all static/);
  }
  assert.deepEqual(await fs.readdir(join(root,'public')),[]);
});
test('single-process lock blocks a second process, releases only on graceful close, restart retains data',async t=>{
  const f=await fixture(t);await init(f);
  const storeURL=new URL('../server/student-homes/store.mjs',import.meta.url).href;
  const script=`import {StudentHomeStore} from ${JSON.stringify(storeURL)}; const s=new StudentHomeStore({dataDir:process.env.TEST_HOME_DIR}); try {await s.initialize(); console.log('acquired'); await s.close();} catch(e){console.log(e.code);process.exitCode=3;}`;
  let child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,TEST_HOME_DIR:f.directory}});
  assert.equal(child.status,3);assert.match(child.stdout,/store_locked/);
  await f.service.close();child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,TEST_HOME_DIR:f.directory}});
  assert.equal(child.status,0);assert.match(child.stdout,/acquired/);
  await f.restart();assert.equal((await f.call(`/students/${A}/home`)).body.home.studentId,A);
});
test('fixed origin validates config, redirects are not followed, upstream failures/timeouts are unavailable',async()=>{
  for(const value of ['https://trusted.invalid/path','https://user:password@trusted.invalid','http://example.com','https://trusted.invalid?x=1'])assert.throws(()=>trustedOrigin(value));
  let calls=0;const p=new PlatformClient({origin:'https://trusted.invalid',fetchImpl:async(url,opts)=>{calls++;assert.equal(url.origin,'https://trusted.invalid');assert.equal(opts.redirect,'manual');return new Response('{}',{status:302,headers:{location:'https://evil.invalid','content-type':'application/json'}});}});
  await assert.rejects(p.session('fixture=1'),error=>error.status===503);assert.equal(calls,1);
  await assert.rejects(p.request('https://evil.invalid','fixture=1'),TypeError);
  const timeout=new PlatformClient({origin:'https://trusted.invalid',timeoutMs:10,fetchImpl:(_,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new Error('aborted'))))});
  await assert.rejects(timeout.session('fixture=1'),error=>error.status===503);
});
test('static service preserves game namespace, default redirects to formal entry and does not expose data',async t=>{
  const f=await fixture(t);const response=await f.root('/');assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/games/homeworld/student-homes.html');
  const vendor=await f.root('/games/homeworld/vendor/three.module.js');assert.equal(vendor.status,200);await vendor.arrayBuffer();
  assert.equal((await f.root('/games/homeworld/.env')).status,404);
  assert.equal((await f.root('/games/homeworld/%2e%2e/%2e%2e/package.json')).status,404);
  const health=await (await f.root('/health')).json();assert.deepEqual(Object.keys(health),['service','version','mode','auth']);assert.equal(health.version,'dev');
});
test('release health identity reads the real release commit, dev is allowed only outside dist mode',async t=>{
  const root=await fs.mkdtemp(join(tmpdir(),'homeworld-home-release-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  assert.equal(await readReleaseVersion(root,false),'dev');await assert.rejects(readReleaseVersion(root,true));
  const release={schemaVersion:1,gameId:'homeworld',mode:'student-homes-v1',version:'a'.repeat(40)};
  await fs.writeFile(join(root,'release.json'),JSON.stringify(release));assert.equal(await readReleaseVersion(root,true),release.version);
  await fs.writeFile(join(root,'release.json'),JSON.stringify({...release,mode:'demo'}));await assert.rejects(readReleaseVersion(root,true));
});
