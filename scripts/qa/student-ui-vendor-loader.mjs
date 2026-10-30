// Used only by the explicitly launched, loopback UI review lab.
import {realpath} from 'node:fs/promises';
import {relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const vendor=new URL('../../vendor/three/',import.meta.url);
export async function resolve(specifier,context,nextResolve){
  try{return await nextResolve(specifier,context);}catch(error){
    let suffix;
    if(specifier==='three')suffix='build/three.module.js';
    else if(specifier.startsWith('three/addons/'))suffix='examples/jsm/'+specifier.slice('three/addons/'.length);
    else throw error;
    let decoded;try{decoded=decodeURIComponent(suffix);}catch{throw error;}
    if(decoded.includes('\\')||decoded.includes('\0')||decoded.split('/').some(part=>part.startsWith('.')))throw error;
    const base=await realpath(fileURLToPath(vendor)),file=await realpath(fileURLToPath(new URL(decoded,vendor))),inside=relative(base,file);
    if(inside==='..'||inside.startsWith('..'+sep)||isAbsolute(inside))throw error;
    return{url:pathToFileURL(file).href,shortCircuit:true};
  }
}
