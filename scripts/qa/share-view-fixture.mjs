/** Disposable share-view acceptance house. Every purchase and placement uses
 * the production account calculator; no real student or account is loaded. */
import {createStudentHome,validateStudentHome} from '../../server/student-homes/profile.mjs';
import {prepareCommerceCommand,houseFromCommerce} from '../../server/student-homes/commerce.mjs';
import {serializeHomeShareSnapshot} from '../../server/student-homes/share-snapshot.mjs';
import {getFloorHomes,getStoreyRoomSlots} from '../../public/js/home-commerce.js';
import {getHomeStairs,isExteriorElevator} from '../../public/js/home-staircase-shape.js';

export function createShareViewReviewFixture(){
  const studentId='11111111-1111-4111-8111-111111111111',now='2026-11-04T08:00:00.000Z';
  let home=createStudentHome(studentId,now),serial=0;
  const apply=command=>{
    const prepared=prepareCommerceCommand(home.commerce,command,`share-view-qa-${++serial}`);
    home={...home,commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:home.revision+(prepared.changed?1:0),updatedAt:now};
    if(!validateStudentHome(home,studentId))throw Error('Invalid share acceptance fixture after '+command.type);
  };
  const slab={minX:-2.8,minZ:-2.6,width:11.2,depth:10.4};
  for(const storey of[0,1])apply({type:'constructFloor',selection:{storey,rects:[slab]}});
  apply({type:'upgradeStaircase',storey:0,id:getHomeStairs(home.commerce.home).find(row=>row.direction==='up').id});
  apply({type:'constructFloor',selection:{storey:2,rects:[slab]}});
  const rooms=[['room-kitchen',0,1,-1],['room-playroom',0,-1,1],['room-bedroom',1,-1,-1],['room-study',1,1,-1],['room-bedroom',2,-1,-1],['room-study',2,1,-1]];
  // Keep the ground-floor entrance's real door swing and arrival corridor
  // clear; the sofa sits along the room's side instead of across that route.
  const objects=[['ipRetroTelevision-classic',0,{x:0,z:3.45,rotation:0}],['sofa-classic',0,{x:1.5,z:5.2,rotation:90}],['bedTimber-classic',1,{x:.5,z:0,rotation:0}]];
  const outdoors=[['outdoor-pool-3',{x:15,z:0,rotation:0}],['outdoor-football-3',{x:5,z:18,rotation:0}],['outdoor-garden-2',{x:-10,z:0,rotation:0}],['outdoor-bench',{x:-10,z:6,rotation:0}]];
  const quantities=new Map();for(const skuId of[...rooms.map(([skuId])=>skuId),...objects.map(([skuId])=>skuId),...outdoors.map(([skuId])=>skuId)])quantities.set(skuId,(quantities.get(skuId)??0)+1);
  apply({type:'checkout',lines:[...quantities].map(([skuId,quantity])=>({skuId,quantity}))});
  const stock=sku=>home.commerce.owned.find(row=>row.skuId===sku&&row.status==='stored');
  for(const[sku,storey,cx,cz]of rooms){
    const item=stock(sku),slot=getStoreyRoomSlots(home.commerce,item.item.kind,storey).find(row=>row.cx===cx&&row.cz===cz);
    if(!slot)throw Error('Missing legal share-view QA room: '+sku);
    apply({type:'placeRoom',id:item.id,storey,pose:{cx,cz,bounds:slot.bounds}});
  }
  for(const[sku,storey,pose]of objects){try{apply({type:'placeItem',id:stock(sku).id,storey,pose});}catch(error){throw new Error(`Share-view QA placement ${sku}: ${error.message}`,{cause:error});}}
  for(const[sku,pose]of outdoors)apply({type:'placeOutdoor',id:stock(sku).id,pose});
  const floors=getFloorHomes(home.commerce);
  if(floors.length!==3||floors.some(floor=>!getHomeStairs(floor).some(isExteriorElevator)))throw Error('Acceptance fixture requires a real three-floor exterior lift.');
  return{home,envelope:{share:{id:'A'.repeat(43),publishedAt:now,snapshot:serializeHomeShareSnapshot(home)}}};
}
