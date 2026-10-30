import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {decodePNG,measureMaskedLuminance,normalizePolygon,pointInPolygon,analyzeRoamPhotometry} from '../scripts/qa/roam-photometry.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function checksum(data){let crc=-1;for(const byte of data){crc^=byte;for(let j=0;j<8;j++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}return(crc^-1)>>>0;}
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(checksum(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);}
function png(width,height,bytes,{channels=4,filters=Array(height).fill(0),interlace=0}={}){
  const stride=width*channels,filtered=Buffer.alloc((stride+1)*height),raw=Buffer.from(bytes);
  for(let y=0;y<height;y++){
    const mode=filters[y],start=y*(stride+1);filtered[start]=mode;
    for(let x=0;x<stride;x++){
      const a=x>=channels?raw[y*stride+x-channels]:0,b=y?raw[(y-1)*stride+x]:0,c=y&&x>=channels?raw[(y-1)*stride+x-channels]:0,p=a+b-c;
      const distances=[Math.abs(p-a),Math.abs(p-b),Math.abs(p-c)],lowest=Math.min(...distances),paeth=distances[0]===lowest?a:distances[1]===lowest?b:c;
      const predictor=[0,a,b,Math.floor((a+b)/2),paeth][mode];filtered[start+1+x]=(raw[y*stride+x]-predictor)&255;
    }
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=channels===4?6:2;header[12]=interlace;
  const compressed=deflateSync(filtered),middle=Math.floor(compressed.length/2);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed.subarray(0,middle)),chunk('IDAT',compressed.subarray(middle)),chunk('IEND',Buffer.alloc(0))]);
}
function image(width,height,value=0){const data=Buffer.alloc(width*height*4);for(let i=0;i<data.length;i+=4)data.set([value,value,value,255],i);return{width,height,data};}
function setPixel(image,x,y,rgba){image.data.set(rgba.length===3?[...rgba,255]:rgba,(y*image.width+x)*4);}
function gray(image,x,y,value){setPixel(image,x,y,[value,value,value,255]);}
function mask(width,height,points){const value=image(width,height);for(const[x,y]of points)gray(value,x,y,255);return value;}

test('dependency-free PNG decoding handles RGB/RGBA, every PNG filter and split IDAT chunks',()=>{
  for(const channels of[3,4]){
    const raw=Uint8Array.from({length:3*5*channels},(_,i)=>(i*47+19)%256),decoded=decodePNG(png(3,5,raw,{channels,filters:[0,1,2,3,4]}));
    assert.equal(decoded.width,3);assert.equal(decoded.height,5);
    for(let i=0;i<15;i++){assert.deepEqual([...decoded.data.subarray(i*4,i*4+3)],[...raw.subarray(i*channels,i*channels+3)]);assert.equal(decoded.data[i*4+3],channels===4?raw[i*channels+3]:255);}
  }
});

test('PNG decoder rejects corruption, interlace and a truncated image rather than measuring false pixels',()=>{
  const valid=png(1,1,[100,140,180,255]),corrupt=Buffer.from(valid);corrupt[corrupt.length-1]^=1;
  assert.throws(()=>decodePNG(corrupt),/CRC/);assert.throws(()=>decodePNG(valid.subarray(0,valid.length-3)),/Truncated/);
  assert.throws(()=>decodePNG(png(1,1,[100,140,180,255],{interlace:1})),/non-interlaced/);
});

test('encoded sRGB luminance and population deviation are measured without gamma conversion',()=>{
  const source=image(3,1),all=mask(3,1,[[0,0],[1,0],[2,0]]);setPixel(source,0,0,[255,0,0]);setPixel(source,1,0,[0,255,0]);setPixel(source,2,0,[0,0,255]);
  const result=measureMaskedLuminance(source,all,{threshold:.7}),values=[.2126,.7152,.0722],mean=1/3;
  near(result.mean,mean);near(result.stdDev,Math.sqrt(values.reduce((sum,x)=>sum+(x-mean)**2,0)/3));assert.equal(result.highPixels,1);near(result.highFraction,1/3);
});

