import * as fs from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {exactKeys,isIdentity,isStudentId,HomeServiceError,invalid,unavailable} from './errors.mjs';
import {isCommandId} from './commerce.mjs';
import {HOME_SHARE_MAX_BYTES,serializeHomeShareSnapshot,validateHomeShareSnapshot} from './share-snapshot.mjs';
export {serializeHomeShareSnapshot,validateHomeShareSnapshot} from './share-snapshot.mjs';

export const isHomeShareId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value)&&Buffer.from(value,'base64url').toString('base64url')===value;
const digest=value=>createHash('sha256').update(value).digest('hex');
const unavailableStore=()=>unavailable('share_storage_unavailable',"DisplayText5039, DisplayText5040.");
const missing=()=>new HomeServiceError(404,'share_not_found',"DisplayText5041.");
const owner=value=>isIdentity(value?.tenantId)&&isStudentId(value?.studentId)&&isIdentity(value?.actorUserId);
const metadata=record=>({id:record.id,createdAt:record.createdAt,sourceRevision:record.sourceRevision,status:record.revokedAt?'revoked':'active'});
const MAX_RECORD_BYTES=HOME_SHARE_MAX_BYTES+8192,MAX_RECORDS=4096;
const BODY_KEYS=['schemaVersion','id','tenantId','studentId','actorUserId','commandId','sourceRevision','createdAt','revokedAt','snapshot'];

/** Private immutable visual snapshots with an owner-only revocation bit. The
 * containing StudentHomeStore holds the process lock. One atomic file commits
 * both the public capability and idempotency receipt; GET never writes. */
