// Offline, dependency-free measurement of fixed, visible-surface masks.
// Pixel values are encoded sRGB samples, not linear-light radiance.
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inflateSync} from 'node:zlib';

const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{for(let bit=0;bit<8;bit++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=CRC_TABLE[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function requireValue(condition,message){if(!condition)throw new Error(message);}
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}

/** Decode non-interlaced 8-bit RGB/RGBA PNGs from browser or Sharp captures. */
export function decodePNG(bytes){
  const buffer=Buffer.from(bytes);requireValue(buffer.subarray(0,8).equals(SIGNATURE),'Invalid PNG signature');
  let offset=8,width,height,channels,ended=false;const idat=[];
  while(offset<buffer.length){
    requireValue(offset+12<=buffer.length,'Truncated PNG chunk');
    const length=buffer.readUInt32BE(offset),end=offset+12+length;requireValue(end<=buffer.length,'Truncated PNG chunk data');
    const type=buffer.toString('ascii',offset+4,offset+8),data=buffer.subarray(offset+8,offset+8+length);
    requireValue(crc32(buffer.subarray(offset+4,offset+8+length))===buffer.readUInt32BE(offset+8+length),'PNG CRC mismatch: '+type);
    if(type==='IHDR'){
      requireValue(width===undefined&&length===13,'Invalid PNG header');width=data.readUInt32BE(0);height=data.readUInt32BE(4);
      requireValue(width>0&&height>0&&width*height<=64*1024*1024,'PNG dimensions exceed the supported measurement size');
      requireValue(data[8]===8&&[2,6].includes(data[9]),'Only 8-bit RGB/RGBA PNG is supported');channels=data[9]===2?3:4;
      requireValue(data[10]===0&&data[11]===0&&data[12]===0,'Only standard, non-interlaced PNG is supported');
    }else if(type==='IDAT'){requireValue(channels!==undefined,'PNG IDAT precedes header');idat.push(data);}
    else if(type==='IEND'){requireValue(length===0,'Invalid PNG end chunk');ended=true;break;}
    offset=end;
  }
  requireValue(ended&&channels!==undefined&&idat.length>0,'PNG requires header, image data and end chunks');
  const stride=width*channels,expected=(stride+1)*height,filtered=inflateSync(Buffer.concat(idat),{maxOutputLength:expected});
  requireValue(filtered.length===expected,'PNG decompressed size does not match dimensions');
  const pixels=Buffer.alloc(stride*height);
  for(let y=0;y<height;y++){
    const row=y*stride,source=y*(stride+1),filter=filtered[source];requireValue(filter<=4,'Unsupported PNG row filter');
    for(let x=0;x<stride;x++){
      const left=x>=channels?pixels[row+x-channels]:0,above=y?pixels[row-stride+x]:0,upperLeft=y&&x>=channels?pixels[row-stride+x-channels]:0;
      const predictor=filter===0?0:filter===1?left:filter===2?above:filter===3?Math.floor((left+above)/2):paeth(left,above,upperLeft);
      pixels[row+x]=(filtered[source+1+x]+predictor)&255;
    }
  }
  const data=Buffer.alloc(width*height*4);
  for(let i=0,j=0;i<pixels.length;i+=channels,j+=4){data[j]=pixels[i];data[j+1]=pixels[i+1];data[j+2]=pixels[i+2];data[j+3]=channels===4?pixels[i+3]:255;}
  return{width,height,data};
}

export function normalizePolygon(value){
  if(value===undefined||value===null)return null;
  requireValue(Array.isArray(value)&&value.length>=3,'A measurement polygon requires at least three vertices');
  return value.map(point=>{const xy=Array.isArray(point)?point:[point?.x,point?.y];requireValue(xy.length===2&&xy.every(Number.isFinite),'Polygon vertices must be finite [x,y] coordinates');return[...xy];});
}

/** Even-odd rule; a pixel centre lying exactly on the boundary is included. */
export function pointInPolygon(x,y,polygon){
  if(!polygon)return true;let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const[a,b]=polygon[i],[c,d]=polygon[j],cross=(x-a)*(d-b)-(y-b)*(c-a);
    if(Math.abs(cross)<=1e-9&&x>=Math.min(a,c)-1e-9&&x<=Math.max(a,c)+1e-9&&y>=Math.min(b,d)-1e-9&&y<=Math.max(b,d)+1e-9)return true;
    if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
  }
  return inside;
}

const white=(data,offset)=>data[offset]>127&&data[offset+1]>127&&data[offset+2]>127&&data[offset+3]>127;
function dimensionsMatch(a,b){return a.width===b.width&&a.height===b.height;}
function assertSameMask(a,b,label){
  requireValue(dimensionsMatch(a,b),'Paired mask dimensions differ: '+label);
  for(let i=0;i<a.data.length;i+=4)requireValue(white(a.data,i)===white(b.data,i),'Paired visibility masks differ: '+label);
}

export function measureMaskedLuminance(image,mask,{polygon=null,threshold=.97}={}){
  requireValue(dimensionsMatch(image,mask),'Mask and image dimensions differ');polygon=normalizePolygon(polygon);
  let pixels=0,mean=0,m2=0,highPixels=0,min=Infinity,max=-Infinity,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
    const i=(y*image.width+x)*4;if(!white(mask.data,i)||!pointInPolygon(x+.5,y+.5,polygon))continue;
    const value=(.2126*image.data[i]+.7152*image.data[i+1]+.0722*image.data[i+2])/255;
    pixels++;const delta=value-mean;mean+=delta/pixels;m2+=delta*(value-mean);if(value>=threshold)highPixels++;
    min=Math.min(min,value);max=Math.max(max,value);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  }
  requireValue(pixels>0,'Measurement region contains no valid pixel centres');
  return{pixels,mean,stdDev:Math.sqrt(Math.max(0,m2/pixels)),min,max,highThreshold:threshold,highPixels,highFraction:highPixels/pixels,
    roi:{bounds:{left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1},polygon}};
}

