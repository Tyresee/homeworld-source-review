import {createHash,createHmac} from 'node:crypto';
import { HomeServiceError, unavailable, unauthorized, isIdentity, isRecord, isStudentId } from './errors.mjs';

export function trustedOrigin(value) {
  let url; try { url = new URL(value); } catch { throw new TypeError('A fixed platform/public origin is required.'); }
  const local = ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new TypeError('Origin must be HTTPS, or loopback HTTP, without credentials/path/query.');
  return url.origin;
}
const platformFailure = () => unavailable('platform_unavailable',"DisplayText4511, DisplayText4016.");
const PAYMENT_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const paymentJSON=value=>Array.isArray(value)?`[${value.map(paymentJSON).join(',')}]`:value&&typeof value==='object'
  ?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${paymentJSON(value[key])}`).join(',')}}`:JSON.stringify(value);
const PLATFORM_ERRORS={
  auth_context_changed:['identity_changed',"DisplayText4268, DisplayText4480."],
  game_points_idempotency_conflict:['game_points_idempotency_conflict',"DisplayText4512, DisplayText4513."],
  game_points_limit:['game_points_limit',"DisplayText4514, DisplayText4513."],
};
const PAYMENT_ERRORS={
  home_payment_not_found:[404,"DisplayText4515."],
  home_payment_insufficient:[409,"DisplayText4516, DisplayText4517."],
  home_payment_order_conflict:[409,"DisplayText4518, DisplayText4519."],
  home_payment_state_conflict:[409,"DisplayText4520, DisplayText4521."],
  home_payment_unavailable:[503,"DisplayText4522, DisplayText4523."],
  game_points_invalid:[422,"DisplayText4524."],
  home_resale_not_found:[404,"DisplayText4525."],
  home_resale_invalid:[422,"DisplayText4526."],
  home_resale_original_order_not_found:[404,"DisplayText4527."],
  home_resale_original_order_uncommitted:[409,"DisplayText4528, DisplayText4513."],
  home_resale_original_order_mismatch:[409,"DisplayText4529, DisplayText4513."],
  home_resale_amount_exceeded:[409,"DisplayText4530, DisplayText4513."],
  home_resale_item_already_sold:[409,"DisplayText4531, DisplayText4532."],
  home_resale_conflict:[409,"DisplayText4533, DisplayText4534."],
  home_resale_unavailable:[503,"DisplayText4535, DisplayText4536."],
};
const RESALE_POLICY='paid-unit-half-v1';
const RESALE_QUOTE_KEYS=['id','studentId','ownedId','skuId','originalOrderId','originalItemsHash','paidUnitPrice','creditAmount','policy'];
function validResaleQuote(quote,studentId){
  return isRecord(quote)&&Object.keys(quote).sort().join(',')===[...RESALE_QUOTE_KEYS].sort().join(',')
    &&quote.studentId===studentId&&['id','ownedId','skuId','originalOrderId'].every(key=>typeof quote[key]==='string'&&PAYMENT_ID.test(quote[key]))
    &&typeof quote.originalItemsHash==='string'&&/^[a-f0-9]{64}$/.test(quote.originalItemsHash)
    &&Number.isSafeInteger(quote.paidUnitPrice)&&quote.paidUnitPrice>0&&quote.paidUnitPrice<=1_000_000_000
    &&Number.isSafeInteger(quote.creditAmount)&&quote.creditAmount>0&&quote.creditAmount===Math.floor(quote.paidUnitPrice/2)&&quote.policy===RESALE_POLICY;
}
export class PlatformClient {
  constructor({origin, publicOrigin=origin, fetchImpl = fetch, timeoutMs = 5000, maxResponseBytes = 4 * 1024 * 1024,
    homeCommerceSigningSecret=process.env.HOME_COMMERCE_SIGNING_SECRET,clock=Date.now} = {}) {
    this.origin=trustedOrigin(origin);this.publicOrigin=trustedOrigin(publicOrigin);this.fetch=fetchImpl;this.timeoutMs=timeoutMs;this.maxResponseBytes=maxResponseBytes;
    this.homeCommerceSigningSecret=homeCommerceSigningSecret;this.clock=clock;
  }
  async request(path,cookie,write=null) {
    // Only a fixed starter program may write upstream; clients cannot choose an amount or source.
    const starter=/^\/api\/game-points\/v1\/students\/([a-f\d-]{36})\/starter-grant$/.exec(path);
    if(write ? !starter || !isIdentity(write.expectedUserId) || Object.keys(write).length!==1
      : !['/api/auth/me','/api/game-points/v1/context','/api/student-profiles/v1'].includes(path)
        && !/^\/api\/game-points\/v1\/students\/[a-f\d-]{36}\/wallet$/.test(path)) throw new TypeError('Upstream route not allowed.');
    return this.#fetch(path,cookie,{body:write,key:write?`starter-v1-${starter[1]}`:undefined});
  }
  async #fetch(path,cookie,{body=null,key,payment=false,headers={}}={}) {
    if (typeof cookie !== 'string' || !cookie || cookie.length > 16384 || /[\r\n]/.test(cookie)) throw unauthorized();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try {
      const response=await this.fetch(new URL(path,this.origin),{method:body?'POST':'GET',headers:{accept:'application/json',cookie,...headers,
        ...(body?{'content-type':'application/json',origin:this.publicOrigin,'idempotency-key':key}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:controller.signal});
      if (response.status===401) throw unauthorized();
      if (response.status===403) throw new HomeServiceError(403,'platform_forbidden',"DisplayText4537.");
      const expectedFailure=body&&response.status===409||payment&&[404,409,422,503].includes(response.status);
      if (response.status!==200&&!expectedFailure) throw platformFailure();
      if (!/application\/json/i.test(response.headers.get('content-type')??'')) throw platformFailure();
      const announced=Number(response.headers.get('content-length')??0);
      if (announced>this.maxResponseBytes) throw platformFailure();
      const reader=response.body?.getReader();if(!reader)throw platformFailure();
      let size=0;const chunks=[];
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
        if(size>this.maxResponseBytes){await reader.cancel();throw platformFailure();}chunks.push(Buffer.from(part.value));}
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(response.status!==200){
        // Accept the platform's flat error code and the older proxy envelope,
        // but never expose its private text or mistake payment conflicts for a changed login.
        const code=typeof data?.error==='string'?data.error:data?.error?.code;
        if(response.status===409&&typeof code==='string'&&Object.hasOwn(PLATFORM_ERRORS,code))
          throw new HomeServiceError(409,...PLATFORM_ERRORS[code]);
        if(payment&&typeof code==='string'&&Object.hasOwn(PAYMENT_ERRORS,code)&&PAYMENT_ERRORS[code][0]===response.status)
          throw new HomeServiceError(response.status,code,PAYMENT_ERRORS[code][1]);
        throw platformFailure();
      }
      return data;
    } catch(error) { if(error instanceof HomeServiceError)throw error;throw platformFailure(); }
    finally {clearTimeout(timer);}
  }
  async session(cookie) {
    const session=await this.request('/api/auth/me',cookie);
    if (session?.authenticated === false) throw unauthorized();
    if (session?.authenticated !== true || !isRecord(session.user) || !isIdentity(session.user.id)
      || !['owner','member'].includes(session.user.role)) throw platformFailure();
    const context=await this.request('/api/game-points/v1/context',cookie);
    if (context?.schemaVersion!=='game-points-context.v1' || !isIdentity(context.tenantId)
      || context.currency!=='platform-points' || context.actor?.id!==session.user.id || context.actor?.role!==session.user.role) throw platformFailure();
    return {authenticated:true,actor:{id:session.user.id,role:session.user.role,
      displayName:typeof session.user.displayName==='string'?session.user.displayName.slice(0,100):''},tenantId:context.tenantId,currency:context.currency};
  }
  async students(cookie) {
    const data=await this.request('/api/student-profiles/v1',cookie);
    if(data?.schemaVersion!=='student-profile-store.v1'||!Array.isArray(data.students)||data.students.length>512)throw platformFailure();
    const seen=new Set();return data.students.map(row=>{
      if(!isStudentId(row?.id)||seen.has(row.id)||row.status!=='active'||typeof row.displayName!=='string'||!row.displayName.trim()||row.displayName.length>100)throw platformFailure();
      seen.add(row.id);return {id:row.id,displayName:row.displayName};
    });
  }
  async wallet(cookie,tenantId,studentId) {
    if(!isStudentId(studentId))throw new TypeError('Invalid student id');
    const data=await this.request(`/api/game-points/v1/students/${studentId}/wallet`,cookie);
    return this.checkedWallet(data?.wallet,tenantId,studentId);
  }
  checkedWallet(wallet,tenantId,studentId) {
    const amountKeys=['balance','totalEarned','totalSpent','totalRefunded','revision'];
    if(!isRecord(wallet)||wallet.tenantId!==tenantId||wallet.studentId!==studentId||wallet.currency!=='platform-points'
      ||!amountKeys.every(key=>Number.isSafeInteger(wallet[key])&&wallet[key]>=0)
      ||Object.hasOwn(wallet,'reserved')&&(!Number.isSafeInteger(wallet.reserved)||wallet.reserved<0))throw platformFailure();
    return {tenantId,studentId,currency:'platform-points',...Object.fromEntries(amountKeys.map(key=>[key,wallet[key]])),
      ...(Object.hasOwn(wallet,'reserved')?{reserved:wallet.reserved}:{})};
  }
  paymentAdapter(cookie,tenantId,studentId,actorId) {
    if(!isIdentity(tenantId)||!isIdentity(actorId)||!isStudentId(studentId))throw new TypeError('Invalid payment identity');
    const call=async(action,orderId,quote=null)=>{
      if(typeof orderId!=='string'||!PAYMENT_ID.test(orderId))throw new TypeError('Invalid order id');
      if(quote&&(!isRecord(quote)||Object.keys(quote).sort().join(',')!=='amount,catalogVersion,itemsHash,orderId,studentId'
        ||quote.orderId!==orderId||quote.studentId!==studentId||!Number.isSafeInteger(quote.amount)||quote.amount<1||quote.amount>1_000_000_000
        ||typeof quote.catalogVersion!=='string'||!PAYMENT_ID.test(quote.catalogVersion)||typeof quote.itemsHash!=='string'||!/^[a-f0-9]{64}$/.test(quote.itemsHash)))throw new TypeError('Invalid payment quote');
      const secret=this.homeCommerceSigningSecret;
      if(typeof secret!=='string'||secret.length<32||secret.length>4096)throw unavailable('home_payment_unavailable',"DisplayText4538, DisplayText4539.");
      const path=`/api/game-points/v1/homeworld/orders/${orderId}${action==='get'?'':`/${action}`}`;
      const body=action==='get'?null:{expectedUserId:actorId,...quote?{studentId,amount:quote.amount,catalogVersion:quote.catalogVersion,itemsHash:quote.itemsHash}:{}};
      const method=body?'POST':'GET',timestamp=String(Math.floor(this.clock()/1000));
      const signature=createHmac('sha256',secret).update(`homeworld-payment-v1\n${timestamp}\n${method}\n${path}\n${paymentJSON(body)}`).digest('hex');
      const key=`home-${action}-${createHash('sha256').update(orderId).digest('hex')}`;
      const result=await this.#fetch(path,cookie,{body,key,payment:true,headers:{'x-home-payment-timestamp':timestamp,'x-home-payment-signature':signature}});
      const wallet=this.checkedWallet(result?.wallet,tenantId,studentId),order=result?.order;
      if(!isRecord(order)||order.id!==orderId||order.studentId!==studentId||order.sourceGameId!=='homeworld'
        ||!Number.isSafeInteger(order.amount)||order.amount<1||order.amount>1_000_000_000
        ||typeof order.catalogVersion!=='string'||!PAYMENT_ID.test(order.catalogVersion)||typeof order.itemsHash!=='string'||!/^[a-f0-9]{64}$/.test(order.itemsHash)
        ||!['reserved','committed','cancelled'].includes(order.status)||!isIdentity(order.createdBy)||!Number.isFinite(Date.parse(order.createdAt))
        ||(quote&&(order.amount!==quote.amount||order.catalogVersion!==quote.catalogVersion||order.itemsHash!==quote.itemsHash))
        ||(action!=='get'&&typeof result.duplicate!=='boolean'))throw platformFailure();
      const keys=['id','sourceGameId','studentId','amount','catalogVersion','itemsHash','createdBy','createdAt','status','reserveLedgerEntryId','committedAt','cancelledAt','commitLedgerEntryId','cancelLedgerEntryId','updatedBy'];
      return {order:Object.fromEntries(keys.filter(key=>Object.hasOwn(order,key)).map(key=>[key,order[key]])),wallet,
        ...(action==='get'?{}:{duplicate:result.duplicate})};
    };
    const resaleCall=async(id,quote=null)=>{
      if(typeof id!=='string'||!PAYMENT_ID.test(id)||quote&&(!validResaleQuote(quote,studentId)||quote.id!==id))throw new TypeError('Invalid resale quote');
      const secret=this.homeCommerceSigningSecret;
      if(typeof secret!=='string'||secret.length<32||secret.length>4096)throw unavailable('home_resale_unavailable',"DisplayText4540, DisplayText4541.");
      const path=`/api/game-points/v1/homeworld/resales/${id}`;
      const body=quote?{expectedUserId:actorId,...Object.fromEntries(RESALE_QUOTE_KEYS.filter(key=>key!=='id').map(key=>[key,quote[key]]))}:null;
      const method=body?'POST':'GET',timestamp=String(Math.floor(this.clock()/1000));
      const signature=createHmac('sha256',secret).update(`homeworld-resale-v1\n${timestamp}\n${method}\n${path}\n${paymentJSON(body)}`).digest('hex');
      const key=`home-resale-${createHash('sha256').update(id).digest('hex')}`;
      const result=await this.#fetch(path,cookie,{body,key,payment:true,headers:{'x-home-payment-timestamp':timestamp,'x-home-payment-signature':signature}});
      const wallet=this.checkedWallet(result?.wallet,tenantId,studentId),resale=result?.resale;
      if(!isRecord(resale)||!validResaleQuote(Object.fromEntries(RESALE_QUOTE_KEYS.map(key=>[key,resale[key]])),studentId)
        ||resale.id!==id||resale.sourceGameId!=='homeworld'||resale.currency!=='platform-points'||resale.status!=='credited'
        ||typeof resale.ledgerEntryId!=='string'||!PAYMENT_ID.test(resale.ledgerEntryId)||!isIdentity(resale.createdBy)||!Number.isFinite(Date.parse(resale.createdAt))
        ||quote&&RESALE_QUOTE_KEYS.some(key=>resale[key]!==quote[key])||body&&typeof result.duplicate!=='boolean')throw platformFailure();
      const keys=[...RESALE_QUOTE_KEYS,'sourceGameId','currency','status','ledgerEntryId','createdAt','createdBy'];
      return {resale:Object.fromEntries(keys.map(key=>[key,resale[key]])),wallet,...body?{duplicate:result.duplicate}:{}};
    };
    return Object.freeze({reserve:quote=>call('reserve',quote?.orderId,quote),get:id=>call('get',id),commit:id=>call('commit',id),cancel:id=>call('cancel',id),
      getResale:id=>resaleCall(id),creditResale:quote=>resaleCall(quote?.id,quote)});
  }
  async starterGrant(cookie,tenantId,studentId,actorId) {
    if(!isStudentId(studentId)||!isIdentity(actorId))throw new TypeError('Invalid starter identity');
    const result=await this.request(`/api/game-points/v1/students/${studentId}/starter-grant`,cookie,{expectedUserId:actorId});
    const wallet=this.checkedWallet(result?.wallet,tenantId,studentId),grant=result?.grant,baseline=result?.baseline;
    if(!isRecord(grant)||grant.programId!=='student-starter-v1'||grant.amount!==50000
      ||typeof grant.ledgerEntryId!=='string'||!grant.ledgerEntryId||!Number.isFinite(Date.parse(grant.createdAt))
      ||typeof result.duplicate!=='boolean')throw platformFailure();
    // The original 50k receipt stays immutable. The v2 baseline confirms the
    // cumulative initial funding, independently of today's spendable balance.
    if(!isRecord(baseline)||baseline.programId!=='student-starter-baseline-v2'||baseline.amount!==150000
      ||!Number.isSafeInteger(baseline.creditedAmount)||baseline.creditedAmount<150000
      ||!Number.isSafeInteger(baseline.addedAmount)||baseline.addedAmount<0||baseline.addedAmount>150000
      ||!(baseline.ledgerEntryId===null||typeof baseline.ledgerEntryId==='string'&&baseline.ledgerEntryId.length>0)
      ||baseline.addedAmount>0&&baseline.ledgerEntryId===null||!Number.isFinite(Date.parse(baseline.createdAt))
      ||typeof baseline.duplicate!=='boolean'||baseline.duplicate!==(baseline.addedAmount===0))throw platformFailure();
    return {wallet,grant:{programId:grant.programId,amount:grant.amount,ledgerEntryId:grant.ledgerEntryId,createdAt:grant.createdAt},
      baseline:{programId:baseline.programId,amount:baseline.amount,creditedAmount:baseline.creditedAmount,addedAmount:baseline.addedAmount,
        ledgerEntryId:baseline.ledgerEntryId,createdAt:baseline.createdAt,duplicate:baseline.duplicate},duplicate:result.duplicate};
  }
}
