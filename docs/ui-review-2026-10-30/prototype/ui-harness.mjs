// Local UI harness: fake platform + real service + front proxy (vendor three). Fictional data only.
import {createServer,request as httpRequest} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,extname} from 'node:path';
const R='/home/claude/src/homeworld-source-review';
const {createStudentHomesService}=await import(R+'/server/student-homes/app.mjs');
const FRONT=18850,PUBLIC=`http://127.0.0.1:${FRONT}`,ACTOR='fictional-teacher',TENANT='fictional-project';
const students=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const names=['小明','小红','乐乐'];
const wallets=new Map(students.map(id=>[id,{tenantId:TENANT,studentId:id,currency:'platform-points',balance:150000,reserved:0,totalEarned:150000,totalSpent:0,totalRefunded:0,revision:0}]));
const listen=(s,port=0)=>new Promise(d=>s.listen(port,'127.0.0.1',()=>d(`http://127.0.0.1:${s.address().port}`)));
const platform=createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):null;
  res.setHeader('content-type','application/json');const answer=(s,d)=>{res.statusCode=s;res.end(JSON.stringify(d));};
  if(req.url==='/api/auth/me')return answer(200,{authenticated:true,user:{id:ACTOR,role:'owner',displayName:'王老师'}});
  if(req.url==='/api/game-points/v1/context')return answer(200,{schemaVersion:'game-points-context.v1',tenantId:TENANT,currency:'platform-points',actor:{id:ACTOR,role:'owner'}});
  if(req.url==='/api/student-profiles/v1')return answer(200,{schemaVersion:'student-profile-store.v1',students:students.map((id,i)=>({id,status:'active',displayName:names[i]}))});
  const w=/^\/api\/game-points\/v1\/students\/([^/]+)\/wallet$/.exec(req.url);if(w)return answer(200,{wallet:wallets.get(w[1])});
  const g=/^\/api\/game-points\/v1\/students\/([^/]+)\/(starter-grant|wallet\/starter-grant)/.exec(req.url);if(g)return answer(200,{wallet:wallets.get(g[1]),granted:false});
  return answer(404,{error:'not_found',path:req.url,body});
});
const upstream=await listen(platform);
const dir=await mkdtemp(join(tmpdir(),'hw-ui-'));
const service=await createStudentHomesService({platformOrigin:upstream,publicOrigin:PUBLIC,dataDir:dir,homeCommerceSigningSecret:'fictional-ui-secret'});
const svc=await listen(service.server);const svcURL=new URL(svc);
const mime={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
const front=createServer(async(req,res)=>{
  const url=new URL(req.url,PUBLIC);let p=url.pathname;
  const vend=p.match(/^\/games\/homeworld\/vendor\/(.*)$/);
  if(vend){let rel=vend[1];let file=rel.startsWith('addons/')?join(R,'vendor/three/examples/jsm',rel.slice(7)):join(R,'vendor/three/build',rel);
    try{const b=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]??'application/octet-stream'});return res.end(b);}catch{res.writeHead(404);return res.end('nf '+file);}}
  const prox=httpRequest({host:svcURL.hostname,port:svcURL.port,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
  req.pipe(prox);prox.on('error',e=>{res.writeHead(502);res.end(String(e));});
});
await listen(front,FRONT);console.log('UI harness',PUBLIC+'/games/homeworld/student-homes.html');
