// Fictional E1 house: uses the production starter origin and only front/right
// growth. Every floor/paid connection goes through the real account calculator.
import {createStudentHome,validateStudentHome} from '../../server/student-homes/profile.mjs';
import {prepareCommerceCommand,houseFromCommerce} from '../../server/student-homes/commerce.mjs';
import {getFloorHomes} from '../../public/js/home-commerce.js';
import {getHomeStairs,isExteriorElevator} from '../../public/js/home-staircase-shape.js';
import {isRobotActivityTargetValid} from '../../server/student-homes/robot-activity.mjs';

export function createExteriorElevatorUIReviewFixture(studentId){
  let home=createStudentHome(studentId,'2026-11-02T00:00:00.000Z');const commands=[];
  function apply(command){
    const id='ui-exterior-elevator-'+(commands.length+1),prepared=prepareCommerceCommand(home.commerce,command,id);
    home={...home,commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:home.revision+1};
    commands.push({id,type:command.type,amount:prepared.amount});
    if(!validateStudentHome(home,studentId))throw Error('Invalid anchored E1 fixture');
  }
  for(const storey of[0,1])apply({type:'constructFloor',selection:{storey,rects:[{minX:-2.8,minZ:-2.6,width:12,depth:11}]}});
  const first=getHomeStairs(home.commerce.home).find(row=>row.direction==='up');
  apply({type:'upgradeStaircase',storey:0,id:first.id});
  apply({type:'constructFloor',selection:{storey:2,rects:[{minX:-2.8,minZ:-2.6,width:12,depth:11}]}});
  const floors=getFloorHomes(home.commerce);
  if(floors.length!==3||floors.some(floor=>!getHomeStairs(floor).some(isExteriorElevator)))throw Error('E1 extension did not continue');
  const robotActivity={kind:'stand',environment:'interior',storey:2,point:{x:0,z:2},rotation:0};
  if(!isRobotActivityTargetValid(home,robotActivity))throw Error('Invalid E1 starting checkpoint');
  return{home,commands,robotActivity,summary:{id:'exterior-elevator',floors:3,recommendedStorey:2,anchoredOrigin:true,simulatedSpend:commands.reduce((sum,row)=>sum+row.amount,0),commands:commands.length}};
}
