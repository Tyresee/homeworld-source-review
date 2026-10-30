// Explicit loopback review tool. No account, wallet, save or write route.
import {createServer} from 'node:http';
import {readFile,realpath,access} from 'node:fs/promises';
import {resolve,relative,sep,isAbsolute,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const MIME={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const QA=new Set(['roam-review-ui.mjs','roam-review-cases.mjs','roam-review-photometry.mjs','look-dev-runtime.mjs','look-dev-fixtures.mjs','look-dev-backdrop.mjs','look-dev-zip.mjs','look-dev-preset-safety.mjs']);
const CSS=new Set(['home-roam.css','student-home-warm.css']);
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
const inside=(base,file)=>{const rel=relative(base,file);return rel!== '..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);};

export async function createRoamReviewServer({sourceRoot=root,harnessRoot=root,port=19550}={}) {
  if(!Number.isInteger(port)||port<0||port>65535)throw new TypeError('Invalid review port');
  const qa=await realpath(resolve(harnessRoot,'scripts/qa')),publicRoot=await realpath(resolve(sourceRoot,'public'));
  const candidates=[resolve(sourceRoot,'node_modules/three'),resolve(sourceRoot,'vendor/three'),resolve(harnessRoot,'node_modules/three'),resolve(harnessRoot,'vendor/three')];
  let vendor;
  for(const candidate of candidates)if(await exists(resolve(candidate,'build/three.module.js'))){vendor=await realpath(candidate);break;}
  if(!vendor)throw new Error('Three.js requires either the installed package or the licensed vendor/three bundle.');
  const server=createServer(async(req,res)=>{
    const send=(status,bytes,type='text/plain; charset=utf-8')=>{res.writeHead(status,{'content-type':type,'content-length':Buffer.byteLength(bytes),'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);};
    try {
      if(!['GET','HEAD'].includes(req.method)){send(405,'Read-only review tool');return;}
      const url=new URL(req.url,'http://127.0.0.1'),path=decodeURIComponent(url.pathname);
      if(path.includes('\\')||path.includes('\0')||path.split('/').some(part=>part.startsWith('.'))){send(403,'Forbidden');return;}
      if(path==='/health'){send(200,JSON.stringify({mode:'read-only-roam-review',accounts:false,wallet:false,persistence:false,writes:false,width:1440,height:900,vendor:vendor.includes('node_modules')?'installed':'bundled'}),MIME['.json']);return;}
      let base,file;
      if(path==='/'||path==='/review.html'){base=qa;file=resolve(base,'roam-review.html');}
      else if(path.startsWith('/qa/')&&QA.has(path.slice(4))){base=qa;file=resolve(base,path.slice(4));}
      else if(path==='/presets/warm-walls.json'){base=qa;file=resolve(base,'look-dev-presets/warm-walls.json');}
      else if(CSS.has(path.slice(1))){base=publicRoot;file=resolve(base,path.slice(1));}
      else if(path.startsWith('/vendor/three/')&&path.endsWith('.js')){base=vendor;file=resolve(base,path.slice('/vendor/three/'.length));}
      else {
        const resource=path.startsWith('/public/')?path.slice('/public'.length):path;
        if(resource.startsWith('/js/')&&/\.m?js$/.test(resource)||resource.startsWith('/assets/')&&/\.(glb|png|webp|svg|jpe?g)$/.test(resource)){base=publicRoot;file=resolve(base,resource.slice(1));}
        else{send(404,'Review resource not found');return;}
      }
      const canonical=await realpath(file);if(!inside(base,canonical)){send(403,'Forbidden');return;}
      send(200,await readFile(canonical),MIME[extname(canonical)]??'application/octet-stream');
    }catch(error){send(error.code==='ENOENT'?404:400,error.code==='ENOENT'?'Review resource not found':'Invalid review request');}
  });
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
  return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const server=await createRoamReviewServer({sourceRoot:resolve(process.env.ROAM_REVIEW_SOURCE_ROOT??root),port:Number(process.env.ROAM_REVIEW_PORT??19550)});
  console.log('Roam review: http://127.0.0.1:'+server.address().port+'/');
  for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
