import * as THREE from 'three';
import {getFloorFinish} from './home-floor-finishes.js';

export const FLOOR_TEXTURE_SIZE=1024;
export const FLOOR_PATTERN_SPECS=Object.freeze({
  wide:Object.freeze({tileMeters:2.4,plank:.20,minLen:1.3,maxLen:2.3,tone:[.88,1],seam:.32,grain:.10}),
  narrow:Object.freeze({tileMeters:2.4,plank:.12,minLen:.9,maxLen:1.7,tone:[.87,1],seam:.30,grain:.10}),
  washed:Object.freeze({tileMeters:2.4,plank:.20,minLen:1.3,maxLen:2.3,tone:[.92,1],seam:.22,grain:.07}),
  herringbone:Object.freeze({tileMeters:2.4,plank:.12,minLen:.6,maxLen:.6,tone:[.86,1],seam:.34,grain:.09,column:.6}),
  tile:Object.freeze({tileMeters:1.4,gridStrokeAlpha:.14,gridStrokeWidth:32}),
});
const makeCanvas=()=>{
  if(typeof document==='undefined')throw new Error('A canvas factory is required outside the browser');
  return document.createElement('canvas');
};
const caches=new WeakMap(),leases=new WeakMap();
function cacheFor(createCanvas) {
  if(!caches.has(createCanvas))caches.set(createCanvas,{canvases:new Map(),sources:new Map(),previews:new Map()});
  return caches.get(createCanvas);
}
function random(seed=7){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
const rgba=(r,g,b,a)=>`rgba(${r},${g},${b},${a})`;
function plankRow(ctx,rand,y,width,from,to,spec,px) {
  let x=from-rand()*spec.maxLen*px;
  while(x<to) {
    const length=(spec.minLen+rand()*(spec.maxLen-spec.minLen))*px;
    const tone=spec.tone[0]+rand()*(spec.tone[1]-spec.tone[0]),warm=.97+rand()*.03;
    ctx.fillStyle=`rgb(${Math.round(255*tone)},${Math.round(255*tone*warm)},${Math.round(255*tone*warm*warm)})`;
    ctx.fillRect(x,y,length,width);
    const lines=Math.max(3,Math.round(width/5));
    for(let i=0;i<lines;i++) {
      const gy=y+(i+.5)*width/lines+(rand()-.5)*2;
      ctx.beginPath();ctx.strokeStyle=rgba(70,45,25,spec.grain*(.4+rand()*.6));ctx.lineWidth=.6+rand()*.8;
      ctx.moveTo(x,gy);const phase=rand()*6,amplitude=.6+rand()*1.4;
      for(let gx=x;gx<=x+length;gx+=12)ctx.lineTo(gx,gy+Math.sin(gx/60+phase)*amplitude);
      ctx.stroke();
    }
    if(rand()<.12) {
      ctx.beginPath();ctx.fillStyle=rgba(80,50,28,spec.grain*1.2);
      ctx.ellipse(x+length*(.2+rand()*.6),y+width*(.3+rand()*.4),5+rand()*6,2+rand()*2,0,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle=rgba(55,35,20,spec.seam);ctx.fillRect(x,y,1.6,width);
    x+=length;
  }
  ctx.fillStyle=rgba(55,35,20,spec.seam);ctx.fillRect(from,y,to-from,1.6);
}
/** The same seeded generator supplies the floor and the menu thumbnail. */
export function createFloorPatternCanvas(pattern,{createCanvas=makeCanvas}={}) {
  const spec=FLOOR_PATTERN_SPECS[pattern];if(!spec)throw new RangeError('Unknown floor pattern: '+pattern);
  const canvas=createCanvas();canvas.width=canvas.height=FLOOR_TEXTURE_SIZE;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Floor texture canvas unavailable');
  const size=FLOOR_TEXTURE_SIZE,px=size/spec.tileMeters,rand=random(7);
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);
  if(pattern==='tile') {
    // Preserve the original ceramic grid: 2 px per 64 px cell becomes
    // a 32 px stroke around one 1024 px, physically 1.4 m square repeat.
    ctx.strokeStyle=rgba(91,132,133,spec.gridStrokeAlpha);ctx.lineWidth=spec.gridStrokeWidth;
    for(const edge of[0,size]) {
      ctx.beginPath();ctx.moveTo(edge,0);ctx.lineTo(edge,size);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,edge);ctx.lineTo(size,edge);ctx.stroke();
    }
  } else if(pattern==='herringbone') {
    const cols=Math.round(size/(spec.column*px)),column=size/cols,w=spec.plank*px;
    for(let c=0;c<cols;c++) {
      ctx.save();ctx.beginPath();ctx.rect(c*column,0,column,size);ctx.clip();
      ctx.translate(c*column+column/2,size/2);ctx.rotate((c%2?-1:1)*Math.PI/4);
      const span=size*1.6,rows=Math.ceil(span/w),length=column*Math.SQRT2;
      for(let row=0;row<rows;row++)plankRow(ctx,rand,-span/2+row*w,w,-length/2-length*(row%2)/2,span,{...spec,minLen:length/px,maxLen:length/px},px);
      ctx.restore();ctx.fillStyle=rgba(55,35,20,spec.seam);ctx.fillRect(c*column,0,1.6,size);
    }
  } else {
    const width=spec.plank*px,rows=Math.ceil(size/width);
    for(let row=0;row<rows;row++)plankRow(ctx,rand,row*width,width,0,size,spec,px);
  }
  return canvas;
}
export function getFloorPatternCanvas(pattern,options={}) {
  const factory=options.createCanvas??makeCanvas,cache=cacheFor(factory);
  if(!cache.canvases.has(pattern))cache.canvases.set(pattern,createFloorPatternCanvas(pattern,{createCanvas:factory}));
  return cache.canvases.get(pattern);
}
/** Color the real neutral texture, never an unrelated illustrative swatch. */
export function getFloorFinishPreview(value,options={}) {
  const finish=typeof value==='string'?getFloorFinish(value):value;if(!finish)return null;
  const factory=options.createCanvas??makeCanvas,cache=cacheFor(factory),key=finish.pattern+':'+finish.color;
  if(cache.previews.has(key))return cache.previews.get(key);
  const source=getFloorPatternCanvas(finish.pattern,{createCanvas:factory}),canvas=factory();canvas.width=canvas.height=160;
  const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0,160,160);ctx.globalCompositeOperation='multiply';ctx.fillStyle=finish.color;ctx.fillRect(0,0,160,160);ctx.globalCompositeOperation='source-over';
  const url=canvas.toDataURL('image/png');cache.previews.set(key,url);
  if(cache.previews.size>64)cache.previews.delete(cache.previews.keys().next().value);
  return url;
}
function acquire(pattern,factory) {
  const cache=cacheFor(factory);let source=cache.sources.get(pattern);
  if(!source) {
    const texture=new THREE.CanvasTexture(getFloorPatternCanvas(pattern,{createCanvas:factory}));
    texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;texture.name='floor-source:'+pattern;
    source={texture,refs:0};cache.sources.set(pattern,source);
  }
  source.refs++;return source;
}
function releaseSource(pattern,factory) {
  const cache=cacheFor(factory),source=cache.sources.get(pattern);if(!source)return;
  if(--source.refs===0){source.texture.dispose();cache.sources.delete(pattern);}
}
export function retainHomeFloorTexture(texture) {const lease=leases.get(texture);if(!lease)return false;lease.refs++;return true;}
export function releaseHomeFloorTexture(texture) {const lease=leases.get(texture);if(!lease)return false;if(--lease.refs===0){texture.dispose();releaseSource(lease.pattern,lease.factory);leases.delete(texture);}return true;}
export function getFloorTextureCacheStats({createCanvas=makeCanvas}={}) {
  const cache=cacheFor(createCanvas);return {canvases:cache.canvases.size,sources:cache.sources.size,clones:[...cache.sources.values()].reduce((sum,row)=>sum+row.refs,0)};
}
/** Uses actual vertex bounds, including rounded or clipped floor geometry. */
export function getFloorTextureMetrics(mesh,tileMeters) {
  const geometry=mesh?.geometry;if(!geometry?.attributes.position||!Number.isFinite(tileMeters)||tileMeters<=0)return null;
  geometry.computeBoundingBox();const box=geometry.boundingBox,localWidth=box.max.x-box.min.x,localDepth=box.max.z-box.min.z;
  if(localWidth<=1e-7||localDepth<=1e-7)return null;
  mesh.updateWorldMatrix(true,false);
  const origin=new THREE.Vector3(box.min.x,0,box.min.z).applyMatrix4(mesh.matrixWorld),xAxis=new THREE.Vector3(1,0,0).transformDirection(mesh.matrixWorld),zAxis=new THREE.Vector3(0,0,1).transformDirection(mesh.matrixWorld),scale=new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
  const width=localWidth*Math.abs(scale.x),depth=localDepth*Math.abs(scale.z);
  return {localWidth,localDepth,minX:box.min.x,minZ:box.min.z,width,depth,repeat:[width/tileMeters,depth/tileMeters],offset:[origin.dot(xAxis)/tileMeters,origin.dot(zAxis)/tileMeters]};
}
function topOnlyShader(shader) {
  shader.vertexShader='varying float vWarmFloorTop;\n'+shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvWarmFloorTop = smoothstep(0.4, 0.95, objectNormal.y);');
  shader.fragmentShader='varying float vWarmFloorTop;\n'+shader.fragmentShader.replace('#include <map_fragment>','vec4 warmFloorBase = diffuseColor;\n#include <map_fragment>\ndiffuseColor = mix(warmFloorBase, diffuseColor, vWarmFloorTop);');
}
/** Clones share a cached source image, but each floor owns its UV transform. */
export function createHomeFloorTextureManager({createCanvas=makeCanvas}={}) {
  const records=new Map();let disposed=false;
  function release(mesh) {
    const record=records.get(mesh);if(!record)return;
    if(mesh.geometry===record.geometry&&record.uv)mesh.geometry.setAttribute('uv',record.uv);
    if(mesh.material===record.material){mesh.material.map=record.originalMap;mesh.material.onBeforeCompile=record.compile;mesh.material.customProgramCacheKey=record.programKey;mesh.material.needsUpdate=true;}
    releaseHomeFloorTexture(record.texture);records.delete(mesh);
    for(const key of ['floorFinishId','floorPattern','floorTexture'])delete mesh.userData[key];
  }
  function apply(mesh,finish) {
    if(disposed)throw new Error('Floor texture manager is disposed');
    if(!finish){release(mesh);return false;}
    const spec=FLOOR_PATTERN_SPECS[finish.pattern],metrics=getFloorTextureMetrics(mesh,finish.tileMeters??spec?.tileMeters);
    if(!spec||!metrics||!mesh.material?.isMeshStandardMaterial)return false;
    let record=records.get(mesh);
    if(record&&(record.pattern!==finish.pattern||record.geometry!==mesh.geometry||record.material!==mesh.material)){release(mesh);record=null;}
    if(!record) {
      const source=acquire(finish.pattern,createCanvas),texture=source.texture.clone();texture.needsUpdate=true;leases.set(texture,{refs:1,pattern:finish.pattern,factory:createCanvas});
      record={pattern:finish.pattern,texture,geometry:mesh.geometry,material:mesh.material,uv:mesh.geometry.attributes.uv?.clone()??null,compile:mesh.material.onBeforeCompile,programKey:mesh.material.customProgramCacheKey,originalMap:mesh.material.map};
      const compile=record.compile,programKey=record.programKey;mesh.material.onBeforeCompile=function(shader,renderer){compile.call(this,shader,renderer);topOnlyShader(shader);};mesh.material.customProgramCacheKey=function(){return programKey.call(this)+'|warm-floor-top-v1';};
      records.set(mesh,record);
    }
    const uvKey=[metrics.minX,metrics.minZ,metrics.localWidth,metrics.localDepth].join(':');
    if(record.uvKey!==uvKey) {
      const uv=mesh.geometry.attributes.uv??new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count*2),2),position=mesh.geometry.attributes.position;
      for(let i=0;i<position.count;i++)uv.setXY(i,(position.getX(i)-metrics.minX)/metrics.localWidth,(position.getZ(i)-metrics.minZ)/metrics.localDepth);
      uv.needsUpdate=true;mesh.geometry.setAttribute('uv',uv);record.uvKey=uvKey;
    }
    const map=record.texture;map.repeat.set(...metrics.repeat);map.offset.set(...metrics.offset);map.updateMatrix();
    map.name='floor:'+finish.pattern;map.userData={floorPattern:finish.pattern,finishId:finish.id,tileMetres:finish.tileMeters??spec.tileMeters,worldTileMetres:finish.tileMeters??spec.tileMeters,boardWidthMetres:finish.boardWidthMeters??spec.plank??null};
    if(mesh.material.map!==map){mesh.material.map=map;mesh.material.needsUpdate=true;}mesh.material.color.set(finish.color);mesh.material.roughness=finish.group==='tile'?.45:.72;mesh.material.metalness=0;
    Object.assign(mesh.userData,{floorFinishId:finish.id,floorPattern:finish.pattern,floorTexture:map.userData});return true;
  }
  function dispose(){if(disposed)return;for(const mesh of[...records.keys()])release(mesh);disposed=true;}
  return {apply,release,dispose,getStats:()=>({meshes:records.size,...getFloorTextureCacheStats({createCanvas})})};
}
