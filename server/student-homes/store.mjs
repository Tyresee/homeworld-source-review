import * as fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import {hostname} from 'node:os';
import {HomeServiceError,unavailable,isIdentity,isStudentId,exactKeys} from './errors.mjs';
import {createStudentHome,normalizeColors,validateStudentHome,migrateStudentHome} from './profile.mjs';

import {prepareCommerceCommand,commandHash,paymentOrderId,resaleOrderId,CATALOG_VERSION,LEGACY_CATALOG_VERSION,isCommandId,houseFromCommerce} from './commerce.mjs';
import {robotActivityForRecord,prepareRobotActivityCommand,reconcileRobotActivityDetail} from './robot-activity.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>structuredClone(value);
const storageFailure=()=>unavailable('storage_unavailable',"DisplayText4548, DisplayText4549; DisplayText4550.");
// Pose checkpoints and object settings are replaceable, unlike financial
// receipts. Each has a bounded retry window; current settings live in the home.
function compactRobotCheckpoints(operations){
  let retained=0,settings=0,latestPose=false;const kept=[];
  for(let index=operations.length-1;index>=0;index--){const row=operations[index];
    const carriesPose=row.receipt?.detail&&Object.hasOwn(row.receipt.detail,'robotActivity'),preservePose=carriesPose&&!latestPose;
    if(carriesPose)latestPose=true;
    if(row.receipt?.type==='setRobotActivity'){if(retained++<64||preservePose)kept.push(row);}
    else if(row.receipt?.type==='setObjectState'){if(settings++<128||preservePose)kept.push(row);}
    else kept.push(row);
  }
  return kept.reverse();
}
const RESALE_KEYS=['id','studentId','ownedId','skuId','originalOrderId','originalItemsHash','paidUnitPrice','creditAmount','policy'];
function resaleQuote(record,command,prepared){
  const quote=prepared.detail?.quote,owned=record.home.commerce.owned.find(row=>row.id===command.id);
  const order=record.home.commerce.orders.find(row=>row.id===owned?.orderId);
  const operation=record.operations.find(row=>row.commandId===order?.transactionId);
  const originalOrderId=order&&paymentOrderId(record.tenantId,record.studentId,order.transactionId);
  if(!quote||!owned||!order||!operation||operation.receipt.status!=='delivered'||operation.receipt.type!=='checkout'
    ||operation.receipt.orderId!==originalOrderId||operation.receipt.amount!==order.total
    ||commandHash(operation.receipt.detail?.order)!==commandHash(order)||quote.ownedId!==owned.id||quote.orderId!==order.id
    ||quote.skuId!==owned.skuId||quote.amount!==prepared.creditAmount)throw unavailable('resale_provenance_invalid',"DisplayText4551, DisplayText4491.");
  return {id:resaleOrderId(record.tenantId,record.studentId,owned.id,originalOrderId),studentId:record.studentId,ownedId:owned.id,skuId:owned.skuId,
    originalOrderId,originalItemsHash:operation.hash,paidUnitPrice:quote.paidUnitPrice,creditAmount:prepared.creditAmount,policy:'paid-unit-half-v1'};
}
/** Single writer process; atomic replace + fsync. A crash leaves the lock in place,
 * requiring explicit operator inspection, never silently stealing another process's lock. */
