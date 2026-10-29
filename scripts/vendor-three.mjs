// Maintainer utility. Reviewers can run the offline viewer without this step.
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {resolve,dirname,relative,sep,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const vendorRoot=resolve(root,'vendor/three'),version='0.186.1';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const imports=code=>[...new Set([
  ...[...code.matchAll(/^[ \t]*(?:import|export)\s+(?:[\w$*{},\s]+?\s+from\s+)?['"]([^'"]+)['"]/gm)].map(match=>match[1]),
  ...[...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match=>match[1]),
])];
const inside=(base,file)=>file.startsWith(base+sep);
function threePath(spec,importer){
  const path=spec==='three'?'build/three.module.js'
    :spec.startsWith('three/addons/')?'examples/jsm/'+spec.slice('three/addons/'.length)
    :spec.startsWith('three/examples/jsm/')?spec.slice('three/'.length)
    :spec.startsWith('.')&&importer?posix.normalize(posix.join(posix.dirname(importer),spec)):null;
  if(!path||path.startsWith('../')||!path.endsWith('.js')||!['build/','examples/jsm/'].some(prefix=>path.startsWith(prefix)))
    throw new Error('Unsupported vendored import: '+spec);
  return path;
}
async function listFiles(base){
  const files=[];
  async function walk(dir){
    for(const entry of await readdir(dir,{withFileTypes:true})){
      if(entry.isSymbolicLink())throw new Error('Symlinks are not allowed in review source or vendor');
      const file=resolve(dir,entry.name);
      if(entry.isDirectory())await walk(file);else if(entry.isFile())files.push(file);
    }
  }
  await walk(base);return files.sort();
}
async function entrypoints(){
  const paths=new Set(['build/three.module.js']);
  for(const dir of ['public/js','scripts/qa'])for(const file of await listFiles(resolve(root,dir))){
    if(!/\.(?:m?js)$/.test(file))continue;
    for(const spec of imports(await readFile(file,'utf8')))if(spec==='three'||spec.startsWith('three/'))paths.add(threePath(spec));
  }
  return [...paths].sort();
}
async function check(){
  const manifest=JSON.parse(await readFile(resolve(vendorRoot,'MANIFEST.json'),'utf8'));
  if(manifest.package!=='three'||manifest.version!==version||manifest.license!=='MIT'||!Array.isArray(manifest.files))throw new Error('Invalid vendor identity');
  const files=new Map();
  for(const entry of manifest.files){
    if(typeof entry.path!=='string'||entry.path.includes('\\')||posix.normalize(entry.path)!==entry.path)throw new Error('Invalid vendor path');
    const file=resolve(vendorRoot,entry.path);
    if(!inside(vendorRoot,file)||(await lstat(file)).isSymbolicLink())throw new Error('Invalid vendor boundary');
    const bytes=await readFile(file);
    if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw new Error('Vendor hash mismatch: '+entry.path);
    files.set(entry.path,bytes);
  }
  if(!files.has('LICENSE')||!files.get('LICENSE').toString().includes('Copyright')||!files.get('LICENSE').toString().includes('three.js authors'))throw new Error('Original Three.js LICENSE is required');
  for(const[path,bytes]of files)if(path.endsWith('.js'))for(const spec of imports(bytes.toString())){
    const dependency=threePath(spec,path);if(!files.has(dependency))throw new Error('Missing transitive vendor import: '+path+' -> '+dependency);
  }
  for(const entry of await entrypoints())if(!files.has(entry))throw new Error('Missing application vendor entry: '+entry);
  const found=(await listFiles(vendorRoot)).map(file=>relative(vendorRoot,file).split(sep).join('/'));
  const extra=found.filter(path=>path!=='MANIFEST.json'&&!files.has(path));
  if(extra.length)throw new Error('Unlisted vendor files: '+extra.join(', '));
  console.log('Verified Three.js '+version+': '+files.size+' licensed files, complete imports, matching SHA-256.');
  return manifest;
}

const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--check')await check();
else {
  if(args.length&&!(args.length===2&&args[0]==='--source'))throw new Error('Usage: node scripts/vendor-three.mjs [--source path/to/three | --check]');
  const source=resolve(root,args[1]??'node_modules/three');
  const pkg=JSON.parse(await readFile(resolve(source,'package.json'),'utf8'));
  if(pkg.name!=='three'||pkg.version!==version||pkg.license!=='MIT')throw new Error('Source must be the genuine installed Three.js '+version+' MIT package');
  const entries=await entrypoints(),pending=[...entries],files=new Map();
  while(pending.length){
    const path=pending.shift();if(files.has(path))continue;
    const file=resolve(source,path);
    if(!inside(source,file)||(await lstat(file)).isSymbolicLink())throw new Error('Invalid source boundary: '+path);
    const bytes=await readFile(file);files.set(path,bytes);
    for(const spec of imports(bytes.toString()))pending.push(threePath(spec,path));
  }
  files.set('LICENSE',await readFile(resolve(source,'LICENSE')));
  const manifest={schemaVersion:1,package:'three',version,license:'MIT',upstream:'https://www.npmjs.com/package/three/v/'+version,
    scope:'Unmodified runtime ESM closure used by the local review pages. Optional decoder, WebGPU and unused examples are not bundled.',
    entrypoints:entries,files:[...files].sort(([a],[b])=>a.localeCompare(b)).map(([path,bytes])=>({path,bytes:bytes.length,sha256:digest(bytes)}))};
  for(const[path,bytes]of files){const file=resolve(vendorRoot,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}
  await writeFile(resolve(vendorRoot,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
  await check();
}
