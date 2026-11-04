// Standalone, read-only rendering of the bundled fictional share snapshot.
// Uses only Node built-ins and the committed Three.js runtime; no npm or API.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,realpath,stat} from 'node:fs/promises';
import {extname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const DEFAULT_ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const SHARE_REVIEW_PREFIX='/games/homeworld/';
export const SHARE_REVIEW_ENTRY=SHARE_REVIEW_PREFIX+'home-share.html?sample=1';
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.txt':'text/plain; charset=utf-8'};
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow, noarchive','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"};
const within=(base,file)=>{const rel=relative(base,file);return rel!==''&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);};
const safePath=raw=>{
  // Check the original request before URL parsing can normalize dot segments.
  if(!raw.startsWith('/')||raw.startsWith('//'))return null;
  let path;try{path=decodeURIComponent(raw.split('?')[0]);}catch{return null;}
  if(path.includes('\\')||path.includes('\0')||path.includes('%')||path.split('/').some(part=>part.startsWith('.')))return null;
  return path;
};

/** Exported for a disposable-directory safety test. Does not listen, import a
 * game service, allocate a save store, or write to the filesystem. */
export async function createShareViewReviewServer({projectRoot=DEFAULT_ROOT}={}){
  const root=await realpath(projectRoot),publicRoot=await realpath(resolve(root,'public')),vendorRoot=await realpath(resolve(root,'vendor/three'));
  if(!within(root,publicRoot)||!within(root,vendorRoot))throw new Error('Preview asset roots must stay within the project.');
  const manifest=JSON.parse(await readFile(resolve(vendorRoot,'MANIFEST.json'),'utf8'));
  if(manifest.package!=='three'||manifest.version!=='0.186.1'||!Array.isArray(manifest.files))throw new Error('The committed Three.js 0.186.1 runtime is required.');
  const vendorFiles=new Set(manifest.files.map(row=>row.path));
  const server=createServer(async(req,res)=>{
    const send=(status,text='',headers={})=>{res.writeHead(status,{...HEADERS,'content-type':'text/plain; charset=utf-8',...headers});res.end(req.method==='HEAD'?'':text);};
    try{
      if(!['GET','HEAD'].includes(req.method))return send(405,'GET and HEAD only',{allow:'GET, HEAD'});
      const host='127.0.0.1:'+server.address().port;
      if(req.headers.host!==host)return send(403,'Loopback preview only');
      const path=safePath(req.url??'');if(path===null)return send(404,'Not found');
      if(path==='/favicon.ico')return send(204);
      if(path==='/'||path===SHARE_REVIEW_PREFIX.slice(0,-1)||path===SHARE_REVIEW_PREFIX)return send(302,'',{location:SHARE_REVIEW_ENTRY});
      if(!path.startsWith(SHARE_REVIEW_PREFIX))return send(404,'Not found');
      const suffix=path.slice(SHARE_REVIEW_PREFIX.length);
      // No account routes or additional app entrypoints are exposed here.
      if(suffix==='api'||suffix.startsWith('api/')||suffix.endsWith('.html')&&suffix!=='home-share.html')return send(404,'Not found');
      let base=publicRoot,name=suffix;
      if(suffix.startsWith('vendor/')){
        base=vendorRoot;const module=suffix.slice('vendor/'.length);
        name=module.startsWith('addons/')?'examples/jsm/'+module.slice('addons/'.length):'build/'+module;
        if(!vendorFiles.has(name))return send(404,'Not found');
      }
      const target=resolve(base,name);if(!within(base,target))return send(404,'Not found');
      const file=await realpath(target);if(!within(base,file))return send(404,'Not found');
      const info=await stat(file),type=TYPES[extname(file)];if(!info.isFile()||!type)return send(404,'Not found');
      res.writeHead(200,{...HEADERS,'content-type':type,'content-length':info.size});
      if(req.method==='HEAD')return res.end();
      createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    }catch{if(res.headersSent)res.destroy();else send(404,'Not found');}
  });
  return server;
}

const invoked=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(invoked){
  const port=Number(process.env.SHARE_VIEW_REVIEW_PORT??19579);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('SHARE_VIEW_REVIEW_PORT must be an integer from 1024 to 65535.');
  const server=await createShareViewReviewServer();
  server.on('error',error=>{console.error('Unable to start the loopback share preview ('+(error.code??'error')+').');process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log('Fictional read-only share preview: http://127.0.0.1:'+port+SHARE_REVIEW_ENTRY));
  const close=()=>{server.close();server.closeAllConnections();};
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,close);
}
