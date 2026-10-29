import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStudentHomesService,API_PREFIX} from '../server/student-homes/app.mjs';
import {CATALOG_VERSION,LEGACY_CATALOG_VERSION} from '../server/student-homes/commerce.mjs';
import {PlatformClient} from '../server/student-homes/platform-client.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const ACTOR='fictional-payment-teacher',TENANT='fictional-payment-project';
const PUBLIC='http://127.0.0.1:18803',SECRET='fictional-home-payment-secret-for-isolated-tests';
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'
  ?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const listen=server=>new Promise(done=>server.listen(0,'127.0.0.1',()=>done(`http://127.0.0.1:${server.address().port}`)));
const close=server=>new Promise(done=>{server.close(done);server.closeAllConnections();});
const checkout={type:'checkout',lines:[{skuId:'bed-classic',quantity:1}]};
const quote={orderId:'isolated-platform-order',studentId:A,amount:3200,catalogVersion:'home-catalog-v1',itemsHash:'a'.repeat(64)};
const fixtureWallet=(studentId=A)=>({tenantId:TENANT,studentId,currency:'platform-points',balance:50000,reserved:0,totalEarned:50000,totalSpent:0,totalRefunded:0,revision:0});
const fixtureOrder=(extra={})=>({id:quote.orderId,sourceGameId:'homeworld',studentId:A,amount:3200,catalogVersion:quote.catalogVersion,itemsHash:quote.itemsHash,
  status:'reserved',createdBy:ACTOR,createdAt:'2026-10-18T00:00:00.000Z',reserveLedgerEntryId:'fixture-reserve-ledger',committedAt:null,cancelledAt:null,...extra});

async function fixture(t,{secret=SECRET}={}){
  const dir=await mkdtemp(join(tmpdir(),'home-payment-http-'));
  const control={actor:ACTOR,tenant:TENANT,authenticated:true,students:[A,B],requests:[],fail:null,lost:null,corrupt:false};
  const wallets=new Map([[A,fixtureWallet(A)],[B,fixtureWallet(B)]]),orders=new Map();
  const platform=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):null;
    control.requests.push({path:req.url,method:req.method,headers:req.headers,body});
    res.setHeader('content-type','application/json');
    const answer=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
    if(req.url==='/api/auth/me')return answer(200,{authenticated:control.authenticated,user:{id:control.actor,role:'owner'}});
    if(req.url==='/api/game-points/v1/context')return answer(200,{schemaVersion:'game-points-context.v1',tenantId:control.tenant,currency:'platform-points',actor:{id:control.actor,role:'owner'}});
    if(req.url==='/api/student-profiles/v1')return answer(200,{schemaVersion:'student-profile-store.v1',students:control.students.map((id,i)=>({id,status:'active',displayName:`DisplayText4642${i}`}))});
    const walletMatch=/^\/api\/game-points\/v1\/students\/([^/]+)\/wallet$/.exec(req.url);
    if(walletMatch)return answer(200,{wallet:wallets.get(walletMatch[1])});
    const match=/^\/api\/game-points\/v1\/homeworld\/orders\/([^/]+)(?:\/(reserve|commit|cancel))?$/.exec(req.url);
    if(!match)return answer(404,{error:'not_found'});
    const [,id,action]=match,timestamp=req.headers['x-home-payment-timestamp'];
    const expected=createHmac('sha256',SECRET).update(`homeworld-payment-v1\n${timestamp}\n${req.method}\n${req.url}\n${canonical(body)}`).digest('hex');
    if(!timestamp||expected!==req.headers['x-home-payment-signature'])return answer(403,{error:'home_payment_signature_invalid'});
    if(action&&req.headers.origin!==PUBLIC)return answer(403,{error:'origin_forbidden'});
    if(action&&body.expectedUserId!==control.actor)return answer(409,{error:'auth_context_changed'});
    if(control.fail)return answer(control.fail.status,{error:control.fail.code,message:'PRIVATE_PLATFORM_DETAIL'});
    let order=orders.get(id),duplicate=Boolean(order);
    if(!action){if(!order)return answer(404,{error:'home_payment_not_found'});}
    else if(action==='reserve'){
      if(!order){
        const wallet=wallets.get(body.studentId);
        if(wallet.balance<body.amount)return answer(409,{error:'home_payment_insufficient'});
        order=fixtureOrder({id,studentId:body.studentId,amount:body.amount,catalogVersion:body.catalogVersion,itemsHash:body.itemsHash,createdBy:body.expectedUserId});orders.set(id,order);
        wallet.balance-=body.amount;wallet.reserved+=body.amount;wallet.revision++;
      }
    }else{
      if(!order)return answer(404,{error:'home_payment_not_found'});
      const target=action==='commit'?'committed':'cancelled';duplicate=order.status===target;
      if(!duplicate){
        if(order.status!=='reserved')return answer(409,{error:'home_payment_state_conflict'});
        order.status=target;const wallet=wallets.get(order.studentId);wallet.reserved-=order.amount;
        if(action==='commit'){wallet.totalSpent+=order.amount;order.committedAt=new Date().toISOString();}
        else{wallet.balance+=order.amount;order.cancelledAt=new Date().toISOString();}wallet.revision++;
      }
    }
    if(control.lost===action){control.lost=null;res.destroy();return;}
    return answer(200,{order:{...order,...control.corrupt?{studentId:B}:{}},wallet:wallets.get(order.studentId),...action?{duplicate}:{}});
  });
  const upstream=await listen(platform);let service,origin;
  async function start(){service=await createStudentHomesService({platformOrigin:upstream,publicOrigin:PUBLIC,dataDir:dir,homeCommerceSigningSecret:secret});origin=await listen(service.server);}
  await start();t.after(async()=>{await service.close();await close(platform);await rm(dir,{recursive:true,force:true});});
  const call=async(route,{method='GET',body,cookie='fictional-session=1',originHeader=PUBLIC,headers={}}={})=>{
    const response=await fetch(`${origin}${API_PREFIX}${route}`,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),origin:originHeader,...headers},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  };
  return {control,wallets,orders,call,get service(){return service;},async restart(){await service.close();await start();},
    init:(student=A)=>call(`/students/${student}/home/init`,{method:'POST',body:{expectedUserId:control.actor}}),
    command:(command=checkout,{id='http-command-0001',revision=0,student=A,...extra}={})=>call(`/students/${student}/home/commands`,{method:'POST',body:{expectedUserId:control.actor,expectedRevision:revision,commandId:id,command,...command.type==='checkout'?{expectedCatalogVersion:CATALOG_VERSION}:{}},...extra})};
}

