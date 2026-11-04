import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeHomeShareSnapshot,validateHomeShareSnapshot,HOME_SHARE_TITLE,createHomeShareTitle} from '../server/student-homes/share-snapshot.mjs';
import {createStudentHome} from '../server/student-homes/profile.mjs';
import {createClassroomRegressionFixture} from '../scripts/qa/student-ui-classroom-regression-fixture.mjs';
import {createMultiFloorUIReviewFixture} from '../scripts/qa/student-ui-multi-floor-fixture.mjs';
import {getFloorHomes,getStoreyRoomSlots} from '../public/js/home-commerce.js';
import {validateHomeState,getWallMountTargets,getFurniturePose} from '../public/js/home-engine.js';
import {prepareCommerceCommand,houseFromCommerce} from '../server/student-homes/commerce.mjs';
import {createHomeRoamModel} from '../public/js/home-roam-model.js';
import {createHomeRoamOutdoor} from '../public/js/home-roam-outdoor.js';
import {HOME_THEMES} from '../public/js/home-theme.js';

const studentId='11111111-1111-4111-8111-111111111111';
const forbidden=new Set(['wallet','balance','initialBalance','orders','inventory','commerce','studentId','actorUserId','tenantId','orderId','commandId','source','sourceRevision','createdBy','expectedUserId','robotActivity','createdAt','updatedAt','price','unitPrice','transactionId']);
function assertPublic(value){if(Array.isArray(value))value.forEach(assertPublic);else if(value&&typeof value==='object')for(const[key,item]of Object.entries(value)){assert.equal(forbidden.has(key),false,`private field ${key}`);assertPublic(item);}}
const appearance=item=>Object.fromEntries(Object.entries(item).filter(([key])=>key!=='id'&&key!=='mount'));

test('a full classroom achievement publishes only visual floors, actual placed outdoor items and robot appearance',()=>{
  const {home}=createClassroomRegressionFixture(studentId),before=JSON.stringify(home),snapshot=serializeHomeShareSnapshot(home);
  assert.equal(validateHomeShareSnapshot(snapshot),true);assert.equal(snapshot.title,HOME_SHARE_TITLE);assert.equal(snapshot.floors.length,2);assert.equal(snapshot.outdoor.owned.length,4);assertPublic(snapshot);
  const json=JSON.stringify(snapshot);assert.equal(json.includes(studentId),false);assert.equal(json.includes('ui-classroom'),false);assert.equal(json.includes('classroom-regression'),false);assert.equal(JSON.stringify(home),before);
  const originals=getFloorHomes(home.commerce);
  for(let i=0;i<snapshot.floors.length;i++){
    const shared=snapshot.floors[i],original=originals[i];assert.equal(validateHomeState(shared),true);assert.deepEqual(shared.slab,original.slab);assert.deepEqual(shared.surfaces,original.surfaces);assert.deepEqual(shared.furniture.map(appearance),original.furniture.map(appearance));assert.equal(shared.revision,0);assert.equal(shared.paint,0);assert.equal(shared.sandbox,false);
    assert.deepEqual(shared.rooms.map(({id,...room})=>room),original.rooms.map(({id,...room})=>room));
    for(const furniture of original.furniture)assert.equal(json.includes(`"${furniture.id}"`),false,'source ownership IDs are not public');
  }
  assert.deepEqual(snapshot.avatar.colors,home.avatar.colors);assert.deepEqual(snapshot.avatar.equipped,home.commerce.avatar.equipped);
  const expected=home.commerce.owned.filter(row=>row.status==='placed'&&row.item.kind.startsWith('outdoor-')).map(row=>appearance(row.item));assert.deepEqual(snapshot.outdoor.owned.map(row=>appearance(row.item)),expected);
  snapshot.floors[0].surfaces['floor.main'].color='#ff0000';snapshot.avatar.colors.shell='#000000';assert.equal(JSON.stringify(home),before,'returned objects do not alias stored home objects');
});


