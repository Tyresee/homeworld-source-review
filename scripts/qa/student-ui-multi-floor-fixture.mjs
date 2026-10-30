// Explicit, disposable QA data. Every structure and owned object is produced by
// the real account command calculator; no platform account or wallet is used.
import {createStudentHome,validateStudentHome} from '../../server/student-homes/profile.mjs';
import {prepareCommerceCommand,houseFromCommerce} from '../../server/student-homes/commerce.mjs';
import {getFloorHomes,getStoreyRoomSlots} from '../../public/js/home-commerce.js';
import {getHomeStairs} from '../../public/js/home-staircase-shape.js';
import {roomRect} from '../../public/js/home-layout.js';

export function createMultiFloorUIReviewFixture(studentId,{now='2026-10-30T00:00:00.000Z'}={}) {
  let home=createStudentHome(studentId,now),serial=0;
  const commands=[];
  function apply(command) {
    const commandId=`ui-multi-floor-${++serial}`,prepared=prepareCommerceCommand(home.commerce,command,commandId);
    home={...home,commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:home.revision+(prepared.changed?1:0),updatedAt:now};
    commands.push({id:commandId,type:command.type,amount:prepared.amount});
    if(!validateStudentHome(home,studentId))throw Error('Invalid disposable multi-floor fixture after '+command.type);
  }
  const slab={minX:-2.8,minZ:-3.8,width:11.2,depth:11.6};
  for(const storey of[0,1])apply({type:'constructFloor',selection:{storey,rects:[slab]}});
  const connection=getHomeStairs(home.commerce.home).find(row=>row.direction==='up');
  apply({type:'upgradeStaircase',id:connection.id,storey:0});
  apply({type:'checkout',lines:[
    {skuId:'room-kitchen',quantity:1},{skuId:'room-playroom',quantity:1},
    {skuId:'room-bedroom',quantity:1},{skuId:'room-study',quantity:1},
    {skuId:'ipRetroTelevision-classic',quantity:2},{skuId:'sofa-classic',quantity:2},
    {skuId:'bedTimber-classic',quantity:1},
  ]});
  const stock=sku=>home.commerce.owned.find(row=>row.skuId===sku&&row.status==='stored');
  function room(sku,storey,cx,cz) {
    const owned=stock(sku),slot=getStoreyRoomSlots(home.commerce,owned.item.kind,storey).find(row=>row.cx===cx&&row.cz===cz);
    if(!slot)throw Error('Missing legal review room position: '+sku);
    apply({type:'placeRoom',id:owned.id,pose:{cx,cz,bounds:slot.bounds},storey});
    return roomRect(getFloorHomes(home.commerce)[storey].rooms.find(row=>row.id===owned.id));
  }
  // Ground: starter living + rear-right kitchen + front-left playroom.
  // Upper: rear-right bedroom + front-right study; the left half is open.
  room('room-kitchen',0,1,-1);const playroom=room('room-playroom',0,-1,1);
  const bedroom=room('room-bedroom',1,1,-1),study=room('room-study',1,1,1),seatingRooms=[playroom,study];
  const televisions=[];
  for(const storey of[0,1]){
    const area=seatingRooms[storey],x=area.x,tv=stock('ipRetroTelevision-classic');
    apply({type:'placeItem',id:tv.id,pose:{x,z:area.minZ+.85,rotation:0},storey});
    apply({type:'setObjectState',id:tv.id,patch:{power:true,channel:storey},storey});televisions.push(tv.id);
    apply({type:'placeItem',id:stock('sofa-classic').id,pose:{x,z:area.maxZ-1.2,rotation:180},storey});
  }
  apply({type:'placeItem',id:stock('bedTimber-classic').id,pose:{x:bedroom.x,z:bedroom.z,rotation:0},storey:1});
  return {home,summary:{id:'multi-floor',floors:getFloorHomes(home.commerce).length,connectionId:connection.id,transport:'elevator',televisions,commands:commands.length,simulatedSpend:commands.reduce((sum,row)=>sum+row.amount,0)},commands};
}
