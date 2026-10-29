import * as THREE from 'three';
import {sampleRobotDance} from './student-home-robot-dance.js';

/** Rigid-part animation for the Blender robot, independent of home saves and commerce. */
export const ROBOT_ACTIONS = Object.freeze(['idle', 'walk', 'wave', 'sit', 'lie', 'read', 'cook', 'wash', 'stairs', 'swim', 'dishwash']);
export const ROBOT_EXPRESSIONS = Object.freeze(['smile', 'happy', 'focused', 'sleepy', 'wink']);
const instances = new WeakMap();
const TV_LEAN_AXIS=new THREE.Vector3(1,0,0);
const REQUIRED = [
  'RobotRoot', 'PoseRoot', 'HipRoot', 'Torso', 'Head', 'Backpack', 'EyeL', 'EyeR', 'Mouth',
  'ShoulderL', 'ShoulderR', 'ElbowL', 'ElbowR', 'WristL', 'WristR',
  'HipL', 'HipR', 'KneeL', 'KneeR', 'AnkleL', 'AnkleR', 'SeatContact',
];
const JOINTS = ['HipRoot', 'Torso', 'Head', 'ShoulderL', 'ShoulderR', 'ElbowL', 'ElbowR',
  'WristL', 'WristR', 'HipL', 'HipR', 'KneeL', 'KneeR', 'AnkleL', 'AnkleR'];
const coordinates = box => ({ min:box.min.toArray(), max:box.max.toArray(), size:box.getSize(new THREE.Vector3()).toArray() });
const visible = (node, root) => {
  for (let n=node; n&&n!==root; n=n.parent) if (!n.visible) return false;
  return true;
};
function stateFor(model) {
  const state=instances.get(model);
  if (!state || state.disposed) throw new TypeError('Expected a live robot created by createRobotAvatar.');
  return state;
}

/** Exact rendered-vertex bounds in model-local space. Used for calibration and explicit
 * measurements; animation checks only cached foot meshes, never the whole model. */
function boundsOf(state, meshes=state.meshes) {
  state.model.updateWorldMatrix(true, true);
  state.inverse.copy(state.model.matrixWorld).invert();
  state.box.makeEmpty();
  for (const mesh of meshes) {
    if (!visible(mesh,state.model)) continue;
    const positions=mesh.geometry.getAttribute('position');
    if (!positions) continue;
    state.matrix.multiplyMatrices(state.inverse,mesh.matrixWorld);
    for (let i=0; i<positions.count; i++) {
      state.vertex.fromBufferAttribute(positions,i).applyMatrix4(state.matrix);
      state.box.expandByPoint(state.vertex);
    }
  }
  return state.box;
}
function localPoint(state, node) {
  state.model.updateWorldMatrix(true,true);
  state.inverse.copy(state.model.matrixWorld).invert();
  return node.getWorldPosition(state.point).applyMatrix4(state.inverse);
}
function delta(state,name,x=0,y=0,z=0) {
  const node=state.nodes[name],rest=state.rest.get(node);
  state.euler.set(x,y,z);
  state.quaternion.setFromEuler(state.euler);
  node.quaternion.copy(rest.quaternion).multiply(state.quaternion);
}
function applyExpression(state,blink=1) {
  let left=1,right=1,mouthX=1,mouthY=1;
  switch (state.expression) {
    case 'happy': left=.67;right=.67;mouthX=1.12;mouthY=1.15;break;
    case 'focused': left=.58;right=.58;mouthX=.7;mouthY=.18;break;
    case 'sleepy': left=.10;right=.10;mouthX=.65;mouthY=.22;break;
    case 'wink': left=.10;break;
  }
  for (const [name,factor] of [['EyeL',left*blink],['EyeR',right*blink]]) {
    const node=state.nodes[name];node.scale.copy(state.faceRest.get(node)).y*=factor;
  }
  const mouth=state.nodes.Mouth;mouth.scale.copy(state.faceRest.get(mouth));mouth.scale.x*=mouthX;mouth.scale.y*=mouthY;
}

/** The caller owns the loaded source's geometries/textures. Instances borrow those
 * immutable resources and own a clone of each material; no source transform changes. */
