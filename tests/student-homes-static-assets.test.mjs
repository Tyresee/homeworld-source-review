import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {mkdtemp,mkdir,writeFile,stat,realpath,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {brotliCompressSync,gzipSync,brotliDecompressSync,gunzipSync} from 'node:zlib';
import {acceptedStaticEncodings,createStaticAssetResponder} from '../server/student-homes/static-assets.mjs';
import {createStudentHomesService,API_PREFIX} from '../server/student-homes/app.mjs';

async function fixture(t,{isDist=true}={}){
  const dir=await realpath(await mkdtemp(join(tmpdir(),'homeworld-assets-test-'))),file=join(dir,'module.js');
  const bytes=Buffer.from('export const greeting="isolated asset fixture";\n'.repeat(90));
  await writeFile(file,bytes);await writeFile(file+'.br',brotliCompressSync(bytes));await writeFile(file+'.gz',gzipSync(bytes));
  const send=createStaticAssetResponder({isDist});
  const server=createServer(async(req,res)=>{try{await send(req,res,{canonical:file,canonicalBase:dir,info:await stat(file),contentType:'text/javascript; charset=utf-8'});}catch(error){res.writeHead(500);res.end(error.message);}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();});await rm(dir,{recursive:true,force:true});});
  const call=(headers={},method='GET')=>new Promise((resolve,reject)=>{
    const req=request(`http://127.0.0.1:${server.address().port}`,{method,headers},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)}));});req.on('error',reject);req.end();
  });
  return {dir,file,bytes,call};
}

test('encoding negotiation respects quality and excludes explicitly disabled codecs',()=>{
  assert.deepEqual(acceptedStaticEncodings(),[]);
  assert.deepEqual(acceptedStaticEncodings('gzip, deflate, br'),['br','gzip']);
  assert.deepEqual(acceptedStaticEncodings('gzip;q=1, br;q=0.4'),['gzip','br']);
  assert.deepEqual(acceptedStaticEncodings('br;q=0, *;q=1'),['gzip']);
  assert.deepEqual(acceptedStaticEncodings('br;q=0, gzip;q=0'),[]);
});

test('published JS is compressed without changing decoded bytes, MIME type or HEAD length',async t=>{
  const f=await fixture(t),plain=await f.call(),br=await f.call({'accept-encoding':'gzip, br'}),gzip=await f.call({'accept-encoding':'gzip'});
  assert.deepEqual(plain.bytes,f.bytes);assert.equal(plain.headers['content-encoding'],undefined);
  assert.equal(br.headers['content-encoding'],'br');assert.deepEqual(brotliDecompressSync(br.bytes),f.bytes);
  assert.equal(gzip.headers['content-encoding'],'gzip');assert.deepEqual(gunzipSync(gzip.bytes),f.bytes);
  assert.ok(br.bytes.length<f.bytes.length/4);assert.equal(br.headers['content-type'],'text/javascript; charset=utf-8');
  assert.equal(br.headers.vary,'Accept-Encoding');assert.equal(br.headers['cache-control'],'public, max-age=0, must-revalidate');
  const head=await f.call({'accept-encoding':'br'},'HEAD');assert.equal(head.bytes.length,0);assert.equal(Number(head.headers['content-length']),br.bytes.length);assert.equal(head.headers.etag,br.headers.etag);
});

test('revalidation returns no asset body; variants and changed contents cannot reuse a stale validator',async t=>{
  const f=await fixture(t),plain=await f.call(),br=await f.call({'accept-encoding':'br'});
  const unchanged=await f.call({'if-none-match':`"unrelated", W/${br.headers.etag}`,'accept-encoding':'br'});
  assert.equal(unchanged.status,304);assert.equal(unchanged.bytes.length,0);assert.equal(unchanged.headers.etag,br.headers.etag);
  assert.equal((await f.call({'if-none-match':plain.headers.etag,'accept-encoding':'br'})).status,200);
  await writeFile(f.file,'export const fresh=true;');const changed=await f.call({'if-none-match':plain.headers.etag});
  assert.equal(changed.status,200);assert.notEqual(changed.headers.etag,plain.headers.etag);assert.equal(changed.bytes.toString(),'export const fresh=true;');
});

test('source preview never uses release sidecars or HTTP cache and missing sidecars fall back safely',async t=>{
  const dev=await fixture(t,{isDist:false}),first=await dev.call({'accept-encoding':'br'});
  assert.equal(first.headers['cache-control'],'no-store');assert.equal(first.headers['content-encoding'],undefined);
  assert.deepEqual(first.bytes,dev.bytes);assert.equal((await dev.call({'if-none-match':first.headers.etag})).status,200);
  const f=await fixture(t);await rm(f.file+'.br');const fallback=await f.call({'accept-encoding':'br, gzip'});assert.equal(fallback.headers['content-encoding'],'gzip');
  await rm(f.file+'.gz');const plain=await f.call({'accept-encoding':'br, gzip'});assert.deepEqual(plain.bytes,f.bytes);
});

test('precompressed symlinks outside the public root are never served',async t=>{
  const f=await fixture(t),outside=join(f.dir,'..',`outside-${f.dir.split('/').at(-1)}.br`);
  await writeFile(outside,'private fixture content');t.after(()=>rm(outside,{force:true}));
  await rm(f.file+'.br');await symlink(outside,f.file+'.br');
  const result=await f.call({'accept-encoding':'br'});assert.equal(result.status,200);assert.equal(result.headers['content-encoding'],undefined);assert.deepEqual(result.bytes,f.bytes);
});

test('formal HTTP service enables asset revalidation while account responses remain no-store',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'homeworld-static-service-')),projectRoot=join(dir,'release'),web=join(projectRoot,'dist/games/homeworld');
  await mkdir(web,{recursive:true});await writeFile(join(projectRoot,'release.json'),JSON.stringify({schemaVersion:1,gameId:'homeworld',mode:'student-homes-v1',version:'a'.repeat(40)}));
  const bytes=Buffer.from('const publicCode=true;\n'.repeat(90));await writeFile(join(web,'example.js'),bytes);await writeFile(join(web,'example.js.br'),brotliCompressSync(bytes));
  const service=await createStudentHomesService({projectRoot,isDist:true,publicOrigin:'http://127.0.0.1:18803',dataDir:join(dir,'isolated-data'),platformClient:{session:async()=>({authenticated:true,actor:{id:'isolated-teacher'}})}});
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await service.close();await rm(dir,{recursive:true,force:true});});
  const origin=`http://127.0.0.1:${service.server.address().port}`,first=await fetch(origin+'/games/homeworld/example.js',{headers:{'accept-encoding':'br'}});
  assert.equal(first.headers.get('content-encoding'),'br');assert.deepEqual(Buffer.from(await first.arrayBuffer()),bytes);
  const unchanged=await fetch(origin+'/games/homeworld/example.js',{headers:{'accept-encoding':'br','if-none-match':first.headers.get('etag')}});
  assert.equal(unchanged.status,304);assert.equal((await unchanged.arrayBuffer()).byteLength,0);
  const account=await fetch(origin+API_PREFIX+'/session',{headers:{'if-none-match':'*'}});
  assert.equal(account.status,200);assert.equal(account.headers.get('cache-control'),'no-store');assert.equal(account.headers.get('etag'),null);
});