test('an explicitly supplied roster display name personalizes only the public title without mutating the home',()=>{
  const home=createStudentHome(studentId),before=JSON.stringify(home),legacy=serializeHomeShareSnapshot(home),named=serializeHomeShareSnapshot(home,{displayName:'  Sample Learner  '});
  assert.equal(named.title,"Sample Learner Home");assert.equal(validateHomeShareSnapshot(named),true);assertPublic(named);
  const {title,...visual}=named,{title:legacyTitle,...legacyVisual}=legacy;assert.deepEqual(visual,legacyVisual);assert.equal(legacyTitle,HOME_SHARE_TITLE);assert.equal(JSON.stringify(home),before);
  assert.equal(JSON.stringify(named).includes(studentId),false);assert.equal(Object.hasOwn(named,'displayName'),false,'the existing title is the only public name carrier');
});

test('public home titles retain whole Unicode code points and canonicalize trusted display text within the existing visitor limit',()=>{
  assert.equal(createHomeShareTitle('  Alex\n  Rivera  '),"Alex Rivera Home");
  assert.equal(createHomeShareTitle('A\u0000\u202elex'),"Alex Home");assert.equal(createHomeShareTitle("Zoë & O'Neil"),"Zoë & O'Neil Home");
  assert.equal(createHomeShareTitle('🙂'.repeat(40)),'🙂'.repeat(Math.floor((60-" Home".length)/'🙂'.length))+" Home");assert.equal(createHomeShareTitle('x'.repeat(100)),'x'.repeat(60-" Home".length)+" Home");
  for(const value of [undefined,null,'','  ',42,{}])assert.equal(createHomeShareTitle(value),HOME_SHARE_TITLE);
  const base=serializeHomeShareSnapshot(createStudentHome(studentId));
  for(const title of [HOME_SHARE_TITLE,"Sample Home",createHomeShareTitle('🙂'.repeat(40))])assert.equal(validateHomeShareSnapshot({...base,title}),true);
  for(const title of ['Sample'," Home"," Sample Home","Sample  Learner Home","Sample\nLearner Home","Sample‮ Home",'x'.repeat(60-" Home".length+1)+" Home"])assert.equal(validateHomeShareSnapshot({...base,title}),false,title);
});

test('an empty starter retains its real room, lawn and neutral robot without inventing purchases',()=>{
  const home=createStudentHome(studentId),snapshot=serializeHomeShareSnapshot(home);assert.equal(validateHomeShareSnapshot(snapshot),true);assert.deepEqual(snapshot.outdoor.owned,[]);assert.equal(snapshot.floors.length,1);assert.equal(snapshot.floors[0].furniture.length,0);assert.deepEqual(snapshot.floors[0].rooms,home.commerce.home.rooms);assertPublic(snapshot);
});

test('multi-floor shared stairs retain paired topology after rekeying all original IDs',()=>{
  const {home}=createMultiFloorUIReviewFixture(studentId),snapshot=serializeHomeShareSnapshot(home);
  const lower=snapshot.floors[0].stairs??snapshot.floors[0].staircases[0],upper=snapshot.floors[1].stairs??snapshot.floors[1].staircases[0];
  assert.equal(lower.id,upper.id);assert.match(lower.id,/^stairs-\d+$/);assert.equal(lower.type,'elevator');assert.equal(lower.direction,'up');assert.equal(upper.direction,'down');assert.equal(validateHomeState(snapshot.floors[1]),true);
});