test('masks enforce >127 white and alpha and polygon inclusion uses exact pixel centres',()=>{
  const source=image(4,1,128),visibility=image(4,1,255);visibility.data[3]=127;visibility.data[4]=127;
  const polygon=normalizePolygon([{x:1,y:0},{x:3,y:0},{x:3,y:1},{x:1,y:1}]);
  const result=measureMaskedLuminance(source,visibility,{polygon});assert.equal(result.pixels,1);assert.deepEqual(result.roi.bounds,{left:2,top:0,width:1,height:1});near(result.mean,128/255);
  assert.equal(pointInPolygon(3,.5,polygon),true);assert.equal(pointInPolygon(3.5,.5,polygon),false);assert.throws(()=>normalizePolygon([[0,0],[NaN,1],[1,2]]),/finite/);
  assert.throws(()=>measureMaskedLuminance(source,mask(4,1,[])),/no valid pixel/);
});

async function fixture(){
  const directory=await mkdtemp(join(tmpdir(),'homeworld-roam-photometry-')),masks=join(directory,'masks'),names={door:'07-look-back-at-open-front-door',off:'11a-floor-lamp-off',on:'11b-floor-lamp-on'};
  const current=image(6,3),legacy=image(6,3),off=image(6,3),on=image(6,3);
  gray(current,0,0,178);gray(current,1,0,230);gray(current,2,0,134);gray(legacy,2,0,128);
  for(const x of[0,1]){gray(off,x,1,102);gray(on,x,1,153);gray(off,x,2,64);gray(on,x,2,128);}gray(off,2,1,250);gray(on,2,1,250);gray(off,2,2,255);gray(on,2,2,255);gray(on,3,1,230);
  const save=async(file,value)=>writeFile(file,png(value.width,value.height,value.data));
  await save(join(directory,names.door+'.png'),current);await save(join(directory,names.door+'--legacy.png'),legacy);await save(join(directory,names.off+'.png'),off);await save(join(directory,names.on+'.png'),on);
  const maskFiles={'all-visible-walls.png':mask(6,3,[[0,1],[1,1],[2,1]]),'lamp-wall-one-metre.png':mask(6,3,[[0,1],[1,1],[2,1]]),'lamp-shade.png':mask(6,3,[[3,1]]),'lamp-floor-pool.png':mask(6,3,[[0,2],[1,2],[2,2]])};
  const regions={regions:{lampWallOneMetre:{polygon:[[0,1],[2,1],[2,2],[0,2]]},lampFloorPool:{polygon:[[0,2],[2,2],[2,3],[0,3]]}}};
  for(const key of['off','on']){const folder=join(masks,names[key]);await mkdir(folder,{recursive:true});for(const[file,value]of Object.entries(maskFiles))await save(join(folder,file),value);await writeFile(join(folder,'regions.json'),JSON.stringify(regions));}
  const doorFolder=join(masks,names.door);await mkdir(doorFolder,{recursive:true});await save(join(doorFolder,'door-aperture.png'),mask(6,3,[[0,0],[1,0]]));await save(join(doorFolder,'interior-walls-and-door.png'),mask(6,3,[[2,0]]));
  return{directory,masks,names,save,cleanup:()=>rm(directory,{recursive:true,force:true})};
}

test('fixed PNG capture/mask fixtures produce independently calculable door and lamp acceptance numbers',async()=>{
  const f=await fixture();try{
    const r=await analyzeRoamPhotometry(f.directory);assert.equal(r.pass,true);assert.equal(r.door.aperture.pixels,2);near(r.door.aperture.mean,204/255);near(r.door.aperture.stdDev,26/255);assert.equal(r.door.aperture.highFraction,0);
    near(r.door.interior.relativeChange,6/128);assert.equal(r.lamp.wallOneMetre.before.pixels,2);near(r.lamp.wallOneMetre.relativeChange,.5);near(r.lamp.wallOneMetre.possibleMaximumRelativeLift,1.5);
    near(r.lamp.floorPool.relativeChange,1);assert.equal(r.lamp.shade.on.mean>r.lamp.shade.onVisibleWalls.mean,true);assert.equal(r.method.pairedMasksVerified.length,4);assert.equal(JSON.stringify(r).includes(f.directory),false,'published JSON contains no private local directory');
  }finally{await f.cleanup();}
});

test('paired mask changes and dimension mismatches fail rather than silently changing measurement regions',async()=>{
  const f=await fixture();try{
    await f.save(join(f.masks,f.names.off,'lamp-shade.png'),mask(6,3,[[4,1]]));await assert.rejects(analyzeRoamPhotometry(f.directory),/Paired visibility masks differ/);
    await f.save(join(f.directory,f.names.on+'.png'),image(2,2));await assert.rejects(analyzeRoamPhotometry(f.directory),/same PNG dimensions/);
  }finally{await f.cleanup();}
});
