import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {captureRoamPhotometry,projectReviewPoint} from '../scripts/qa/roam-review-photometry.mjs';

test('photometry masks preserve scalar materials on ungrouped geometry and restore all rendering ownership',()=>{
  const scene=new THREE.Scene(),wall=new THREE.Mesh(new THREE.PlaneGeometry(4,3),new THREE.MeshStandardMaterial({color:'#f4efe6'}));scene.add(wall);
  const camera=new THREE.PerspectiveCamera(68,1440/900,.05,400);camera.position.set(0,1.45,4);camera.lookAt(0,1.45,0);camera.updateMatrixWorld(true);
  const material=wall.material,geometry=wall.geometry;let rendered=0;
  const context={fillStyle:null,fillRect(){},drawImage(){}},doc={createElement:()=>({width:0,height:0,getContext:()=>context,toDataURL:()=> 'data:image/png;base64,QA'})};
  const renderer={domElement:{width:1440,height:900,ownerDocument:doc},toneMapping:THREE.NeutralToneMapping,shadowMap:{enabled:true},render(s){rendered++;assert.equal(s,scene);assert.equal(Array.isArray(wall.material),false,'scalar meshes with no geometry groups must still draw in the mask pass');assert.equal(wall.material.isMeshBasicMaterial,true);}};
  const experience={scene,renderer,controller:{camera,getCameraPose:()=>({position:camera.position.toArray()})},model:{architecture:{getRoamWalls:()=>[wall]},entrance:{width:1.16,height:1.76,bottom:.08,wallCenter:new THREE.Vector3(),outward:new THREE.Vector3(0,0,1),leaf:null}},interactions:{getTargets:()=>[]},renderNow(){}};
  const result=captureRoamPhotometry(experience);assert.equal(rendered,3);assert.ok(result.masks['door-aperture']);assert.ok(result.masks['interior-walls-and-door']);assert.ok(result.metadata.regions.doorAperture.polygon.length>20);assert.equal(wall.material,material);assert.equal(wall.geometry,geometry);assert.equal(renderer.shadowMap.enabled,true);assert.equal(renderer.toneMapping,THREE.NeutralToneMapping);assert.equal(scene.children.length,1);
  const center=projectReviewPoint(new THREE.Vector3(0,1.45,0),camera);assert.ok(Math.abs(center[0]-720)<1e-8&&Math.abs(center[1]-450)<1e-8);geometry.dispose();material.dispose();
});
