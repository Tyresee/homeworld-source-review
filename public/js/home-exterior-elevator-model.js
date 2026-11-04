import * as THREE from 'three';
import {FLOOR_Y,STOREY_HEIGHT,ELEVATOR_DOOR_CLEAR_WIDTH,ELEVATOR_CABIN_CLEAR_HEIGHT,getStaircaseSurfaceId,getStaircaseVolume,getStaircaseEntrances,areElevatorsAligned} from './home-staircase-shape.js';

const clamp=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
/** A complete exterior shaft, fixed to the starter's left wall. Its local +Z
 * doorway faces the house; only the cabin and sliding gates own moving parts.
 * No clipping plane or decorative cut ring is used in either scene. */
export function createExteriorHomeElevator(stairs,{connections=null,groundY=null}={}){
  const base=stairs.direction==='down'?-STOREY_HEIGHT:0,links=connections??[{stairs,baseY:base}];
  if(!links.length||links.some((row,i)=>!areElevatorsAligned(row.stairs,stairs)||!Number.isFinite(row.baseY)||i&&row.baseY<=links[i-1].baseY))throw new TypeError('Invalid exterior elevator shaft');
  const root=new THREE.Group();root.name='home-elevator';
  const metadata={surfaceId:getStaircaseSurfaceId(stairs),stairId:stairs.id,stairDirection:stairs.direction,roomPart:'stairs',transportType:'elevator',paintable:false,exteriorElevator:true};
  const geometries=new Map(),materials=new Map();let disposed=false;
  const blue='#2c65bb',yellow='#ffcd38',cream='#fff5d5',ink='#214a83';
  const material=(color,options={})=>{const key=JSON.stringify([color,options]);if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.62,...options}));return materials.get(key);};
  const glass=material('#c6eaff',{transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide,roughness:.2});
  function box(parent,size,color,at,name){
    const key=JSON.stringify(size);if(!geometries.has(key))geometries.set(key,new THREE.BoxGeometry(...size));
    const mesh=new THREE.Mesh(geometries.get(key),color?.isMaterial?color:material(color));mesh.position.set(...at);mesh.name=`elevator-${name}`;mesh.castShadow=!mesh.material.transparent;mesh.receiveShadow=true;mesh.userData={...metadata,elevatorPart:name};parent.add(mesh);return mesh;
  }
  const low=links[0].baseY+FLOOR_Y,high=links.at(-1).baseY+FLOOR_Y+STOREY_HEIGHT,top=high+3.00,shaftLow=Number.isFinite(groundY)?Math.min(low,groundY+FLOOR_Y):low,height=top-shaftLow;
  const shaft=new THREE.Group();shaft.name='elevator-shaft';root.add(shaft);
  // Match the house foundation rather than leaving the outdoor shaft
  // suspended at its finished-floor datum above the lawn.
  box(shaft,[1.70,.42,1.80],blue,[0,shaftLow-.21,0],'shaft-footing');
  for(const x of[-.79,.79])for(const z of[-.84,.84])box(shaft,[.12,height,.12],blue,[x,shaftLow+height/2,z],'shaft-post');
  for(const y of[shaftLow+.04,...links.map(link=>link.baseY+FLOOR_Y+STOREY_HEIGHT),top-.06]){
    for(const x of[-.79,.79])box(shaft,[.12,.12,1.80],blue,[x,y,0],'shaft-side-beam');
    for(const z of[-.84,.84])box(shaft,[1.70,.12,.12],blue,[0,y,z],'shaft-cross-beam');
  }
  // Three transparent faces; the fourth is the house wall with real doorways.
  for(const x of[-.79,.79])box(shaft,[.018,height-.16,1.56],glass,[x,shaftLow+height/2,0],'shaft-side-glass');
  box(shaft,[1.46,height-.16,.018],glass,[0,shaftLow+height/2,-.84],'shaft-rear-glass');
  box(shaft,[1.70,.10,1.80],blue,[0,top-.05,0],'shaft-top-cap');
  for(const x of[-.68,.68])box(shaft,[.035,height-.16,.05],ink,[x,shaftLow+height/2,-.40],'guide-rail');

  // Gates telescope into their side pockets. Two half leaves per side retain
  // the 1.08m clear doorway without extending beyond the 1.70m shaft width.
  function doors(parent,y,z,name){
    const group=new THREE.Group();group.name=`elevator-${name}-doors`;group.position.set(0,y,z);parent.add(group);
    const leaves=[];
    for(const side of[-1,1])for(const layer of[0,1]){
      const leaf=new THREE.Group();leaf.name=`elevator-${name}-door-${side<0?'left':'right'}${layer?'-outer':''}`;group.add(leaf);
      const w=ELEVATOR_DOOR_CLEAR_WIDTH/4;
      box(leaf,[w,1.86,.025],cream,[0,.93,0],`${name}-door-panel`);
      box(leaf,[w-.045,1.13,.012],glass,[0,1.11,.02],`${name}-door-window`);
      box(leaf,[w,.14,.035],yellow,[0,.18,.02],`${name}-door-kick`);
      leaves.push({leaf,side,layer,w});
    }
    return {group,setOpen(value){for(const {leaf,side,layer,w}of leaves){const closed=side*w*(layer+.5),open=side*(ELEVATOR_DOOR_CLEAR_WIDTH/2+w/2);leaf.position.set(closed+(open-closed)*clamp(value),0,layer*.035);}}};
  }
  const stations=[],byY=new Map();
  for(const link of links)for(const [side,y]of[['lower',link.baseY+FLOOR_Y],['upper',link.baseY+FLOOR_Y+STOREY_HEIGHT]]){
    const key=Math.round(y*1e6);let station=byY.get(key);
    if(station){station.endpoints.push({link,side});continue;}
    const group=new THREE.Group();group.name=`elevator-${side}-station`;shaft.add(group);
    box(group,[1.42,.018,.24],yellow,[0,y-.009,.84],`${side}-threshold`);
    for(const x of[-.60,.60])box(group,[.10,1.98,.12],blue,[x,y+.99,.9],`${side}-portal-jamb`);
    box(group,[1.30,.14,.12],blue,[0,y+2.00,.9],`${side}-portal-header`);
    box(group,[.14,.30,.22],ink,[.73,y+1.10,1.045],`${side}-call-panel`);
    box(group,[.065,.065,.025],yellow,[.73,y+1.10,1.172],`${side}-call-button`);
    const gate=doors(group,y,.9,`${side}-landing`);
    group.traverse(node=>Object.assign(node.userData,{...metadata,elevatorConnectionId:link.stairs.id,elevatorStationSide:side,elevatorStationY:y,stairId:link.stairs.id,stairDirection:link.stairs.direction}));
    station={group,gate,endpoints:[{link,side}]};stations.push(station);byY.set(key,station);
  }
  const cabin=new THREE.Group();cabin.name='elevator-cabin';root.add(cabin);
  box(cabin,[1.46,.018,1.48],yellow,[0,-.009,0],'cabin-base');
  box(cabin,[1.34,.012,1.36],cream,[0,-.006,0],'cabin-floor');
  for(const x of[-.70,.70])for(const z of[-.69,.69])box(cabin,[.055,1.88,.055],yellow,[x,.94,z],'cabin-post');
  for(const x of[-.70,.70]){
    box(cabin,[.05,.34,1.42],yellow,[x,.17,0],'cabin-side-kick');
    box(cabin,[.018,1.35,1.30],glass,[x,1.03,0],'cabin-side-window');
    box(cabin,[.035,.055,1.18],cream,[x-Math.sign(x)*.05,.88,0],'cabin-handrail');
    box(cabin,[.09,.09,1.48],yellow,[x,ELEVATOR_CABIN_CLEAR_HEIGHT+.05,0],'cabin-canopy-side');
  }
  box(cabin,[1.40,.34,.05],yellow,[0,.17,-.71],'cabin-rear-kick');
  box(cabin,[1.30,1.35,.018],glass,[0,1.03,-.71],'cabin-rear-window');
  for(const z of[-.69,.69])box(cabin,[1.46,.09,.09],yellow,[0,ELEVATOR_CABIN_CLEAR_HEIGHT+.05,z],'cabin-canopy-cross');
  const carGate=doors(cabin,0,.74,'cabin-front');
  const defaultLink=links.find(link=>link.stairs.id===stairs.id)??links[0];
  function setElevatorFrame(frame={}){
    if(disposed)return false;
    const link=links.find(link=>link.stairs.id===(frame.doorStairId??frame.stairId))??defaultLink;
    const parked=defaultLink.baseY+FLOOR_Y+(stairs.direction==='down'?STOREY_HEIGHT:0),cabinY=Number.isFinite(frame.cabinY)?Math.max(low,Math.min(high,frame.cabinY)):parked;
    const fallback=clamp(frame.doorOpen),gate={lower:clamp(frame.doors?.lower??(frame.doorSide==='lower'?fallback:0)),upper:clamp(frame.doors?.upper??(frame.doorSide==='upper'?fallback:0))};
    cabin.position.y=cabinY;
    for(const station of stations){const endpoint=station.endpoints.find(endpoint=>endpoint.link===link);station.gate.setOpen(endpoint?gate[endpoint.side]:0);}
    carGate.setOpen(Math.max(Math.abs(cabinY-link.baseY-FLOOR_Y)<.005?gate.lower:0,Math.abs(cabinY-link.baseY-FLOOR_Y-STOREY_HEIGHT)<.005?gate.upper:0));
    root.userData.elevatorFrame={stairId:frame.stairId??link.stairs.id,doorStairId:link.stairs.id,cabinY,doors:gate,phase:frame.phase??'parked',direction:frame.direction??stairs.direction};root.updateMatrixWorld(true);return true;
  }
  root.position.set(stairs.x,0,stairs.z);root.rotation.y=stairs.rotation*Math.PI/180;
  root.userData={...metadata,stairs:{...stairs},volume:getStaircaseVolume(stairs),entrances:getStaircaseEntrances(stairs),connectionIds:links.map(link=>link.stairs.id),shaftTopY:top,setElevatorFrame};
  root.dispose=onDispose=>{if(disposed)return;disposed=true;root.removeFromParent();for(const value of[...geometries.values(),...materials.values()]){onDispose?.(value);value.dispose();}root.clear();};root.userData.dispose=root.dispose;
  setElevatorFrame();return root;
}
