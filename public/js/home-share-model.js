import * as THREE from 'three';
import {createHomeRoamModel} from './home-roam-model.js';
import {createOutdoorWorld} from './home-outdoor-world.js';
import {getOutdoorProduct} from './home-outdoor-catalog.js';
import {getOutdoorLandBounds} from './home-outdoor-placement.js';
import {getFloorHomes} from './home-commerce.js';
import {roomRect,getRoomKind,findRoomAt} from './home-layout.js';
import {getWallMountTargets,FURNITURE_ITEMS} from './home-engine.js';
import {ROAM_FLOOR_Y} from './home-roam-geometry.js';
import {STOREY_HEIGHT} from './home-staircase-shape.js';
import {WALL_HEIGHT} from './home-room-expansion.js';
import {HOME_THEMES} from './home-theme.js';

const NORMALS={left:[-1,0,0],right:[1,0,0],front:[0,0,1],back:[0,0,-1]};
const EPS=1e-5;
const furnitureNames=new Map(FURNITURE_ITEMS.map(item=>[item.id,item.label]));
const smooth=(value,target,k)=>Math.abs(target-value)<.0001?target:value+(target-value)*k;
const materialsOf=node=>[].concat(node.material??[]);
const collect=root=>{const result=[];root.traverse(node=>result.push(node));return result;};

/** Room routes use saved room rectangles, including precise purchased areas.
 * The door is the centre of the shared opening, never a guessed grid index. */
export function getShareRooms(home){
  const rooms=(home.rooms??[]).map(room=>{const rect=roomRect(room);return {id:room.id,name:room.name??room.label??getRoomKind(room.kind)?.label??"Room",center:{x:rect.x,z:rect.z},rect,adjacent:[]};});
  for(const a of rooms)for(const b of rooms){
    if(a===b)continue;const ar=a.rect,br=b.rect;let door=null;
    const z0=Math.max(ar.minZ,br.minZ),z1=Math.min(ar.maxZ,br.maxZ),x0=Math.max(ar.minX,br.minX),x1=Math.min(ar.maxX,br.maxX);
    if(z1-z0>.1&&(Math.abs(ar.maxX-br.minX)<EPS||Math.abs(ar.minX-br.maxX)<EPS))door={x:Math.abs(ar.maxX-br.minX)<EPS?ar.maxX:ar.minX,z:(z0+z1)/2};
    if(x1-x0>.1&&(Math.abs(ar.maxZ-br.minZ)<EPS||Math.abs(ar.minZ-br.maxZ)<EPS))door={x:(x0+x1)/2,z:Math.abs(ar.maxZ-br.minZ)<EPS?ar.maxZ:ar.minZ};
    if(door)a.adjacent.push({roomId:b.id,door});
  }
  return rooms;
}

/** A disposable presentation graph. It instantiates only model builders;
 * editor, object runtimes, robot commands and account writers are absent. */
