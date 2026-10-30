import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,copyFile,symlink,access,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const root=fileURLToPath(new URL('../',import.meta.url));
const api='/games/homeworld/api/v1',A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const deadline=async(promise,ms,label)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(timer);}};
const exists=async path=>{try{await access(path);return true;}catch{return false;}};

test('review vendor loader preserves installed resolution and confines fallback including encoded paths and symlinks',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'homeworld-loader-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await mkdir(join(dir,'scripts/qa'),{recursive:true});await mkdir(join(dir,'vendor/three/build'),{recursive:true});await mkdir(join(dir,'vendor/three/examples/jsm/controls'),{recursive:true});
  await copyFile(join(root,'scripts/qa/student-ui-vendor-loader.mjs'),join(dir,'scripts/qa/loader.mjs'));
  await writeFile(join(dir,'vendor/three/build/three.module.js'),'export const fixture=true;');await writeFile(join(dir,'vendor/three/examples/jsm/controls/Example.js'),'export const fixture=true;');await writeFile(join(dir,'outside.js'),'export const outside=true;');
  await symlink(join(dir,'outside.js'),join(dir,'vendor/three/examples/jsm/controls/escaped.js'));
  const loader=await import(pathToFileURL(join(dir,'scripts/qa/loader.mjs'))),missing=async()=>{throw Error('not installed');};
  const installed={url:'file:///installed/three.js'};assert.equal(await loader.resolve('three',{},async()=>installed),installed);
  for(const specifier of ['three','three/addons/controls/Example.js']){const result=await loader.resolve(specifier,{},missing);assert.equal(result.shortCircuit,true);assert.ok(fileURLToPath(result.url).startsWith(await realpath(join(dir,'vendor/three'))+'/'));}
  for(const specifier of ['unrelated-package','three/addons/../../outside.js','three/addons/%2e%2e/%2e%2e/%2e%2e/%2e%2e/outside.js','three/addons/controls/escaped.js','three/addons/%00file.js','three/addons/%5c..%5coutside.js','three/addons/%ZZ'])await assert.rejects(loader.resolve(specifier,{},missing),undefined,specifier);
});