export function createRobotAvatar(gltfScene) {
  if (!gltfScene?.isObject3D) throw new TypeError('createRobotAvatar needs a loaded glTF scene.');
  const sourceNodes=new Map();
  gltfScene.traverse(node=>{
    if(node.isSkinnedMesh)throw new TypeError('The rigid robot must not contain skinned meshes.');
    if(REQUIRED.includes(node.name)){
      if(sourceNodes.has(node.name))throw new Error(`Duplicate robot node: ${node.name}`);
      sourceNodes.set(node.name,node);
    }
  });
  const missing=REQUIRED.filter(name=>!sourceNodes.has(name));
  if(missing.length)throw new Error(`Robot asset is missing nodes: ${missing.join(', ')}`);

  const model=new THREE.Group();model.name='robot-avatar';
  const motion=new THREE.Group();motion.name='robot-runtime-pose';model.add(motion);
  const asset=gltfScene.clone(true);motion.add(asset);
  const nodes=Object.fromEntries(REQUIRED.map(name=>[name,asset.getObjectByName(name)]));
  const materials=new Map(),meshes=[];
  asset.traverse(node=>{
    if(!node.isMesh)return;
    meshes.push(node);
    const clone=source=>{if(!materials.has(source))materials.set(source,source.clone());return materials.get(source);};
    node.material=Array.isArray(node.material)?node.material.map(clone):clone(node.material);
    node.userData={...node.userData,robotAvatar:true};
  });
  const footMeshes=[],torsoMeshes=[],seatSupportMeshes=[];
  for(const name of ['AnkleL','AnkleR'])nodes[name].traverse(node=>{if(node.isMesh)footMeshes.push(node);});
  // Torso includes the head and backpack; only the body shell is used as a backrest bound.
  for(const mesh of meshes){
    let n=mesh,underTorso=false,excluded=false;
    while(n&&n!==asset){if(n===nodes.Head||n===nodes.Backpack)excluded=true;if(n===nodes.Torso)underTorso=true;n=n.parent;}
    if(underTorso&&!excluded)torsoMeshes.push(mesh);
  }
  for(const name of ['HipL','HipR'])for(const child of nodes[name].children)if(child.isMesh)seatSupportMeshes.push(child);
  const torsoShell=asset.getObjectByName('TorsoShell');
  if(torsoShell?.isMesh)seatSupportMeshes.push(torsoShell);
  if(!footMeshes.length||!torsoMeshes.length||!torsoShell?.isMesh||seatSupportMeshes.length<3){for(const m of materials.values())m.dispose();throw new Error('Robot must contain foot, torso and seated-support meshes.');}
  const rest=new Map(JOINTS.map(name=>{const n=nodes[name];return[n,{position:n.position.clone(),quaternion:n.quaternion.clone(),scale:n.scale.clone()}];}));
  const state={model,motion,asset,nodes,meshes,footMeshes,torsoMeshes,seatSupportMeshes,materials,rest,
    faceRest:new Map(['EyeL','EyeR','Mouth'].map(name=>[nodes[name],nodes[name].scale.clone()])),
    action:'idle',expression:'smile',backpackWanted:true,disposed:false,time:0,standingLift:0,lieLift:null,sitTranslation:null,
    inverse:new THREE.Matrix4(),matrix:new THREE.Matrix4(),box:new THREE.Box3(),vertex:new THREE.Vector3(),point:new THREE.Vector3(),
    euler:new THREE.Euler(),quaternion:new THREE.Quaternion(),standingBounds:null,navigation:null};
  state.blendNodes=[motion,...rest.keys()];
  state.blendStart=state.blendNodes.map(()=>({position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),targetQuaternion:new THREE.Quaternion(),scale:new THREE.Vector3()}));
  state.fastBox=new THREE.Box3();state.fastPartBox=new THREE.Box3();state.blendContact=new THREE.Vector3();state.blendDesired=new THREE.Vector3();
  instances.set(model,state);
  state.waveSide=Math.sign(localPoint(state,nodes.ShoulderR).x)||1;
  state.standingLift=-boundsOf(state,footMeshes).min.y;
  poseRobotAvatar(model);
  state.swimPivot=localPoint(state,nodes.HipRoot).clone();
  state.swimRotatedPivot=new THREE.Vector3();
  state.standingBounds=coordinates(boundsOf(state));
  const size=state.standingBounds.size;
  state.navigation={radius:0,height:size[1],width:size[0],depth:size[2]};
  // Include an entire sampled walking cycle plus 2 cm clearance. This calibration
  // runs once when the asset instance is created, never on a rendering hot path.
  const swept=new THREE.Box3();
  for(let sample=0;sample<=32;sample++){
    poseRobotAvatar(model,{action:sample?'walk':'idle',time:sample?((sample-1)/32)*Math.PI*2/6.8:0});
    swept.union(boundsOf(state));
    state.inverse.copy(model.matrixWorld).invert();
    for(const mesh of meshes){
      if(!visible(mesh,model))continue;
      const p=mesh.geometry.getAttribute('position');state.matrix.multiplyMatrices(state.inverse,mesh.matrixWorld);
      for(let i=0;i<p.count;i++){state.vertex.fromBufferAttribute(p,i).applyMatrix4(state.matrix);state.navigation.radius=Math.max(state.navigation.radius,Math.hypot(state.vertex.x,state.vertex.z));}
    }
  }
  const sweptSize=swept.getSize(new THREE.Vector3());
  state.navigation={radius:state.navigation.radius+.02,height:swept.max.y+.02,width:sweptSize.x+.04,depth:sweptSize.z+.04,clearance:.02,walkSamples:32};
  poseRobotAvatar(model);
  model.userData={robotAvatar:true,action:'idle',origin:'feet',forward:'+z',units:'meters',height:size[1],radius:state.navigation.radius,resourceOwnership:'borrowed geometry/textures; owned materials'};
  return model;
}