test('HTTP checkout signs server-calculated price, delivers furniture once, and persists placement',async t=>{
  const f=await fixture(t);await f.init();await f.init(B);
  const replies=await Promise.all([f.command(),f.command(),f.command()]);
  assert.ok(replies.every(r=>r.status===200),JSON.stringify(replies));assert.equal(replies.filter(r=>!r.body.duplicate).length,1);
  const purchase=replies[0].body;assert.equal(purchase.receipt.amount,1800);assert.equal(purchase.home.commerce.owned.length,1);assert.equal(f.wallets.get(A).balance,48200);assert.equal(f.wallets.get(A).reserved,0);assert.equal(f.wallets.get(A).totalSpent,1800);
  assert.equal(f.orders.size,1);const writes=f.control.requests.filter(r=>r.path.includes('/homeworld/orders/')&&r.method==='POST');
  assert.equal(writes.length,2);assert.ok(writes.every(r=>r.headers.cookie==='fictional-session=1'&&r.headers.origin===PUBLIC));
  assert.deepEqual(Object.keys(writes[0].body).sort(),['amount','catalogVersion','expectedUserId','itemsHash','studentId']);assert.equal(writes[0].body.amount,1800);
  assert.doesNotMatch(JSON.stringify(purchase),new RegExp(SECRET));
  const item=purchase.home.commerce.owned[0],placed=await f.command({type:'placeItem',id:item.id,pose:{x:0,z:0,rotation:0},storey:0},{id:'http-command-place',revision:1});
  assert.equal(placed.status,200);assert.equal(placed.body.home.commerce.home.furniture.length,1);assert.equal(f.wallets.get(A).balance,48200);
  await f.restart();const read=await f.call(`/students/${A}/home`);assert.equal(read.body.home.commerce.home.furniture.length,1);
  assert.equal((await f.call(`/students/${B}/home`)).body.home.commerce.owned.length,0);assert.equal(f.wallets.get(B).balance,50000);
});

