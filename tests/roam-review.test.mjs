import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRoamReviewServer} from '../scripts/qa/roam-review.mjs';
import {ROAM_REVIEW_CASES,parseRoamReviewPose,summarizeRoamFrames,sameRoamReviewCameraSnapshot} from '../scripts/qa/roam-review-cases.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const close=server=>new Promise(done=>{server.close(done);server.closeAllConnections();});
test('the isolated roam workstation serves real source assets and only read-only loopback routes',async()=>{
  const server=await createRoamReviewServer({port:0}),origin='http://127.0.0.1:'+server.address().port;
  try {
    assert.equal(server.address().address,'127.0.0.1');const health=await (await fetch(origin+'/health')).json();assert.deepEqual({accounts:health.accounts,wallet:health.wallet,persistence:health.persistence,writes:health.writes},{accounts:false,wallet:false,persistence:false,writes:false});assert.deepEqual([health.width,health.height],[1440,900]);
    for(const path of['/','/qa/roam-review-ui.mjs','/qa/roam-review-cases.mjs','/qa/look-dev-fixtures.mjs','/qa/look-dev-runtime.mjs','/js/home-scene.js','/public/js/home-room-expansion.js','/vendor/three/build/three.module.js','/home-roam.css','/presets/warm-walls.json']){const response=await fetch(origin+path);assert.equal(response.status,200,path);assert.ok((await response.text()).length>0);}
    assert.equal((await fetch(origin+'/health',{method:'HEAD'})).status,200);assert.equal(await (await fetch(origin+'/health',{method:'HEAD'})).text(),'');
    for(const path of['/api/auth/me','/api/student-homes','/server/student-homes/app.mjs','/qa/roam-site/house.b64.txt','/presets/default.json','/public/student-homes.html'])assert.equal((await fetch(origin+path)).status,404,path);
    for(const method of['POST','PUT','PATCH','DELETE'])assert.equal((await fetch(origin+'/health',{method})).status,405);
  }finally{await close(server);}
});

test('canonical file containment blocks encoded traversal and a symlink escaping the source public tree',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'homeworld-roam-review-'));
  await mkdir(join(temp,'public/js'),{recursive:true});await writeFile(join(temp,'secret.txt'),'not-a-review-resource');await symlink(join(temp,'secret.txt'),join(temp,'public/js/escaped.js'));await writeFile(join(temp,'public/js/safe.js'),'export const safe=true;');
  const server=await createRoamReviewServer({sourceRoot:temp,harnessRoot:root,port:0}),origin='http://127.0.0.1:'+server.address().port;
  try {
    assert.equal((await fetch(origin+'/js/safe.js')).status,200);
    assert.equal((await fetch(origin+'/js/escaped.js')).status,403);
    for(const path of['/js/%2e%2e/%2e%2e/secret.txt','/vendor/three/%2e%2e/%2e%2e/secret.txt','/js/%5cescaped.js','/qa/%00roam-review-ui.mjs']){const response=await fetch(origin+path);assert.ok([400,403,404].includes(response.status));assert.ok(!(await response.text()).includes('not-a-review-resource'));}
  }finally{await close(server);await rm(temp,{recursive:true,force:true});}
  await assert.rejects(()=>createRoamReviewServer({port:-1}),/Invalid review port/);
});

test('the twelve reference cases and paired lamp cases use actual controller/interaction paths, and camera controls stay confined to QA',async()=>{
  assert.equal(ROAM_REVIEW_CASES.length,14);assert.equal(new Set(ROAM_REVIEW_CASES.map(row=>row.id)).size,14);assert.ok(ROAM_REVIEW_CASES.slice(0,12).every((row,index)=>row.id.startsWith(String(index+1).padStart(2,'0'))));assert.deepEqual(ROAM_REVIEW_CASES.slice(12).map(row=>row.id),['11a-floor-lamp-off','11b-floor-lamp-on']);
  const code=await readFile(new URL('../scripts/qa/roam-review-ui.mjs',import.meta.url),'utf8'),html=await readFile(new URL('../scripts/qa/roam-review.html',import.meta.url),'utf8');
  assert.match(code,/createHomeScene/);assert.match(code,/createLookDevFixture\('house'\)/);assert.match(code,/models\/v4\/robot\.glb/);assert.match(code,/manualClock:true/);assert.match(code,/controller\.enterDoor\(\)/);assert.match(code,/interactions\.activate/);assert.match(code,/key:'Process',code/);
  assert.doesNotMatch(code,/window\.__|globalThis\.__|house\.b64|ObjectLoader|localStorage|\/api\//);assert.match(html,/roam-review-ui\.mjs/);assert.match(html,/1440/);assert.match(html,/900/);
});

test('review pose and foreground timing summaries validate actual numeric input without making hardware claims',()=>{
  const value={position:[1,1.45,3],target:[4,1,0]},pose=parseRoamReviewPose(JSON.stringify(value));assert.deepEqual(pose,value);pose.position[0]=99;assert.equal(value.position[0],1);
  for(const bad of[{position:[1,NaN,3],target:[0,0,0]},{position:[1,.1,3],target:[0,0,0]},{position:[1,31,3],target:[0,0,0]},{position:[1,2],target:[0,0,0]}])assert.throws(()=>parseRoamReviewPose(bad));
  const stats=summarizeRoamFrames(Array(120).fill(1000/60),[0,2,4]);assert.ok(Math.abs(stats.averageFPS-60)<1e-8);assert.equal(stats.samples,120);assert.equal(stats.renderCallCPUms.mean,2);assert.equal(stats.renderCallCPUms.samples,3);assert.match(stats.evidence,/not a GPU timer/);assert.equal(summarizeRoamFrames([],[]).averageFPS,null);
  const camera={position:[1,2,3],projection:[1,.00000001,3],zoom:1};assert.equal(sameRoamReviewCameraSnapshot(camera,structuredClone(camera)),true);assert.equal(sameRoamReviewCameraSnapshot(camera,{...camera,zoom:1.00000001}),false);assert.equal(sameRoamReviewCameraSnapshot(camera,null),null);
});
