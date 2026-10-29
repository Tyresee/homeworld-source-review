import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createEstateManor } from '../public/js/home-estate-manor.js';
import { createWarmGableRoof } from '../public/js/home-roof-gable.js';
import { createRoom, getFloorBounds } from '../public/js/home-layout.js';
import { WALL_HEIGHT } from '../public/js/home-room-expansion.js';
import { STOREY_HEIGHT } from '../public/js/home-staircase.js';

const ROOF_STYLE = 'warm-terracotta-gable';
const meshes = object => { const values=[]; object.traverse(node=>{if(node.isMesh)values.push(node);}); return values; };
const roofs = object => { const values=[]; object.traverse(node=>{if(node.isGroup&&node.userData.buildingPart==='roof')values.push(node);}); return values; };
const near = (actual,expected,message) => assert.ok(Math.abs(actual-expected)<1e-5,`${message}: ${actual} != ${expected}`);
const starter = () => ({rooms:[createRoom('living')]});
const emptyFloor = rects => ({profile:'upper',rooms:[],slab:{rects}});
function geometrySignature(object) {
  return meshes(object).map(mesh=>{
    const hash=createHash('sha256');
    for(const name of ['position','normal'])hash.update(Buffer.from(mesh.geometry.attributes[name].array.buffer));
    return `${mesh.material.color.getHexString()}:${hash.digest('hex')}`;
  }).sort();
}
function resourceEvents(object) {
  const resources=new Set(meshes(object).flatMap(mesh=>[mesh.geometry,...(Array.isArray(mesh.material)?mesh.material:[mesh.material])]));
  const counts=new Map([...resources].map(resource=>[resource,0]));
  for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));
  return counts;
}
function assertDisposedOnce(counts) { for(const value of counts.values())assert.equal(value,1,'each retired GPU resource is disposed exactly once'); }
function assertSoundGeometry(object) {
  for(const mesh of meshes(object)) {
    const {position,normal}=mesh.geometry.attributes;
    assert.equal(normal.count,position.count);
    for(const value of position.array)assert.ok(Number.isFinite(value),'all positions are finite');
    for(let index=0;index<normal.count;index++) {
      const length=Math.hypot(normal.getX(index),normal.getY(index),normal.getZ(index));
      assert.ok(Number.isFinite(length)&&Math.abs(length-1)<.001,'unit normals prevent broken tile shading');
    }
  }
}

test('the formal starter uses the selected A gable proportions and shared roof geometry',()=>{
  const manor=createEstateManor({floors:[starter()]}),actual=roofs(manor);
  assert.equal(actual.length,1);
  const roof=actual[0];
  assert.equal(roof.userData.roofStyle,ROOF_STYLE);
  near(roof.position.y,WALL_HEIGHT+.08,'gable sits on the real wall ceiling');
  near(roof.userData.roofDimensions.width,5.96,'A width includes only a modest eave');
  near(roof.userData.roofDimensions.depth,5.56,'A depth includes only a modest eave');
  near(roof.userData.roofDimensions.height,1.248,'A remains a low-pitched roof');
  const reference=createWarmGableRoof({width:5.96,depth:5.56,height:1.248});
  assert.deepEqual(geometrySignature(roof),geometrySignature(reference),'formal integration must not substitute the former hip roof');
  const size=new THREE.Box3().setFromObject(roof).getSize(new THREE.Vector3());
  assert.ok(size.y<1.65&&size.x>5.9&&size.z>5.5,'readable wide roof, including its thick cream eave and ridge cap, without a phantom attic');
  assert.ok(meshes(roof).every(mesh=>mesh.userData.buildingPart==='roof'&&mesh.userData.estateFeature==='manor'),'raycasting keeps formal home identity');
  manor.dispose();reference.dispose();
});

