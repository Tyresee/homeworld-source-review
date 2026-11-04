// Fictional browser QA only. The third storey is purchased by the same account
// calculator as the real game; the starting robot checkpoint is separately
// seeded through the temporary lab's normal zero-cost command route.
import {createMultiFloorUIReviewFixture} from './student-ui-multi-floor-fixture.mjs';
import {prepareCommerceCommand,houseFromCommerce} from '../../server/student-homes/commerce.mjs';
import {validateStudentHome} from '../../server/student-homes/profile.mjs';
import {isRobotActivityTargetValid} from '../../server/student-homes/robot-activity.mjs';
import {getFloorHomes} from '../../public/js/home-commerce.js';
import {getFloorRects} from '../../public/js/home-layout.js';
import {getHomeStairs,areElevatorsAligned} from '../../public/js/home-staircase-shape.js';

export function createElevatorCommandUIReviewFixture(studentId,{startingStorey=1}={}){
  const base=createMultiFloorUIReviewFixture(studentId),selection={storey:2,rects:structuredClone(getFloorRects(getFloorHomes(base.home.commerce)[1]))};
  const id='ui-elevator-command-third-floor',prepared=prepareCommerceCommand(base.home.commerce,{type:'constructFloor',selection},id);
  const home={...base.home,commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:base.home.revision+(prepared.changed?1:0)};
  if(!validateStudentHome(home,studentId))throw Error('Invalid elevator command review home');
  const floors=getFloorHomes(home.commerce),middle=getHomeStairs(floors[1]),up=middle.find(row=>row.direction==='up'),down=middle.find(row=>row.direction==='down');
  if(floors.length!==3||!areElevatorsAligned(up,down))throw Error('Review third floor did not extend the paid elevator shaft');
  const robotActivity={kind:'stand',environment:'interior',storey:startingStorey,point:{x:-1.5,z:3},rotation:0};
  if(!isRobotActivityTargetValid(home,robotActivity))throw Error('Review starting-floor robot position is not walkable');
  const commands=[...base.commands,{id,type:'constructFloor',amount:prepared.amount}];
  return{home,commands,robotActivity,summary:{...base.summary,id:'elevator-command',floors:3,connectionIds:[down.id,up.id],recommendedStorey:startingStorey,commands:commands.length,simulatedSpend:commands.reduce((sum,row)=>sum+row.amount,0)}};
}

/** Same legally purchased house, with Sam on 3F for the exact 3→2→1 case. */
export function createElevatorSingleEntryUIReviewFixture(studentId){
  const fixture=createElevatorCommandUIReviewFixture(studentId,{startingStorey:2});
  return{...fixture,summary:{...fixture.summary,id:'elevator-single-entry'}};
}
