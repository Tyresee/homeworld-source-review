import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {request} from 'node:http';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createShareViewReviewServer,SHARE_REVIEW_ENTRY,SHARE_REVIEW_PREFIX} from '../scripts/qa/share-view-review.mjs';

// Raw http.request intentionally keeps dot segments that fetch normalizes.
const read=(port,path,{method='GET',host='127.0.0.1:'+port}={})=>new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port,path,method,headers:{host}},res=>{let body='';res.setEncoding('utf8');res.on('data',data=>body+=data);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();
});
test('fictional static preview serves its local closure and rejects writes, account APIs, traversal and symlink escape',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'share-view-safety-'));let server;
  try{
    for(const folder of ['public/assets/home-share','vendor/three/build','vendor/three/examples/jsm/loaders'])await mkdir(join(dir,folder),{recursive:true});
    await writeFile(join(dir,'public/home-share.html'),'<h1>Fictional snapshot</h1>');
    await writeFile(join(dir,'public/student-homes.html'),'<h1>Account page</h1>');
    await writeFile(join(dir,'public/assets/home-share/sample.json'),'{}');
    await writeFile(join(dir,'outside.txt'),'MUST NOT BE SERVED');
    await symlink(join(dir,'outside.txt'),join(dir,'public/escape.txt'));
    await symlink(join(dir,'outside.txt'),join(dir,'vendor/three/build/escape.js'));
    await writeFile(join(dir,'vendor/three/build/three.module.js'),'export const REVISION="186";');
    await writeFile(join(dir,'vendor/three/examples/jsm/loaders/GLTFLoader.js'),'export class GLTFLoader {}');
    await writeFile(join(dir,'vendor/three/MANIFEST.json'),JSON.stringify({package:'three',version:'0.186.1',files:[{path:'build/three.module.js'},{path:'examples/jsm/loaders/GLTFLoader.js'},{path:'build/escape.js'}]}));
    server=await createShareViewReviewServer({projectRoot:dir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
    assert.equal((await read(port,'/favicon.ico')).status,204);
    const root=await read(port,'/');assert.equal(root.status,302);assert.equal(root.headers.location,SHARE_REVIEW_ENTRY);
    const html=await read(port,SHARE_REVIEW_ENTRY);assert.equal(html.status,200);assert.match(html.body,/Fictional/);assert.match(html.headers['content-security-policy'],/connect-src 'self'/);
    const head=await read(port,SHARE_REVIEW_ENTRY,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body,'');assert.equal(head.headers['content-length'],html.headers['content-length']);
    assert.equal((await read(port,SHARE_REVIEW_PREFIX+'vendor/three.module.js')).status,200);assert.equal((await read(port,SHARE_REVIEW_PREFIX+'vendor/addons/loaders/GLTFLoader.js')).status,200);
    for(const path of [SHARE_REVIEW_PREFIX+'../outside.txt',SHARE_REVIEW_PREFIX+'%2e%2e/outside.txt',SHARE_REVIEW_PREFIX+'%252e%252e/outside.txt',SHARE_REVIEW_PREFIX+'%2e%2e%5coutside.txt',SHARE_REVIEW_PREFIX+'escape.txt',SHARE_REVIEW_PREFIX+'vendor/../../outside.txt',SHARE_REVIEW_PREFIX+'vendor/MANIFEST.json',SHARE_REVIEW_PREFIX+'vendor/escape.js',SHARE_REVIEW_PREFIX+'api/v1/shares/test',SHARE_REVIEW_PREFIX+'student-homes.html','/outside.txt'])assert.equal((await read(port,path)).status,404,path);
    for(const method of ['POST','PATCH','PUT','DELETE']){const response=await read(port,SHARE_REVIEW_ENTRY,{method});assert.equal(response.status,405);assert.equal(response.headers.allow,'GET, HEAD');}
    assert.equal((await read(port,SHARE_REVIEW_ENTRY,{host:'unrelated.invalid:'+port})).status,403);
  }finally{if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await rm(dir,{recursive:true,force:true});}
});