/** Deterministic in-place pose; callers own clocks, visibility scheduling and locomotion. */
export function poseRobotAvatar(model,{action='idle',time=0,tuck=0,swimBlend=1}={}) {
  const state=stateFor(model);
  if(!ROBOT_ACTIONS.includes(action))throw new RangeError(`Unknown robot action: ${action}`);
  time=Number.isFinite(time)?Math.max(0,time):0;
  state.action=action;state.time=time;
  const {motion,nodes}=state;
  motion.position.set(0,state.standingLift,0);motion.quaternion.identity();motion.scale.set(1,1,1);
  for(const [node,rest] of state.rest){node.position.copy(rest.position);node.quaternion.copy(rest.quaternion);node.scale.copy(rest.scale);}
  nodes.Backpack.visible=state.backpackWanted&&!['sit','lie'].includes(action);
  if(action==='walk'||action==='stairs') {
    const beat=Math.sin(time*6.8);
    for(const [side,sign] of [['L',-1],['R',1]]){
      delta(state,`Hip${side}`,sign*beat*(action==='stairs'?.64:.45));
      delta(state,`Knee${side}`,Math.max(0,-sign*beat)*(action==='stairs'?.95:.58));
      delta(state,`Shoulder${side}`,-sign*beat*.38);
      delta(state,`Elbow${side}`,-.10-Math.max(0,sign*beat)*.10);
    }
    delta(state,'Head',0,Math.sin(time*3.4)*.025,Math.sin(time*6.8)*.012);
    motion.position.y-=boundsOf(state,state.footMeshes).min.y;
  } else if(action==='swim') {
    // The root remains the caller's navigation transform. At full immersion its
    // origin is the torso waterline; turning toward a lane never changes that
    // contract. The hip pivot descends smoothly while the body pitches forward.
    const blend=THREE.MathUtils.clamp(Number.isFinite(swimBlend)?swimBlend:1,0,1);
    const cycle=time*Math.PI,roll=Math.sin(cycle)*.035*blend;
    motion.rotation.set(Math.PI/2*blend,0,roll);
    const pivot=state.swimPivot??state.rest.get(nodes.HipRoot).position;
    state.swimRotatedPivot.copy(pivot).applyQuaternion(motion.quaternion);
    motion.position.set(-state.swimRotatedPivot.x,
      pivot.y*(1-blend)+Math.sin(cycle*2)*.012*blend-state.swimRotatedPivot.y,
      -state.swimRotatedPivot.z);
    delta(state,'Torso',-.20*blend);
    delta(state,'Head',-1.42*blend,Math.sin(cycle)*.045*blend,0);
    for(const [side,offset]of[['L',0],['R',Math.PI]]){
      const phase=cycle+offset,outward=Math.sign(state.rest.get(nodes[`Shoulder${side}`]).position.x)||1;
      // Bounded shoulder sweeps are deliberate: multiplying accumulated Euler
      // revolutions by an exit blend would violently unwind a long swim. The
      // alternating reach/pull/recovery still moves hands through and above the
      // water, while any phase can now settle smoothly back to standing.
      delta(state,`Shoulder${side}`,(-1.05-1.90*Math.cos(phase))*blend,0,
        outward*(.24+.17*Math.sin(phase))*blend);
      delta(state,`Elbow${side}`,(-.20-.35*(.5+.5*Math.cos(phase)))*blend);
      delta(state,`Wrist${side}`,-.12*blend,0,Math.sin(phase)*.08*blend);
      const kick=Math.sin(cycle*2+offset);
      delta(state,`Hip${side}`,kick*.23*blend,0,outward*.035*blend);
      delta(state,`Knee${side}`,Math.max(0,-kick)*.28*blend);
      delta(state,`Ankle${side}`,(-.18-kick*.08)*blend);
    }
  } else if(action==='wave') {
    delta(state,'ShoulderR',-.15,0,state.waveSide*2.05);
    delta(state,'ElbowR',0,0,state.waveSide*(.30+Math.sin(time*6)*.26));
    delta(state,'WristR',0,Math.sin(time*6)*.10,0);
    delta(state,'Head',0,.07,-.06);
  } else if(action==='sit') {
    for(const side of ['L','R']){
      delta(state,`Hip${side}`,-Math.PI/2);
      delta(state,`Knee${side}`,Math.PI/2);
      // Let the upper arms hang; fold forearms back toward the outer thighs.
      // Derive the inward direction from the authored shoulder, not a left/right convention.
      const outward=Math.sign(state.rest.get(nodes[`Shoulder${side}`]).position.x)||1;
      delta(state,`Shoulder${side}`,0,0,-outward*.25);
      delta(state,`Elbow${side}`,-1.20);
    }
    motion.position.set(0,0,0);
    if(!state.sitTranslation){
      const seat=localPoint(state,nodes.SeatContact),seatX=seat.x,seatZ=seat.z;
      // The authored marker is the torso-shell bottom, not the rotated thigh backs.
      // Measure real supporting geometry once instead of sinking shells into a cushion.
      const supportY=boundsOf(state,state.seatSupportMeshes).min.y;
      state.sitTranslation=new THREE.Vector3(-seatX,-supportY,-seatZ);
    }
    motion.position.copy(state.sitTranslation);
    // Lifting both bent legs before swivelling onto a bed clears its side rail.
    const folded=Math.max(0,Math.min(1,Number(tuck)||0));
    if(folded)for(const side of ['L','R']){
      delta(state,`Hip${side}`,-Math.PI/2-folded*.50);
      delta(state,`Knee${side}`,Math.PI/2-folded*1.02);
    }
  } else if(action==='dishwash') {
    const press=Math.sin(Math.max(0,Math.min(1,time/.8,(5-time)/.8))*Math.PI/2),beat=(1-Math.cos(time*3.6))*.5;
    delta(state,'ShoulderR',-1.00*press,0,-.05*press);
    delta(state,'ElbowR',(-.30-beat*.12)*press);
    delta(state,'WristR',-.10*press);delta(state,'Head',.17*press,-.08*press,0);
    delta(state,'ShoulderL',-.12*press,0,.10*press);delta(state,'ElbowL',-.35*press);
  } else if(['read','cook','wash'].includes(action)) {
    // Both arms reach in front of the torso. The rig is authored in meters;
    // gestures operate the real shoulder/elbow chain, not a prop-only animation.
    for(const side of ['L','R']) {
      const outward=Math.sign(state.rest.get(nodes[`Shoulder${side}`]).position.x)||1;
      const beat=Math.sin(time*(action==='wash'?7:3.6)+(side==='L'?0:Math.PI));
      const inward=action==='wash'?.65:action==='cook'?(side==='R'?.60:.20):0;
      delta(state,`Shoulder${side}`,-.72+(action==='read'?0:beat*.13),-outward*inward,-outward*.20);
      delta(state,`Elbow${side}`,-.98+(action==='cook'&&side==='R'?Math.cos(time*3.6)*.25:action==='wash'?beat*.20:0));
      delta(state,`Wrist${side}`,0,action==='cook'&&side==='R'?Math.sin(time*3.6)*.35:0,0);
    }
    delta(state,'Head',.23,action==='read'?Math.sin(time*.8)*.045:0,0);
  } else if(action==='lie') {
    motion.position.set(0,0,0);motion.rotation.x=-Math.PI/2;
    for(const side of ['L','R']){delta(state,`Hip${side}`,.03);delta(state,`Knee${side}`,.04);}
    const hip=localPoint(state,nodes.HipRoot);motion.position.x=-hip.x;motion.position.z=-hip.z;
    if(state.lieLift===null)state.lieLift=-boundsOf(state).min.y;
    motion.position.y=state.lieLift;
  } else {
    delta(state,'Head',Math.sin(time*.7)*.018,Math.sin(time*.55)*.065,0);
    for(const [side,sign]of[['L',-1],['R',1]])delta(state,`Shoulder${side}`,Math.sin(time*1.6+sign*.2)*.018);
  }
  const phase=time%4.7,blink=phase>4.45?Math.max(.07,Math.abs(phase-4.575)/.125):1;
  applyExpression(state,blink);
  model.userData.action=action;
  return model;
}


