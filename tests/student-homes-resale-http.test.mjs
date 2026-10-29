import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PlatformClient} from '../server/student-homes/platform-client.mjs';
import {createStudentHomesService,API_PREFIX} from '../server/student-homes/app.mjs';
import {canonicalJSON,CATALOG_VERSION} from '../server/student-homes/commerce.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const TENANT='fictional-resale-http-project',ACTOR='fictional-resale-http-teacher';
const PUBLIC='http://127.0.0.1:18803',SECRET='fictional-resale-secret-for-isolated-http-tests';
const now='2026-10-25T00:00:00.000Z';
const quote={id:'isolated-home-resale',studentId:A,ownedId:'owned-1-1',skuId:'bed-classic',originalOrderId:'original-platform-order',originalItemsHash:'a'.repeat(64),paidUnitPrice:1800,creditAmount:900,policy:'paid-unit-half-v1'};
const wallet=()=>({tenantId:TENANT,studentId:A,currency:'platform-points',balance:50000,reserved:0,totalEarned:50000,totalSpent:0,totalRefunded:0,revision:0});
const resale=()=>({...quote,sourceGameId:'homeworld',currency:'platform-points',status:'credited',ledgerEntryId:'fictional-resale-ledger',createdBy:ACTOR,createdAt:now});
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});

test('resale adapter signs a distinct domain and allows only server-built bound credit quotes',async()=>{
  const requests=[];let reply={resale:resale(),wallet:wallet(),duplicate:false};
  const client=new PlatformClient({origin:PUBLIC,publicOrigin:PUBLIC,homeCommerceSigningSecret:SECRET,clock:()=>Date.parse(now),fetchImpl:async(url,options)=>{
    requests.push({url,options});return new Response(JSON.stringify(reply),{headers:{'content-type':'application/json'}});
  }});
  const adapter=client.paymentAdapter('fictional-session=1',TENANT,A,ACTOR);
  for(const input of [{...quote,studentId:B},{...quote,creditAmount:1800},{...quote,creditAmount:0},{...quote,paidUnitPrice:1.5},
    {...quote,policy:'other'},{...quote,originalItemsHash:'bad'},{...quote,id:'../../escape'},{...quote,amount:900}])
    await assert.rejects(adapter.creditResale(input),TypeError);
  assert.equal(requests.length,0);
  assert.equal((await adapter.creditResale(quote)).wallet.balance,50000);
  const request=requests[0],path=`/api/game-points/v1/homeworld/resales/${quote.id}`,body=JSON.parse(request.options.body);
  assert.equal(request.url.pathname,path);assert.equal(request.options.method,'POST');assert.equal(request.options.headers.cookie,'fictional-session=1');assert.equal(request.options.headers.origin,PUBLIC);
  assert.deepEqual(body,{expectedUserId:ACTOR,...Object.fromEntries(Object.entries(quote).filter(([key])=>key!=='id'))});
  const timestamp=request.options.headers['x-home-payment-timestamp'];
  const signature=domain=>createHmac('sha256',SECRET).update(`${domain}\n${timestamp}\nPOST\n${path}\n${canonicalJSON(body)}`).digest('hex');
  assert.equal(request.options.headers['x-home-payment-signature'],signature('homeworld-resale-v1'));
  assert.notEqual(request.options.headers['x-home-payment-signature'],signature('homeworld-payment-v1'));
  reply={resale:resale(),wallet:wallet()};await adapter.getResale(quote.id);
  assert.equal(requests[1].options.method,'GET');assert.equal(requests[1].options.body,undefined);assert.equal(requests[1].url.search,'');
  const getSignature=createHmac('sha256',SECRET).update(`homeworld-resale-v1\n${timestamp}\nGET\n${path}\nnull`).digest('hex');
  assert.equal(requests[1].options.headers['x-home-payment-signature'],getSignature);
});

