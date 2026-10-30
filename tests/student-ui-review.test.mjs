import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,copyFile,symlink,access,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createMultiFloorUIReviewFixture} from '../scripts/qa/student-ui-multi-floor-fixture.mjs';
import {validateStudentHome} from '../server/student-homes/profile.mjs';
import {getFloorHomes} from '../public/js/home-commerce.js';
import {getHomeStairs} from '../public/js/home-staircase-shape.js';

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

async function startLab(t,{fixture='starter'}={}){
  const directory=await mkdtemp(join(tmpdir(),'homeworld-ui-lab-test-'));await mkdir(join(directory,'tmp'));
  // A local guard makes an accidental external destination a test failure before
  // a socket is opened; all lab listeners must also bind only to loopback.
  const guard=join(directory,'network-guard.cjs'),audit=join(directory,'network.jsonl');
  await writeFile(guard,`const fs=require('node:fs'),net=require('node:net'),http=require('node:http'),https=require('node:https'),tls=require('node:tls');\nconst audit=${JSON.stringify(audit)};function check(host,kind){if(!['127.0.0.1','localhost','::1'].includes(host))throw Error('Non-loopback '+kind);fs.appendFileSync(audit,JSON.stringify({host,kind})+'\\n');}\nfor(const module of [http,https]){const original=module.request;module.request=function(options,...args){check(typeof options==='string'?new URL(options).hostname:options.hostname??options.host??'localhost','request');return original.call(this,options,...args);};}\nconst listen=net.Server.prototype.listen;net.Server.prototype.listen=function(port,host,...args){check(typeof port==='object'?port.host:host,'listen');return listen.call(this,port,host,...args);};\nconst originalFetch=global.fetch;global.fetch=function(input,...args){check(new URL(input.url??input).hostname,'fetch');return originalFetch.call(this,input,...args);};require('node:module').syncBuiltinESMExports();\n`);
  const probe=createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));const port=probe.address().port;await new Promise(done=>probe.close(done));
  let output='',errors='';const child=spawn(process.execPath,['--require',guard,'scripts/qa/student-ui-review.mjs'],{cwd:root,env:{...process.env,TMPDIR:join(directory,'tmp'),UI_REVIEW_PORT:String(port),UI_REVIEW_FIXTURE:fixture},stdio:['ignore','pipe','pipe']});
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

test('multi-floor seed is a deterministic legal account home with different plans, paired paid elevator and two televisions',()=>{
  const fixture=createMultiFloorUIReviewFixture(A),other=createMultiFloorUIReviewFixture(A),floors=getFloorHomes(fixture.home.commerce);
  assert.equal(validateStudentHome(fixture.home,A),true);assert.deepEqual(fixture,other);assert.equal(floors.length,2);
  assert.deepEqual(floors[0].rooms.map(row=>row.kind),['living','kitchen','playroom']);assert.deepEqual(floors[1].rooms.map(row=>row.kind),['bedroom','study']);
  const lower=getHomeStairs(floors[0])[0],upper=getHomeStairs(floors[1])[0];assert.equal(lower.type,'elevator');assert.deepEqual(upper,{...lower,direction:'down'});
  assert.ok(fixture.commands.some(row=>row.type==='upgradeStaircase'&&row.amount>0));assert.ok(fixture.summary.simulatedSpend>0);
  for(const[storey,floor]of floors.entries()){
    const tv=floor.furniture.find(row=>row.kind==='ipRetroTelevision'),sofa=floor.furniture.find(row=>row.kind==='sofa');assert.ok(tv);assert.ok(sofa);
    const owned=fixture.home.commerce.owned.find(row=>row.id===tv.id);assert.equal(owned.source,'purchase');assert.equal(owned.status,'placed');assert.equal(owned.storey,storey);
  }
  assert.equal(fixture.home.commerce.wallet.balance,0,'fixture bookkeeping is never a spendable platform wallet');assert.equal(fixture.home.commerce.cart.length,0);
});