test('rounded A tiles remain batched, well shaded and bounded at starter and expanded sizes',()=>{
  for(const dimensions of [{width:5.96,depth:5.56,height:1.248},{width:24,depth:18,height:1.34},{width:.24,depth:.36,height:.06}]) {
    const model=createWarmGableRoof(dimensions),values=meshes(model);
    assert.equal(model.userData.roofStyle,ROOF_STYLE);
    assert.ok(values.length<=10,'each tile must not add an individual draw call');
    const triangles=values.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3,0);
    assert.ok(triangles<150000,'even a large contiguous extension stays within a bounded roof geometry budget');
    assertSoundGeometry(model);
    const bounds=new THREE.Box3().setFromObject(model);
    assert.ok(bounds.max.y<dimensions.height+.22,'caps do not turn into a second storey');
    const resources=resourceEvents(model);model.dispose();model.dispose();assertDisposedOnce(resources);
  }
});

test('A roofs follow an L-shaped room plan and an independently purchased L-shaped slab',()=>{
  const ground={rooms:[createRoom('living'),createRoom('study',1,-1,'east'),createRoom('bedroom',-1,1,'south')]};
  const upper=emptyFloor([{minX:-2.8,minZ:-2.6,width:11.2,depth:5.2},{minX:-2.8,minZ:2.6,width:5.6,depth:5.2}]);
  for(const floors of [[ground],[ground,upper]]) {
    const manor=createEstateManor({floors}),bounds=getFloorBounds(ground),values=roofs(manor);
    assert.ok(values.length>=2);
    assert.ok(values.every(roof=>roof.userData.roofStyle===ROOF_STYLE&&roof.userData.storey===floors.length-1),'only exposed purchased levels receive a roof');
    manor.updateMatrixWorld(true);
    for(const x of [3.4,5.6,7.8])for(const z of [3.2,5.2,7.2]) {
      const ray=new THREE.Raycaster(new THREE.Vector3(x-bounds.x,20,z-bounds.z),new THREE.Vector3(0,-1,0));
      assert.equal(ray.intersectObjects(values,true).length,0,'roof tiles cannot bridge an unbuilt courtyard');
    }
    manor.dispose();
  }
});

test('a precisely sized upper storey cuts lower A tiles, trim and ridge before its walls',()=>{
  const ground=starter();
  // Fractional room widths exercise real purchased area, rather than touched grid cells.
  for(const width of [3.2,5.2]) {
    const upper=emptyFloor([{minX:-2.8,minZ:-2.6,width,depth:5.2}]);
    const manor=createEstateManor({floors:[ground,upper]});
    const lowerRoofs=roofs(manor).filter(roof=>roof.userData.storey===0);
    assert.equal(lowerRoofs.length,1,'the exposed strip retains its roof');
    const upperWalls=meshes(manor).filter(mesh=>mesh.userData.storey===1&&mesh.userData.buildingPart==='shell-volume');
    assert.ok(upperWalls.length>0);
    for(const roof of lowerRoofs)for(const wall of upperWalls) {
      assert.equal(new THREE.Box3().setFromObject(roof).intersectsBox(new THREE.Box3().setFromObject(wall)),false,'including tiles and eaves, no lower roof penetrates an upper room');
    }
    assert.ok(roofs(manor).filter(roof=>roof.userData.storey===1).every(roof=>roof.position.y>=STOREY_HEIGHT+WALL_HEIGHT));
    assertSoundGeometry(manor);manor.dispose();
  }
});

test('repainting and rebuilding A releases old tile resources and keeps the saved roof color',()=>{
  const manor=createEstateManor({floors:[starter()],color:'#e05d7b'});
  for(const floors of [[starter(),starter()],[starter()]]) {
    const previous=resourceEvents(manor);
    manor.setFloors(floors);
    assertDisposedOnce(previous);
    assert.equal(manor.getCustomization().color,'#e05d7b');
    assert.ok(roofs(manor).every(roof=>roof.userData.roofStyle===ROOF_STYLE));
  }
  const previous=resourceEvents(manor),before=geometrySignature(roofs(manor)[0]);
  manor.setCustomization({color:'#497ca9'});assertDisposedOnce(previous);
  assert.notDeepEqual(geometrySignature(roofs(manor)[0]),before,'painting changes the tile palette');
  assert.equal(manor.getCustomization().color,'#497ca9');
  assert.ok(manor.userData.paintMaterials.roof.length>0,'formal paint feedback can identify the new tile materials');
  const finalResources=resourceEvents(manor);manor.dispose();manor.dispose();assertDisposedOnce(finalResources);
});
