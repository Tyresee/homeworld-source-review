import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createStageFraming} from '../public/js/student-home-stage-framing.js';
import {frameHomeCamera} from '../public/js/home-scene-framing.js';

test('dance framing centers the chest at different room sizes, angles and viewport shapes',()=>{
  const focus=createStageFraming();
  for(const width of[500,1600])for(const angle of[.6,.85,2.2])for(const size of[6,28]){
    const height=900,bounds=new THREE.Box3(new THREE.Vector3(-3,-.5,-2),new THREE.Vector3(size,3,size)),point={x:2,y:.08,z:1};
    const pose=focus({bounds,width,height,point,angle}),camera=new THREE.OrthographicCamera();
    frameHomeCamera(camera,bounds,{width,height,angle,zoom:pose.zoom,padding:1.15,centerOffset:new THREE.Vector3(pose.pan.x,0,pose.pan.z)});
    const screen=new THREE.Vector3(point.x,point.y+.55,point.z).project(camera);
    assert.ok(Math.abs(screen.x+.12)<1e-9);assert.ok(Math.abs(screen.y)<1e-9);
    assert.ok(screen.z>=-1&&screen.z<=1);assert.ok(pose.zoom>=.6&&pose.zoom<=3.5);
    assert.equal(pose.pan.y,0,'manual ground drag resumes in the same coordinate system');
  }
});
