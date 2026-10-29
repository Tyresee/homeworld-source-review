import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,realpath,stat} from 'node:fs/promises';
import {relative,isAbsolute,sep} from 'node:path';

/** Negotiate only prebuilt encodings. An explicit q=0 always wins over '*'. */
export function acceptedStaticEncodings(header='') {
  const values=new Map();
  for(const entry of String(header).toLowerCase().split(',')){
    const [name,...parameters]=entry.trim().split(';');if(!name)continue;
    const quality=parameters.map(value=>/^\s*q\s*=\s*([\d.]+)\s*$/.exec(value)).find(Boolean);
    const q=quality?Number(quality[1]):1;values.set(name,Number.isFinite(q)&&q>=0&&q<=1?q:0);
  }
  const q=name=>values.get(name)??values.get('*')??0;
  return ['br','gzip'].filter(name=>q(name)>0).sort((a,b)=>q(b)-q(a));
}
const within=(base,path)=>{const rel=relative(base,path);return rel===''||rel!=='..'&&!rel.startsWith(`..${sep}`)&&!isAbsolute(rel);};
const matches=(header,etag)=>String(header??'').split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag.replace(/^W\//,''));

/** Public code and art may be reused, but stable URLs must revalidate on each
 * visit so a new release never leaves stale JS/CSS behind. Account APIs do not
 * use this responder and keep their existing private/no-store behavior. */
export function createStaticAssetResponder({isDist=false}={}) {
  const digests=new Map();
  return async function sendStaticAsset(request,response,{canonical,canonicalBase,info,contentType}){
    let selected=canonical,selectedInfo=info,encoding=null;
    if(isDist)for(const candidate of acceptedStaticEncodings(request.headers['accept-encoding'])){
      try{
        const path=await realpath(`${canonical}.${candidate==='gzip'?'gz':'br'}`);
        if(!within(canonicalBase,path))continue;
        const stats=await stat(path);if(!stats.isFile())continue;
        selected=path;selectedInfo=stats;encoding=candidate;break;
      }catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')throw error;}
    }
    const signature=`${selectedInfo.size}:${selectedInfo.mtimeMs}:${selectedInfo.ctimeMs}`;
    let cached=digests.get(selected);
    if(!cached||cached.signature!==signature){
      const hash=createHash('sha256').update(await readFile(selected)).digest('hex');
      cached={signature,etag:`"${hash}"`};digests.set(selected,cached);
    }
    const headers={'content-type':contentType,'cache-control':isDist?'public, max-age=0, must-revalidate':'no-store',
      etag:cached.etag,vary:'Accept-Encoding','x-content-type-options':'nosniff','referrer-policy':'same-origin',
      ...(encoding?{'content-encoding':encoding}:{})};
    if(isDist&&matches(request.headers['if-none-match'],cached.etag)){
      response.writeHead(304,headers);response.end();return;
    }
    response.writeHead(200,{...headers,'content-length':selectedInfo.size});
    if(request.method==='HEAD'){response.end();return;}
    createReadStream(selected).on('error',()=>response.destroy()).pipe(response);
  };
}
