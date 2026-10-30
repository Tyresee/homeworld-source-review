import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createWallPatternCanvas,getWallPatternCanvas,getWallFinishPreview,createHomeWallTextureManager,getWallTextureMetrics,getWallTextureCacheStats,WALL_PATTERNS} from '../public/js/home-wall-textures.js';
import {clipWallGeometryInterval,createSharedWallFaceMeshes} from '../public/js/home-wall-geometry.js';
import {resolveHomeWallFinish} from '../public/js/home-wall-finishes.js';
import {createHomeFloorTextureManager} from '../public/js/home-floor-textures.js';
import {createRoomExpansion} from '../public/js/home-room-expansion.js';
import {createRoom,roomRect} from '../public/js/home-layout.js';
import {createHomeState,getWallMountTargets} from '../public/js/home-engine.js';
import {HOME_THEMES} from '../public/js/home-theme.js';
import {captureHomeFloor} from '../public/js/home-house-overview.js';

function canvasFactory() {
  const canvases=[];
  const createCanvas=()=>{
    const hash=createHash('sha256'),commands=[],props={};
    const record=(name,...args)=>{commands.push([name,...args]);hash.update(JSON.stringify([name,...args]));};
    const ctx=new Proxy(props,{set(target,key,value){target[key]=value;record('set',key,value);return true;},get(target,key){return key in target?target[key]:(...args)=>record(key,...args.map(value=>value?.fingerprint?value.fingerprint():value));}});
    const canvas={width:0,height:0,getContext:()=>ctx,commands,fingerprint:()=>hash.copy().digest('hex'),toDataURL:()=> 'data:image/png;base64,'+Buffer.from(hash.copy().digest('hex')).toString('base64')};canvases.push(canvas);return canvas;
  };return{createCanvas,canvases};
}
const finish=(pattern='plain',color='#f4efe6')=>({pattern,color,styleId:'wall-'+pattern,colorId:'wall-warm-white'});
const wall=()=>new THREE.Mesh(new RoundedBoxGeometry(5.6,2.85,.22,3,.03),new THREE.MeshStandardMaterial({color:'#abcdef'}));
const area=geometry=>{const p=geometry.attributes.position,index=geometry.index,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let sum=0;for(let i=0;i<(index?.count??p.count);i+=3){a.fromBufferAttribute(p,index?index.getX(i):i);b.fromBufferAttribute(p,index?index.getX(i+1):i+1);c.fromBufferAttribute(p,index?index.getX(i+2):i+2);sum+=b.sub(a).cross(c.sub(a)).length()/2;}return sum;};

test('three neutral wall patterns use deterministic 1024px seed11 canvases with real-world circles',()=>{
  const {createCanvas}=canvasFactory(),hashes=new Set();
  for(const pattern of WALL_PATTERNS){const a=createWallPatternCanvas(pattern,{createCanvas}),b=createWallPatternCanvas(pattern,{createCanvas});assert.equal(a.width,1024);assert.equal(a.height,1024);assert.equal(a.fingerprint(),b.fingerprint());hashes.add(a.fingerprint());}
  assert.equal(hashes.size,3);
  const plain=createWallPatternCanvas('plain',{createCanvas});assert.equal(plain.commands.filter(c=>c[0]==='ellipse').length,260);
  const stripes=createWallPatternCanvas('stripe-fine',{createCanvas}),stripe=stripes.commands.find(c=>c[0]==='fillRect'&&c[3]<100);assert.ok(Math.abs(stripe[3]*1.2/1024-.05)<1e-12);
  const dots=createWallPatternCanvas('dots',{createCanvas}),dot=dots.commands.find(c=>c[0]==='ellipse');assert.ok(Math.abs(dot[3]*2*1.2/1024-.028)<1e-12);assert.ok(Math.abs(dot[4]*2*2.85/1024-.028)<1e-12,'the reference pixel-circle distortion is intentionally corrected');
});

