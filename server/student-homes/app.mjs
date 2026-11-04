import {createServer} from 'node:http';
import {stat,realpath,readFile} from 'node:fs/promises';
import {resolve,relative,join,extname,dirname,basename,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PlatformClient,trustedOrigin} from './platform-client.mjs';
import {StudentHomeStore} from './store.mjs';
import {HomeServiceError,invalid,isStudentId,exactKeys} from './errors.mjs';
import {createStaticAssetResponder} from './static-assets.mjs';
import {StudentHomeShareStore,isHomeShareId} from './shares.mjs';
import {renderHomeShareDocument} from './share-document.mjs';

export const API_PREFIX='/games/homeworld/api/v1';
export const ENTRY='/games/homeworld/student-homes.html';
export const LOGIN_PATH=`/login/?next=${encodeURIComponent(ENTRY)}`;
const PROJECT_ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png',
  '.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.glb':'model/gltf-binary'};
function json(response,status,body,extra={}) {
  response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'same-origin',...extra});response.end(JSON.stringify(body));
}
const within=(base,path)=>{const rel=relative(base,path);return rel===''||rel!=='..'&&!rel.startsWith(`..${sep}`)&&!isAbsolute(rel);};
async function canonicalDestination(path){
  try{return await realpath(path);}catch(error){
    if(error.code!=='ENOENT')throw error;
    const parent=dirname(path);if(parent===path)throw error;
    return join(await canonicalDestination(parent),basename(path));
  }
}
export async function readReleaseVersion(projectRoot=PROJECT_ROOT,isDist=false){
  let release;try{release=JSON.parse(await readFile(join(projectRoot,'release.json'),'utf8'));}
  catch(error){if(error.code==='ENOENT'&&!isDist)return 'dev';throw new Error('Missing or invalid student home release identity.');}
  if(release.schemaVersion!==1||release.gameId!=='homeworld'||release.mode!=='student-homes-v1'||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(release.version))throw new Error('Invalid student home release identity.');
  return release.version;
}
async function readBody(request,maxBytes=4096) {
  if(!/^application\/json(?:\s*;.*)?$/i.test(request.headers['content-type']??''))throw new HomeServiceError(415,'json_required',"DisplayText4474 JSON DisplayText4475.");
  if(Number(request.headers['content-length'])>maxBytes){request.resume();throw new HomeServiceError(413,'request_too_large',"DisplayText4476.");}
  let size=0;const chunks=[];
  for await(const chunk of request){size+=chunk.length;if(size>maxBytes)throw new HomeServiceError(413,'request_too_large',"DisplayText4476.");chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw invalid("DisplayText4477 JSON.");}
}
function verifyWrite(request,publicOrigin,body,actorId,keys) {
  if(request.headers.origin!==publicOrigin||request.headers['sec-fetch-site']==='cross-site')throw new HomeServiceError(403,'origin_forbidden',"DisplayText4478.");
  if(!exactKeys(body,keys))throw invalid("DisplayText4479.");
  if(body.expectedUserId!==actorId)throw new HomeServiceError(409,'identity_changed',"DisplayText4268, DisplayText4480.");
}
async function serveStatic(request,response,path,{publicRoot,projectRoot,isDist,sendStaticAsset,shares,publicOrigin},search='') {
  if(!['GET','HEAD'].includes(request.method))return json(response,405,{error:{code:'method_not_allowed',message:'Method not allowed'}},{allow:'GET, HEAD'});
  const query=new URLSearchParams(search);
  // Keep the lobby and existing bookmarks stable. Only the formal document's
  // implicit presentation changes; explicit review themes and assets stay put.
  if(path==='/'||path==='/games/homeworld'||path==='/games/homeworld/'||path===ENTRY&&!query.has('theme')){
    if(!query.has('theme'))query.set('theme','warm');
    response.writeHead(302,{location:ENTRY+'?'+query.toString(),'cache-control':'no-store'});response.end();return;
  }
  const prefix='/games/homeworld/';if(!path.startsWith(prefix)||path.includes('\\')||path.includes('\0')||path.split('/').some(part=>part.startsWith('.')))throw new HomeServiceError(404,'not_found',"DisplayText4481.");
  const suffix=path.slice(prefix.length);let base=publicRoot,file;
  if(!isDist&&suffix.startsWith('vendor/')){
    base=join(projectRoot,'node_modules/three');const vendor=suffix.slice(7);
    file=resolve(base,vendor.startsWith('addons/')?'examples/jsm/'+vendor.slice(7):'build/'+vendor);
  }else file=resolve(base,suffix);
  try{
    if(relative(base,file).startsWith('..'))throw new Error('outside');
    const canonical=await realpath(file),canonicalBase=await realpath(base);
    if(relative(canonicalBase,canonical).startsWith('..'))throw new Error('outside');
    const info=await stat(canonical);if(!info.isFile())throw new Error('not file');
    if(suffix==='home-share.html'){
      let title,link='';const id=query.get('share');
      if(query.getAll('share').length===1&&!query.has('sample')&&isHomeShareId(id)){
        try{title=(await shares.getPublic(id)).share.snapshot.title;link=publicOrigin+'/games/homeworld/home-share.html?share='+id;}catch{/* An unavailable capability receives generic metadata; the page shows its public error state. */}
      }
      const html=renderHomeShareDocument(await readFile(canonical,'utf8'),{title,canonical:link});
      response.writeHead(200,{'content-type':'text/html; charset=utf-8','content-length':Buffer.byteLength(html),'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow, noarchive'});
      response.end(request.method==='HEAD'?'':html);return;
    }
    await sendStaticAsset(request,response,{canonical,canonicalBase,info,contentType:TYPES[extname(canonical)]??'application/octet-stream',responseHeaders:suffix==='home-share.html'?{'referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow, noarchive'}:{}});
  }catch(error){if(response.headersSent){response.destroy();return;}throw new HomeServiceError(404,'not_found',"DisplayText4481.");}
}

