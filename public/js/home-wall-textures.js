import * as THREE from 'three';
import {getWallStyle,getWallColor} from './home-wall-finishes.js';

export const WALL_TEXTURE_SIZE=1024;
export const WALL_TILE_METRES=1.2;
export const WALL_HEIGHT_METRES=2.85;
export const WALL_PATTERNS=Object.freeze(['plain','stripe-fine','dots']);
const makeCanvas=()=>{if(typeof document==='undefined')throw new Error('A canvas factory is required outside the browser');return document.createElement('canvas');};
const caches=new WeakMap(),leases=new WeakMap();
function cacheFor(factory){if(!caches.has(factory))caches.set(factory,{canvases:new Map(),sources:new Map(),previews:new Map()});return caches.get(factory);}
function random(seed=11){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
const gray=t=>`rgb(${Math.round(255*t)},${Math.round(255*t*.992)},${Math.round(255*t*.982)})`;
/** Neutral, seeded source. Dimensions are metres, including the dot diameter. */
export function createWallPatternCanvas(pattern='plain',{createCanvas=makeCanvas}={}) {
  if(!WALL_PATTERNS.includes(pattern))throw new RangeError('Unknown wall pattern: '+pattern);
  const canvas=createCanvas();canvas.width=canvas.height=WALL_TEXTURE_SIZE;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Wall texture canvas unavailable');
  const size=WALL_TEXTURE_SIZE,px=size/WALL_TILE_METRES,py=size/WALL_HEIGHT_METRES,rand=random();
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);
  if(pattern==='plain')for(let i=0;i<260;i++) {
    const x=rand()*size,y=rand()*size,r=20+rand()*60;
    ctx.fillStyle=`rgba(90,70,50,${.008*rand()})`;ctx.beginPath();ctx.ellipse(x,y,r,r*.6,rand()*3,0,Math.PI*2);ctx.fill();
  }
  else if(pattern==='stripe-fine') {
    const period=.10*px;for(let x=0;x<size;x+=period){ctx.fillStyle=gray(.95);ctx.fillRect(x,0,period/2,size);}
  } else {
    // A circle in world space needs different pixel radii in this 1.2 x 2.85 m tile.
    const spacing=.12;for(let row=0,y=0;y<size+20;row++,y+=spacing*py)for(let x=(row%2)*spacing*px/2;x<size+20;x+=spacing*px) {
      ctx.fillStyle=gray(.86);ctx.beginPath();ctx.ellipse(x,y,.014*px,.014*py,0,0,Math.PI*2);ctx.fill();
    }
  }
  ctx.fillStyle='rgba(60,45,30,.10)';ctx.fillRect(0,size-6,size,6);
  return canvas;
}
export function getWallPatternCanvas(pattern,options={}) {
  const factory=options.createCanvas??makeCanvas,cache=cacheFor(factory);
  if(!cache.canvases.has(pattern))cache.canvases.set(pattern,createWallPatternCanvas(pattern,{createCanvas:factory}));
  return cache.canvases.get(pattern);
}
/** Uses the actual neutral source, multiplied by the selected wall colour. */
export function getWallFinishPreview(value={},options={}) {
  const pattern=value.pattern??getWallStyle(value.styleId)?.pattern??'plain',color=value.color??getWallColor(value.colorId)?.color??'#f4efe6';
  const factory=options.createCanvas??makeCanvas,cache=cacheFor(factory),key=pattern+':'+color;
  if(cache.previews.has(key))return cache.previews.get(key);
  const source=getWallPatternCanvas(pattern,{createCanvas:factory}),canvas=factory();canvas.width=160;canvas.height=160;
  const ctx=canvas.getContext('2d'),sampleHeight=WALL_TEXTURE_SIZE*WALL_TILE_METRES/WALL_HEIGHT_METRES;
  // Square 1.2 m world-space crop, not the anisotropic square source bitmap.
  ctx.drawImage(source,0,(WALL_TEXTURE_SIZE-sampleHeight)/2,WALL_TEXTURE_SIZE,sampleHeight,0,0,160,160);ctx.globalCompositeOperation='multiply';ctx.fillStyle=color;ctx.fillRect(0,0,160,160);ctx.globalCompositeOperation='source-over';
  const url=canvas.toDataURL('image/png');cache.previews.set(key,url);if(cache.previews.size>64)cache.previews.delete(cache.previews.keys().next().value);return url;
}
function acquire(pattern,factory) {
  const cache=cacheFor(factory);let source=cache.sources.get(pattern);
  if(!source){const texture=new THREE.CanvasTexture(getWallPatternCanvas(pattern,{createCanvas:factory}));texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;texture.name='wall-source:'+pattern;source={texture,refs:0};cache.sources.set(pattern,source);}
  source.refs++;return source;
}
function releaseSource(pattern,factory){const cache=cacheFor(factory),source=cache.sources.get(pattern);if(source&&--source.refs===0){source.texture.dispose();cache.sources.delete(pattern);}}
export function retainHomeWallTexture(texture){const lease=leases.get(texture);if(!lease)return false;lease.refs++;return true;}
export function releaseHomeWallTexture(texture){const lease=leases.get(texture);if(!lease)return false;if(--lease.refs===0){texture.dispose();releaseSource(lease.pattern,lease.factory);leases.delete(texture);}return true;}
export function getWallTextureCacheStats({createCanvas=makeCanvas}={}){const cache=cacheFor(createCanvas);return{canvases:cache.canvases.size,sources:cache.sources.size,clones:[...cache.sources.values()].reduce((sum,row)=>sum+row.refs,0)};}
/** A metre UV is never inferred from constructor parameters: clipped/rounded
 * buffers and planes all use their real vertices and object scale. */