export function createHomeShareModel({commerce,outdoor:outdoorState,home=commerce?.home??outdoorState?.home,floors=commerce?getFloorHomes(commerce):home?[home]:[],theme=HOME_THEMES.warm,maps={},robot=null,robotStorey=0,robotEnvironment='interior'}={}){
  if(!floors.length||!home)throw new TypeError("A valid home snapshot is required for read-only viewing.");
  outdoorState=outdoorState??commerce??{home,owned:[]};
  const source=createHomeRoamModel({home,floors,theme:['warm','toy'].includes(theme?.id)?theme:HOME_THEMES.warm,maps,robot,robotStorey,robotEnvironment});
  const scene=source.scene,clonedMaterials=new Set(),clonedGeometries=new Set(),extraGeometries=new Set(),extraMaterials=new Set(),walls=[],roofs=[];
  let disposed=false,lastState={name:'ORBIT',floor:0},elevatorOpacity=1,idleTime=0;
  const floorRows=source.floorModels.map(row=>({index:row.storey,group:row.group,baseY:row.baseY,floorY:row.baseY+ROAM_FLOOR_Y+.007,home:row.home,rooms:getShareRooms(row.home).map(room=>({...room,floorY:row.baseY+ROAM_FLOOR_Y+.007})),opacity:1,offset:0,ceilings:row.ceilings,walls:[]}));
  scene.updateMatrixWorld(true);
  // Roof patches already describe only uncovered cells on each actual floor.
  // Keep their real authored models rather than replacing them with boxes.
  for(const node of [...source.manor.children])if(node.name.startsWith('manor-roof:')){
    const top=node.userData.storey??0;scene.attach(node);roofs.push({group:node,top,baseY:node.position.y,offset:0,opacity:1});
  }
  // The exterior builder authors world-height facade children. attach retains
  // their exact world transform while making the corresponding floor own it.
  const facade=[];
  for(const node of [...source.manor.children]){
    const index=Math.min(floorRows.length-1,node.userData.storey??0),row=floorRows[index];
    if(node.userData.buildingPart==='floor-slab'){node.visible=false;continue;}
    if(node.isMesh&&node.userData.buildingPart==='decoration'&&node.position.y>=row.baseY+WALL_HEIGHT+.1){
      const candidates=roofs.filter(roof=>roof.top===index);if(candidates.length){const at=node.getWorldPosition(new THREE.Vector3()),nearest=candidates.reduce((a,b)=>a.group.position.distanceToSquared(at)<b.group.position.distanceToSquared(at)?a:b);nearest.group.attach(node);continue;}
    }
    row.group.attach(node);facade.push(node);
  }
  if(source.doorway.children.length)floorRows[0].group.attach(source.doorway);
  source.daylight.group.visible=false;
  // Use one independent lighting preset supplied by the share viewer. Saved
  // powered lights remain models, without interactive light/audio controllers.
  scene.traverse(node=>{if(node.isLight)node.intensity=0;if(node.userData.roamCutCap)node.visible=false;});
  source.manor.visible=false;
  function ownMaterials(root){
    const replacements=new Map(),result=[];
    root.traverse(node=>{if(!node.material)return;const list=materialsOf(node).map(original=>{
      if(!replacements.has(original)){
        const m=original.clone();m.clippingPlanes=null;m.userData={...m.userData,base:original.opacity};
        // Material.clone intentionally discards game-specific L1 shader
        // callbacks. Sharing is calibrated in its own rendering pipeline.
        if(m.emissive)m.emissiveIntensity=0;
        replacements.set(original,m);clonedMaterials.add(m);result.push(m);
      }
      return replacements.get(original);
    });node.material=Array.isArray(node.material)?list:list[0];});return result;
  }
  function prepareWall(mesh,row){
    const info=mesh.userData.roamWall;if(!info)return;
    const original=mesh.geometry;original.computeBoundingBox();const foot=original.boundingBox.min.y,geometry=original.clone();
    geometry.translate(0,-foot,0);mesh.position.y+=foot*mesh.scale.y;mesh.geometry=geometry;clonedGeometries.add(geometry);
    const authoredHeight=geometry.boundingBox?.max.y??(info.maxY-info.minY);
    // Ordinary game partitions are deliberately knee-height for editing. The
    // share scene owns a full-height version, then reveals 42% in FOCUS.
    if(info.exterior===false&&mesh.userData.sharedPartitionAxis&&authoredHeight>.01)mesh.scale.y*=WALL_HEIGHT/authoredHeight;
    const exterior=info.exterior!==false,normal=exterior?new THREE.Vector3(...NORMALS[info.side]):null;
    const center=mesh.getWorldPosition(new THREE.Vector3());
    const wall={mesh,info,index:row.index,normal,center,extras:[],ratio:1,fullScaleY:mesh.scale.y};walls.push(wall);row.walls.push(wall);
  }
  for(const row of floorRows){
    row.group.updateMatrixWorld(true);for(const node of collect(row.group))if(node.isMesh&&node.userData.roamWall)prepareWall(node,row);
    const attachments=collect(row.group).filter(node=>node.userData.roamWallId&&!node.userData.roamWall);
    for(const wall of row.walls){
      if(wall.info.id)wall.extras.push(...attachments.filter(node=>node.userData.roamWallId===wall.info.id));
      const mounts=new Map(getWallMountTargets(row.home).map(target=>[target.wallId,target]));
      for(const furniture of source.floorModels[row.index].furniture){const target=furniture.item.mount?.type==='wall'?mounts.get(furniture.item.mount.wallId):null;if(target&&target.axis===wall.info.alongAxis&&Math.abs(target.face-wall.info.plane)<.4){const along=furniture.group.position[target.axis];if(along>=wall.info.from-EPS&&along<=wall.info.to+EPS)wall.extras.push(furniture.group);}}
    }
    for(const node of facade.filter(node=>node.parent===row.group&&node.userData.buildingPart==='facade')){
      const at=node.getWorldPosition(new THREE.Vector3()),side=node.userData.side,axis=['front','back'].includes(side)?'x':'z';
      for(const wall of row.walls.filter(wall=>wall.normal&&wall.info.side===side&&at[axis]>=wall.info.from-EPS&&at[axis]<=wall.info.to+EPS))wall.extras.push(node);
    }
    if(row.index===0)for(const wall of row.walls.filter(wall=>wall.normal&&wall.info.entrance))wall.extras.push(source.doorway);
    row.materials=ownMaterials(row.group);
    row.group.userData.shareFloor=row.index;
    for(const ceiling of row.ceilings){ceiling.visible=false;ceiling.castShadow=true;ceiling.material.side=THREE.DoubleSide;ceiling.material.needsUpdate=true;}
    row.group.traverse(node=>{if(node.isMesh){node.userData.shareFloor=row.index;node.userData.shareHouse=true;}});
    for(const item of source.floorModels[row.index].furniture)item.group.traverse(node=>{if(node.isMesh)Object.assign(node.userData,{shareLabel:item.item.label??furnitureNames.get(item.item.kind)??"Furniture",shareFurnitureId:item.itemId});});
  }
  for(const roof of roofs){roof.materials=ownMaterials(roof.group);roof.group.traverse(node=>{if(node.isMesh)Object.assign(node.userData,{shareFloor:roof.top,shareHouse:true,shareRoof:true});});}
  const transportMaterials=ownMaterials(source.exteriorTransportGroup),interiorTransportMaterials=ownMaterials(source.transportGroup);
  for(const group of [source.exteriorTransportGroup,source.transportGroup])group.traverse(node=>{if(node.isMesh)node.userData.shareHouse=true;});
  if(source.robot)source.robot.traverse(node=>{if(node.isMesh)node.userData.shareRobot=true;});
  const robotScale=source.robot?.scale.clone(),robotHead=source.robot?.getObjectByName('Head'),headQuaternion=robotHead?.quaternion.clone(),idleQuaternion=new THREE.Quaternion(),idleAxis=new THREE.Vector3(1,0,0);
  const outdoor=createOutdoorWorld();outdoor.setState(outdoorState);scene.add(outdoor);
  const land=getOutdoorLandBounds(outdoorState),bounds=new THREE.Box3(new THREE.Vector3(land.minX,-.8,land.minZ),new THREE.Vector3(land.maxX,Math.max(1,source.buildingBounds.max.y),land.maxZ));
  const extra=new THREE.Group();extra.name='share-land-model-base';scene.add(extra);
  const extraBox=(size,at,color)=>{const geometry=new THREE.BoxGeometry(...size),material=new THREE.MeshStandardMaterial({color,roughness:.9});extraGeometries.add(geometry);extraMaterials.add(material);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...at);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.shareIgnorePick=true;extra.add(mesh);return mesh;};
  extraBox([land.width,.45,land.depth],[land.x,-.55,land.z],'#9b7654');
  // A restrained continuous fence reads as the edge of the whole saved plot.
  for(const z of [land.minZ+.16,land.maxZ-.16])for(const y of [.3,.72])extraBox([land.width,.07,.08],[land.x,y,z],'#e4d5b9');
  for(const x of [land.minX+.16,land.maxX-.16])for(const y of [.3,.72])extraBox([.08,.07,land.depth],[x,y,land.z],'#e4d5b9');
  for(let x=land.minX+.16;x<=land.maxX;x+=2.6)for(const z of [land.minZ+.16,land.maxZ-.16])extraBox([.1,.9,.1],[x,.38,z],'#cfb58e');
  for(let z=land.minZ+.16;z<=land.maxZ;z+=2.6)for(const x of [land.minX+.16,land.maxX-.16])extraBox([.1,.9,.1],[x,.38,z],'#cfb58e');
  outdoor.traverse(node=>{if(node.isMesh&&!node.userData.outdoorOwnedId){node.userData.shareIgnorePick=true;node.userData.roamWalkSurface=true;}});
  const estate={group:outdoor,land,bounds:bounds.clone(),placedIds:(outdoorState.owned??[]).filter(row=>row.status==='placed'&&outdoor.getOwned(row.id)).map(row=>row.id)};
  const houseBounds=source.buildingBounds.clone(),houseCenter=houseBounds.getCenter(new THREE.Vector3());
  const spots=[{id:'house',name:"My house",house:true,center:houseCenter.clone(),dist:42,labelPosition:new THREE.Vector3(houseCenter.x,houseBounds.max.y+1,houseCenter.z)}];
  const spotGroups=new Map();
  for(const owned of outdoorState.owned??[]){
    const product=getOutdoorProduct(owned.item?.kind),group=outdoor.getOwned(owned.id);if(!product||!group||owned.status!=='placed')continue;
    const key=product.role==='facility'?(product.feature??owned.id):(product.feature??'outdoor');
    if(!spotGroups.has(key))spotGroups.set(key,{id:key,name:product.role==='facility'?(product.familyLabel??product.name):"Outdoor features",members:[],bounds:new THREE.Box3()});
    const spot=spotGroups.get(key);spot.members.push(group);spot.bounds.expandByObject(group);
    group.traverse(node=>{if(node.isMesh)Object.assign(node.userData,{shareSpot:key,shareLabel:product.name});});
  }
  for(const spot of spotGroups.values()){
    spot.center=spot.bounds.getCenter(new THREE.Vector3());spot.center.y=.5;
    const size=spot.bounds.getSize(new THREE.Vector3());spot.dist=THREE.MathUtils.clamp(Math.max(size.x,size.z)*1.8,17,26);spot.labelPosition=spot.center.clone().setY(spot.bounds.max.y+1);spots.push(spot);
  }
  // Use existing physical elevator stacks and landing contacts. A share visit
  // never creates a paid transport entitlement or a saved staircase record.
  const liftLinks=source.transports.filter(row=>row.type==='elevator'),liftModel=liftLinks.find(row=>row.model.userData.exteriorElevator)?.model??liftLinks[0]?.model;
  let elevator=null;
  if(liftModel){
    const links=liftLinks.filter(row=>row.model===liftModel),contacts=new Map();
    for(const link of links)for(const landing of Object.values(link.landings))if(!contacts.has(landing.storey)){
      const room=findRoomAt(floorRows[landing.storey].home.rooms,landing.waitingPosition.x,landing.waitingPosition.z)??findRoomAt(floorRows[landing.storey].home.rooms,landing.doorPosition.x+landing.normal.x*.85,landing.doorPosition.z+landing.normal.z*.85);
      if(room)contacts.set(landing.storey,{floor:landing.storey,roomId:room.id,door:landing.waitingPosition.clone(),doorPlane:landing.doorPosition.clone(),cabin:landing.cabinCentre.clone(),normal:landing.normal.clone()});
    }
    const served=[...contacts.keys()].sort((a,b)=>a-b);
    if(served.length){
      elevator={group:liftModel,cabinGroup:liftModel.getObjectByName('elevator-cabin'),served,landings:served.map(index=>contacts.get(index)),height:contacts.get(served[0]).cabin.y,
        setHeight(y){if(!Number.isFinite(y))return false;this.height=y;const link=links.find(link=>y>=link.baseY-.1&&y<=link.baseY+STOREY_HEIGHT+.2)??links[0];return link.setElevatorFrame({cabinY:y,doors:{lower:0,upper:0},phase:'share-view'});}};
    }
  }
  function fade(materials,amount){for(const material of materials){const opacity=material.userData.base*amount,transparent=opacity<.999;if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}material.opacity=opacity;material.depthWrite=opacity>.6;}}
  function update(state,camera,dt,{transition=false,ceilingReady=!transition}={}){
    if(disposed)return;lastState={...state};
    idleTime+=Math.min(.05,Math.max(0,dt));
    if(source.robot&&robotScale){source.robot.scale.copy(robotScale);source.robot.scale.y*=1+Math.sin(idleTime*1.6)*.003;}
    if(robotHead&&headQuaternion)robotHead.quaternion.copy(headQuaternion).multiply(idleQuaternion.setFromAxisAngle(idleAxis,Math.sin(idleTime*.7)*.008));const name=state.name??state.state??'ORBIT',floor=state.floor??0,k=1-Math.exp(-7*Math.min(.05,Math.max(0,dt))),room=name==='ROOM',exploded=name==='EXPLODED',focus=name==='FOCUS';
    for(const row of floorRows){
      const offset=exploded?row.index*STOREY_HEIGHT*1.2:focus&&row.index>floor?10:0,opacity=room?(row.index===floor?1:0):focus&&row.index>floor?0:1;
      row.offset=smooth(row.offset,offset,k);row.opacity=smooth(row.opacity,opacity,k);row.group.position.y=row.baseY+row.offset;row.group.visible=row.opacity>.02;fade(row.materials,row.opacity);
      for(const ceiling of row.ceilings)ceiling.visible=room&&row.index===floor&&ceilingReady&&!transition;
      for(const light of source.floorModels[row.index].ceilingLights)light.disc.visible=room&&row.index===floor&&ceilingReady&&!transition;
    }
    for(const roof of roofs){const hidden=room||focus&&roof.top>=floor,offset=exploded?roof.top*STOREY_HEIGHT*1.2+2.6:focus&&roof.top>=floor?8:0;roof.offset=smooth(roof.offset,offset,k);roof.opacity=smooth(roof.opacity,hidden?0:1,k);roof.group.position.y=roof.baseY+roof.offset;roof.group.visible=roof.opacity>.02;fade(roof.materials,roof.opacity);}
    elevatorOpacity=smooth(elevatorOpacity,exploded||focus?0:1,k);source.exteriorTransportGroup.visible=elevatorOpacity>.02;source.transportGroup.visible=elevatorOpacity>.02;for(const transport of source.transports)transport.model.visible=transport.type==='elevator'||!room;fade(transportMaterials,elevatorOpacity);fade(interiorTransportMaterials,elevatorOpacity);
    const extraHidden=new Map();
    for(const wall of walls){
      let target=1;if(focus&&wall.index===floor){if(!wall.normal)target=.42;else target=(camera.position.x-wall.center.x)*wall.normal.x+(camera.position.z-wall.center.z)*wall.normal.z>0?.1:1;}
      wall.ratio=smooth(wall.ratio,target,k);wall.mesh.scale.y=wall.fullScaleY*wall.ratio;
      for(const attachment of wall.extras)extraHidden.set(attachment,(extraHidden.get(attachment)??false)||wall.ratio<.6);
    }
    for(const [node,hidden]of extraHidden)node.visible=!hidden;
    scene.updateMatrixWorld(true);
  }
  function pickInfo(object,point){
    for(let node=object;node;node=node.parent)if(!node.visible||node.userData.shareIgnorePick)return null;
    const material=materialsOf(object);if(material.length&&material.every(m=>m.opacity<=.5)&&!object.userData.shareHitArea)return null;
    const d=object.userData;
    if(d.shareRobot)return {type:'robot',name:"Companion",floor:d.shareFloor??0};
    if(d.shareSpot)return {type:'spot',spotId:d.shareSpot,name:d.shareLabel};
    if(d.shareHouse){const floor=d.shareFloor??d.roamStorey??0,room=point?findRoomAt(floorRows[floor]?.home.rooms??[],point.x,point.z):null;return {type:d.shareFurnitureId?'furniture':'house',floor,roomId:room?.id??null,name:d.shareLabel??"House",roof:!!d.shareRoof};}
    return null;
  }
  function getDiagnostics(){return {floorCount:floorRows.length,storeyHeight:STOREY_HEIGHT,state:{...lastState},floors:floorRows.map(row=>({index:row.index,y:row.group.position.y,offset:row.offset,opacity:row.opacity,visible:row.group.visible})),roofs:roofs.map(roof=>({top:roof.top,offset:roof.offset,opacity:roof.opacity})),walls:walls.map(wall=>({floor:wall.index,side:wall.info.side,exterior:!!wall.normal,ratio:wall.ratio,attachments:wall.extras.length,attachmentsHidden:wall.extras.every(node=>!node.visible)})),elevatorOpacity,elevatorServed:elevator?.served??[],outdoorSpots:spots.filter(spot=>!spot.house).map(spot=>spot.id)};}
  function dispose(){if(disposed)return;disposed=true;outdoor.dispose();source.dispose();for(const material of clonedMaterials)material.dispose();for(const geometry of clonedGeometries)geometry.dispose();for(const geometry of extraGeometries)geometry.dispose();for(const material of extraMaterials)material.dispose();}
  update({name:'ORBIT',floor:0},{position:new THREE.Vector3(-20,20,20)},.05);
  return {scene,floors:floorRows,spots,bounds,houseBounds,buildingBounds:houseBounds,estate,entrance:source.entrance,storeyHeight:STOREY_HEIGHT,elevator,robot:source.robot,roofs,walls,update,pickInfo,getDiagnostics,dispose};
}