export async function createStudentHomesService({platformOrigin,publicOrigin,dataDir,platformClient,store,
  projectRoot=PROJECT_ROOT,publicRoot,isDist=false,homeCommerceSigningSecret=process.env.HOME_COMMERCE_SIGNING_SECRET}={}) {
  const browserOrigin=trustedOrigin(publicOrigin);
  const upstream=platformClient??new PlatformClient({origin:platformOrigin,publicOrigin:browserOrigin,homeCommerceSigningSecret});
  const releaseVersion=await readReleaseVersion(projectRoot,isDist);
  const staticOptions={projectRoot,publicRoot:publicRoot??join(projectRoot,isDist?'dist/games/homeworld':'public'),isDist,sendStaticAsset:createStaticAssetResponder({isDist})};
  const homes=store??new StudentHomeStore({dataDir});
  const canonicalData=await canonicalDestination(homes.dir);
  for(const servedRoot of [staticOptions.publicRoot,join(projectRoot,'public'),join(projectRoot,'dist')]){
    if(within(resolve(servedRoot),homes.dir)||within(await canonicalDestination(resolve(servedRoot)),canonicalData))throw new TypeError('Student home data must be outside all static release/public directories.');
  }
  await homes.initialize();
  const shares=new StudentHomeShareStore({dataDir:homes.dir});
  try{await shares.initialize();}catch(error){await homes.close();throw error;}
  const server=createServer(async(request,response)=>{
    try {
      let url,path;try{url=new URL(request.url,browserOrigin);path=decodeURIComponent(url.pathname);}catch{throw invalid("DisplayText4482.");}
      if(path==='/health'&&['GET','HEAD'].includes(request.method))return json(response,200,{service:'homeworld-student-homes',version:releaseVersion,mode:'platform-student-homes',auth:'platform-session-required'});
      if(!path.startsWith(`${API_PREFIX}/`))return await serveStatic(request,response,path,{...staticOptions,shares,publicOrigin:browserOrigin},url.search);
      if(url.search)throw invalid("DisplayText4483.");
      const sharedRoute=/^\/shares\/([^/]+)$/.exec(path.slice(API_PREFIX.length));
      if(sharedRoute){
        if(!['GET','HEAD'].includes(request.method))return json(response,405,{error:{code:'method_not_allowed',message:"DisplayText5038."}},{allow:'GET, HEAD','referrer-policy':'no-referrer'});
        return json(response,200,await shares.getPublic(sharedRoute[1]),{'referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow, noarchive'});
      }
      const teacherShare=/^\/students\/([^/]+)\/shares(?:\/([^/]+)\/revoke)?$/.exec(path.slice(API_PREFIX.length));
      if(teacherShare){
        const [,studentId,shareId]=teacherShare,method=shareId?'POST':request.method==='GET'?'GET':'POST';
        if(request.method!==method)return json(response,405,{error:{code:'method_not_allowed',message:'Method not allowed'}},{allow:shareId?'POST':'GET, POST'});
        if(method==='POST'&&(request.headers.origin!==browserOrigin||request.headers['sec-fetch-site']==='cross-site'))throw new HomeServiceError(403,'origin_forbidden',"DisplayText4478.");
        const cookie=request.headers.cookie??'',session=await upstream.session(cookie),students=await upstream.students(cookie);
        if(!isStudentId(studentId))throw invalid("DisplayText3785 ID DisplayText4486 UUID.");
        const student=students.find(student=>student.id===studentId);if(!student)throw new HomeServiceError(404,'student_not_found',"DisplayText4487.");
        const owner={tenantId:session.tenantId,studentId,actorUserId:session.actor.id},withURL=share=>({...share,url:`${browserOrigin}/games/homeworld/home-share.html?share=${share.id}`});
        if(method==='GET'){const result=await shares.list(owner);return json(response,200,{shares:result.shares.map(withURL)});}
        const body=await readBody(request);verifyWrite(request,browserOrigin,body,session.actor.id,shareId?['expectedUserId']:['expectedUserId','expectedRevision','commandId']);
        if(shareId)return json(response,200,await shares.revoke({...owner,id:shareId}));
        if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)throw invalid("DisplayText4485.");
        const snapshot=await homes.getSnapshot(session.tenantId,studentId,upstream.paymentAdapter(cookie,session.tenantId,studentId,session.actor.id));
        const result=await shares.create({...owner,home:snapshot.home,displayName:student.displayName,expectedRevision:body.expectedRevision,commandId:body.commandId});
        return json(response,result.duplicate?200:201,{...result,share:withURL(result.share)});
      }
      const route=path.slice(API_PREFIX.length),studentRoute=/^\/students\/([^/]+)\/(home(?:\/init|\/avatar|\/commands)?|wallet(?:\/starter-grant)?)$/.exec(route);
      const validRoute=route==='/session'||route==='/students'||studentRoute;
      if(!validRoute)throw new HomeServiceError(404,'not_found',"DisplayText4484.");
      const method=['home/init','home/commands','wallet/starter-grant'].includes(studentRoute?.[2])?'POST':studentRoute?.[2]==='home/avatar'?'PATCH':'GET';
      if(request.method!==method)return json(response,405,{error:{code:'method_not_allowed',message:'Method not allowed'}},{allow:method});
      if(method!=='GET'&&(request.headers.origin!==browserOrigin||request.headers['sec-fetch-site']==='cross-site'))throw new HomeServiceError(403,'origin_forbidden',"DisplayText4478.");
      const cookie=request.headers.cookie??'',session=await upstream.session(cookie);
      if(route==='/session')return json(response,200,session);
      let body;if(method!=='GET'){
        const command=studentRoute?.[2]==='home/commands';
        body=await readBody(request,command?65536:4096);
        verifyWrite(request,browserOrigin,body,session.actor.id,command?['expectedUserId','expectedRevision','commandId','command',...body&&Object.hasOwn(body,'expectedCatalogVersion')?['expectedCatalogVersion']:[]]:method==='POST'?['expectedUserId']:['expectedUserId','expectedRevision','colors']);
        if((method==='PATCH'||command)&&(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0))throw invalid("DisplayText4485.");
      }
      const students=await upstream.students(cookie);
      if(route==='/students')return json(response,200,{students});
      const [,studentId,action]=studentRoute;
      if(!isStudentId(studentId))throw invalid("DisplayText3785 ID DisplayText4486 UUID.");
      if(!students.some(student=>student.id===studentId))throw new HomeServiceError(404,'student_not_found',"DisplayText4487.");
      if(action==='wallet')return json(response,200,{wallet:await upstream.wallet(cookie,session.tenantId,studentId)});
      if(action==='wallet/starter-grant')return json(response,200,await upstream.starterGrant(cookie,session.tenantId,studentId,session.actor.id));
      const payments=upstream.paymentAdapter(cookie,session.tenantId,studentId,session.actor.id);
      if(action==='home')return json(response,200,await homes.getSnapshot(session.tenantId,studentId,payments));
      if(action==='home/commands')return json(response,200,await homes.executeCommand(session.tenantId,studentId,session.actor.id,
        {expectedRevision:body.expectedRevision,commandId:body.commandId,command:body.command,expectedCatalogVersion:body.expectedCatalogVersion??null},payments));
      if(action==='home/init'){
        const result=await homes.initializeHome(session.tenantId,studentId,session.actor.id);return json(response,result.created?201:200,result);
      }
      return json(response,200,await homes.updateColorsSnapshot(session.tenantId,studentId,session.actor.id,body.expectedRevision,body.colors));
    }catch(error){
      if(response.headersSent){response.destroy();return;}
      const known=error instanceof HomeServiceError,status=known?error.status:503;
      json(response,status,{error:{code:known?error.code:'service_unavailable',message:known?error.message:"DisplayText4214, DisplayText4016."},...(status===401?{authenticated:false,loginPath:LOGIN_PATH}:{})});
    }
  });
  let closing;
  async function close(){return closing??=(async()=>{if(server.listening)await new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections();});await shares.close();await homes.close();})();}
  return {server,store:homes,shares,close,platform:upstream};
}