/** Blend the authored rigid joints as well as the pose origin. This is deliberately
 * separate from setting a final action then sliding its root into furniture.
 * `footTarget` optionally preserves the support-foot centre in world space while
 * knees bend. Its vertical coordinate may rise for a seat too high to reach floor. */
/** Overlay a right-handed remote grip/press or a physical reach on a previously
 * evaluated standing, walking or seated pose. The hand socket is the actual
 * authored v4 attachment; the cabinet remote can meet it without teleporting. */
export function poseRobotTelevisionArms(model,{holding=false,carrying=false,press=0,reach=0,target=null}={}){
  const state=stateFor(model),nodes=state.nodes;
  const carry=Math.max(0,Math.min(1,Number(carrying)||0));
  if(holding){delta(state,'ShoulderR',(-.30-press*.35)*(1-carry)-.03*carry,0,-.08+.20*carry);delta(state,'ElbowR',(-.95+press*.05)*(1-carry)-.18*carry);delta(state,'WristR',-.08+press*.13);}
  if(!target||reach<=0)return;
  // Bend at the waist to reach a low console; the hips, knees and both feet
  // remain on their established standing contacts.
  const lean=.60*Math.max(0,Math.min(1,reach));delta(state,'Torso',lean);
  const leanAxis=TV_LEAN_AXIS;
  nodes.Torso.position.copy(state.rest.get(nodes.Torso).position).applyAxisAngle(leanAxis,lean);
  for(const side of['L','R']){const shoulder=nodes[`Shoulder${side}`];shoulder.position.copy(state.rest.get(shoulder).position).applyAxisAngle(leanAxis,lean);delta(state,`Shoulder${side}`,lean);}
  const cache=state.televisionIK??={joint:new THREE.Vector3(),hand:new THREE.Vector3(),toHand:new THREE.Vector3(),toTarget:new THREE.Vector3(),world:new THREE.Quaternion(),parent:new THREE.Quaternion(),delta:new THREE.Quaternion(),base:[new THREE.Quaternion(),new THREE.Quaternion()]};
  const joints=[nodes.ElbowR,nodes.ShoulderR],socket=model.getObjectByName('HandSocketR');if(!socket)return;
  for(let i=0;i<2;i++)cache.base[i].copy(joints[i].quaternion);
  for(let n=0;n<7;n++)for(const joint of joints){
    model.updateWorldMatrix(true,true);joint.getWorldPosition(cache.joint);socket.getWorldPosition(cache.hand);
    cache.toHand.copy(cache.hand).sub(cache.joint).normalize();cache.toTarget.copy(target).sub(cache.joint).normalize();
    cache.delta.setFromUnitVectors(cache.toHand,cache.toTarget);joint.getWorldQuaternion(cache.world);joint.parent.getWorldQuaternion(cache.parent).invert();
    joint.quaternion.copy(cache.parent.multiply(cache.delta.multiply(cache.world)));
  }
  for(let i=0;i<2;i++)joints[i].quaternion.slerp(cache.base[i],1-Math.max(0,Math.min(1,reach)));
  model.updateWorldMatrix(true,true);
}

