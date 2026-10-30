import * as THREE from 'three';
import {createRoomExpansion,WALL_HEIGHT} from './home-room-expansion.js';
import {createEstateManor} from './home-estate-manor.js';
import {createLuxuryItem} from './home-luxury-models.js';
import {getFurniturePose,getWallMountTargets} from './home-engine.js';
import {getFloorBounds,getFloorRects} from './home-layout.js';
import {getHomeRoamEntrance,ROAM_FLOOR_Y} from './home-roam-geometry.js';
import {createHomeRoamDaylight} from './home-roam-daylight.js';
import {createStaircase,clipFloorMeshToOpening,splitFloorAroundOpening} from './home-staircase.js';
import {STOREY_HEIGHT,getHomeStairs,getStaircaseEntrances} from './home-staircase-shape.js';

/** Read-only model of every actual purchased floor. No account transport,
 * wallet, placement command or saved state belongs to this temporary scene. */
export function createHomeRoamModel({home,floors=home?[home]:[],theme,maps={},robot=null,robotStorey}={}){
  if(theme?.id!=='warm'||!home||!Array.isArray(floors)||!floors.length||floors.some(floor=>!floor||!Array.isArray(floor.rooms)||!getFloorBounds(floor)))throw new TypeError('The viewing scene requires existing Warm home floors.');
  const scene=new THREE.Scene(),interior=new THREE.Group();interior.name='roam-interior';scene.add(interior);
  const floorModels=[],furniture=[],ceilingLights=[],ceilings=[],transports=[],wallGroups=new Map();
  const ownedGeometries=new Set(),ownedMaterials=new Set(),customModels=[];
  let manor,daylight,doorway,entrance,disposed=false;
  const ground=floors[0],bounds=getFloorBounds(ground),rects=getFloorRects(ground),entry=getHomeRoamEntrance(ground,{theme});
  const transportGroup=new THREE.Group();transportGroup.name='roam-transports';interior.add(transportGroup);
  const own=group=>{group.traverse(node=>{if(node.geometry)ownedGeometries.add(node.geometry);for(const material of[].concat(node.material??[]))ownedMaterials.add(material);});return group;};
  const mark=(group,storey,extra={})=>{group.userData.roamStorey=storey;group.traverse(node=>{if(node.isMesh)Object.assign(node.userData,{roamStorey:storey},extra);});};
  function dispose(){
    if(disposed)return;disposed=true;
    daylight?.dispose();for(const floor of floorModels)floor.architecture.dispose();
    for(const model of customModels)model.dispose();manor?.dispose();
    for(const geometry of ownedGeometries)geometry.dispose();for(const material of ownedMaterials)material.dispose();
    scene.clear();
  }
  // The original companion remains owned by the live scene. Copy its current
  // posed mesh tree and resources so temporary hover and teardown are isolated.
  function copyRobot(node){
    const copy=node.isMesh?new THREE.Mesh(node.geometry.clone(),Array.isArray(node.material)?node.material.map(material=>material.clone()):node.material.clone()):new THREE.Group();
    copy.name=node.name;copy.position.copy(node.position);copy.quaternion.copy(node.quaternion);copy.scale.copy(node.scale);copy.visible=node.visible;copy.castShadow=node.castShadow;copy.receiveShadow=node.receiveShadow;
    for(const child of node.children)copy.add(copyRobot(child));return copy;
  }
  function cutOpening(mesh,openings){
    if(!openings.length)return false;
    const signature=JSON.stringify(openings.map(stair=>[stair.x,stair.z,stair.rotation,stair.direction]));
    if(mesh.userData.roamOpeningSignature===signature)return false;
    const changed=clipFloorMeshToOpening(mesh,openings);mesh.userData.roamOpeningSignature=signature;return changed;
  }
  function cutCeiling(ceiling,openings){
    const before=new THREE.Box3().setFromObject(ceiling),pieces=splitFloorAroundOpening({minX:before.min.x,maxX:before.max.x,minZ:before.min.z,maxZ:before.max.z},openings);
    cutOpening(ceiling,openings);
    const point=ceiling.userData.point;
    if(point&&openings.some(stair=>{const test=splitFloorAroundOpening({minX:point.x-.27,maxX:point.x+.27,minZ:point.z-.27,maxZ:point.z+.27},stair);return test.length!==1||Math.abs((test[0].maxX-test[0].minX)*(test[0].maxZ-test[0].minZ)-.54*.54)>1e-6;})){
      const largest=pieces.filter(piece=>piece.maxX-piece.minX>.54&&piece.maxZ-piece.minZ>.54).sort((a,b)=>(b.maxX-b.minX)*(b.maxZ-b.minZ)-(a.maxX-a.minX)*(a.maxZ-a.minZ))[0];
      if(largest)ceiling.userData.point={...point,x:(largest.minX+largest.maxX)/2,z:(largest.minZ+largest.maxZ)/2};
    }
  }
  try{
    manor=createEstateManor({rooms:ground.rooms,floors,theme,roam:true});manor.position.set(bounds.x,0,bounds.z);scene.add(manor);manor.updateMatrixWorld(true);
    // The manor owns its original buffers. Replace an upstairs slab with an
    // independently owned clipped copy, retaining the original for its normal
    // builder disposal instead of disposing a shared registered buffer twice.
    const slabs=[];manor.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.buildingPart==='floor-slab')slabs.push(mesh);});
    for(const mesh of slabs){
      const down=getHomeStairs(floors[mesh.userData.storey??0]).filter(stair=>stair.direction==='down');if(!down.length)continue;
      const copy=mesh.clone();copy.geometry=mesh.geometry.clone();mesh.parent.add(copy);copy.updateWorldMatrix(true,false);
      if(cutOpening(copy,down)){ownedGeometries.add(copy.geometry);mesh.removeFromParent();}
      else{copy.removeFromParent();copy.geometry.dispose();}
    }
    manor.traverse(mesh=>{if(mesh.isMesh)mesh.userData.roamStorey=mesh.userData.storey??0;});
    for(let storey=0;storey<floors.length;storey++){
      const floorHome=floors[storey],baseY=storey*STOREY_HEIGHT,group=new THREE.Group();group.name=`roam-floor-${storey}`;
      // A truthy nonmatching entrance prevents an upstairs facade from gaining
      // a second front door through the architecture builder's default lookup.
      const architecture=createRoomExpansion({...floorHome,theme,maps,roam:true,roamEntrance:storey===0?entry:{side:'none',wallCenter:{x:0,z:0}},includeGrid:false});
      group.add(architecture);interior.add(group);
      const row={storey,baseY,home:floorHome,group,architecture,rects:getFloorRects(floorHome),furniture:[],ceilings:[],ceilingLights:[],transports:[]};floorModels.push(row);
      const stairs=getHomeStairs(floorHome),down=stairs.filter(stair=>stair.direction==='down'),up=stairs.filter(stair=>stair.direction==='up').map(stair=>({...stair,direction:'down'}));
      architecture.updateMatrixWorld(true);
      architecture.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const part=mesh.userData.roomPart;
        if(part==='floor'||part==='zones'||part==='border'&&new THREE.Box3().setFromObject(mesh).max.y<.11)cutOpening(mesh,down);
      });
      for(const ceiling of architecture.getRoamCeilings())cutCeiling(ceiling,up);
      for(const item of floorHome.furniture??[]){
        const model=own(createLuxuryItem({...item,maps})),pose=getFurniturePose(floorHome,item);model.position.set(pose.x,pose.y,pose.z);model.rotation.y=THREE.MathUtils.degToRad(pose.rotation);model.userData.furnitureId=item.id;group.add(model);
        const descriptor={itemId:item.id,item,home:floorHome,storey,group:model};row.furniture.push(descriptor);furniture.push(descriptor);
      }
      for(const ceiling of architecture.getRoamCeilings()){
        if(!ceiling.geometry.getAttribute('position').count)continue;
        ceiling.material.emissive=new THREE.Color('#efe6d8');ceiling.material.emissiveIntensity=.32;row.ceilings.push(ceiling);ceilings.push(ceiling);
        const point=ceiling.userData.point??{x:bounds.x,y:ROAM_FLOOR_Y+WALL_HEIGHT-.015,z:bounds.z};
        const disc=own(new THREE.Mesh(new THREE.CylinderGeometry(.26,.26,.035,32),new THREE.MeshStandardMaterial({color:'#fff3dd',emissive:'#ffe1b8',emissiveIntensity:.8,roughness:.45})));
        disc.name='roam-ceiling-light';disc.position.set(point.x,point.y-.3,point.z);disc.userData.roamCeilingLight=true;group.add(disc);
        const light=new THREE.PointLight('#ffe1b8',0,11,2);light.position.copy(disc.position);group.add(light);
        const descriptor={id:`ceiling:${storey===0?'':storey+':'}${ceiling.userData.roomId??row.ceilingLights.length}`,roomId:ceiling.userData.roomId,storey,baseY,disc,light,worldPoint:disc.position.clone().add(new THREE.Vector3(0,baseY,0)),on:true,enabled:true,setEnabled(value){this.enabled=this.on=!!value;}};
        row.ceilingLights.push(descriptor);ceilingLights.push(descriptor);
      }
      // Clipping planes use world Y, whereas authored walls and caps remain in
      // their actual floor's local coordinates. Keys include the floor index.
      const localWalls=new Map();
      for(const mesh of architecture.getRoamWalls()){
        const local=mesh.userData.roamWall,key=storey===0?local.id:`storey:${storey}:${local.id}`;let wall=localWalls.get(key);
        if(!wall){wall={info:{...local,id:key,minY:local.minY+baseY,maxY:local.maxY+baseY},storey,meshes:[],caps:[],attachments:[]};localWalls.set(key,wall);wallGroups.set(key,wall);}
        wall.meshes.push(mesh);for(const material of[].concat(mesh.material)){material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,-1,0),1e6)];material.clipShadows=true;}
      }
      const mountTargets=new Map(getWallMountTargets(floorHome).map(target=>[target.wallId,target]));
      for(const wall of localWalls.values()){
        const d=wall.info,door=d.doorway,intervals=door?[{from:d.from,to:door.from},{from:door.to,to:d.to}]:[{from:d.from,to:d.to}];
        for(const interval of intervals){
          const length=interval.to-interval.from;if(length<=1e-5)continue;const alongX=d.alongAxis==='x',cap=own(new THREE.Mesh(new THREE.BoxGeometry(alongX?length:d.thickness,.045,alongX?d.thickness:length),new THREE.MeshStandardMaterial({color:'#4a3f37',roughness:.86})));
          cap.name='roam-orbit-cut-surface';cap.position.set(alongX?(interval.from+interval.to)/2:d.centerPlane,d.minY-baseY+.5+.0225,alongX?d.centerPlane:(interval.from+interval.to)/2);cap.visible=false;cap.userData.roamCutCap=true;group.add(cap);wall.caps.push(cap);
        }
        architecture.traverse(node=>{if(node.userData.roamWallId===d.id.replace(`storey:${storey}:`,''))wall.attachments.push(node);});
        for(const {item,group:model}of row.furniture){const mount=item.mount?.type==='wall'?mountTargets.get(item.mount.wallId):null;if(mount&&mount.axis===d.alongAxis&&Math.abs(mount.face-d.plane)<.35){const along=model.position[d.alongAxis];if(along>=d.from-.1&&along<=d.to+.1)wall.attachments.push(model);}}
      }
      group.position.y=baseY;mark(group,storey);
    }
    // One physical connection is shared by its two actual landings. A normal
    // staircase uses the upstairs-authored version once to retain its opening
    // guards; its local -STOREY_HEIGHT offset is cancelled here. Elevators use
    // their full lower-floor shaft and car once, never a duplicate upper shaft.
    for(let from=0;from<floors.length-1;from++)for(const stairs of getHomeStairs(floors[from]).filter(stair=>stair.direction==='up')){
      const to=from+1,peer=getHomeStairs(floors[to]).find(stair=>stair.id===stairs.id&&stair.direction==='down');
      if(!peer)continue;
      const elevator=stairs.type==='elevator',model=createStaircase(elevator?stairs:peer),baseY=from*STOREY_HEIGHT;
      model.position.y=baseY+(elevator?0:STOREY_HEIGHT);transportGroup.add(model);if(elevator)customModels.push(model);else own(model);
      const id=`transport:${from}:${stairs.id}`,positions=getStaircaseEntrances(stairs),angle=THREE.MathUtils.degToRad(stairs.rotation),outward=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
      const localSetter=model.userData.setElevatorFrame;
      const descriptor={id,stairId:stairs.id,type:elevator?'elevator':'stairs',from,to,baseY,stairs,model,landings:{
        lower:{storey:from,position:new THREE.Vector3(positions.lower.x,positions.lower.y+baseY,positions.lower.z),normal:outward.clone()},
        upper:{storey:to,position:new THREE.Vector3(positions.upper.x,positions.upper.y+baseY,positions.upper.z),normal:outward.clone().negate()},
      },setElevatorFrame(frame={}){if(disposed||!localSetter)return false;return localSetter({...frame,...Number.isFinite(frame.cabinY)?{cabinY:frame.cabinY-baseY}:{}});},getElevatorFrame(){const value=model.userData.elevatorFrame;return value?{...value,cabinY:value.cabinY+baseY,doors:{...value.doors}}:null;}};
      Object.assign(model.userData,{roamTransportId:id,roamTransportType:descriptor.type,roamTransportFrom:from,roamTransportTo:to});mark(model,from,{roamTransportId:id,roamTransportType:descriptor.type});
      transports.push(descriptor);floorModels[from].transports.push(descriptor);floorModels[to].transports.push(descriptor);
    }
    let avatar=null;
    if(robot){const inferred=floors.indexOf(home),storey=Number.isInteger(robotStorey)&&robotStorey>=0&&robotStorey<floors.length?robotStorey:Math.max(0,inferred);avatar=own(copyRobot(robot));avatar.visible=true;avatar.userData.avatar=true;floorModels[storey].group.add(avatar);mark(avatar,storey);}
    scene.updateMatrixWorld(true);entrance=manor.getRoamEntry();
    daylight=createHomeRoamDaylight({manor,bounds,entrance});scene.add(daylight.group);mark(daylight.group,0);
    doorway=new THREE.Group();doorway.name='roam-doorway';entrance?.hinge?.parent?.matrixWorld.decompose(doorway.position,doorway.quaternion,doorway.scale);scene.add(doorway);doorway.updateMatrixWorld(true);
    if(entrance?.hinge)doorway.attach(entrance.hinge);if(entrance?.frame)doorway.attach(entrance.frame);mark(doorway,0);scene.updateMatrixWorld(true);
    const interiorBounds=new THREE.Box3();for(const row of floorModels){const box=getFloorBounds(row.home);interiorBounds.expandByPoint(new THREE.Vector3(box.minX,row.baseY,box.minZ));interiorBounds.expandByPoint(new THREE.Vector3(box.maxX,row.baseY+ROAM_FLOOR_Y+WALL_HEIGHT,box.maxZ));}
    const buildingBounds=new THREE.Box3().setFromObject(manor).union(new THREE.Box3().setFromObject(transportGroup));
    return {scene,interior,architecture:floorModels[0].architecture,manor,doorway,daylight,furniture,ceilingLights,ceilings,entrance,bounds,rects,floorModels,floorCount:floorModels.length,transports,transportGroup,robot:avatar,interiorBounds,buildingBounds,
      setOrbitCut(camera,target,enabled){let changed=false;for(const wall of wallGroups.values()){const d=wall.info,cut=!!enabled&&(camera.position[d.axis]-d.plane)*(target[d.axis]-d.plane)<-1e-5;if(wall.cut===cut)continue;wall.cut=cut;changed=true;for(const mesh of wall.meshes)for(const material of[].concat(mesh.material))material.clippingPlanes[0].constant=cut?d.minY+.5:1e6;for(const cap of wall.caps)cap.visible=cut;for(const node of wall.attachments)node.visible=!cut;}return changed;},
      getWallState:()=>[...wallGroups.values()].map(wall=>({id:wall.info.id,storey:wall.storey,cut:!!wall.cut,axis:wall.info.axis,plane:wall.info.plane,capHeight:.045,bodyHeight:.5})),dispose};
  }catch(error){dispose();throw error;}
}

export const buildHomeRoamScene=createHomeRoamModel;
