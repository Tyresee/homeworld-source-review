// Fictional, disposable UI review lab. Never uses platform credentials or network.
// Real home service/builders, explicit in-memory platform adapter, loopback only.
import {createServer,request as proxyRequest} from 'node:http';
import {readFile,mkdtemp,rm,access,realpath} from 'node:fs/promises';
import {resolve,relative,sep,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {register} from 'node:module';

register('./student-ui-vendor-loader.mjs',import.meta.url);
const {createStudentHomesService,API_PREFIX,ENTRY}=await import('../../server/student-homes/app.mjs');
const root=fileURLToPath(new URL('../../',import.meta.url));
const port=Number(process.env.UI_REVIEW_PORT||19542);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid loopback review port');
const origin='http://127.0.0.1:'+port;
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
const vendor=(await Promise.all(['node_modules/three','vendor/three'].map(async path=>await exists(resolve(root,path,'build/three.module.js'))?resolve(root,path):null))).find(Boolean);
if(!vendor)throw new Error('Three.js bundle is missing');
const actor='fictional-ui-teacher',tenant='fictional-ui-project';
const students=[{id:'11111111-1111-4111-8111-111111111111',displayName:'Sam'},{id:'22222222-2222-4222-8222-222222222222',displayName:'Robin'}];
const wallets=new Map(students.map(student=>[student.id,{tenantId:tenant,studentId:student.id,currency:'platform-points',balance:150000,reserved:0,totalEarned:150000,totalSpent:0,totalRefunded:0,revision:0}]));
const paymentAdapter=id=>({wallet:async()=>structuredClone(wallets.get(id)),reserve:async()=>{throw new Error('Purchases are disabled in the visual lab');},commit:async()=>{throw new Error('Purchases are disabled in the visual lab');}});
const platformClient={
  session:async()=>({authenticated:true,actor:{id:actor,role:'owner',displayName:'Demo teacher'},tenantId:tenant,currency:'platform-points'}),
  students:async()=>structuredClone(students),
  wallet:async(_cookie,_tenant,id)=>structuredClone(wallets.get(id)),
  starterGrant:async(_cookie,_tenant,id)=>({wallet:structuredClone(wallets.get(id)),grant:{programId:'student-starter-v1',amount:50000},baseline:{programId:'student-starter-baseline-v2',amount:150000,creditedAmount:150000},duplicate:true}),
  paymentAdapter:(_cookie,_tenant,id)=>paymentAdapter(id),
};
const dataDir=await mkdtemp(join(tmpdir(),'homeworld-ui-review-'));
const service=await createStudentHomesService({publicOrigin:origin,platformClient,dataDir});
for(const student of students)await service.store.initializeHome(tenant,student.id,actor);
await new Promise(done=>service.server.listen(0,'127.0.0.1',done));
const upstreamPort=service.server.address().port;
const prefix=API_PREFIX.slice(0,API_PREFIX.indexOf('/api/'))+'/';
const mime={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
const front=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin),path=decodeURIComponent(url.pathname);
    let commandBody;
    if(req.method==='POST'&&path.endsWith('/home/commands')){
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)throw new Error('Review command too large');chunks.push(chunk);}commandBody=Buffer.concat(chunks);
      const value=JSON.parse(commandBody);
      if(!['setRobotActivity','setObjectState','setWallFinish','setFloorFinish'].includes(value.command?.type)){
        res.writeHead(409,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:'visual_lab_only',message:'Purchases and construction are disabled in the fictional visual lab.'}}));return;
      }
    }
    if(path.startsWith(prefix+'vendor/')){
      const suffix=path.slice((prefix+'vendor/').length);
      if(suffix.includes('\\')||suffix.split('/').some(part=>part.startsWith('.')))throw new Error('Forbidden vendor path');
      const file=await realpath(resolve(vendor,suffix.startsWith('addons/')?'examples/jsm/'+suffix.slice(7):'build/'+suffix));
      const rel=relative(await realpath(vendor),file);if(rel.startsWith('..'+sep)||rel==='..')throw new Error('Forbidden vendor file');
      const bytes=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(bytes);return;
    }
    const upstream=proxyRequest({hostname:'127.0.0.1',port:upstreamPort,path:req.url,method:req.method,headers:req.headers},result=>{res.writeHead(result.statusCode,result.headers);result.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Local visual lab unavailable');});if(commandBody)upstream.end(commandBody);else req.pipe(upstream);
  }catch{res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not found');}
});
await new Promise((done,reject)=>{front.once('error',reject);front.listen(port,'127.0.0.1',done);});
console.log(JSON.stringify({entry:origin+ENTRY+'?theme=warm',mode:'fictional-ui-review',platform:'explicit local mock adapter',realService:true,purchases:false,productionData:false},null,2));
let closing=false;async function close(){if(closing)return;closing=true;await new Promise(done=>{front.close(done);front.closeAllConnections();});await service.close();await rm(dataDir,{recursive:true,force:true});}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void close());
