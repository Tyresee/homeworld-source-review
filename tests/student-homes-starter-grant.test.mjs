import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createStudentHomesService,API_PREFIX} from '../server/student-homes/app.mjs';
import {PlatformClient} from '../server/student-homes/platform-client.mjs';

const STUDENT='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const ACTOR='isolated-teacher',TENANT='isolated-tenant',PUBLIC='http://127.0.0.1:18803';
const grant={programId:'student-starter-v1',amount:50000,ledgerEntryId:'isolated-starter-entry',createdAt:'2026-10-18T00:00:00.000Z'};
const baseline={programId:'student-starter-baseline-v2',amount:150000,creditedAmount:150000,addedAmount:100000,ledgerEntryId:'isolated-baseline-entry',createdAt:'2026-10-25T00:00:00.000Z',duplicate:false};
const wallet={tenantId:TENANT,studentId:STUDENT,currency:'platform-points',balance:150013,totalEarned:150013,totalSpent:0,totalRefunded:0,revision:2};
const listen=server=>new Promise(done=>server.listen(0,'127.0.0.1',()=>done(`http://127.0.0.1:${server.address().port}`)));
async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'home-starter-bridge-'));
  const control={requests:[],authenticated:true,status:200,result:{wallet,grant,baseline,duplicate:false}};
  const platform=createServer(async(req,res)=>{
    const chunks=[];for await(const part of req)chunks.push(part);
    control.requests.push({path:req.url,method:req.method,headers:req.headers,body:chunks.length?JSON.parse(Buffer.concat(chunks)):null});
    res.setHeader('content-type','application/json');let data;
    if(req.url==='/api/auth/me')data={authenticated:control.authenticated,user:{id:ACTOR,role:'member'}};
    else if(req.url==='/api/game-points/v1/context')data={schemaVersion:'game-points-context.v1',tenantId:TENANT,currency:'platform-points',actor:{id:ACTOR,role:'member'}};
    else if(req.url==='/api/student-profiles/v1')data={schemaVersion:'student-profile-store.v1',students:[{id:STUDENT,displayName:"DisplayText4661",status:'active'}]};
    else if(req.url===`/api/game-points/v1/students/${STUDENT}/starter-grant`){res.statusCode=control.status;data=control.result;}
    else if(req.url===`/api/game-points/v1/students/${STUDENT}/wallet`)data={wallet};
    else{res.statusCode=404;data={};}
    res.end(JSON.stringify(data));
  });
  const upstream=await listen(platform),service=await createStudentHomesService({platformOrigin:upstream,publicOrigin:PUBLIC,dataDir:directory});
  const origin=await listen(service.server);
  t.after(async()=>{await service.close();await new Promise(done=>{platform.close(done);platform.closeAllConnections();});await rm(directory,{recursive:true,force:true});});
  return {control,async call({student=STUDENT,method='POST',body={expectedUserId:ACTOR},originHeader=PUBLIC,cookie='isolated-session=1',route='wallet/starter-grant'}={}){
    const response=await fetch(`${origin}${API_PREFIX}/students/${student}/${route}`,{method,headers:{'content-type':'application/json',origin:originHeader,...(cookie?{cookie}:{})},...(method!=='GET'?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json()};
  }};
}

test('starter bridge uses fixed upstream program, trusted origin and stable key; returns actual platform wallet',async t=>{
  const f=await fixture(t);const first=await f.call();assert.equal(first.status,200);assert.deepEqual(first.data,{wallet,grant,baseline,duplicate:false});
  const post=f.control.requests.find(r=>r.method==='POST');assert.equal(post.path,`/api/game-points/v1/students/${STUDENT}/starter-grant`);
  assert.equal(post.headers.origin,PUBLIC);assert.equal(post.headers['idempotency-key'],`starter-v1-${STUDENT}`);
  assert.deepEqual(post.body,{expectedUserId:ACTOR});assert.equal(post.headers.cookie,'isolated-session=1');
  f.control.result={wallet,grant,baseline:{...baseline,addedAmount:0,duplicate:true},duplicate:true};const second=await f.call();assert.equal(second.data.duplicate,true);assert.equal(second.data.wallet.balance,150013);
  const posts=f.control.requests.filter(r=>r.method==='POST');assert.equal(posts[1].headers['idempotency-key'],posts[0].headers['idempotency-key']);
});

test('starter bridge rejects missing auth, wrong origin, changed actor, inaccessible student and client price',async t=>{
  const f=await fixture(t);
  for(const [options,expected] of [[{originHeader:'https://outside.invalid'},403],[{body:{expectedUserId:'other-teacher'}},409],[{student:OTHER},404],[{body:{expectedUserId:ACTOR,amount:999999}},422],[{cookie:''},401],[{method:'GET'},405]]){
    assert.equal((await f.call(options)).status,expected);
  }
  f.control.authenticated=false;assert.equal((await f.call()).status,401);
  assert.equal(f.control.requests.some(r=>r.method==='POST'),false);
});

test('wallet GET remains read-only; an unconfirmed grant never becomes a fabricated zero or 50000',async t=>{
  const f=await fixture(t);const read=await f.call({route:'wallet',method:'GET'});assert.equal(read.data.wallet.balance,150013);
  assert.ok(f.control.requests.every(r=>r.method==='GET'));
  for(const status of [401,403,409,500,302]){f.control.status=status;const result=await f.call();assert.equal(result.status,[401,403].includes(status)?status:503);assert.equal(result.data.wallet,undefined);}
  f.control.status=200;
  for(const result of [{wallet:{...wallet,tenantId:'another-tenant'},grant,duplicate:false},{wallet:{...wallet,studentId:OTHER},grant,duplicate:false},{wallet,grant:{...grant,amount:999999},baseline,duplicate:false},{wallet,grant,baseline,duplicate:'true'}]){
    f.control.result=result;assert.equal((await f.call()).status,503);
  }
});

test('starter bridge requires confirmed cumulative funding, rather than assuming the remaining balance is the baseline',async t=>{
  const f=await fixture(t);
  for(const invalid of [undefined,{...baseline,amount:50000},{...baseline,programId:'unknown-plan'},
    {...baseline,creditedAmount:100000},{...baseline,addedAmount:-1},{...baseline,addedAmount:150001},
    {...baseline,ledgerEntryId:null},{...baseline,createdAt:'invalid'}, {...baseline,duplicate:true}]){
    f.control.result={wallet,grant,baseline:invalid,duplicate:false};
    const result=await f.call();assert.equal(result.status,503);assert.equal(result.data.wallet,undefined);
  }
  f.control.result={wallet:{...wallet,balance:2500,totalSpent:147513},grant,
    baseline:{...baseline,addedAmount:0,duplicate:true},duplicate:true};
  const result=await f.call();assert.equal(result.status,200);assert.equal(result.data.wallet.balance,2500);
  assert.equal(result.data.baseline.creditedAmount,150000);assert.equal(result.data.baseline.addedAmount,0);
});

test('starter bridge distinguishes changed login from wallet conflicts without exposing upstream text',async t=>{
  const f=await fixture(t);f.control.status=409;
  for(const [upstreamCode,expectedCode]of [['auth_context_changed','identity_changed'],['game_points_idempotency_conflict','game_points_idempotency_conflict'],['game_points_limit','game_points_limit']]){
    f.control.result={error:{code:upstreamCode,message:'PRIVATE_UPSTREAM_DETAIL'}};
    const result=await f.call();assert.equal(result.status,409);assert.equal(result.data.error.code,expectedCode);
    assert.doesNotMatch(result.data.error.message,/PRIVATE_UPSTREAM_DETAIL/);
    assert.equal(result.data.wallet,undefined);
  }
  for(const upstreamCode of ['unknown_conflict','__proto__','constructor']){
    f.control.result={error:{code:upstreamCode,message:'PRIVATE_UPSTREAM_DETAIL'}};
    const result=await f.call();assert.equal(result.status,503);assert.equal(result.data.error.code,'platform_unavailable');
    assert.doesNotMatch(result.data.error.message,/PRIVATE_UPSTREAM_DETAIL/);
  }
});

test('409 error bodies use the same JSON, byte-limit and timeout protections as success replies',async()=>{
  const path=`/api/game-points/v1/students/${STUDENT}/starter-grant`,write={expectedUserId:ACTOR};
  for(const response of [
    new Response('not-json',{status:409,headers:{'content-type':'application/json'}}),
    new Response(JSON.stringify({error:{code:'auth_context_changed'}}),{status:409,headers:{'content-type':'text/html'}}),
    new Response('x'.repeat(101),{status:409,headers:{'content-type':'application/json','content-length':'101'}}),
    new Response('x'.repeat(101),{status:409,headers:{'content-type':'application/json'}}),
  ]){
    const client=new PlatformClient({origin:PUBLIC,maxResponseBytes:100,fetchImpl:async()=>response});
    await assert.rejects(client.request(path,'test=1',write),error=>error.code==='platform_unavailable');
  }
  const client=new PlatformClient({origin:PUBLIC,timeoutMs:5,fetchImpl:async(_url,{signal})=>new Response(new ReadableStream({
    start(controller){signal.addEventListener('abort',()=>controller.error(new Error('isolated timeout')),{once:true});},
  }),{status:409,headers:{'content-type':'application/json'}})});
  await assert.rejects(client.request(path,'test=1',write),error=>error.code==='platform_unavailable');
});

test('platform client cannot POST a custom source, amount, URL or read route',async()=>{
  const client=new PlatformClient({origin:'https://platform.invalid',fetchImpl:()=>{throw new Error('Must not fetch');}});
  for(const [path,body]of [['/api/auth/me',{expectedUserId:ACTOR}],['https://evil.invalid',{expectedUserId:ACTOR}],[`/api/game-points/v1/students/${STUDENT}/starter-grant`,{expectedUserId:ACTOR,amount:123}]]){
    await assert.rejects(client.request(path,'test=1',body),TypeError);
  }
});
