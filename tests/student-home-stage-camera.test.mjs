import test from 'node:test';
import assert from 'node:assert/strict';
import {createStageCamera} from '../public/js/student-home-stage-camera.js';

const initial={pan:{x:3,y:.4,z:-2},zoom:.9,angle:.7};
const stage={active:true,requested:true,point:{x:1,y:.08,z:2},time:0,storey:0};
const clone=value=>structuredClone(value);
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} ≠ ${expected}`);
function setup(options={}){
  let value=clone(initial),frames=0,applications=0;const changes=[];
  const camera=createStageCamera({getPose:()=>clone(value),applyPose:next=>{value=clone(next);applications++;},focusPose:(point,angle)=>({pan:{x:point.x+Math.sin(angle),y:point.y+1,z:point.z+Math.cos(angle)},zoom:2.2}),onChange:state=>changes.push(state),requestRender:()=>frames++,...options});
  return{camera,changes,get pose(){return clone(value);},get frames(){return frames;},get applications(){return applications;},setPose:next=>{value=clone(next);}};
}

test('dance entrance starts at the current view and smoothly focuses, without cut or unbounded orbit',()=>{
  const x=setup();assert.equal(x.camera.update(stage,0),true);assert.deepEqual(x.pose,initial);
  x.camera.update(stage,800);assert.ok(x.pose.zoom>initial.zoom&&x.pose.zoom<2.2);
  x.camera.update(stage,1600);close(x.pose.zoom,2.2);close(x.pose.angle,initial.angle);
  x.camera.update(stage,1601);assert.ok(Math.abs(x.pose.angle-initial.angle)<1e-7,'orbit starts with zero velocity');
  for(let t=1700;t<60000;t+=123){x.camera.update(stage,t);assert.ok(Math.abs(x.pose.angle-initial.angle)<=.100001);assert.ok(x.pose.zoom<=2.2);assert.ok(x.pose.zoom>=2.2*.959999);}
  assert.equal(x.camera.getState().active,true);assert.equal(x.changes.length,1,'frames do not refresh semantic UI');x.camera.dispose();
});

test('manual camera exit freezes the view and does not restart during the same dance',()=>{
  const x=setup();x.camera.update(stage,0);x.camera.update(stage,5000);const atExit=x.pose;
  x.camera.exit({restore:false});assert.deepEqual(x.pose,atExit);assert.equal(x.camera.getState().suppressed,true);const count=x.applications,frames=x.frames;
  for(const t of[5001,6000,15000])assert.equal(x.camera.update({...stage,time:t/1000},t),false);
  assert.deepEqual(x.pose,atExit);assert.equal(x.applications,count);assert.equal(x.frames,frames);assert.equal(x.camera.getState().available,true);
  x.camera.update({active:false,requested:false},16000);assert.equal(x.camera.getState().suppressed,false);
  x.camera.update(stage,17000);assert.equal(x.camera.getState().active,true);assert.deepEqual(x.pose,atExit,'next performance begins at the manually chosen view');x.camera.dispose();
});

test('exit before any dance cannot suppress the first performance',()=>{
  const x=setup();x.camera.exit({restore:false});assert.equal(x.camera.getState().suppressed,false);x.camera.update(stage,100);assert.equal(x.camera.getState().active,true);x.camera.dispose();
});

test('restoring exit returns smoothly and stays out while robot continues dancing',()=>{
  const x=setup();x.camera.update(stage,0);x.camera.update(stage,6000);const before=x.pose;
  x.camera.exit();assert.equal(x.camera.getState().returning,true);assert.deepEqual(x.pose,before);
  x.camera.update(stage,10000);assert.deepEqual(x.pose,before,'first return frame anchors its own clock');
  x.camera.update(stage,10325);assert.ok(x.pose.zoom>initial.zoom&&x.pose.zoom<before.zoom);
  x.camera.update(stage,10650);assert.deepEqual(x.pose,initial);assert.equal(x.camera.getState().returning,false);assert.equal(x.camera.getState().suppressed,true);
  const calls=x.applications;assert.equal(x.camera.update(stage,12000),false);assert.equal(x.applications,calls);x.camera.dispose();
});

test('natural dance completion restores origin, never re-enters during return, and terminates rendering',()=>{
  const x=setup();x.camera.update(stage,0);x.camera.update(stage,5000);const before=x.pose;
  assert.equal(x.camera.update({active:false,requested:false},5100),true);assert.deepEqual(x.pose,before);
  x.camera.update({active:false,requested:false},5750);assert.deepEqual(x.pose,initial);assert.equal(x.camera.getState().active,false);
  const calls=x.applications,frames=x.frames;assert.equal(x.camera.update({active:false,requested:false},6000),false);assert.equal(x.applications,calls);assert.equal(x.frames,frames);x.camera.dispose();
});

test('resume permits follow again and resumes a return without a jump',()=>{
  const x=setup();assert.equal(x.camera.resume(),false);x.camera.update(stage,0);x.camera.update(stage,5000);x.camera.exit();x.camera.update(stage,5100);x.camera.update(stage,5300);const halfway=x.pose;
  assert.equal(x.camera.resume(),true);x.camera.update(stage,5400);assert.deepEqual(x.pose,halfway);assert.equal(x.camera.getState().active,true);assert.equal(x.camera.getState().suppressed,false);
  x.camera.update(stage,7000);x.camera.exit();x.camera.update(stage,7100);x.camera.update(stage,7750);assert.deepEqual(x.pose,initial,'return target is the original pre-performance view');x.camera.dispose();
});

test('student/floor reset restores immediately, clears suppression and releases old focus',()=>{
  const x=setup();x.camera.update(stage,0);x.camera.update(stage,700);x.camera.reset();assert.deepEqual(x.pose,initial);assert.deepEqual(x.camera.getState(),{active:false,returning:false,available:false,suppressed:false});
  const other={pan:{x:-9,y:2,z:4},zoom:1.4,angle:2.5};x.setPose(other);x.camera.update({...stage,storey:1,point:{x:-8,y:4,z:5}},1000);assert.deepEqual(x.pose,other);x.camera.update({...stage,storey:1,point:{x:-8,y:4,z:5}},3000);x.camera.reset();assert.deepEqual(x.pose,other);x.camera.dispose();
});

test('reduced motion applies one static focus only, with no render loop or orbit',()=>{
  const x=setup({reducedMotion:true});assert.equal(x.camera.update(stage,0),false);close(x.pose.zoom,2.2);const focused=x.pose,calls=x.applications,frames=x.frames;
  for(let t=20;t<10000;t+=20)assert.equal(x.camera.update(stage,t),false);
  assert.equal(x.applications,calls);assert.equal(x.frames,frames);assert.deepEqual(x.pose,focused);assert.equal(x.changes.length,1);
  x.camera.exit();assert.deepEqual(x.pose,initial);const after=x.applications;assert.equal(x.camera.update(stage,12000),false);assert.equal(x.applications,after);x.camera.dispose();
});

test('absolute time produces the same view at different frame rates and skipped frames',()=>{
  const slow=setup(),fast=setup(),jump=setup();for(const x of[slow,fast,jump])x.camera.update(stage,0);
  for(let t=100;t<8400;t+=100)slow.camera.update(stage,t);for(let t=16;t<8400;t+=16)fast.camera.update(stage,t);
  for(const x of[slow,fast,jump])x.camera.update(stage,8400);
  assert.deepEqual(slow.pose,fast.pose);assert.deepEqual(slow.pose,jump.pose);for(const x of[slow,fast,jump])x.camera.dispose();
});

test('dispose restores origin once, rejects later work, and never requests another frame',()=>{
  const x=setup();x.camera.update(stage,0);x.camera.update(stage,2000);x.camera.dispose();assert.deepEqual(x.pose,initial);const frames=x.frames,calls=x.applications;
  x.camera.dispose();x.camera.exit();x.camera.resume();x.camera.reset();assert.equal(x.camera.update(stage,3000),false);assert.equal(x.frames,frames);assert.equal(x.applications,calls);
});

test('breathing never exceeds the bounded focus zoom used by manual controls',()=>{
  const x=setup({focusPose:()=>({pan:{x:0,y:1,z:0},zoom:3.5})});x.camera.update(stage,0);
  for(let t=1600;t<43000;t+=50){x.camera.update(stage,t);assert.ok(x.pose.zoom<=3.5);assert.ok(x.pose.zoom>=3.5*.96);}
  x.camera.exit({restore:false});assert.ok(x.pose.zoom<=3.5);x.camera.dispose();
});

test('a new dance waits for the prior return, then schedules its own entrance',()=>{
  const x=setup();x.camera.update(stage,0);x.camera.update(stage,5000);x.camera.update({active:false,requested:false},5100);
  x.camera.update(stage,5300);assert.equal(x.camera.getState().returning,true);assert.equal(x.camera.getState().active,false);
  assert.equal(x.camera.update(stage,5750),true);assert.deepEqual(x.pose,initial);assert.equal(x.camera.getState().returning,false);
  x.camera.update(stage,5766);assert.equal(x.camera.getState().active,true);assert.deepEqual(x.pose,initial);x.camera.dispose();
});