test('resale adapter rejects altered authoritative credit proof, wrong wallet identity and missing signing key',async()=>{
  let reply={resale:resale(),wallet:wallet(),duplicate:false},calls=0;
  const client=new PlatformClient({origin:PUBLIC,homeCommerceSigningSecret:SECRET,fetchImpl:async()=>{calls++;return new Response(JSON.stringify(reply),{headers:{'content-type':'application/json'}});}});
  const adapter=client.paymentAdapter('fictional=1',TENANT,A,ACTOR);
  for(const patch of [{id:'wrong-id'},{sourceGameId:'other-game'},{studentId:B},{ownedId:'other-owned'},{skuId:'other-sku'},
    {originalOrderId:'other-order'},{originalItemsHash:'b'.repeat(64)},{creditAmount:1},{paidUnitPrice:2},{policy:'other'},
    {status:'reserved'},{ledgerEntryId:''},{createdAt:'invalid'},{createdBy:''},{currency:'other'}]){
    reply={resale:{...resale(),...patch},wallet:wallet(),duplicate:false};await assert.rejects(adapter.creditResale(quote),e=>e.status===503);
  }
  for(const patch of [{tenantId:'other-tenant'},{studentId:B},{balance:-1},{totalRefunded:-1}]){
    reply={resale:resale(),wallet:{...wallet(),...patch},duplicate:false};await assert.rejects(adapter.creditResale(quote),e=>e.status===503);
  }
  reply={resale:resale(),wallet:wallet(),duplicate:'yes'};await assert.rejects(adapter.creditResale(quote),e=>e.status===503);
  const before=calls,unconfigured=new PlatformClient({origin:PUBLIC,homeCommerceSigningSecret:'',fetchImpl:async()=>{calls++;}}).paymentAdapter('fictional=1',TENANT,A,ACTOR);
  await assert.rejects(unconfigured.creditResale(quote),e=>e.code==='home_resale_unavailable');assert.equal(calls,before);
});

async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'home-resale-http-'));
  const points=wallet(),orders=new Map(),resales=new Map(),control={requests:[],lost:false,corrupt:null};let service,origin;
  const platform=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):null;
    control.requests.push({method:req.method,path:req.url,body,headers:req.headers});res.setHeader('content-type','application/json');
    const answer=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
    if(req.url==='/api/auth/me')return answer(200,{authenticated:true,user:{id:ACTOR,role:'owner'}});
    if(req.url==='/api/game-points/v1/context')return answer(200,{schemaVersion:'game-points-context.v1',tenantId:TENANT,currency:'platform-points',actor:{id:ACTOR,role:'owner'}});
    if(req.url==='/api/student-profiles/v1')return answer(200,{schemaVersion:'student-profile-store.v1',students:[{id:A,status:'active',displayName:"DisplayText4652"}]});
    const match=/^\/api\/game-points\/v1\/homeworld\/(orders|resales)\/([^/]+)(?:\/(reserve|commit))?$/.exec(req.url);
    if(!match)return answer(404,{error:'not_found'});
    const [,kind,id,action]=match,timestamp=req.headers['x-home-payment-timestamp'],domain=kind==='resales'?'homeworld-resale-v1':'homeworld-payment-v1';
    const expected=createHmac('sha256',SECRET).update(`${domain}\n${timestamp}\n${req.method}\n${req.url}\n${canonicalJSON(body)}`).digest('hex');
    if(expected!==req.headers['x-home-payment-signature'])return answer(403,{error:'signature_invalid'});
    if(body&&(body.expectedUserId!==ACTOR||req.headers.origin!==PUBLIC))return answer(409,{error:'auth_context_changed'});
    if(kind==='orders'){
      let order=orders.get(id);if(!action&&!order)return answer(404,{error:'home_payment_not_found'});
      if(action==='reserve'&&!order){order={id,...body,sourceGameId:'homeworld',status:'reserved',createdBy:ACTOR,createdAt:now};delete order.expectedUserId;orders.set(id,order);points.balance-=order.amount;points.reserved+=order.amount;points.revision++;}
      if(action==='commit'&&order.status==='reserved'){order.status='committed';points.totalSpent+=order.amount;points.reserved-=order.amount;points.revision++;}
      return answer(200,{order,wallet:points,...action?{duplicate:false}:{}});
    }
    let entry=resales.get(id),duplicate=!!entry;
    if(req.method==='GET'&&!entry)return answer(404,{error:'home_resale_not_found'});
    if(body&&!entry){
      // Inspect the real on-disk transaction before allowing platform credit.
      const record=await service.store.readRecord(TENANT,A);assert.equal(record.pending.kind,'resale-credit');assert.equal(record.pending.quote.id,id);
      assert.equal(record.home.commerce.owned[0].status,'stored');assert.equal(record.pending.draft.commerce.owned[0].status,'sold');
      const original=orders.get(body.originalOrderId);assert.equal(original.status,'committed');assert.equal(original.itemsHash,body.originalItemsHash);
      assert.equal(body.creditAmount,Math.floor(body.paidUnitPrice/2));entry={id,...body,sourceGameId:'homeworld',currency:'platform-points',status:'credited',ledgerEntryId:`credit-${id}`,createdBy:ACTOR,createdAt:now};delete entry.expectedUserId;
      resales.set(id,entry);points.balance+=entry.creditAmount;points.totalRefunded+=entry.creditAmount;points.revision++;
    }
    if(body&&control.lost){control.lost=false;res.destroy();return;}
    return answer(200,{resale:{...entry,...control.corrupt},wallet:points,...body?{duplicate}:{}});
  });
  const platformOrigin=await listen(platform);
  const start=async()=>{service=await createStudentHomesService({platformOrigin,publicOrigin:PUBLIC,dataDir:dir,homeCommerceSigningSecret:SECRET});origin=await listen(service.server);};
  await start();t.after(async()=>{await service.close();await close(platform);await rm(dir,{recursive:true,force:true});});
  const call=async(route,body)=>{const response=await fetch(`${origin}${API_PREFIX}${route}`,{method:body?'POST':'GET',headers:{cookie:'fictional=1',origin:PUBLIC,'content-type':'application/json'},...body?{body:JSON.stringify(body)}:{}});return {status:response.status,body:await response.json()};};
  await call(`/students/${A}/home/init`,{expectedUserId:ACTOR});
  return {control,points,orders,resales,call,get service(){return service;},async restart(){await service.close();await start();},
    command:(command,id,revision)=>call(`/students/${A}/home/commands`,{expectedUserId:ACTOR,expectedRevision:revision,commandId:id,command,...command.type==='checkout'?{expectedCatalogVersion:CATALOG_VERSION}:{}})};
}

