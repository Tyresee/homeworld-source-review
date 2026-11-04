import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {StudentHomeShareStore,isHomeShareId} from '../server/student-homes/shares.mjs';
import {createStudentHome} from '../server/student-homes/profile.mjs';

const studentId='11111111-1111-4111-8111-111111111111',otherStudent='22222222-2222-4222-8222-222222222222';
const identity={tenantId:'teacher-tenant',studentId,actorUserId:'teacher-one'};
const digest=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t,options={}){const dir=await fs.mkdtemp(join(tmpdir(),'pocket-share-'));const store=new StudentHomeShareStore({dataDir:dir,...options});await store.initialize();t.after(async()=>{await store.close();await fs.rm(dir,{recursive:true,force:true});});const home=createStudentHome(studentId);return{dir,store,home,args:{...identity,commandId:'share-command-0001',expectedRevision:home.revision,home}};}
const fails=(promise,status,code)=>assert.rejects(promise,error=>error.status===status&&error.code===code);

test('create persists an immutable anonymous achievement; public reads never touch files or source home',async t=>{
  const f=await fixture(t),before=JSON.stringify(f.home),result=await f.store.create(f.args);assert.equal(result.duplicate,false);assert.equal(result.share.status,'active');assert.equal(isHomeShareId(result.share.id),true);assert.equal(result.share.id.length,43);assert.equal(result.share.id.includes(studentId),false);
  const path=f.store.fileFor(result.share.id),stat=await fs.stat(path),bytes=await fs.readFile(path);assert.equal(stat.mode&0o777,0o600);assert.equal((await fs.stat(f.store.dir)).mode&0o777,0o700);
  const publicResult=await f.store.getPublic(result.share.id);assert.deepEqual(Object.keys(publicResult.share),['id','publishedAt','snapshot']);assert.equal(JSON.stringify(publicResult).includes(studentId),false);assert.equal(JSON.stringify(publicResult).includes(identity.tenantId),false);assert.equal(JSON.stringify(publicResult).includes(identity.actorUserId),false);assert.equal(JSON.stringify(publicResult).includes('wallet'),false);
  for(let i=0;i<3;i++)await f.store.getPublic(result.share.id);assert.deepEqual(await fs.readFile(path),bytes);assert.equal((await fs.stat(path)).mtimeMs,stat.mtimeMs);assert.equal(JSON.stringify(f.home),before);
  f.home.commerce.home.surfaces['floor.main'].color='#ff0000';assert.notEqual((await f.store.getPublic(result.share.id)).share.snapshot.floors[0].surfaces['floor.main'].color,'#ff0000');
});


test('personalized titles are immutable across idempotent retries and restart while legacy title records remain readable',async t=>{
  const f=await fixture(t),legacy=await f.store.create(f.args),named=await f.store.create({...f.args,commandId:'share-named-command-0002',displayName:'Sample Learner'});
  const path=f.store.fileFor(named.share.id),bytes=await fs.readFile(path),before=JSON.stringify(f.home);
  assert.equal((await f.store.getPublic(legacy.share.id)).share.snapshot.title,"My Learning Home");assert.equal((await f.store.getPublic(named.share.id)).share.snapshot.title,"Sample Learner Home");
  const duplicate=await f.store.create({...f.args,commandId:'share-named-command-0002',displayName:'Renamed Learner'});assert.equal(duplicate.duplicate,true);assert.equal(duplicate.share.id,named.share.id);assert.deepEqual(await fs.readFile(path),bytes);assert.equal(JSON.stringify(f.home),before);
  await f.store.close();const restart=new StudentHomeShareStore({dataDir:f.dir});await restart.initialize();t.after(()=>restart.close());
  assert.equal((await restart.getPublic(legacy.share.id)).share.snapshot.title,"My Learning Home");assert.equal((await restart.getPublic(named.share.id)).share.snapshot.title,"Sample Learner Home");
});

test('creation is idempotent concurrently and across restart, even after the source home is subsequently changed',async t=>{
  const f=await fixture(t),rows=await Promise.all(Array.from({length:8},()=>f.store.create(f.args)));assert.equal(rows.filter(row=>!row.duplicate).length,1);assert.equal(new Set(rows.map(row=>row.share.id)).size,1);
  assert.equal((await fs.readdir(f.store.dir)).filter(n=>n.endsWith('.json')).length,1);await f.store.close();
  const restart=new StudentHomeShareStore({dataDir:f.dir});await restart.initialize();t.after(()=>restart.close());
  const retry=await restart.create({...f.args,home:null});assert.equal(retry.duplicate,true);assert.equal(retry.share.id,rows[0].share.id);
  await fails(restart.create({...f.args,expectedRevision:1}),409,'idempotency_conflict');
});

test('the same visible request ID has unrelated capabilities for another teacher, student or tenant',async t=>{
  const f=await fixture(t),a=await f.store.create(f.args),b=await f.store.create({...f.args,actorUserId:'teacher-two'}),c=await f.store.create({...f.args,tenantId:'other-tenant'}),home=createStudentHome(otherStudent),d=await f.store.create({...f.args,studentId:otherStudent,home});assert.equal(new Set([a,b,c,d].map(row=>row.share.id)).size,4);
  assert.deepEqual((await f.store.list(identity)).shares.map(row=>row.id),[a.share.id]);assert.deepEqual((await f.store.list({...identity,actorUserId:'teacher-two'})).shares.map(row=>row.id),[b.share.id]);
});