test('explicit multi-floor lab serves legal Sam data, keeps Robin starter-only and isolates upper television writes',async t=>{
  const lab=await startLab(t,{fixture:'multi-floor'});assert.equal(lab.info.fixture,'multi-floor');assert.equal(lab.info.fixtureSummary.floors,2);
  const session=(await lab.call('/session')).data,sam=(await lab.call('/students/'+A+'/home')).data.home,robin=(await lab.call('/students/'+B+'/home')).data.home;
  assert.equal(validateStudentHome(sam,A),true);assert.equal(validateStudentHome(robin,B),true);assert.equal(getFloorHomes(sam.commerce).length,2);assert.equal(getFloorHomes(robin.commerce).length,1);assert.equal(robin.revision,0);
  const [lower,upper]=getFloorHomes(sam.commerce),tv=upper.furniture.find(row=>row.kind==='ipRetroTelevision'),lowerTV=lower.furniture.find(row=>row.kind==='ipRetroTelevision');
  const beforeLower=structuredClone(sam.commerce.objectStates[lowerTV.id]);
  const applied=await lab.call('/students/'+A+'/home/commands',{body:{expectedUserId:session.actor.id,expectedRevision:sam.revision,commandId:'multi-floor-upper-television-1',command:{type:'setObjectState',id:tv.id,storey:1,patch:{channel:3}}}});
  assert.equal(applied.status,200);assert.equal(applied.data.home.commerce.objectStates[tv.id].channel,3);assert.deepEqual(applied.data.home.commerce.objectStates[lowerTV.id],beforeLower);
  assert.equal((await lab.call('/students/'+B+'/home')).data.home.revision,0);assert.equal((await lab.call('/students/'+A+'/wallet')).data.wallet.balance,150000);
  const traffic=(await readFile(lab.audit,'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.ok(traffic.every(row=>['127.0.0.1','localhost','::1'].includes(row.host)));await lab.stop();
});

test('an occupied review port closes the upstream service and removes its temporary fixture store',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'homeworld-ui-startup-test-')),scratch=join(directory,'tmp');await mkdir(scratch);const blocker=createServer();await new Promise(done=>blocker.listen(0,'127.0.0.1',done));
  t.after(async()=>{await new Promise(done=>blocker.close(done));await rm(directory,{recursive:true,force:true});});
  const child=spawn(process.execPath,['scripts/qa/student-ui-review.mjs'],{cwd:root,env:{...process.env,TMPDIR:scratch,UI_REVIEW_PORT:String(blocker.address().port),UI_REVIEW_FIXTURE:'multi-floor'},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',bytes=>errors+=bytes);child.stdout.resume();
  const[code]=await deadline(once(child,'exit'),15000,'Failed startup did not release its service');assert.notEqual(code,0);assert.match(errors,/EADDRINUSE/);assert.deepEqual(await readdir(scratch),[]);
});

test('viewport review embeds the real local Warm application at only approved dimensions and never accepts writes',async t=>{
  const lab=await startLab(t,{fixture:'multi-floor'}),before=(await lab.call('/students/'+A+'/home')).data.home;
  for(const[width,height]of[[1440,900],[1280,720],[1024,600]]){
    const response=await fetch(lab.origin+`/qa/viewport?width=${width}&height=${height}`),html=await response.text();assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);assert.match(response.headers.get('content-security-policy'),/frame-src 'self'/);
    assert.ok(html.includes(`width:${width}px;height:${height}px`));assert.ok(html.includes(`title="Classroom viewport" width="${width}" height="${height}"`));assert.ok(html.includes('src="/games/homeworld/student-homes.html?theme=warm"'));assert.doesNotMatch(html,/<script|https?:\/\//i);
    const real=await fetch(lab.origin+'/games/homeworld/student-homes.html?theme=warm');assert.equal(real.status,200);assert.match(await real.text(),/student-homes\.js/);
  }
  for(const query of['width=1279&height=720','width=1280&height=600','width=1280','width=1280&height=720&width=1440','width=1280&height=720&src=https://outside.invalid','width=1280.0&height=720']){
    assert.equal((await fetch(lab.origin+'/qa/viewport?'+query)).status,400);
  }
  const denied=await fetch(lab.origin+'/qa/viewport?width=1280&height=720',{method:'POST'});assert.equal(denied.status,405);assert.equal(denied.headers.get('allow'),'GET');assert.deepEqual((await lab.call('/students/'+A+'/home')).data.home,before);await lab.stop();
});
