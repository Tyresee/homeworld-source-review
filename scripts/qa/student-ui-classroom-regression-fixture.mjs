// Fictional purchased home for classroom interaction regressions. All changes
// go through the real account calculator; this fixture never reads real pupils.
import {createMultiFloorUIReviewFixture} from './student-ui-multi-floor-fixture.mjs';
import {prepareCommerceCommand,houseFromCommerce} from '../../server/student-homes/commerce.mjs';
import {validateStudentHome} from '../../server/student-homes/profile.mjs';
export function createClassroomRegressionFixture(studentId){
  const base=createMultiFloorUIReviewFixture(studentId);let home=base.home,serial=0;const commands=[...base.commands],placed=[];
  function apply(command){
    const commandId=`ui-classroom-${++serial}`,prepared=prepareCommerceCommand(home.commerce,command,commandId);
    home={...home,commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:home.revision+(prepared.changed?1:0)};
    commands.push({id:commandId,type:command.type,amount:prepared.amount});if(!validateStudentHome(home,studentId))throw Error('Invalid classroom review fixture: '+command.type);
  }
  const rows=[
    ['outdoor-pool-3',{x:14,z:0,rotation:0},'outdoor'],
    ['outdoor-football-3',{x:5,z:17,rotation:0},'outdoor'],
    ['outdoor-garden-2',{x:-9,z:0,rotation:0},'outdoor'],
    ['outdoor-bench',{x:-9,z:6,rotation:0},'outdoor'],
    ['compactToilet-classic',{x:3.65,z:-2.8,rotation:0},0],
    ['bdSplitToilet-classic',{x:4.8,z:-2.8,rotation:0},0],
    ['bdMonoblocToilet-classic',{x:5.6,z:-2.8,rotation:0},0],
    ['bdSmartToilet-classic',{x:6.9,z:-3.1,rotation:0},0],
    ['loungeChair-classic',{x:4.0,z:.2,rotation:180},0],
    ['lcRockingChair-classic',{x:6.4,z:.2,rotation:0},0],
    ['bed-classic',{x:0,z:5.1,rotation:0},1],
  ];
  apply({type:'checkout',lines:rows.map(([skuId])=>({skuId,quantity:1}))});
  for(const[skuId,pose,storey]of rows){const owned=home.commerce.owned.find(row=>row.skuId===skuId&&row.status==='stored');if(!owned)throw Error('Missing fictional stock '+skuId);try{apply(storey==='outdoor'?{type:'placeOutdoor',id:owned.id,pose}:{type:'placeItem',id:owned.id,pose,storey});}catch(error){throw new Error('Fixture '+skuId+': '+error.message,{cause:error});}placed.push({id:owned.id,skuId,storey,pose});}
  return{home,commands,summary:{...base.summary,id:'classroom-regression',placed,commands:commands.length,simulatedSpend:commands.reduce((sum,row)=>sum+row.amount,0)}};
}