test('stale or uninitialized source homes cannot publish and malformed IDs never become paths',async t=>{
  const f=await fixture(t);await fails(f.store.create({...f.args,expectedRevision:3}),409,'revision_conflict');await fails(f.store.create({...f.args,home:null}),404,'home_not_initialized');
  for(const id of['../secret','.share-key','A'.repeat(42),'A'.repeat(43)+'?x=1','A'.repeat(42)+'B'])await fails(f.store.getPublic(id),404,'share_not_found');
  assert.equal((await fs.readdir(f.store.dir)).filter(n=>n.endsWith('.json')).length,0);
});

test('only the exact owner can revoke; a revoked capability stays revoked across retries and restarts',async t=>{
  const f=await fixture(t),result=await f.store.create(f.args),id=result.share.id;
  for(const change of[{actorUserId:'teacher-two'},{tenantId:'other-tenant'},{studentId:otherStudent}])await fails(f.store.revoke({...identity,...change,id}),404,'share_not_found');
  assert.ok(await f.store.getPublic(id));assert.deepEqual(await f.store.revoke({...identity,id}),{share:{id,status:'revoked'}});assert.deepEqual(await f.store.revoke({...identity,id}),{share:{id,status:'revoked'}});await fails(f.store.getPublic(id),404,'share_not_found');
  const repeated=await f.store.create(f.args);assert.equal(repeated.share.status,'revoked');assert.equal(repeated.duplicate,true);assert.equal((await f.store.list(identity)).shares[0].status,'revoked');
  await f.store.close();const restart=new StudentHomeShareStore({dataDir:f.dir});await restart.initialize();t.after(()=>restart.close());await fails(restart.getPublic(id),404,'share_not_found');
});

test('list is owner scoped, newest first, bounded to50 and exposes no snapshot or ownership identity',async t=>{
  let n=0;const f=await fixture(t,{clock:()=>new Date(Date.UTC(2026,9,31,0,0,n++)).toISOString()});
  for(let i=0;i<53;i++)await f.store.create({...f.args,commandId:`share-command-${String(i).padStart(4,'0')}`});
  const result=await f.store.list(identity);assert.equal(result.shares.length,50);assert.ok(result.shares[0].createdAt>result.shares[49].createdAt);for(const row of result.shares)assert.deepEqual(Object.keys(row),['id','createdAt','sourceRevision','status']);
  assert.deepEqual(await f.store.list({...identity,studentId:otherStudent}),{shares:[]});
});

test('partial write failure leaves no public capability and retry uses the same authenticated operation',async t=>{
  let fail=true;const wrapped={...fs,rename:async(...args)=>{if(fail){fail=false;throw Error('disk failure');}return fs.rename(...args);}};
  const f=await fixture(t,{fsImpl:wrapped});await fails(f.store.create(f.args),503,'share_storage_unavailable');assert.deepEqual((await fs.readdir(f.store.dir)).filter(n=>n.endsWith('.json')||n.endsWith('.tmp')),[]);
  const result=await f.store.create(f.args);assert.equal(result.duplicate,false);assert.ok(await f.store.getPublic(result.share.id));
});

test('symlinked records and directory never expose targets, corrupt private files fail closed without replacement',async t=>{
  const f=await fixture(t),result=await f.store.create(f.args),path=f.store.fileFor(result.share.id),valid=await fs.readFile(path);await fs.rm(path);const secret=join(f.dir,'private.json');await fs.writeFile(secret,'PRIVATE');await fs.symlink(secret,path);await fails(f.store.getPublic(result.share.id),503,'share_storage_unavailable');assert.equal(await fs.readFile(secret,'utf8'),'PRIVATE');await fs.rm(path);await fs.writeFile(path,valid);
  const body=JSON.parse(valid);body.snapshot.title='leaked private text';await fs.writeFile(path,JSON.stringify(body));const corrupt=await fs.readFile(path);await fails(f.store.getPublic(result.share.id),503,'share_storage_unavailable');assert.deepEqual(await fs.readFile(path),corrupt);
  const dir=await fs.mkdtemp(join(tmpdir(),'pocket-share-link-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.symlink(f.store.dir,join(dir,'shares-v1'));const linked=new StudentHomeShareStore({dataDir:dir});await fails(linked.initialize(),503,'share_storage_unavailable');
});

test('record identity is bound to the private keyed capability even if an unkeyed checksum is rewritten',async t=>{
  const f=await fixture(t),result=await f.store.create(f.args),path=f.store.fileFor(result.share.id),record=JSON.parse(await fs.readFile(path));record.actorUserId='teacher-two';const {checksum,...body}=record;record.checksum=digest(JSON.stringify(body));await fs.writeFile(path,JSON.stringify(record));await fails(f.store.getPublic(result.share.id),503,'share_storage_unavailable');
});

test('a lost capability key with existing snapshots fails closed instead of silently generating replacement links',async t=>{
  const f=await fixture(t),result=await f.store.create(f.args);await f.store.close();await fs.rm(join(f.store.dir,'.share-key'));const restart=new StudentHomeShareStore({dataDir:f.dir});await fails(restart.initialize(),503,'share_storage_unavailable');assert.equal(await fs.stat(f.store.fileFor(result.share.id)).then(v=>v.isFile()),true);await assert.rejects(fs.stat(join(f.store.dir,'.share-key')),{code:'ENOENT'});
});

test('closing waits for durable queued work, rejects new reads and never alters an existing snapshot',async t=>{
  const f=await fixture(t),promise=f.store.create(f.args),closing=f.store.close(),result=await promise;await closing;assert.throws(()=>f.store.getPublic(result.share.id),error=>error.code==='share_storage_unavailable');assert.ok((await fs.stat(f.store.fileFor(result.share.id))).isFile());
});