test('HTTP sale signs server price, credits platform wallet once, and recovers a lost reply through signed GET after restart',async t=>{
  const f=await fixture(t),bought=await f.command({type:'checkout',lines:[{skuId:'bed-classic',quantity:1}]},'http-resale-purchase',0);
  assert.equal(bought.status,200);const id=bought.body.home.commerce.owned[0].id;
  assert.equal((await f.command({type:'sellItem',id,creditAmount:99999},'http-forged-sale',1)).status,422);
  f.control.lost=true;assert.equal((await f.command({type:'sellItem',id},'http-resale-command',1)).status,503);
  assert.equal(f.points.balance,49100);assert.equal(f.points.totalRefunded,900);assert.equal((await f.service.store.readRecord(TENANT,A)).home.commerce.owned[0].status,'stored');
  await f.restart();const recovered=await f.call(`/students/${A}/home`);
  assert.equal(recovered.status,200);assert.equal(recovered.body.home.commerce.owned[0].status,'sold');assert.equal(recovered.body.wallet.balance,49100);
  const replay=await f.command({type:'sellItem',id},'http-resale-command',1);assert.equal(replay.status,200);assert.equal(replay.body.duplicate,true);assert.equal(replay.body.receipt.creditAmount,900);
  assert.equal(replay.body.wallet.balance,49100,'a lost final home reply still refreshes the browser wallet on duplicate replay');
  assert.equal(f.resales.size,1);assert.equal(f.control.requests.filter(row=>row.path.includes('/resales/')&&row.method==='POST').length,1);
  assert.ok(f.control.requests.some(row=>row.path.includes('/resales/')&&row.method==='GET'));
  assert.doesNotMatch(JSON.stringify(replay.body),new RegExp(SECRET));
});

test('HTTP malformed credited proof leaves pending and sold delivery waits for an authoritative matching reply',async t=>{
  const f=await fixture(t),bought=await f.command({type:'checkout',lines:[{skuId:'bed-classic',quantity:1}]},'http-mismatch-purchase',0),id=bought.body.home.commerce.owned[0].id;
  f.control.corrupt={originalItemsHash:'b'.repeat(64)};
  assert.equal((await f.command({type:'sellItem',id},'http-mismatch-sale',1)).status,503);
  assert.equal((await f.service.store.readRecord(TENANT,A)).home.commerce.owned[0].status,'stored');
  f.control.corrupt=null;const recovered=await f.call(`/students/${A}/home`);assert.equal(recovered.status,200);assert.equal(recovered.body.home.commerce.owned[0].status,'sold');assert.equal(f.points.balance,49100);
});