async function startLab(t){
  const directory=await mkdtemp(join(tmpdir(),'homeworld-ui-lab-test-'));await mkdir(join(directory,'tmp'));
  // A local guard makes an accidental external destination a test failure before
  // a socket is opened; all lab listeners must also bind only to loopback.
  const guard=join(directory,'network-guard.cjs'),audit=join(directory,'network.jsonl');
  await writeFile(guard,`const fs=require('node:fs'),net=require('node:net'),http=require('node:http'),https=require('node:https'),tls=require('node:tls');\nconst audit=${JSON.stringify(audit)};function check(host,kind){if(!['127.0.0.1','localhost','::1'].includes(host))throw Error('Non-loopback '+kind);fs.appendFileSync(audit,JSON.stringify({host,kind})+'\\n');}\nfor(const module of [http,https]){const original=module.request;module.request=function(options,...args){check(typeof options==='string'?new URL(options).hostname:options.hostname??options.host??'localhost','request');return original.call(this,options,...args);};}\nconst listen=net.Server.prototype.listen;net.Server.prototype.listen=function(port,host,...args){check(typeof port==='object'?port.host:host,'listen');return listen.call(this,port,host,...args);};\nconst originalFetch=global.fetch;global.fetch=function(input,...args){check(new URL(input.url??input).hostname,'fetch');return originalFetch.call(this,input,...args);};require('node:module').syncBuiltinESMExports();\n`);
  const probe=createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));const port=probe.address().port;await new Promise(done=>probe.close(done));
  let output='',errors='';const child=spawn(process.execPath,['--require',guard,'scripts/qa/student-ui-review.mjs'],{cwd:root,env:{...process.env,TMPDIR:join(directory,'tmp'),UI_REVIEW_PORT:String(port)},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',bytes=>output+=bytes);child.stderr.on('data',bytes=>errors+=bytes);
  let closed=false;async function stop(){if(closed)return;closed=true;if(child.exitCode===null){const exit=once(child,'exit');child.kill('SIGTERM');try{await deadline(exit,10000,'Lab cleanup timed out');}catch(error){child.kill('SIGKILL');throw error;}}}
  t.after(async()=>{try{await stop();}finally{await rm(directory,{recursive:true,force:true});}});
  const ready=(async()=>{while(!output.includes('fictional-ui-review')){if(child.exitCode!==null)throw Error('Lab exited: '+errors);await new Promise(done=>setTimeout(done,20));}return JSON.parse(output);})();
  const info=await deadline(ready,20000,'Lab did not report readiness');assert.equal(info.mode,'fictional-ui-review');assert.equal(info.platform,'explicit local mock adapter');assert.equal(info.productionData,false);assert.equal(info.purchases,false);
  const origin='http://127.0.0.1:'+port;
  return{directory,origin,info,audit,stop,async call(path,{body,originHeader=origin}={}){const response=await fetch(origin+api+path,{method:body?'POST':'GET',headers:body?{origin:originHeader,'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return{status:response.status,data:await response.json()};},getErrors:()=>errors};
}

test('fictional visual lab binds loopback, uses only disposable data, rejects purchases before mutation and accepts free choices',async t=>{
  const lab=await startLab(t),session=(await lab.call('/session')).data;
  assert.equal(session.authenticated,true);assert.equal(session.actor.id,'fictional-ui-teacher');assert.equal(session.tenantId,'fictional-ui-project');
  const students=(await lab.call('/students')).data.students;assert.deepEqual(students.map(row=>row.id),[A,B]);
  const initial=(await lab.call('/students/'+A+'/home')).data.home;assert.equal(initial.revision,0);assert.equal((await lab.call('/students/'+A+'/wallet')).data.wallet.balance,150000);
  const tempChildren=await readdir(join(lab.directory,'tmp'));assert.equal(tempChildren.length,1);assert.ok(tempChildren[0].startsWith('homeworld-ui-review-'));const dataDir=join(lab.directory,'tmp',tempChildren[0]);assert.ok(relative(root,dataDir).startsWith('..'));
  const storeFiles=(await readdir(dataDir)).filter(name=>name.endsWith('.json'));assert.equal(storeFiles.length,2);const before=await Promise.all(storeFiles.map(name=>readFile(join(dataDir,name),'utf8')));
  const envelope={expectedUserId:session.actor.id,expectedRevision:initial.revision,commandId:'visual-lab-blocked-purchase-1',command:{type:'checkout',lines:[{skuId:'sofa-classic',quantity:1}]}};
  for(const command of [envelope.command,{type:'constructFloor'},{type:'resell'},{type:'upgradeStaircase'}]){const rejected=await lab.call('/students/'+A+'/home/commands',{body:{...envelope,command}});assert.equal(rejected.status,409);assert.equal(rejected.data.error.code,'visual_lab_only');}assert.deepEqual(await Promise.all(storeFiles.map(name=>readFile(join(dataDir,name),'utf8'))),before,'blocked purchase creates no pending record or receipt');
  const forged=await lab.call('/students/'+A+'/home/commands',{body:{...envelope,commandId:'wrong-origin-1',command:{type:'setWallFinish',surfaceId:'wall.inner',styleId:'wall-dots',storey:0}},originHeader:'http://outside.invalid'});assert.equal(forged.status,403);
  const applied=await lab.call('/students/'+A+'/home/commands',{body:{...envelope,commandId:'visual-lab-free-wall-1',command:{type:'setWallFinish',surfaceId:'wall.inner',styleId:'wall-dots',storey:0}}});assert.equal(applied.status,200);assert.equal(applied.data.receipt.amount,0);assert.equal(applied.data.home.commerce.home.surfaces['wall.inner'].styleId,'wall-dots');assert.equal(applied.data.home.commerce.orders.length,0);
  assert.equal((await lab.call('/students/'+B+'/home')).data.home.revision,0);assert.equal((await lab.call('/students/'+A+'/wallet')).data.wallet.balance,150000);
  const vendor=await fetch(lab.origin+'/games/homeworld/vendor/three.module.js');assert.equal(vendor.status,200);assert.match(vendor.headers.get('content-type'),/javascript/);
  for(const tail of ['addons/%2e%2e%2f%2e%2e%2fpackage.json','addons/%5c..%5cpackage.json','addons/%00.js']){const result=await fetch(lab.origin+'/games/homeworld/vendor/'+tail);assert.equal(result.status,404);}
  const traffic=(await readFile(lab.audit,'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.ok(traffic.length>3);assert.ok(traffic.every(row=>['127.0.0.1','localhost','::1'].includes(row.host)));assert.ok(traffic.filter(row=>row.kind==='listen').length===2);assert.equal(lab.getErrors(),'');await lab.stop();assert.equal(await exists(dataDir),false,'graceful exit removes disposable saves');
});