test('wall previews reuse the actual pattern canvas with the resolved wall tint',()=>{
  const {createCanvas,canvases}=canvasFactory(),a=getWallPatternCanvas('plain',{createCanvas});assert.equal(a,getWallPatternCanvas('plain',{createCanvas}));
  const preview=getWallFinishPreview({styleId:'wall-plain',colorId:'wall-apricot'},{createCanvas});assert.match(preview,/^data:image\/png;base64,/);assert.equal(canvases.length,2);
  assert.equal(preview,getWallFinishPreview({pattern:'plain',color:'#f1d9cc'},{createCanvas}));assert.equal(canvases.length,2);
  getWallFinishPreview({pattern:'plain',color:'#123456'},{createCanvas});assert.equal(canvases.length,3);assert.ok(canvases[1].commands.some(c=>c[0]==='set'&&c[1]==='fillStyle'&&c[2]==='#f1d9cc'));
});

test('planes, rounded boxes and extruded walls use metre UVs without stretching or constructor assumptions',()=>{
  const {createCanvas}=canvasFactory(),manager=createHomeWallTextureManager({createCanvas});
  const shape=new THREE.Shape();shape.moveTo(-2.8,0);shape.lineTo(2.8,0);shape.lineTo(2.8,2.85);shape.lineTo(-2.8,2.85);shape.closePath();
  const objects=[wall(),new THREE.Mesh(new THREE.PlaneGeometry(5.6,2.85),new THREE.MeshStandardMaterial()),new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.22,bevelEnabled:false}),new THREE.MeshStandardMaterial())];
  objects[0].scale.set(1.5,1.2,1);objects[0].userData.wallTextureAxis='x';
  for(const object of objects){const metrics=getWallTextureMetrics(object);assert.ok(metrics.width>5);manager.apply(object,finish('stripe-fine'));assert.deepEqual(object.material.map.repeat.toArray(),[1/1.2,1/2.85]);const p=object.geometry.attributes.position,uv=object.geometry.attributes.uv;for(let i=0;i<p.count;i++){assert.ok(Math.abs(uv.getX(i)-p.getX(i)*Math.abs(object.scale.x))<1e-6);assert.ok(Math.abs(uv.getY(i)-(p.getY(i)-metrics.minY)*Math.abs(object.scale.y))<1e-6);}}
  manager.dispose();for(const object of objects){object.geometry.dispose();object.material.dispose();}
});

test('per-wall clones share neutral source, change independently and restore borrowed maps on release',()=>{
  const {createCanvas}=canvasFactory(),manager=createHomeWallTextureManager({createCanvas}),a=wall(),b=wall(),borrowed=new THREE.Texture(),uv=a.geometry.attributes.uv.array.slice();a.material.map=borrowed;
  manager.apply(a,finish());manager.apply(b,finish());assert.notEqual(a.material.map,b.material.map);assert.equal(a.material.map.source,b.material.map.source);assert.equal(borrowed.version,0);
  const before=b.material.map;manager.apply(a,finish('dots','#d4dfe7'));assert.equal(b.material.map,before);assert.equal(b.material.color.getHexString(),'f4efe6');assert.equal(a.material.map.userData.dotDiameterMetres,.028);
  manager.release(a);assert.equal(a.material.map,borrowed);assert.deepEqual(a.geometry.attributes.uv.array,uv);manager.dispose();manager.dispose();assert.equal(getWallTextureCacheStats({createCanvas}).clones,0);
  for(const object of[a,b]){object.geometry.dispose();object.material.dispose();}borrowed.dispose();
});

test('whole-house captures retain wall clones until their own disposal',()=>{
  const {createCanvas}=canvasFactory(),manager=createHomeWallTextureManager({createCanvas}),object=wall(),group=new THREE.Group();group.add(object);manager.apply(object,finish('dots'));const map=object.material.map;let disposal=0;map.addEventListener('dispose',()=>disposal++);
  const capture=captureHomeFloor(group);assert.equal(capture.children[0].material.map,map);manager.dispose();assert.equal(disposal,0);capture.userData.dispose();assert.equal(disposal,1);assert.equal(getWallTextureCacheStats({createCanvas}).clones,0);object.geometry.dispose();object.material.dispose();
});