export class StudentHomeShareStore{
  constructor({dataDir,fsImpl=fs,clock=()=>new Date().toISOString()}={}){
    if(typeof dataDir!=='string'||!dataDir)throw TypeError('Explicit dataDir required');
    this.dir=resolve(dataDir,'shares-v1');this.fs=fsImpl;this.clock=clock;this.key=null;this.ready=false;this.closed=false;this.tail=Promise.resolve();
  }
  async initialize(){
    if(this.ready)return this;if(this.closed)throw unavailableStore();
    try{
      await this.fs.mkdir(this.dir,{recursive:true,mode:0o700});const info=await this.fs.lstat(this.dir);if(!info.isDirectory()||info.isSymbolicLink())throw unavailableStore();
      const file=join(this.dir,'.share-key');let infoKey;
      try{infoKey=await this.fs.lstat(file);}catch(error){if(error.code!=='ENOENT')throw error;if((await this.fs.readdir(this.dir)).some(name=>/^share-[a-f0-9]{64}\.json$/.test(name)))throw unavailableStore();let handle;try{handle=await this.fs.open(file,'wx',0o600);await handle.writeFile(randomBytes(32));await handle.sync();}catch(error){if(error.code!=='EEXIST')throw error;}finally{await handle?.close();}const directory=await this.fs.open(this.dir,'r');try{await directory.sync();}finally{await directory.close();}infoKey=await this.fs.lstat(file);}
      if(!infoKey.isFile()||infoKey.isSymbolicLink()||infoKey.size!==32)throw unavailableStore();
      this.key=await this.fs.readFile(file);if(this.key.length!==32)throw unavailableStore();this.ready=true;return this;
    }catch{throw unavailableStore();}
  }
  fileFor(id){if(!isHomeShareId(id))throw missing();return join(this.dir,`share-${digest(id)}.json`);}
  idFor({tenantId,studentId,actorUserId,commandId}){return createHmac('sha256',this.key).update(JSON.stringify([tenantId,studentId,actorUserId,commandId])).digest('base64url');}
  operation(fn){if(!this.ready||this.closed)throw unavailableStore();const next=this.tail.then(fn);this.tail=next.catch(()=>{});return next;}
  async readRecord(id){
    let text;try{const file=this.fileFor(id),info=await this.fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_RECORD_BYTES)throw unavailableStore();text=await this.fs.readFile(file,'utf8');}
    catch(error){if(error.code==='ENOENT')return null;if(error instanceof HomeServiceError)throw error;throw unavailableStore();}
    try{
      const record=JSON.parse(text),body=Object.fromEntries(BODY_KEYS.map(key=>[key,record[key]]));
      if(!exactKeys(record,[...BODY_KEYS,'checksum'])||record.schemaVersion!==1||record.id!==id||!owner(record)||!isCommandId(record.commandId)||record.id!==this.idFor(record)||!Number.isSafeInteger(record.sourceRevision)||record.sourceRevision<0
        ||![record.createdAt,...record.revokedAt===null?[]:[record.revokedAt]].every(value=>typeof value==='string'&&new Date(value).toISOString()===value)||record.revokedAt!==null&&record.revokedAt<record.createdAt
        ||record.checksum!==digest(JSON.stringify(body))||!validateHomeShareSnapshot(record.snapshot))throw unavailableStore();
      return record;
    }catch{throw unavailableStore();}
  }
  async writeRecord(body){
    const destination=this.fileFor(body.id),temporary=`${destination}.${randomUUID()}.tmp`,text=JSON.stringify({...body,checksum:digest(JSON.stringify(body))})+'\n';if(Buffer.byteLength(text)>MAX_RECORD_BYTES)throw unavailableStore();let handle;
    try{handle=await this.fs.open(temporary,'wx',0o600);await handle.writeFile(text);await handle.sync();await handle.close();handle=null;await this.fs.rename(temporary,destination);const directory=await this.fs.open(this.dir,'r');try{await directory.sync();}finally{await directory.close();}}
    catch{throw unavailableStore();}finally{await handle?.close().catch(()=>{});await this.fs.rm(temporary,{force:true}).catch(()=>{});}
  }
  create({tenantId,studentId,actorUserId,commandId,expectedRevision,home,displayName}={}){
    if(!owner({tenantId,studentId,actorUserId})||!isCommandId(commandId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw invalid("DisplayText5042.");
    return this.operation(async()=>{
      const id=this.idFor({tenantId,studentId,actorUserId,commandId}),existing=await this.readRecord(id);
      if(existing){if(existing.sourceRevision!==expectedRevision)throw new HomeServiceError(409,'idempotency_conflict',"DisplayText5043.");return{share:metadata(existing),duplicate:true};}
      if(!home||home.studentId!==studentId)throw new HomeServiceError(404,'home_not_initialized',"DisplayText4566.");
      if(home.revision!==expectedRevision)throw new HomeServiceError(409,'revision_conflict',"DisplayText4567, DisplayText5044.");
      const files=await this.fs.readdir(this.dir);if(files.filter(name=>/^share-[a-f0-9]{64}\.json$/.test(name)).length>=MAX_RECORDS)throw unavailable('share_capacity',"DisplayText5045, DisplayText4541.");
      const body={schemaVersion:1,id,tenantId,studentId,actorUserId,commandId,sourceRevision:home.revision,createdAt:this.clock(),revokedAt:null,snapshot:serializeHomeShareSnapshot(home,{displayName})};
      await this.writeRecord(body);return{share:metadata(body),duplicate:false};
    });
  }
  getPublic(id){return this.operation(async()=>{const record=await this.readRecord(id);if(!record||record.revokedAt)throw missing();return{share:{id:record.id,publishedAt:record.createdAt,snapshot:structuredClone(record.snapshot)}};});}
  list({tenantId,studentId,actorUserId}={}){
    if(!owner({tenantId,studentId,actorUserId}))throw invalid("DisplayText5042.");
    return this.operation(async()=>{
      const names=(await this.fs.readdir(this.dir)).filter(name=>/^share-[a-f0-9]{64}\.json$/.test(name));if(names.length>MAX_RECORDS)throw unavailableStore();const rows=[];
      for(const name of names){let text;try{const path=join(this.dir,name),info=await this.fs.lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_RECORD_BYTES)throw unavailableStore();text=await this.fs.readFile(path,'utf8');const hint=JSON.parse(text);if(hint.tenantId!==tenantId||hint.studentId!==studentId||hint.actorUserId!==actorUserId)continue;const record=await this.readRecord(hint.id);if(name!==`share-${digest(record.id)}.json`)throw unavailableStore();rows.push(metadata(record));}catch{throw unavailableStore();}}
      return{shares:rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)).slice(0,50)};
    });
  }
  revoke({tenantId,studentId,actorUserId,id}={}){
    if(!owner({tenantId,studentId,actorUserId}))throw invalid("DisplayText5042.");
    return this.operation(async()=>{const record=await this.readRecord(id);if(!record||record.tenantId!==tenantId||record.studentId!==studentId||record.actorUserId!==actorUserId)throw missing();
      if(!record.revokedAt){const body=Object.fromEntries(BODY_KEYS.map(key=>[key,record[key]]));body.revokedAt=this.clock();await this.writeRecord(body);}
      return{share:{id,status:'revoked'}};
    });
  }
  async close(){this.closed=true;await this.tail;this.key?.fill(0);this.ready=false;}
}
