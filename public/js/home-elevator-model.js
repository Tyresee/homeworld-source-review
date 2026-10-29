import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {STOREY_HEIGHT,STAIR_WIDTH,STAIR_DEPTH,FLOOR_Y,ELEVATOR_DOOR_CLEAR_WIDTH,ELEVATOR_CABIN_CLEAR_HEIGHT,isStaircaseValid,getStaircaseSurfaceId,getStaircaseVolume,getStaircaseEntrances} from './home-staircase-shape.js';

const clamp=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
/** A through-car lift replaces exactly one existing staircase connection.
 * The lower +Z entrance and upper -Z exit retain its established footprint.
 * No clock is owned here: the robot's single animation loop supplies frames. */
export function createHomeElevator(stairs){
  if(!isStaircaseValid(stairs)||stairs.type!=='elevator')throw new TypeError('Invalid elevator connection');
  const root=new THREE.Group();root.name='home-elevator';
  const base=stairs.direction==='down'?-STOREY_HEIGHT:0,lowerY=base+FLOOR_Y,upperY=lowerY+STOREY_HEIGHT;
  const metadata={surfaceId:getStaircaseSurfaceId(stairs),stairId:stairs.id,stairDirection:stairs.direction,roomPart:'stairs',transportType:'elevator',paintable:false};
  const geometries=new Map(),materials=new Map();let disposed=false;
  const cream='#f6ecd8',mint='#7eaca5',deep='#426e6c',gold='#c7a25c',wood='#c9a577',dark='#355351';
  const material=(color,options={})=>{const key=JSON.stringify([color,options]);if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.58,...options}));return materials.get(key);};
  const glass=material('#bfe7e4',{transparent:true,opacity:.12,depthWrite:false,roughness:.18,metalness:.06,side:THREE.DoubleSide});
  function add(parent,geometry,color,at,name,options={}){
    const mesh=new THREE.Mesh(geometry,color?.isMaterial?color:material(color,options));mesh.position.set(...at);mesh.name=`elevator-${name}`;
    mesh.castShadow=!mesh.material.transparent;mesh.receiveShadow=true;mesh.userData={...metadata,elevatorPart:name};parent.add(mesh);return mesh;
  }
  function box(parent,size,color,at,name,radius=0,options={}){
    const key=JSON.stringify(['box',size,radius]);if(!geometries.has(key))geometries.set(key,radius>=.02?new RoundedBoxGeometry(...size,1,Math.min(radius,...size.map(x=>x*.4))):new THREE.BoxGeometry(...size));
    return add(parent,geometries.get(key),color,at,name,options);
  }
  function cylinder(parent,r,h,color,at,name){const key=`cylinder:${r}:${h}`;if(!geometries.has(key))geometries.set(key,new THREE.CylinderGeometry(r,r,h,12));return add(parent,geometries.get(key),color,at,name);}
  const shaft=new THREE.Group();shaft.name='elevator-shaft';root.add(shaft);
  const shaftTop=upperY+2.10,shaftHeight=shaftTop-(lowerY-.018);
  // Slender full-height posts and uninterrupted rails leave the moving car
  // readable from the room's isometric view. No opaque shaft box hides it.
  for(const x of[-.985,.985])for(const z of[-1.46,1.46]){
    box(shaft,[.10,shaftHeight,.10],cream,[x,lowerY-.018+shaftHeight/2,z],'shaft-post',.025);
    box(shaft,[.018,shaftHeight-.10,.026],gold,[x+Math.sign(x)*.052,lowerY+.03+(shaftHeight-.10)/2,z],'post-inlay',.005);
  }
  for(const x of[-.88,.88]){
    box(shaft,[.045,shaftHeight-.16,.07],deep,[x,lowerY+.05+(shaftHeight-.16)/2,0],'guide-rail');
    box(shaft,[.12,.08,.16],gold,[x,shaftTop-.10,0],'rail-stop',.012);
  }
  for(const y of[lowerY+.06,upperY+.04,shaftTop-.07]){
    for(const x of[-.985,.985])box(shaft,[.10,.12,2.98],cream,[x,y,0],'shaft-side-beam',.018);
    for(const z of[-1.46,1.46])box(shaft,[2.08,.12,.10],cream,[0,y,z],'shaft-cross-beam',.018);
  }
  const stations={};
  function doubleDoor(parent,y,z,name){
    const leafWidth=ELEVATOR_DOOR_CLEAR_WIDTH/2,closedX=(leafWidth+.01)/2,openX=(ELEVATOR_DOOR_CLEAR_WIDTH+leafWidth)/2;
    const group=new THREE.Group();group.name=`elevator-${name}-doors`;group.position.set(0,y,z);parent.add(group);
    const leaves=[];
    for(const side of[-1,1]){
      const leaf=new THREE.Group();leaf.name=`elevator-${name}-door-${side<0?'left':'right'}`;leaf.position.x=side*closedX;group.add(leaf);leaves.push({leaf,side});
      box(leaf,[leafWidth,.30,.055],mint,[0,.20,0],`${name}-door-kick`,.025);
      box(leaf,[leafWidth,.12,.055],cream,[0,1.80,0],`${name}-door-cap`,.02);
      for(const x of[-.245,.245])box(leaf,[.045,1.54,.06],cream,[x,1.015,0],`${name}-door-stile`,.012);
      box(leaf,[.445,1.40,.018],glass,[0,1.02,0],`${name}-door-window`);
      box(leaf,[.026,.38,.075],gold,[-side*.19,1.03,z<0?-.015:.015],`${name}-door-handle`,.009);
    }
    return {group,leaves,setOpen(value){for(const {leaf,side}of leaves)leaf.position.x=side*(closedX+(openX-closedX)*clamp(value));}};
  }
  function station(side,y,z){
    const group=new THREE.Group();group.name=`elevator-${side}-station`;shaft.add(group);
    box(group,[1.72,.018,.22],wood,[0,y-.009,z],`${side}-threshold`,.018);
    for(const x of[-.61,.61])box(group,[.095,1.96,.11],cream,[x,y+.98,z],`${side}-portal-jamb`,.025);
    box(group,[1.34,.16,.15],mint,[0,y+1.96,z],`${side}-portal-header`,.04);
    box(group,[.40,.10,.012],dark,[0,y+1.96,z+(z>0?.081:-.081)],`${side}-level-display`,.012);
    const indicators=[];
    for(const index of[0,1])indicators.push(box(group,[.105,.023,.015],index===0?'#bde4c4':'#7c9991',[(index-.5)*.16,y+1.96,z+(z>0?.092:-.092)],`${side}-level-indicator-${index}`,.005));
    box(group,[.15,.38,.055],deep,[.79,y+1.06,z+(z>0?.04:-.04)],`${side}-call-panel`,.025);
    const button=cylinder(group,.042,.018,gold,[.79,y+1.06,z+(z>0?.078:-.078)],`${side}-call-button`);button.rotation.x=Math.PI/2;
    const doors=doubleDoor(group,y,z,`${side}-landing`);stations[side]={group,doors,indicators};
  }
  station('lower',lowerY,1.44);station('upper',upperY,-1.44);
  const cabin=new THREE.Group();cabin.name='elevator-cabin';root.add(cabin);
  // The cabin transform denotes the walkable deck top, the same datum used by
  // the robot's foot contacts. The authored floor does not float above its feet.
  box(cabin,[1.78,.018,2.72],mint,[0,-.009,0],'cabin-base',.045);
  box(cabin,[1.64,.012,2.58],wood,[0,-.006,0],'cabin-floor',.015);
  for(const z of[-.86,-.43,0,.43,.86])box(cabin,[1.60,.003,.014],'#b18b60',[0,.001,z],'floor-inlay');
  for(const x of[-.84,.84])for(const z of[-1.30,1.30])box(cabin,[.06,1.84,.06],gold,[x,.92,z],'cabin-post',.018);
  for(const x of[-.84,.84]){
    box(cabin,[.055,.28,2.46],mint,[x,.20,0],'cabin-side-kick',.025);
    box(cabin,[.018,1.15,2.38],glass,[x,.94,0],'cabin-side-window');
    box(cabin,[.065,.06,2.48],cream,[x,1.72,0],'cabin-side-top',.018);
    box(cabin,[.045,.055,1.98],gold,[x-Math.sign(x)*.06,.88,0],'cabin-handrail',.018);
  }
  // A light open rim instead of an opaque roof exposes the actual passenger.
  for(const x of[-.84,.84])box(cabin,[.10,.095,2.66],cream,[x,ELEVATOR_CABIN_CLEAR_HEIGHT+.05,0],'cabin-canopy-side',.025);
  for(const z of[-1.30,1.30])box(cabin,[1.78,.095,.10],cream,[0,ELEVATOR_CABIN_CLEAR_HEIGHT+.05,z],'cabin-canopy-cross',.025);
  box(cabin,[.025,.62,.18],deep,[.797,1.02,.08],'cabin-controls',.012);
  for(const y of[.88,1.10])box(cabin,[.015,.065,.065],gold,[.775,y,.08],'cabin-control-button',.008);
  const cabinDoors={lower:doubleDoor(cabin,0,1.29,'cabin-front'),upper:doubleDoor(cabin,0,-1.29,'cabin-rear')};
  let lastFrame=null;
  function setElevatorFrame(frame={}){
    if(disposed)return false;
    const cabinY=Math.max(lowerY,Math.min(upperY,finite(frame.cabinY,stairs.direction==='down'?upperY:lowerY)));
    const doors=frame.doors??{},fallback=clamp(frame.doorOpen);
    const lower=clamp(finite(doors.lower,frame.doorSide==='lower'?fallback:0)),upper=clamp(finite(doors.upper,frame.doorSide==='upper'?fallback:0));
    cabin.position.y=cabinY;
    stations.lower.doors.setOpen(lower);stations.upper.doors.setOpen(upper);
    // The cabin gate follows only the corresponding open landing. Both remain
    // closed while moving; opening a remote station never opens a moving car.
    cabinDoors.lower.setOpen(Math.abs(cabinY-lowerY)<.005?lower:0);
    cabinDoors.upper.setOpen(Math.abs(cabinY-upperY)<.005?upper:0);
    const progress=(cabinY-lowerY)/STOREY_HEIGHT;
    for(const station of Object.values(stations))for(let i=0;i<2;i++)station.indicators[i].material=material((i===0?progress<.5:progress>=.5)?'#d6edbd':'#73928b',{emissive:(i===0?progress<.5:progress>=.5)?'#243d1b':'#000000',emissiveIntensity:.18});
    lastFrame={cabinY,doors:{lower,upper},phase:frame.phase??'parked',direction:frame.direction??stairs.direction};
    root.userData.elevatorFrame=lastFrame;root.updateMatrixWorld(true);return true;
  }
  root.position.set(stairs.x,0,stairs.z);root.rotation.y=stairs.rotation*Math.PI/180;
  root.userData={...metadata,stairs:{...stairs},volume:getStaircaseVolume(stairs),entrances:getStaircaseEntrances(stairs),setElevatorFrame};
  root.dispose=onDispose=>{if(disposed)return;disposed=true;root.removeFromParent();for(const geometry of geometries.values()){onDispose?.(geometry);geometry.dispose();}for(const value of materials.values()){onDispose?.(value);value.dispose();}root.clear();};
  root.userData.dispose=root.dispose;
  setElevatorFrame({cabinY:stairs.direction==='down'?upperY:lowerY,doors:{lower:0,upper:0}});
  return root;
}