test('actual purchased table and wall ornaments preserve their mounting world poses after identifier rekeying',()=>{
  let home=createStudentHome(studentId),serial=0;
  const apply=command=>{const next=prepareCommerceCommand(home.commerce,command,`share-mount-test-${++serial}`);home={...home,commerce:next.commerce,house:houseFromCommerce(next.commerce),revision:home.revision+(next.changed?1:0)};};
  apply({type:'constructFloor',selection:{storey:0,rects:[{minX:-2.8,minZ:-2.6,width:11.2,depth:5.2}]}});
  apply({type:'checkout',lines:[{skuId:'room-kitchen',quantity:1},{skuId:'wallClock-classic',quantity:1},{skuId:'writingDesk-classic',quantity:1},{skuId:'pencilCup-classic',quantity:1}]});
  const owned=sku=>home.commerce.owned.find(row=>row.skuId===sku),room=owned('room-kitchen'),slot=getStoreyRoomSlots(home.commerce,room.item.kind,0)[0];
  apply({type:'placeRoom',id:room.id,storey:0,pose:{cx:slot.cx,cz:slot.cz,bounds:slot.bounds}});
  const wall=getWallMountTargets(home.commerce.home)[0];
  apply({type:'placeItem',id:owned('wallClock-classic').id,storey:0,pose:{mount:{type:'wall',wallId:wall.wallId,u:.8,v:.5}}});
  const deskId=owned('writingDesk-classic').id;
  apply({type:'placeItem',id:deskId,storey:0,pose:{x:0,z:0,rotation:0}});
  apply({type:'placeItem',id:owned('pencilCup-classic').id,storey:0,pose:{mount:{type:'table',parentId:deskId,u:.3,v:.3}}});
  const snapshot=serializeHomeShareSnapshot(home),floor=snapshot.floors[0],cup=floor.furniture.find(item=>item.kind==='pencilCup'),desk=floor.furniture.find(item=>item.kind==='writingDesk');
  assert.equal(cup.mount.parentId,desk.id);assert.notEqual(cup.mount.parentId,deskId);assert.equal(validateHomeState(floor),true);
  for(const original of home.commerce.home.furniture){const item=floor.furniture.find(item=>item.kind===original.kind);assert.deepEqual(getFurniturePose(floor,item),getFurniturePose(home.commerce.home,original));}
});

test('the public schema rejects arbitrary text, identity fields, hidden ownership metadata and asset URLs',()=>{
  const base=serializeHomeShareSnapshot(createStudentHome(studentId));
  for(const mutate of [v=>v.title='PRIVATE STUDENT',v=>v.studentId=studentId,v=>v.avatar.colors.email='student@example.test',v=>v.avatar.modelUrl='https://example.test/private.glb',v=>v.outdoor.owned.push({id:'one',status:'placed',item:{id:'one',kind:'outdoor-pool-1',x:9,z:0,rotation:0,color:'#ffaaaa'},orderId:'private-order'})]){const value=structuredClone(base);mutate(value);assert.equal(validateHomeShareSnapshot(value),false);}
  const home=createStudentHome(studentId);home.displayName='private';assert.throws(()=>serializeHomeShareSnapshot(home),error=>error.status===422);
});

test('rekeyed render input generates the same complete building and estate geometry as the actual saved asset',()=>{
  const previous=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)})})};
  const {home}=createClassroomRegressionFixture(studentId),snapshot=serializeHomeShareSnapshot(home),floors=getFloorHomes(home.commerce);
  const a=createHomeRoamModel({home:floors[0],floors,theme:HOME_THEMES.warm}),b=createHomeRoamModel({home:snapshot.floors[0],floors:snapshot.floors,theme:HOME_THEMES.warm});
  const outdoorA=createHomeRoamOutdoor({outdoor:home.commerce}),outdoorB=createHomeRoamOutdoor({outdoor:snapshot.outdoor});
  const meshes=root=>{const rows=[];root.traverse(node=>{if(node.isMesh)rows.push(node);});return rows;};
  try{
    assert.deepEqual(b.buildingBounds.toArray?.()??[b.buildingBounds.min.toArray(),b.buildingBounds.max.toArray()],[a.buildingBounds.min.toArray(),a.buildingBounds.max.toArray()]);
    assert.equal(meshes(a.scene).length,meshes(b.scene).length);assert.equal(meshes(outdoorA.group).length,meshes(outdoorB.group).length);
    assert.deepEqual(outdoorB.bounds.min.toArray(),outdoorA.bounds.min.toArray());assert.deepEqual(outdoorB.bounds.max.toArray(),outdoorA.bounds.max.toArray());
    assert.equal(a.transports.length,b.transports.length);for(let i=0;i<a.transports.length;i++)for(const side of['lower','upper'])assert.deepEqual(a.transports[i].landings[side].position.toArray(),b.transports[i].landings[side].position.toArray());
    for(let i=0;i<floors.length;i++){const original=getWallMountTargets(floors[i]),shared=getWallMountTargets(snapshot.floors[i]);assert.equal(shared.length,original.length);assert.deepEqual(shared.map(({wallId,surfaceId,roomId,label,...row})=>row),original.map(({wallId,surfaceId,roomId,label,...row})=>row));}
  }finally{a.dispose();b.dispose();outdoorA.dispose();outdoorB.dispose();globalThis.document=previous;}
});