export function getWallTextureMetrics(mesh) {
  const geometry=mesh?.geometry;if(!geometry?.attributes.position)return null;
  geometry.computeBoundingBox();const box=geometry.boundingBox;
  const axis=mesh.userData.wallTextureAxis??(box.max.x-box.min.x>=box.max.z-box.min.z?'x':'z');
  const width=box.max[axis]-box.min[axis],height=box.max.y-box.min.y;if(width<=1e-7||height<=1e-7)return null;
  const scale=mesh.scale;return {axis,minY:mesh.userData.wallTextureMinY??box.min.y,width:width*Math.abs(scale[axis]),height:height*Math.abs(scale.y),repeat:[1/WALL_TILE_METRES,1/WALL_HEIGHT_METRES]};
}
/** One source image per pattern; independent clones own per-wall transforms. */
export function createHomeWallTextureManager({createCanvas=makeCanvas}={}) {
  const records=new Map();let disposed=false;
  function release(mesh){const row=records.get(mesh);if(!row)return;if(mesh.geometry===row.geometry){if(row.uv)mesh.geometry.setAttribute('uv',row.uv);else mesh.geometry.deleteAttribute('uv');}if(mesh.material===row.material){mesh.material.map=row.originalMap;mesh.material.needsUpdate=true;}releaseHomeWallTexture(row.texture);records.delete(mesh);delete mesh.userData.wallTexture;delete mesh.userData.wallPattern;}
  function apply(mesh,finish) {
    if(disposed)throw new Error('Wall texture manager is disposed');if(!finish){release(mesh);return false;}
    const metrics=getWallTextureMetrics(mesh);if(!metrics||!WALL_PATTERNS.includes(finish.pattern)||!mesh.material?.isMeshStandardMaterial)return false;
    let row=records.get(mesh);if(row&&(row.pattern!==finish.pattern||row.geometry!==mesh.geometry||row.material!==mesh.material)){release(mesh);row=null;}
    if(!row){const source=acquire(finish.pattern,createCanvas),texture=source.texture.clone();texture.needsUpdate=true;leases.set(texture,{refs:1,pattern:finish.pattern,factory:createCanvas});row={pattern:finish.pattern,texture,geometry:mesh.geometry,material:mesh.material,uv:mesh.geometry.attributes.uv?.clone()??null,originalMap:mesh.material.map};records.set(mesh,row);}
    const position=mesh.geometry.attributes.position,key=[metrics.axis,metrics.minY,mesh.scale.x,mesh.scale.y,mesh.scale.z].join(':');
    if(row.uvKey!==key){const uv=new THREE.Float32BufferAttribute(new Float32Array(position.count*2),2);for(let i=0;i<position.count;i++)uv.setXY(i,(metrics.axis==='x'?position.getX(i):position.getZ(i))*Math.abs(mesh.scale[metrics.axis]),(position.getY(i)-metrics.minY)*Math.abs(mesh.scale.y));mesh.geometry.setAttribute('uv',uv);row.uvKey=key;}
    const map=row.texture;map.repeat.set(...metrics.repeat);map.offset.set(0,0);map.updateMatrix();map.name='wall:'+finish.pattern;map.userData={wallPattern:finish.pattern,styleId:finish.styleId,colorId:finish.colorId,worldTileMetres:WALL_TILE_METRES,worldHeightMetres:WALL_HEIGHT_METRES,dotDiameterMetres:finish.pattern==='dots'?.028:null};
    if(mesh.material.map!==map){mesh.material.map=map;mesh.material.needsUpdate=true;}mesh.material.color.set(finish.color);mesh.material.roughness=.72;mesh.material.metalness=0;
    mesh.userData.wallPattern=finish.pattern;mesh.userData.wallTexture=map.userData;return true;
  }
  function dispose(){if(disposed)return;for(const mesh of[...records.keys()])release(mesh);disposed=true;}
  return{apply,release,dispose,getStats:()=>({meshes:records.size,...getWallTextureCacheStats({createCanvas})})};
}
