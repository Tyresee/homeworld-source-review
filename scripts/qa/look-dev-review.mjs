// Isolated, read-only look-development workstation. No platform/account API.
import {createServer} from 'node:http';
import {readFile,access,readdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const harnessRoot=fileURLToPath(new URL('../../',import.meta.url));
const sourceRoot=resolve(process.env.LOOK_DEV_SOURCE_ROOT??harnessRoot);
const port=Number(process.env.LOOK_DEV_PORT??19534);
if(!Number.isInteger(port)||port<1||port>65535)throw new TypeError('Invalid look-development port');
const qa=resolve(harnessRoot,'scripts/qa'),presetRoot=resolve(qa,'look-dev-presets');
const presetName=/^[a-z0-9][a-z0-9-]{0,63}\.json$/;
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
const vendorRoots=[resolve(sourceRoot,'node_modules/three'),resolve(sourceRoot,'vendor/three'),resolve(harnessRoot,'node_modules/three'),resolve(harnessRoot,'vendor/three')];
const vendorRoot=(await Promise.all(vendorRoots.map(async root=>await exists(resolve(root,'build/three.module.js'))?root:null))).find(Boolean);
if(!vendorRoot)throw new Error('Three.js was not found in node_modules/three or vendor/three. Run npm ci or install the offline vendor bundle.');
const allowedQA=new Set(['look-dev-ui.mjs','look-dev-runtime.mjs','look-dev-fixtures.mjs','look-dev-backdrop.mjs','look-dev-zip.mjs','look-dev-preset-safety.mjs']);
const server=createServer(async(req,res)=>{
  const send=(status,bytes,type='text/plain; charset=utf-8')=>{res.writeHead(status,{'content-type':type,'content-length':Buffer.byteLength(bytes),'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);};
  try{
    if(!['GET','HEAD'].includes(req.method)){send(405,'Read-only workstation');return;}
    const url=new URL(req.url,'http://127.0.0.1:'+port),path=decodeURIComponent(url.pathname);
    if(path.includes('\\')||path.includes('\0')||path.split('/').some(part=>part.startsWith('.'))){send(403,'Forbidden');return;}
    let file;
    if(path==='/'||path==='/review.html')file=resolve(qa,'look-dev-ui.html');
    else if(path==='/look-dev-ui.css')file=resolve(qa,'look-dev-ui.css');
    else if(path==='/health'){send(200,JSON.stringify({mode:'read-only-look-development',accounts:false,persistence:false,width:1440,height:900}),mime['.json']);return;}
    else if(path==='/presets'){
      const files=(await readdir(presetRoot)).filter(name=>presetName.test(name)).sort();
      send(200,JSON.stringify(files),mime['.json']);return;
    }else if(path.startsWith('/presets/')){
      const name=path.slice('/presets/'.length);
      if(!presetName.test(name)){send(400,'Preset file name is not allowed');return;}
      file=resolve(presetRoot,name);
    }else if(path.startsWith('/qa/')&&allowedQA.has(path.slice(4)))file=resolve(qa,path.slice(4));
    else{
      const base=path.startsWith('/js/')||path.startsWith('/assets/')||path.startsWith('/public/')?resolve(sourceRoot,'public'):path.startsWith('/vendor/three/')?vendorRoot:null;
      if(!base){send(404,'Not found');return;}
      const relative=path.startsWith('/vendor/three/')?path.slice('/vendor/three/'.length):path.startsWith('/public/')?path.slice('/public/'.length):path.slice(1);
      file=resolve(base,relative);if(!file.startsWith(base+sep)){send(403,'Forbidden');return;}
    }
    const bytes=await readFile(file);send(200,bytes,mime[extname(file)]??'application/octet-stream');
  }catch(error){send(error.code==='ENOENT'?404:400,error.code==='ENOENT'?'Review resource not found':'Invalid review request');}
});
server.listen(port,'127.0.0.1',()=>console.log('Look development: http://127.0.0.1:'+port+'/?preset=default.json'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