const CASES={door:'07-look-back-at-open-front-door',off:'11a-floor-lamp-off',on:'11b-floor-lamp-on'};
const MASKS={doorAperture:'door-aperture.png',interior:'interior-walls-and-door.png',walls:'all-visible-walls.png',lampWallOneMetre:'lamp-wall-one-metre.png',lampShade:'lamp-shade.png',lampFloorPool:'lamp-floor-pool.png'};
const exists=async path=>{try{await access(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const readPNG=async path=>decodePNG(await readFile(path));
function comparison(before,after){const relativeChange=before.mean>0?(after.mean-before.mean)/before.mean:null;return{before,after,relativeChange,changePercent:relativeChange===null?null:relativeChange*100,absoluteChange:after.mean-before.mean};}

/**
 * Fixed filenames and masks prevent measuring a different region for on/off.
 * Masks are <maskRoot>/<case basename>/*.png plus regions.json. Lamp region
 * polygons are required; visible-surface masks are additionally intersected
 * with those polygons at PNG pixel centres.
 */
export async function analyzeRoamPhotometry(inputDirectory,{maskRoot=join(inputDirectory,'masks')}={}){
  const door=await readPNG(join(inputDirectory,CASES.door+'.png')),legacy=await readPNG(join(inputDirectory,CASES.door+'--legacy.png')),
    off=await readPNG(join(inputDirectory,CASES.off+'.png')),on=await readPNG(join(inputDirectory,CASES.on+'.png'));
  requireValue([legacy,off,on].every(image=>dimensionsMatch(door,image)),'All four captures must use the same PNG dimensions');
  const doorDirectory=join(maskRoot,CASES.door),lampDirectory=join(maskRoot,CASES.on),offDirectory=join(maskRoot,CASES.off);
  const metadata=JSON.parse(await readFile(join(lampDirectory,'regions.json'),'utf8'));
  const wallPolygon=normalizePolygon(metadata.regions?.lampWallOneMetre?.polygon),floorPolygon=normalizePolygon(metadata.regions?.lampFloorPool?.polygon);
  requireValue(wallPolygon&&floorPolygon,'regions.json requires lampWallOneMetre.polygon and lampFloorPool.polygon');
  const masks={};for(const key of['walls','lampWallOneMetre','lampShade','lampFloorPool'])masks[key]=await readPNG(join(lampDirectory,MASKS[key]));
  const pairedMasks=[];
  for(const key of Object.keys(masks))if(await exists(join(offDirectory,MASKS[key]))){assertSameMask(masks[key],await readPNG(join(offDirectory,MASKS[key])),MASKS[key]);pairedMasks.push(MASKS[key]);}
  if(await exists(join(offDirectory,'regions.json'))){const offMeta=JSON.parse(await readFile(join(offDirectory,'regions.json'),'utf8'));for(const key of['lampWallOneMetre','lampFloorPool'])requireValue(JSON.stringify(normalizePolygon(offMeta.regions?.[key]?.polygon))===JSON.stringify(normalizePolygon(metadata.regions[key].polygon)),'Paired polygons differ: '+key);}
  const aperture=measureMaskedLuminance(door,await readPNG(join(doorDirectory,MASKS.doorAperture))),interiorMask=await readPNG(join(doorDirectory,MASKS.interior));
  const interior=comparison(measureMaskedLuminance(legacy,interiorMask),measureMaskedLuminance(door,interiorMask));
  const wall=comparison(measureMaskedLuminance(off,masks.lampWallOneMetre,{polygon:wallPolygon}),measureMaskedLuminance(on,masks.lampWallOneMetre,{polygon:wallPolygon}));
  const shade=measureMaskedLuminance(on,masks.lampShade),allWalls=measureMaskedLuminance(on,masks.walls),floor=comparison(measureMaskedLuminance(off,masks.lampFloorPool,{polygon:floorPolygon}),measureMaskedLuminance(on,masks.lampFloorPool,{polygon:floorPolygon}));
  const doorChecks={meanWithinRange:aperture.mean>=.70&&aperture.mean<=.88,stdDevAtLeast004:aperture.stdDev>=.04,highFractionBelow10Percent:aperture.highFraction<.10,interiorWithin5Percent:interior.relativeChange!==null&&Math.abs(interior.relativeChange)<=.05};
  const lampChecks={wallLiftAtLeast25Percent:wall.relativeChange!==null&&wall.relativeChange>=.25,shadeBrighterThanVisibleWalls:shade.mean>allWalls.mean};
  return{schemaVersion:1,method:{channelEncoding:'encoded sRGB bytes; no linearization, ICC conversion or alpha compositing',luminance:'(0.2126 R + 0.7152 G + 0.0722 B) / 255',standardDeviation:'population',mask:'all RGB channels > 127 and alpha > 127',polygon:'even-odd pixel-centre test, boundary included',sameMaskForEachPair:true,pairedMasksVerified:pairedMasks},dimensions:{width:door.width,height:door.height},
    files:{door:CASES.door+'.png',legacyDoor:CASES.door+'--legacy.png',lampOff:CASES.off+'.png',lampOn:CASES.on+'.png'},
    door:{aperture:{...aperture,mask:CASES.door+'/'+MASKS.doorAperture},interior:{...interior,mask:CASES.door+'/'+MASKS.interior},checks:doorChecks,pass:Object.values(doorChecks).every(Boolean)},
    lamp:{wallOneMetre:{...wall,possibleMaximumRelativeLift:wall.before.mean>0?(1-wall.before.mean)/wall.before.mean:null,mask:CASES.on+'/'+MASKS.lampWallOneMetre},shade:{on:shade,onVisibleWalls:allWalls,mask:CASES.on+'/'+MASKS.lampShade,wallMask:CASES.on+'/'+MASKS.walls},floorPool:{...floor,mask:CASES.on+'/'+MASKS.lampFloorPool},checks:lampChecks,pass:Object.values(lampChecks).every(Boolean)},
    pass:[...Object.values(doorChecks),...Object.values(lampChecks)].every(Boolean)};
}

async function main(args){
  let inputDirectory,maskRoot,output;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--masks'){requireValue(args[i+1]&&!args[i+1].startsWith('--'),'--masks requires a directory');maskRoot=resolve(args[++i]);}
    else if(args[i]==='--output'){requireValue(args[i+1]&&!args[i+1].startsWith('--'),'--output requires a file');output=resolve(args[++i]);}
    else if(!args[i].startsWith('-')&&!inputDirectory)inputDirectory=resolve(args[i]);
    else throw new Error('Usage: node scripts/qa/roam-photometry.mjs INPUT_DIRECTORY [--masks MASK_ROOT] [--output RESULT.json]');
  }
  requireValue(inputDirectory,'Usage: node scripts/qa/roam-photometry.mjs INPUT_DIRECTORY [--masks MASK_ROOT] [--output RESULT.json]');
  const result=await analyzeRoamPhotometry(inputDirectory,maskRoot?{maskRoot}:{}),json=JSON.stringify(result,null,2)+'\n';if(output)await writeFile(output,json);else process.stdout.write(json);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