test('HTTP commands reject wrong identity, origin, prices, oversized bodies and stale revisions before debit',async t=>{
  const f=await fixture(t);await f.init();
  assert.equal((await f.command(checkout,{originHeader:'https://elsewhere.invalid'})).status,403);
  assert.equal((await f.command(checkout,{body:{expectedUserId:'another-teacher',expectedRevision:0,commandId:'http-invalid-actor',command:checkout}})).status,409);
  assert.equal((await f.command(checkout,{student:'33333333-3333-4333-8333-333333333333'})).status,404);
  assert.equal((await f.command(checkout,{cookie:''})).status,401);
  assert.equal((await f.command({...checkout,amount:1})).status,422);
  assert.equal((await f.command({...checkout,lines:[{skuId:'bed-classic',quantity:1,unitPrice:1}]})).status,422);
  assert.equal((await f.command(checkout,{revision:-1})).status,422);
  assert.equal((await f.command(checkout,{body:{expectedUserId:ACTOR,expectedRevision:0,commandId:'http-extra-field',command:checkout,amount:1}})).status,422);
  assert.equal((await f.command({type:'checkout',lines:[],padding:'x'.repeat(65536)})).status,413);
  assert.equal((await f.call(`/students/${A}/home/commands`)).status,405);
  assert.equal(f.orders.size,0);
  assert.equal((await f.command()).status,200);assert.equal((await f.command(checkout,{id:'http-stale-command'})).status,409);assert.equal(f.orders.size,1);
});

test('HTTP old storefront checkout is rejected without payment; current catalog checkout uses the displayed price',async t=>{
  const f=await fixture(t);await f.init();
  for(const [index,version] of [undefined,LEGACY_CATALOG_VERSION,null,'unknown-catalog'].entries()){
    const denied=await f.call(`/students/${A}/home/commands`,{method:'POST',body:{expectedUserId:ACTOR,expectedRevision:0,
      commandId:`old-page-purchase-${index}`,command:checkout,...version===undefined?{}:{expectedCatalogVersion:version}}});
    assert.equal(denied.status,409);assert.equal(denied.body.error.code,'catalog_changed');
    assert.match(denied.body.error.message,/DisplayText4643/);
  }
  assert.equal(f.orders.size,0);assert.equal(f.wallets.get(A).balance,50000);
  const record=await f.service.store.readRecord(TENANT,A);assert.equal(record.pending,null);assert.equal(record.operations.length,0);
  assert.equal(record.home.commerce.owned.length,0);
  const bought=await f.command();assert.equal(bought.status,200);assert.equal(bought.body.receipt.amount,1800);
  assert.equal(bought.body.home.commerce.orders[0].lines[0].unitPrice,1800);
  assert.equal(f.wallets.get(A).balance,48200);assert.equal([...f.orders.values()][0].catalogVersion,CATALOG_VERSION);
});

test('HTTP old pending checkout and duplicate replay recover before the new-page catalog guard',async t=>{
  const f=await fixture(t);await f.init();f.control.lost='reserve';
  assert.equal((await f.command()).status,503);
  // Reproduce the persisted v1 record and platform receipt in this temporary
  // fixture; production students and historical ledgers are never touched.
  const record=await f.service.store.readRecord(TENANT,A),pending=record.pending;
  delete pending.catalogVersion;pending.amount=3200;
  pending.draft.commerce.orders[0].lines[0].unitPrice=3200;pending.draft.commerce.orders[0].total=3200;
  pending.draft.commerce.wallet.initialBalance=3200;pending.detail.order=structuredClone(pending.draft.commerce.orders[0]);
  const order=f.orders.get(pending.orderId);order.catalogVersion=LEGACY_CATALOG_VERSION;order.amount=3200;
  Object.assign(f.wallets.get(A),{balance:46800,reserved:3200});
  await f.service.store.writeRecord(record);await f.restart();
  const legacyBody={expectedUserId:ACTOR,expectedRevision:0,commandId:'http-command-0001',command:checkout};
  for(const body of [legacyBody,{...legacyBody,expectedCatalogVersion:'outdated-page-version'}]){
    const recovered=await f.call(`/students/${A}/home/commands`,{method:'POST',body});
    assert.equal(recovered.status,200);assert.equal(recovered.body.duplicate,true);assert.equal(recovered.body.receipt.amount,3200);
    assert.equal(recovered.body.home.commerce.owned.length,1);assert.equal(f.wallets.get(A).balance,46800);
  }
  assert.equal(f.wallets.get(A).totalSpent,3200);assert.equal(f.orders.size,1);
  assert.equal(f.control.requests.filter(row=>row.path.endsWith('/reserve')).length,1);
  assert.equal(f.control.requests.filter(row=>row.path.endsWith('/commit')).length,1);
});