export class StudentHomeStore {
  constructor({dataDir,fsImpl=fs,clock=()=>new Date().toISOString()}={}) {
    if(typeof dataDir!=='string'||!dataDir)throw new TypeError('Explicit dataDir required.');
    this.dir=resolve(dataDir);this.lockDir=join(this.dir,'.student-homes-process-lock');this.fs=fsImpl;this.clock=clock;
    this.token=randomUUID();this.ready=false;this.closed=false;this.tail=Promise.resolve();
  }
  async initialize() {
    if(this.ready)return this;
    await this.fs.mkdir(this.dir,{recursive:true,mode:0o700});
    try {await this.fs.mkdir(this.lockDir,{mode:0o700});}
    catch(error){if(error.code==='EEXIST')throw unavailable('store_locked',"DisplayText4552; DisplayText4553, DisplayText4554.");throw storageFailure();}
    try {await this.fs.writeFile(join(this.lockDir,'owner.json'),JSON.stringify({pid:process.pid,host:hostname(),token:this.token,startedAt:this.clock()})+'\n',{flag:'wx',mode:0o600});}
    catch(error){await this.fs.rm(this.lockDir,{recursive:true,force:true}).catch(()=>{});throw storageFailure();}
    this.ready=true;return this;
  }
  fileFor(tenantId,studentId) {
    if(!isIdentity(tenantId)||!isStudentId(studentId))throw new TypeError('Trusted tenant and UUID required.');
    return join(this.dir,`${digest(`${tenantId}\0${studentId}`)}.json`);
  }
  async operation(fn) {
    if(!this.ready||this.closed)throw storageFailure();
    const next=this.tail.then(fn);this.tail=next.catch(()=>{});return next;
  }
  async readRecord(tenantId,studentId) {
    let text;
    try{const file=this.fileFor(tenantId,studentId),stat=await this.fs.lstat(file);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)throw storageFailure();text=await this.fs.readFile(file,'utf8');}
    catch(error){if(error.code==='ENOENT')return null;throw storageFailure();}
    try{
      const record=JSON.parse(text),extra=record.schemaVersion===2?['operations','pending']:[];
      const body={schemaVersion:record.schemaVersion,tenantId:record.tenantId,studentId:record.studentId,actorUserId:record.actorUserId,home:record.home,...record.schemaVersion===2?{operations:record.operations,pending:record.pending}:{}};
      if(!exactKeys(record,['schemaVersion','tenantId','studentId','actorUserId','home',...extra,'checksum'])||![1,2].includes(record.schemaVersion)
        ||record.tenantId!==tenantId||record.studentId!==studentId||!isIdentity(record.actorUserId)
        ||record.checksum!==digest(JSON.stringify(body))||!validateStudentHome(record.home,studentId))throw storageFailure();
      const next={...record,home:migrateStudentHome(record.home),operations:record.operations??[],pending:record.pending??null};
      if(!this.validTransactions(next))throw storageFailure();
      return next;
    }catch{throw storageFailure();}
  }
  validTransactions(record){
    if(!Array.isArray(record.operations)||record.operations.length>10000)return false;
    const ids=new Set();
    for(const row of record.operations){
      if(!exactKeys(row,['commandId','hash','receipt'])||!isCommandId(row.commandId)||ids.has(row.commandId)||!/^[a-f0-9]{64}$/.test(row.hash)
        ||!row.receipt||row.receipt.commandId!==row.commandId||!['delivered','failed'].includes(row.receipt.status))return false;
      ids.add(row.commandId);
    }
    const p=record.pending;if(p===null)return true;
    if(!p||typeof p!=='object'||Array.isArray(p))return false;
    if(p.kind==='resale-credit'){
      if(!exactKeys(p,['kind','commandId','hash','command','draft','amount','creditAmount','orderId','quote','detail','actorUserId','phase','createdAt'])
        ||!isCommandId(p.commandId)||ids.has(p.commandId)||!exactKeys(p.command,['type','id'])||p.command.type!=='sellItem'
        ||p.hash!==commandHash(p.command)||!isIdentity(p.actorUserId)||p.phase!=='prepared'||p.amount!==0
        ||!Number.isSafeInteger(p.creditAmount)||p.creditAmount<1||!exactKeys(p.quote,RESALE_KEYS)||p.quote.id!==p.orderId
        ||!validateStudentHome(p.draft,record.studentId)||p.draft.revision!==record.home.revision+1)return false;
      try{
        const prepared=prepareCommerceCommand(record.home.commerce,p.command,p.commandId),quote=resaleQuote(record,p.command,prepared);
        return p.creditAmount===prepared.creditAmount&&commandHash(p.quote)===commandHash(quote)
          &&commandHash(p.draft.commerce)===commandHash(prepared.commerce)
          &&commandHash(p.detail)===commandHash(reconcileRobotActivityDetail(record,p.draft,prepared.detail));
      }catch{return false;}
    }
    const hasCatalogVersion=Object.hasOwn(p,'catalogVersion');
    return exactKeys(p,['commandId','hash','command','draft','amount','orderId','detail','actorUserId','phase','createdAt',...hasCatalogVersion?['catalogVersion']:[]])
      &&(!hasCatalogVersion||[LEGACY_CATALOG_VERSION,CATALOG_VERSION].includes(p.catalogVersion))&&isCommandId(p.commandId)&&!ids.has(p.commandId)
      &&p.hash===commandHash(p.command)&&isIdentity(p.actorUserId)&&['prepared','commit-intent'].includes(p.phase)
      &&p.orderId===paymentOrderId(record.tenantId,record.studentId,p.commandId)&&Number.isSafeInteger(p.amount)&&p.amount>0
      &&validateStudentHome(p.draft,record.studentId)&&p.draft.revision===record.home.revision+1;
  }
  async read(tenantId,studentId) {return (await this.readRecord(tenantId,studentId))?.home??null;}
  async writeRecord(record){
    const {tenantId,studentId,actorUserId,home,pending=null}=record;
    const operations=compactRobotCheckpoints(record.operations??[]);record.operations=operations;
    if(!isIdentity(actorUserId)||!validateStudentHome(home,studentId)||!this.validTransactions({...record,operations,pending}))throw storageFailure();
    const body={schemaVersion:2,tenantId,studentId,actorUserId,home,operations,pending},output={...body,checksum:digest(JSON.stringify(body))};
    const serialized=JSON.stringify(output)+'\n';if(Buffer.byteLength(serialized)>16*1024*1024)throw storageFailure();
    const destination=this.fileFor(tenantId,studentId),temporary=`${destination}.${randomUUID()}.tmp`;let handle;
    try{
      handle=await this.fs.open(temporary,'wx',0o600);await handle.writeFile(serialized);await handle.sync();await handle.close();handle=null;
      await this.fs.rename(temporary,destination);
      const directory=await this.fs.open(this.dir,'r');try{await directory.sync();}finally{await directory.close();}
    }catch{throw storageFailure();}
    finally {await handle?.close().catch(()=>{});await this.fs.rm(temporary,{force:true}).catch(()=>{});}
  }
  async write(tenantId,studentId,actorUserId,home){
    const previous=await this.readRecord(tenantId,studentId);
    await this.writeRecord({tenantId,studentId,actorUserId,home,operations:previous?.operations??[],pending:previous?.pending??null});
  }
  async recover(record,payments){
    const pending=record.pending;if(!pending)return {record};
    if(pending.kind==='resale-credit')return this.recoverResale(record,payments);
    // v1 drafts predate this field. Their durable amount and stock are already
    // locked; never reprice an interrupted purchase against today's catalog.
    const catalogVersion=pending.catalogVersion??LEGACY_CATALOG_VERSION;
    if(!payments||!['get','reserve','commit'].every(key=>typeof payments[key]==='function'))throw unavailable('payment_pending',"DisplayText4555, DisplayText4016; DisplayText4556.");
    let response;
    try{response=await payments.get(pending.orderId);}
    catch(error){if(error.status!==404)throw error;}
    if(!response){
      try{response=await payments.reserve({orderId:pending.orderId,studentId:record.studentId,amount:pending.amount,catalogVersion,itemsHash:pending.hash});}
      catch(error){
        // Insufficient balance is a definite non-reservation. Unknown outcomes,
        // identity changes and transport failures retain the durable draft.
        if(error.status===402||error.status===422||error.status===409&&error.code==='home_payment_insufficient'){
          const receipt={commandId:pending.commandId,type:pending.command.type,amount:pending.amount,orderId:pending.orderId,status:'failed',error:{status:error.status,code:error.code??'purchase_rejected',message:error.message}};
          record.operations.push({commandId:pending.commandId,hash:pending.hash,receipt});record.pending=null;await this.writeRecord(record);
        }
        throw error;
      }
    }
    const check=reply=>{
      const order=reply?.order;
      if(!order||order.id!==pending.orderId||order.studentId!==record.studentId||order.amount!==pending.amount||order.catalogVersion!==catalogVersion||order.itemsHash!==pending.hash
        ||!['reserved','committed','cancelled'].includes(order.status))throw unavailable('payment_mismatch',"DisplayText4557, DisplayText4519.");
      return order;
    };
    let order=check(response);
    if(order.status==='cancelled')throw unavailable('payment_cancelled',"DisplayText4558, DisplayText4559.");
    if(order.status==='reserved'){
      if(pending.phase!=='commit-intent'){pending.phase='commit-intent';await this.writeRecord(record);}
      response=await payments.commit(pending.orderId);order=check(response);
    }
    if(order.status!=='committed')throw unavailable('payment_pending',"DisplayText4560, DisplayText4016.");
    const receipt={commandId:pending.commandId,type:pending.command.type,amount:pending.amount,orderId:pending.orderId,status:'delivered',detail:reconcileRobotActivityDetail(record,pending.draft,pending.detail)};
    record.home=pending.draft;record.actorUserId=pending.actorUserId;record.operations.push({commandId:pending.commandId,hash:pending.hash,receipt});record.pending=null;
    await this.writeRecord(record);return {record,receipt,wallet:response.wallet};
  }
  async recoverResale(record,payments){
    const pending=record.pending;
    if(!payments||typeof payments.getResale!=='function'||typeof payments.creditResale!=='function')
      throw unavailable('resale_pending',"DisplayText4561, DisplayText4016; DisplayText4562.");
    let response,notFound=false;
    try{response=await payments.getResale(pending.orderId);}
    catch(error){if(error.status!==404||error.code!=='home_resale_not_found')throw error;notFound=true;}
    if(notFound){
      try{response=await payments.creditResale(clone(pending.quote));}
      catch(error){
        const definite=['home_resale_invalid','game_points_invalid','home_resale_original_order_not_found','home_resale_original_order_uncommitted',
          'home_resale_original_order_mismatch','home_resale_amount_exceeded','game_points_limit'].includes(error.code)
          &&[404,409,422].includes(error.status);
        if(definite){
          const receipt={commandId:pending.commandId,type:'sellItem',amount:0,creditAmount:pending.creditAmount,direction:'credit',orderId:pending.orderId,status:'failed',
            error:{status:error.status,code:error.code,message:error.message}};
          record.operations.push({commandId:pending.commandId,hash:pending.hash,receipt});record.pending=null;await this.writeRecord(record);
        }
        throw error;
      }
    }
    const resale=response?.resale;
    if(!resale||RESALE_KEYS.some(key=>resale[key]!==pending.quote[key])||resale.sourceGameId!=='homeworld'||resale.currency!=='platform-points'
      ||resale.status!=='credited'||typeof resale.ledgerEntryId!=='string'||!resale.ledgerEntryId
      ||!isIdentity(resale.createdBy)||!Number.isFinite(Date.parse(resale.createdAt)))
      throw unavailable('resale_mismatch',"DisplayText4563, DisplayText4564.");
    const receipt={commandId:pending.commandId,type:'sellItem',amount:0,creditAmount:pending.creditAmount,direction:'credit',orderId:pending.orderId,status:'delivered',
      detail:reconcileRobotActivityDetail(record,pending.draft,{...pending.detail,platformResale:clone(resale)})};
    record.home=pending.draft;record.actorUserId=pending.actorUserId;record.operations.push({commandId:pending.commandId,hash:pending.hash,receipt});record.pending=null;
    await this.writeRecord(record);return {record,receipt,wallet:response.wallet};
  }
  getSnapshot(tenantId,studentId,payments) {return this.operation(async()=>{
    let record=await this.readRecord(tenantId,studentId);if(!record)return {home:null,robotActivity:null};
    let recovered;if(record.pending){recovered=await this.recover(record,payments);record=recovered.record;}
    return {home:clone(record.home),robotActivity:robotActivityForRecord(record),...recovered?.wallet?{wallet:recovered.wallet}:{}};
  });}
  get(tenantId,studentId,payments) {return this.getSnapshot(tenantId,studentId,payments).then(result=>result.home);}
  initializeHome(tenantId,studentId,actorUserId) {
    return this.operation(async()=>{
      const existing=await this.readRecord(tenantId,studentId);if(existing){if(existing.pending)throw unavailable('payment_pending',"DisplayText4565.");return {home:clone(existing.home),created:false,robotActivity:robotActivityForRecord(existing)};}
      const home=createStudentHome(studentId,this.clock());await this.write(tenantId,studentId,actorUserId,home);return {home:clone(home),created:true,robotActivity:null};
    });
  }
  updateColors(tenantId,studentId,actorUserId,expectedRevision,colors) {return this.updateColorsSnapshot(tenantId,studentId,actorUserId,expectedRevision,colors).then(result=>result.home);}
  updateColorsSnapshot(tenantId,studentId,actorUserId,expectedRevision,colors) {
    const normalized=normalizeColors(colors);
    return this.operation(async()=>{
      const record=await this.readRecord(tenantId,studentId);if(!record)throw new HomeServiceError(404,'home_not_initialized',"DisplayText4566.");
      if(record.pending)throw new HomeServiceError(409,'payment_pending',"DisplayText4565.");
      const home=record.home;
      if(home.revision!==expectedRevision)throw new HomeServiceError(409,'revision_conflict',"DisplayText4567, DisplayText4568.");
      if(JSON.stringify(home.avatar.colors)===JSON.stringify(normalized))return {home:clone(home),robotActivity:robotActivityForRecord(record)};
      if(home.revision===Number.MAX_SAFE_INTEGER)throw storageFailure();
      home.avatar.colors=normalized;home.revision++;home.updatedAt=this.clock();record.actorUserId=actorUserId;
      await this.writeRecord(record);return {home:clone(home),robotActivity:robotActivityForRecord(record)};
    });
  }
  executeCommand(tenantId,studentId,actorUserId,{expectedRevision,commandId,command,expectedCatalogVersion=CATALOG_VERSION}={},payments){
    if(!isIdentity(actorUserId)||!isCommandId(commandId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new HomeServiceError(422,'invalid_request',"DisplayText4569.");
    let hash;try{hash=commandHash(command);}catch{throw new HomeServiceError(422,'invalid_request',"DisplayText4570.");}
    return this.operation(async()=>{
      let record=await this.readRecord(tenantId,studentId);if(!record)throw new HomeServiceError(404,'home_not_initialized',"DisplayText4566.");
      if(record.pending&&record.pending.commandId===commandId&&record.pending.hash!==hash)throw new HomeServiceError(409,'command_conflict',"DisplayText4571.");
      let recovered;if(record.pending){recovered=await this.recover(record,payments);record=recovered.record;}
      record.operations=compactRobotCheckpoints(record.operations);
      const previous=record.operations.find(row=>row.commandId===commandId);
      if(previous){
        if(previous.hash!==hash)throw new HomeServiceError(409,'command_conflict',"DisplayText4571.");
        if(previous.receipt.status==='failed'){const error=previous.receipt.error;throw new HomeServiceError(error.status,error.code,error.message);}
        let wallet=recovered?.wallet;
        if(previous.receipt.type==='sellItem'&&previous.receipt.creditAmount>0&&!wallet){
          // The home response can be lost after both stores committed. A replay
          // must refresh the displayed platform balance as well as the item.
          if(typeof payments?.getResale!=='function')throw unavailable('resale_pending',"DisplayText4572, DisplayText4573, DisplayText4016.");
          const response=await payments.getResale(previous.receipt.orderId),proof=previous.receipt.detail?.platformResale;
          if(!proof||!response?.resale||!response.wallet||proof.id!==previous.receipt.orderId||proof.creditAmount!==previous.receipt.creditAmount
            ||commandHash(response.resale)!==commandHash(proof))throw unavailable('resale_mismatch',"DisplayText4563, DisplayText4574.");
          wallet=response.wallet;
        }
        return {home:clone(record.home),robotActivity:robotActivityForRecord(record),receipt:clone(previous.receipt),duplicate:true,...wallet?{wallet}:{}};
      }
      if(command?.type==='checkout'&&expectedCatalogVersion!==CATALOG_VERSION)throw new HomeServiceError(409,'catalog_changed',"DisplayText4575, DisplayText4576; DisplayText4577.");
      if(record.home.revision!==expectedRevision)throw new HomeServiceError(409,'revision_conflict',"DisplayText4567, DisplayText4568.");
      if(record.operations.length>=10000||record.home.revision===Number.MAX_SAFE_INTEGER)throw unavailable('history_limit',"DisplayText4578, DisplayText4579.");
      const prepared=command?.type==='setRobotActivity'?prepareRobotActivityCommand(record,command):prepareCommerceCommand(record.home.commerce,command,commandId);
      const nextHome={...record.home,commerce:prepared.commerce};
      const detail=reconcileRobotActivityDetail(record,nextHome,prepared.detail);
      const changed=prepared.changed||detail!==prepared.detail;
      const draft={...clone(record.home),commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:record.home.revision+(changed?1:0),updatedAt:changed?this.clock():record.home.updatedAt};
      if(!validateStudentHome(draft,studentId))throw storageFailure();
      if(prepared.creditAmount){
        const quote=resaleQuote(record,command,prepared);
        record.pending={kind:'resale-credit',commandId,hash,command:clone(command),draft,amount:0,creditAmount:prepared.creditAmount,orderId:quote.id,quote,
          detail,actorUserId,phase:'prepared',createdAt:this.clock()};
        await this.writeRecord(record);
        const result=await this.recover(record,payments);
        return {home:clone(result.record.home),robotActivity:robotActivityForRecord(result.record),receipt:clone(result.receipt),duplicate:false,wallet:result.wallet};
      }
      if(prepared.amount===0){
        // A historical one-point unit rounds down to zero. There is no wallet
        // mutation to recover, but its original purchase still must be proven.
        if(command.type==='sellItem')resaleQuote(record,command,prepared);
        const receipt={commandId,type:command.type,amount:0,...command.type==='sellItem'?{creditAmount:0,direction:'credit'}:{},orderId:null,status:'delivered',detail};
        record.home=draft;record.actorUserId=actorUserId;record.operations.push({commandId,hash,receipt});await this.writeRecord(record);
        return {home:clone(draft),robotActivity:robotActivityForRecord(record),receipt:clone(receipt),duplicate:false};
      }
      record.pending={commandId,hash,command:clone(command),draft,amount:prepared.amount,catalogVersion:CATALOG_VERSION,orderId:paymentOrderId(tenantId,studentId,commandId),detail,actorUserId,phase:'prepared',createdAt:this.clock()};
      await this.writeRecord(record);
      const result=await this.recover(record,payments);
      return {home:clone(result.record.home),robotActivity:robotActivityForRecord(result.record),receipt:clone(result.receipt),duplicate:false,wallet:result.wallet};
    });
  }
  async close() {
    if(this.closed||!this.ready)return;this.closed=true;await this.tail;
    try{const owner=JSON.parse(await this.fs.readFile(join(this.lockDir,'owner.json'),'utf8'));
      if(owner.token!==this.token)throw storageFailure();await this.fs.rm(this.lockDir,{recursive:true});this.ready=false;}
    catch(error){if(error instanceof HomeServiceError)throw error;throw storageFailure();}
  }
}