/** Surface work uses two actual hand sockets and measured world contacts.
 * Only the torso and arms lean; feet retain their standing ground contacts. */
export function poseRobotSurfaceHands(model,{reach=0,contacts=null,lean=1.05}={}){
  if(!contacts||reach<=0)return;
  const state=stateFor(model),nodes=state.nodes,blend=Math.max(0,Math.min(1,reach)),bend=lean*blend;
  delta(state,'Torso',bend);delta(state,'Head',-.20*blend);
  nodes.Torso.position.copy(state.rest.get(nodes.Torso).position).applyAxisAngle(TV_LEAN_AXIS,bend);
  for(const side of['L','R']){
    const shoulder=nodes[`Shoulder${side}`];shoulder.position.copy(state.rest.get(shoulder).position).applyAxisAngle(TV_LEAN_AXIS,bend);delta(state,`Shoulder${side}`,bend);
    const target=contacts[side],socket=model.getObjectByName(`HandSocket${side}`);if(!target||!socket)continue;
    const cache=state.surfaceIK??={joint:new THREE.Vector3(),hand:new THREE.Vector3(),toHand:new THREE.Vector3(),toTarget:new THREE.Vector3(),world:new THREE.Quaternion(),parent:new THREE.Quaternion(),delta:new THREE.Quaternion(),base:[new THREE.Quaternion(),new THREE.Quaternion()]};
    const joints=[nodes[`Elbow${side}`],shoulder];for(let i=0;i<2;i++)cache.base[i].copy(joints[i].quaternion);
    for(let n=0;n<9;n++)for(const joint of joints){
      model.updateWorldMatrix(true,true);joint.getWorldPosition(cache.joint);socket.getWorldPosition(cache.hand);
      cache.toHand.copy(cache.hand).sub(cache.joint).normalize();cache.toTarget.copy(target).sub(cache.joint).normalize();
      cache.delta.setFromUnitVectors(cache.toHand,cache.toTarget);joint.getWorldQuaternion(cache.world);joint.parent.getWorldQuaternion(cache.parent).invert();
      joint.quaternion.copy(cache.parent.multiply(cache.delta.multiply(cache.world)));
    }
    for(let i=0;i<2;i++)joints[i].quaternion.slerp(cache.base[i],1-blend);
  }
  model.updateWorldMatrix(true,true);
}