test('triangle clipping preserves rounded/window holes, area and original mount wall IDs',()=>{
  const {createCanvas}=canvasFactory(),floorTextureManager=createHomeFloorTextureManager({createCanvas}),wallTextureManager=createHomeWallTextureManager({createCanvas});
  const home=createHomeState({profile:'account',rooms:[createRoom('living'),createRoom('bedroom',1,-1,'bedroom')],slab:{rects:[{minX:-2.8,minZ:-2.6,width:11.2,depth:5.2}]}}),before=JSON.stringify(home),targets=getWallMountTargets(home);
  const baseline=createRoomExpansion({...home,includeGrid:false,theme:HOME_THEMES.default}),warm=createRoomExpansion({...home,includeGrid:false,theme:HOME_THEMES.warm,floorTextureManager,wallTextureManager});
  try {
    const a=baseline.userData.roomParts,b=warm.userData.roomParts;assert.equal(a.windows.length,b.windows.length,'the original single centred window is not duplicated');
    const signature=list=>list.map(m=>[m.position.toArray(),m.rotation.toArray(),Array.from(m.geometry.attributes.position.array)]);assert.deepEqual(signature(a.windows),signature(b.windows));
    assert.deepEqual([...new Set(b.walls.map(m=>m.userData.wallId).filter(Boolean))].sort(),[...new Set(a.walls.map(m=>m.userData.wallId).filter(Boolean))].sort());
    assert.ok(Math.abs(a.walls.reduce((sum,m)=>sum+area(m.geometry),0)-b.walls.reduce((sum,m)=>sum+area(m.geometry),0))<1e-4,'no extra end caps or overlaid faces');
    const segment=b.walls.find(m=>m.userData.surfaceId==='room:bedroom.wall'&&m.userData.floorBoundary?.side==='back');assert.ok(segment);assert.ok(warm.userData.surfaceIds['room:bedroom.wall']);
    const allBack=b.walls.filter(m=>m.userData.floorBoundary?.side==='back');baseline.updateMatrixWorld(true);warm.updateMatrixWorld(true);
    for(let x=-2.7;x<8.3;x+=.2)for(let y=.1;y<2.8;y+=.25){const ray=new THREE.Raycaster(new THREE.Vector3(x,y,0),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObjects(allBack).length>0,ray.intersectObjects(a.walls.filter(m=>m.userData.floorBoundary?.side==='back')).length>0);}
    const next=structuredClone(home);next.rooms.find(r=>r.id==='bedroom').wall={...next.rooms.find(r=>r.id==='bedroom').wall,styleId:'wall-dots',colorId:'wall-lavender'};warm.syncWallFinishes(next);
    assert.ok(b.walls.filter(m=>m.userData.surfaceId==='room:bedroom.wall').every(m=>m.material.map.name==='wall:dots'&&m.material.color.getHexString()==='e1dbe8'));assert.ok(b.walls.filter(m=>m.userData.roomId==='living').every(m=>m.material.map.name==='wall:plain'&&m.material.color.getHexString()==='f4efe6'));
    assert.equal(JSON.stringify(home),before);assert.deepEqual(getWallMountTargets(home),targets);
  }finally{baseline.dispose();warm.dispose();floorTextureManager.dispose();wallTextureManager.dispose();}
});