for(const phase of ['reserve','commit'])test(`HTTP recovers a lost ${phase} reply after restart without double debit or delivery`,async t=>{
  const f=await fixture(t);await f.init();f.control.lost=phase;
  assert.equal((await f.command()).status,503);assert.equal(f.wallets.get(A).balance,48200);
  await f.restart();const read=await f.call(`/students/${A}/home`);assert.equal(read.status,200);assert.equal(read.body.home.commerce.owned.length,1);
  assert.equal(f.wallets.get(A).balance,48200);assert.equal(f.wallets.get(A).totalSpent,1800);assert.equal(f.orders.size,1);
  const replay=await f.command();assert.equal(replay.status,200);assert.equal(replay.body.duplicate,true);
});

test('HTTP insufficient balance is a definite failure; service outages never become a fake successful purchase',async t=>{
  const f=await fixture(t);await f.init();f.wallets.get(A).balance=10;
  const denied=await f.command();assert.equal(denied.status,409);assert.equal(denied.body.error.code,'home_payment_insufficient');assert.equal(f.orders.size,0);
  assert.equal((await f.call(`/students/${A}/home`)).body.home.commerce.owned.length,0);
  f.wallets.get(A).balance=50000;const done=await f.command(checkout,{id:'http-new-purchase'});assert.equal(done.status,200);
  f.control.fail={status:409,code:'auth_context_changed'};
  const changed=await f.command(checkout,{id:'http-login-change',revision:1});assert.equal(changed.status,409);assert.equal(changed.body.error.code,'identity_changed');
  assert.doesNotMatch(JSON.stringify(changed),/PRIVATE_PLATFORM_DETAIL/);
});

test('HTTP purchasing without a server signing key fails closed',async t=>{
  const f=await fixture(t,{secret:''});await f.init();const result=await f.command();
  assert.equal(result.status,503);assert.equal(result.body.error.code,'home_payment_unavailable');assert.equal(f.orders.size,0);assert.equal(f.wallets.get(A).balance,50000);
});

test('payment adapter binds identity and quote and rejects cross-student or malformed upstream receipts',async()=>{
  let calls=0,result={order:fixtureOrder(),wallet:fixtureWallet(),duplicate:false};
  const client=new PlatformClient({origin:PUBLIC,homeCommerceSigningSecret:SECRET,fetchImpl:async()=>{calls++;return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});}});
  const adapter=client.paymentAdapter('fictional=1',TENANT,A,ACTOR);
  for(const input of [{...quote,studentId:B},{...quote,amount:0},{...quote,amount:1.5},{...quote,itemsHash:'bad'},{...quote,sourceGameId:'other'},{...quote,orderId:'../../escape'}])await assert.rejects(adapter.reserve(input),TypeError);
  assert.equal(calls,0);
  for(const bad of [{order:fixtureOrder({studentId:B})},{wallet:{...fixtureWallet(),tenantId:'other-project'}},
    {wallet:{...fixtureWallet(),studentId:B}},{order:fixtureOrder({amount:1})},{order:fixtureOrder({itemsHash:'b'.repeat(64)})},
    {order:fixtureOrder({sourceGameId:'other-game'})},{order:fixtureOrder({id:'other-order'})},{wallet:{...fixtureWallet(),reserved:-1}},{duplicate:'yes'}]){
    result={order:fixtureOrder(),wallet:fixtureWallet(),duplicate:false,...bad};await assert.rejects(adapter.reserve(quote),e=>e.status===503);
  }
  result={order:fixtureOrder(),wallet:fixtureWallet(),duplicate:false};assert.equal((await adapter.reserve(quote)).wallet.reserved,0);
});