export function poseRobotTransition(model,{from={action:'idle'},to={action:'sit'},progress=0,time=0,footTarget=null,supportTarget=null}={}) {
  const state=stateFor(model),t=THREE.MathUtils.clamp(Number(progress)||0,0,1);
  const first=typeof from==='string'?{action:from}:from,second=typeof to==='string'?{action:to}:to;
  poseRobotAvatar(model,{...first,time:first.time??time});
  const nodes=state.blendNodes,start=state.blendStart;
  nodes.forEach((node,i)=>{start[i].position.copy(node.position);start[i].quaternion.copy(node.quaternion);start[i].scale.copy(node.scale);});
  poseRobotAvatar(model,{...second,time:second.time??time});
  nodes.forEach((node,i)=>{node.position.lerpVectors(start[i].position,node.position,t);start[i].targetQuaternion.copy(node.quaternion);node.quaternion.copy(start[i].quaternion).slerp(start[i].targetQuaternion,t);node.scale.lerpVectors(start[i].scale,node.scale,t);});
  if(footTarget){
    const feet=boundsOf(state,state.footMeshes),centre=feet.getCenter(state.blendContact);centre.y=feet.min.y;
    state.model.updateWorldMatrix(true,true);state.inverse.copy(state.model.matrixWorld).invert();
    const desired=state.blendDesired.set(footTarget.x,footTarget.y,footTarget.z).applyMatrix4(state.inverse);
    state.motion.position.x+=desired.x-centre.x;state.motion.position.z+=desired.z-centre.z;
    if(Number.isFinite(footTarget.y))state.motion.position.y+=desired.y-centre.y;
  }
  if(Number.isFinite(supportTarget)){
    // Only cached mesh boxes are transformed here. No full-body vertex walk is
    // performed in an animation frame, even when a dressed robot reclines.
    state.model.updateWorldMatrix(true,true);state.inverse.copy(state.model.matrixWorld).invert();state.fastBox.makeEmpty();
    const full=first.action==='lie'||second.action==='lie',meshes=full?state.meshes:state.seatSupportMeshes;
    for(const mesh of meshes){if(!visible(mesh,model))continue;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
      state.matrix.multiplyMatrices(state.inverse,mesh.matrixWorld);state.fastPartBox.copy(mesh.geometry.boundingBox).applyMatrix4(state.matrix);state.fastBox.union(state.fastPartBox);}
    const target=state.blendDesired.set(model.position.x,supportTarget,model.position.z).applyMatrix4(state.inverse).y;
    state.motion.position.y+=target-state.fastBox.min.y;
  }
  model.userData.transition={from:first.action,to:second.action,progress:t};return model;
}

/** Calibrate the actual v4 limb lengths and the true rubber sole, not a visual
 * ankle marker. The result is immutable data used by the stair planner. */
export function measureRobotStairRig(model) {
  const state=stateFor(model);poseRobotAvatar(model);model.updateWorldMatrix(true,true);
  const result={legs:{},footCentre:{},hipHeight:localPoint(state,state.nodes.HipRoot).y};
  for(const side of ['L','R']){
    const hip=localPoint(state,state.nodes[`Hip${side}`]).clone(),knee=localPoint(state,state.nodes[`Knee${side}`]).clone(),ankle=localPoint(state,state.nodes[`Ankle${side}`]).clone();
    const sole=model.getObjectByName(`FootSole${side}`),box=boundsOf(state,[sole]).clone();
    const centre=box.getCenter(new THREE.Vector3());centre.y=box.min.y;
    result.footCentre[side]={x:centre.x,y:centre.y,z:centre.z};
    result.legs[side]={upper:hip.distanceTo(knee),lower:knee.distanceTo(ankle),hip:hip.toArray(),ankleFromSole:ankle.sub(centre).toArray(),soleDepth:box.max.z-box.min.z,soleWidth:box.max.x-box.min.x};
    // Cache exact rubber-sole support profiles once. A tilted rounded toe
    // contacts at a different vertex than a flat sole; a box corner would
    // make it hover. Runtime only interpolates this compact support table.
    const inverse=model.matrixWorld.clone().invert(),matrix=new THREE.Matrix4().multiplyMatrices(inverse,sole.matrixWorld),vertices=[],v=new THREE.Vector3(),positions=sole.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){v.fromBufferAttribute(positions,i).applyMatrix4(matrix).sub(centre);vertices.push({y:v.y,z:v.z});}
    const toe=(box.max.z-box.min.z)/2;
    const support=[];
    for(let i=0;i<=140;i++){const pitch=i*.005,c=Math.cos(pitch),sn=Math.sin(pitch);let min=Infinity;for(const v of vertices)min=Math.min(min,v.y*c-v.z*sn);support.push({lift:-min,z:toe*(1-c)});}
    result.legs[side].toeSupport=support;
  }
  state.stairRig=result;
  state.ik={inverse:new THREE.Matrix4(),hip:new THREE.Vector3(),target:new THREE.Vector3(),direction:new THREE.Vector3(),bend:new THREE.Vector3(),knee:new THREE.Vector3(),leg:new THREE.Vector3(),restVector:new THREE.Vector3(),parentQuaternion:new THREE.Quaternion(),worldQuaternion:new THREE.Quaternion(),modelQuaternion:new THREE.Quaternion(),localQuaternion:new THREE.Quaternion(),forward:new THREE.Vector3(0,0,1),footOffset:new THREE.Vector3(),footQuaternion:new THREE.Quaternion(),footEuler:new THREE.Euler(0,0,0,'YXZ')};
  return result;
}