test('warm bathrooms use plain warmwhite while custom legacy paint remains plain and default/toy allocate no wall pattern',()=>{
  const {createCanvas}=canvasFactory(),wallTextureManager=createHomeWallTextureManager({createCanvas}),floorTextureManager=createHomeFloorTextureManager({createCanvas});
  const room=createRoom('bathroom',1,-1,'bathroom');
  for(const theme of[HOME_THEMES.default,HOME_THEMES.toy]){const model=createRoomExpansion({rooms:[room],theme,wallTextureManager});assert.equal(getWallTextureCacheStats({createCanvas}).canvases,0);model.dispose();}
  const model=createRoomExpansion({rooms:[room],theme:HOME_THEMES.warm,wallTextureManager,floorTextureManager});assert.ok(model.userData.roomParts.walls.length);assert.ok(model.userData.roomParts.walls.every(mesh=>mesh.material.map.name==='wall:plain'&&mesh.material.color.getHexString()==='f4efe6'));
  const custom={...room,wall:{color:'#123456',material:'walnut'}};model.syncWallFinishes({rooms:[custom]});assert.ok(model.userData.roomParts.walls.every(mesh=>mesh.material.map.name==='wall:plain'&&mesh.material.color.getHexString()==='123456'));
  assert.equal(resolveHomeWallFinish('bathroom',custom.wall,{themeId:'warm'}).color,'#123456');model.dispose();floorTextureManager.dispose();wallTextureManager.dispose();assert.equal(getWallTextureCacheStats({createCanvas}).clones,0);
});

test('shared low partitions have separate room-facing targets and neutral caps without extra area or solids',()=>{
  const {createCanvas}=canvasFactory(),wallTextureManager=createHomeWallTextureManager({createCanvas}),floorTextureManager=createHomeFloorTextureManager({createCanvas});
  const bed=createRoom('bedroom',1,-1,'bedroom');bed.wall={...bed.wall,styleId:'wall-stripe-fine',colorId:'wall-mist-blue'};
  const home=createHomeState({profile:'account',rooms:[createRoom('living'),bed],slab:{rects:[{minX:-2.8,minZ:-2.6,width:11.2,depth:5.2}]}}),before=JSON.stringify(home);
  const baseline=createRoomExpansion({...home,theme:HOME_THEMES.default}),warm=createRoomExpansion({...home,theme:HOME_THEMES.warm,wallTextureManager,floorTextureManager});
  try {
    const old=baseline.userData.roomParts.walls,now=warm.userData.roomParts.walls;assert.ok(Math.abs(old.reduce((s,m)=>s+area(m.geometry),0)-now.reduce((s,m)=>s+area(m.geometry),0))<1e-4);
    const bounds=root=>{root.updateMatrixWorld(true);return new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray();};assert.deepEqual(bounds(warm),bounds(baseline));
    const livingRay=new THREE.Raycaster(new THREE.Vector3(1,.5,-1.8),new THREE.Vector3(1,0,0)),bedRay=new THREE.Raycaster(new THREE.Vector3(4,.5,-1.8),new THREE.Vector3(-1,0,0));
    const livingHit=livingRay.intersectObjects(now).find(hit=>hit.object.userData.sharedPartitionAxis),bedHit=bedRay.intersectObjects(now).find(hit=>hit.object.userData.sharedPartitionAxis);
    assert.ok(livingHit);assert.ok(bedHit);assert.equal(livingHit.object.userData.surfaceId,'wall.side');assert.equal(livingHit.object.userData.roomId,'living');assert.equal(bedHit.object.userData.surfaceId,'room:bedroom.wall');assert.equal(bedHit.object.userData.roomId,'bedroom');assert.notEqual(livingHit.object,bedHit.object);
    assert.equal(livingHit.object.material.map.name,'wall:plain');assert.equal(livingHit.object.material.color.getHexString(),'f4efe6');assert.equal(bedHit.object.material.map.name,'wall:stripe-fine');assert.equal(bedHit.object.material.color.getHexString(),'d4dfe7');
    const trims=now.filter(mesh=>mesh.userData.wallNeutralTrim);assert.ok(trims.length);assert.ok(trims.every(mesh=>!mesh.userData.surfaceId&&!mesh.material.map&&mesh.material.color.getHexString()===HOME_THEMES.warm.shell.trim.slice(1)));
    const next=structuredClone(home);next.rooms.find(room=>room.id==='bedroom').wall={...bed.wall,styleId:'wall-dots',colorId:'wall-lavender'};const livingMap=livingHit.object.material.map;warm.syncWallFinishes(next);
    assert.equal(livingHit.object.material.map,livingMap);assert.equal(livingHit.object.material.color.getHexString(),'f4efe6');assert.equal(bedHit.object.material.map.name,'wall:dots');assert.equal(bedHit.object.material.color.getHexString(),'e1dbe8');assert.equal(JSON.stringify(home),before);
  } finally {baseline.dispose();warm.dispose();floorTextureManager.dispose();wallTextureManager.dispose();}
});