/** Two-bone inverse kinematics for a stair contact frame. Each foot is a world
 * sole-centre target: the planted foot stays there while the pelvis transfers
 * weight. Ankles counter-rotate the hip/knee so the rubber soles stay horizontal.
 * No geometry traversal, mesh rebuilding or per-frame vertex scans occur here. */
export function poseRobotStairStep(model,{feet,bodyLean=0,armSwing=0,intensity=1}={}) {
  const state=stateFor(model);if(!state.stairRig)measureRobotStairRig(model);
  poseRobotAvatar(model);
  delta(state,'Torso',bodyLean);delta(state,'Head',-bodyLean*.5);
  delta(state,'ShoulderL',-.15*intensity+armSwing);delta(state,'ShoulderR',-.15*intensity-armSwing);
  delta(state,'ElbowL',-.22*intensity);delta(state,'ElbowR',-.22*intensity);
  solveRobotFootContacts(state,feet);
  state.action='stairs';model.userData.action='stairs';return model;
}

function solveRobotFootContacts(state,feet){
  const {model,nodes,ik:k}=state;
  model.updateWorldMatrix(true,true);k.inverse.copy(model.matrixWorld).invert();model.getWorldQuaternion(k.modelQuaternion);
  for(const side of ['L','R']){
    const target=feet[side],rig=state.stairRig.legs[side],hip=nodes[`Hip${side}`],knee=nodes[`Knee${side}`],ankle=nodes[`Ankle${side}`];
    k.footEuler.set(target.pitch??0,target.yaw??0,0,'YXZ');k.footQuaternion.setFromEuler(k.footEuler);
    k.target.set(target.x,target.y,target.z).applyMatrix4(k.inverse);k.footOffset.fromArray(rig.ankleFromSole).applyQuaternion(k.footQuaternion);k.target.add(k.footOffset);
    k.forward.set(Math.sin(target.yaw??0),0,Math.cos(target.yaw??0));
    hip.getWorldPosition(k.hip).applyMatrix4(k.inverse);
    k.direction.copy(k.target).sub(k.hip);const distance=Math.min(rig.upper+rig.lower-1e-8,Math.max(1e-7,k.direction.length()));k.direction.normalize();
    const along=(rig.upper*rig.upper-rig.lower*rig.lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,rig.upper*rig.upper-along*along));
    k.bend.copy(k.forward).addScaledVector(k.direction,-k.forward.dot(k.direction)).normalize();
    k.knee.copy(k.hip).addScaledVector(k.direction,along).addScaledVector(k.bend,height);
    // Solve the upper bone in its parent's coordinate frame.
    hip.parent.getWorldQuaternion(k.parentQuaternion);k.localQuaternion.copy(k.parentQuaternion).invert().multiply(k.modelQuaternion);
    k.leg.copy(k.knee).sub(k.hip).applyQuaternion(k.localQuaternion).normalize();k.restVector.copy(state.rest.get(knee).position).normalize();
    hip.quaternion.setFromUnitVectors(k.restVector,k.leg);hip.updateWorldMatrix(false,true);
    // Then the lower bone, followed by an ankle that cancels both bends.
    knee.parent.getWorldQuaternion(k.parentQuaternion);k.localQuaternion.copy(k.parentQuaternion).invert().multiply(k.modelQuaternion);
    k.leg.copy(k.target).sub(k.knee).applyQuaternion(k.localQuaternion).normalize();k.restVector.copy(state.rest.get(ankle).position).normalize();
    knee.quaternion.setFromUnitVectors(k.restVector,k.leg);knee.updateWorldMatrix(false,true);
    ankle.parent.getWorldQuaternion(k.parentQuaternion);ankle.quaternion.copy(k.parentQuaternion).invert().multiply(k.modelQuaternion).multiply(k.footQuaternion);ankle.updateWorldMatrix(false,true);
  }
}

/** Authored stage motion stays inside a local envelope; the caller-owned
 * navigation transform remains untouched. Heel/toe contacts use the same
 * two-bone IK as stairs, with cached exact sole support for the tilted feet. */
export function poseRobotDance(model,{time=0,blend=1}={}){
  const state=stateFor(model);if(!state.stairRig)measureRobotStairRig(model);
  poseRobotAvatar(model);const frame=sampleRobotDance(time,blend),{nodes}=state;
  if(frame.blend===0)return model;
  state.danceFeet??={L:new THREE.Vector3(),R:new THREE.Vector3()};
  const yaw=frame.motion.yaw,c=Math.cos(yaw),s=Math.sin(yaw);
  state.motion.rotation.y=yaw;
  state.motion.position.x=frame.motion.x*c+frame.motion.z*s;
  state.motion.position.z=-frame.motion.x*s+frame.motion.z*c;
  nodes.HipRoot.position.x+=frame.pelvis.x;nodes.HipRoot.position.y+=frame.pelvis.y;
  delta(state,'HipRoot',0,frame.pelvis.turn);delta(state,'Torso',frame.torso.lean,frame.torso.turn,frame.torso.roll);
  delta(state,'Head',frame.head.nod,frame.head.turn,frame.head.roll);
  for(const side of ['L','R']){
    const arm=frame.arms[side];delta(state,`Shoulder${side}`,arm.shoulderX,arm.shoulderY??0,arm.shoulderZ);
    delta(state,`Elbow${side}`,arm.elbowX);delta(state,`Wrist${side}`,0,0,arm.wristZ);
    const base=state.stairRig.footCentre[side],offset=frame.feet[side],rig=state.stairRig.legs[side],target=state.danceFeet[side];
    const index=Math.max(0,Math.min(139,Math.floor(offset.pitch/.005))),part=offset.pitch/.005-index;
    const from=rig.toeSupport[index],to=rig.toeSupport[index+1];
    const lift=from.lift+(to.lift-from.lift)*part,forward=from.z+(to.z-from.z)*part;
    const x=base.x+offset.x,z=base.z+offset.z+forward;
    target.set(x*c+z*s,base.y+offset.y+lift,-x*s+z*c);target.pitch=offset.pitch;target.yaw=yaw;
  }
  model.updateWorldMatrix(true,false);
  for(const side of ['L','R'])state.danceFeet[side].applyMatrix4(model.matrixWorld);
  solveRobotFootContacts(state,state.danceFeet);
  state.action='dance';state.time=frame.time;model.userData.action='dance';model.userData.dancePhase=frame.phase;return model;
}

export function setRobotPalette(model,{shell,accent}={}) {
  const state=stateFor(model),updates=Object.entries({shell,accent}).filter(([,value])=>value!==undefined);
  for(const [part,color]of updates)if(typeof color!=='string'||!/^#[\da-f]{6}$/i.test(color))throw new TypeError(`${part} must be a six-digit hex color.`);
  const targets=updates.map(([part,color])=>{
    const selected=[...state.materials.values()].filter(material=>material.name.toLowerCase()===part||material.name.toLowerCase().startsWith(`${part}_`));
    if(!selected.length)throw new Error(`Robot asset is missing the ${part} material.`);
    return {selected,color};
  });
  for(const {selected,color}of targets)for(const material of selected)material.color.set(color);
  return model;
}
export function setRobotExpression(model,id='smile') {
  const state=stateFor(model);
  if(!ROBOT_EXPRESSIONS.includes(id))throw new RangeError(`Unknown robot expression: ${id}`);
  state.expression=id;applyExpression(state);return model;
}
export function setRobotBackpackVisible(model,value) {
  const state=stateFor(model);state.backpackWanted=Boolean(value);
  state.nodes.Backpack.visible=state.backpackWanted&&!['sit','lie'].includes(state.action);return model;
}

/** Measurements are model-local, so review scenes can freely place and rotate the root. */
export function measureRobotAvatar(model) {
  const state=stateFor(model),bounds=coordinates(boundsOf(state)),body=coordinates(boundsOf(state,state.torsoMeshes));
  const authoredContact=localPoint(state,state.nodes.SeatContact).toArray(),contact=[...authoredContact];
  const supportMinY=boundsOf(state,state.seatSupportMeshes).min.y;
  if(state.action==='sit')contact[1]=supportMinY;
  let triangles=0;
  for(const mesh of state.meshes){const g=mesh.geometry;triangles+=(g.index?.count??g.getAttribute('position').count)/3;}
  return {action:state.action,expression:state.expression,backpackVisible:state.nodes.Backpack.visible,bounds,
    standingBounds:structuredClone(state.standingBounds),navigation:{...state.navigation},
    seat:{contact,authoredContact,supportMinY,bodyBackZ:body.min[2],bodyFrontZ:body.max[2]},
    metrics:{meshes:state.meshes.length,triangles,materials:state.materials.size}};
}

/** Never disposes the caller-owned glTF geometries or textures. */
export function disposeRobotAvatar(model) {
  const state=instances.get(model);if(!state||state.disposed)return;
  for(const material of state.materials.values())material.dispose();
  state.disposed=true;model.removeFromParent();model.userData.disposed=true;
}