test('preserved legacy outer and side walls give added rooms independent outward faces without changing originals',()=>{
  const living=createRoom('living'),behind=createRoom('bedroom',undefined,undefined,'behind',{minX:-2.8,minZ:-5.2,width:2.8,depth:2.6}),behindRight=createRoom('bathroom',undefined,undefined,'behind-right',{minX:0,minZ:-5.2,width:2.8,depth:2.6}),left=createRoom('study',undefined,undefined,'left',{minX:-5.6,minZ:-2.6,width:2.8,depth:5.2});
  const outer=new THREE.Mesh(new THREE.PlaneGeometry(5.6,2.85),new THREE.MeshStandardMaterial());outer.position.set(0,1.46,-2.756);outer.rotation.y=Math.PI;outer.userData={surfaceId:'wall.outer',wallId:'original-outer-id'};
  const side=new THREE.Mesh(new RoundedBoxGeometry(.22,2.95,5.36,3,.065),new THREE.MeshStandardMaterial());side.position.set(-2.81,1.44,-.08);side.userData={surfaceId:'wall.side',wallId:'original-side-id'};
  const sources=[outer,side],groups=[];
  try {
    for(const source of sources) {
      const axis=source===outer?'x':'z',defaultSurfaceId=source===outer?'wall.outer':'wall.side',before=Buffer.from(source.geometry.attributes.position.array.buffer).toString('base64');
      assert.equal(createSharedWallFaceMeshes(source,[living],{axis,rectForRoom:roomRect,defaultSurfaceId}),null,'a single-room reference keeps the exact original mesh');
      const copies=createSharedWallFaceMeshes(source,[living,behind,behindRight,left],{axis,rectForRoom:roomRect,defaultSurfaceId});assert.ok(copies?.length);groups.push(copies);
      const root=new THREE.Group();root.add(...copies);root.updateMatrixWorld(true);assert.ok(Math.abs(copies.reduce((sum,mesh)=>sum+area(mesh.geometry),0)-area(source.geometry))<1e-4);assert.equal(Buffer.from(source.geometry.attributes.position.array.buffer).toString('base64'),before);assert.ok(copies.every(copy=>copy.userData.wallId===source.userData.wallId));
      if(source===outer)for(const[x,id]of[[-1,'behind'],[1,'behind-right']]) {const ray=new THREE.Raycaster(new THREE.Vector3(x,1.2,-3.5),new THREE.Vector3(0,0,1)),hit=ray.intersectObjects(copies)[0];assert.ok(hit);assert.equal(hit.object.userData.surfaceId,`room:${id}.wall`);assert.equal(hit.object.userData.roomId,id);}
      else {const inside=new THREE.Raycaster(new THREE.Vector3(-2,1.2,0),new THREE.Vector3(-1,0,0)).intersectObjects(copies)[0],outside=new THREE.Raycaster(new THREE.Vector3(-4,1.2,0),new THREE.Vector3(1,0,0)).intersectObjects(copies)[0];assert.equal(inside.object.userData.surfaceId,'wall.side');assert.equal(inside.object.userData.roomId,'living');assert.equal(outside.object.userData.surfaceId,'room:left.wall');assert.equal(outside.object.userData.roomId,'left');assert.ok(copies.filter(copy=>copy.userData.wallFace==='trim').every(copy=>!copy.userData.surfaceId));}
    }
  }finally{for(const mesh of[...sources,...groups.flat()]){mesh.geometry.dispose();mesh.material.dispose();}}
});
