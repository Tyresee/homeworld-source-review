// Disposable fictional account fixtures. Construction and ownership use the
// real calculator. The five-floor case additionally seeds a validated top
// staircase, so the same house exercises an unserved floor without a purchase.
import {createElevatorCommandUIReviewFixture} from './student-ui-elevator-command-fixture.mjs';
import {prepareCommerceCommand,houseFromCommerce} from '../../server/student-homes/commerce.mjs';
import {validateStudentHome} from '../../server/student-homes/profile.mjs';
import {isRobotActivityTargetValid} from '../../server/student-homes/robot-activity.mjs';
import {getFloorHomes} from '../../public/js/home-commerce.js';
import {getFloorRects} from '../../public/js/home-layout.js';
import {getHomeStairs} from '../../public/js/home-staircase-shape.js';
import {applyChange} from '../../public/js/home-engine.js';
import {planRobotElevator} from '../../public/js/student-home-robot-elevator.js';

export function createElevatorKeypadUIReviewFixture(studentId,{floorCount=5,servedCount=floorCount===5?4:floorCount}={}){
  if(![5,20].includes(floorCount)||![4,20].includes(servedCount)||servedCount>floorCount)throw new TypeError('Unsupported keypad review fixture');
  const base=createElevatorCommandUIReviewFixture(studentId,{startingStorey:2});let home=base.home;
  const commands=[...base.commands];
  for(let storey=3;storey<floorCount;storey++){
    const id=`ui-keypad-floor-${storey+1}`,prepared=prepareCommerceCommand(home.commerce,{type:'constructFloor',selection:{storey,rects:structuredClone(getFloorRects(getFloorHomes(home.commerce)[storey-1]))}},id);
    home={...home,commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:home.revision+1};commands.push({id,type:'constructFloor',amount:prepared.amount});
    if(!validateStudentHome(home,studentId))throw new Error('Invalid keypad construction fixture');
  }
  if(servedCount<floorCount){
    const floors=getFloorHomes(home.commerce),index=servedCount-1,link=getHomeStairs(floors[index]).find(row=>row.direction==='up');let changed=false;
    // The supported public builder continues a paid shaft automatically. This
    // intentionally isolated historical-style fixture instead has top stairs.
    // Both records are changed together and the final full account is validated.
    const {type,placement,...plainStairs}=link;
    for(const [x,z]of[[5.5,4],[5.5,1],[4,5.5],[6,-1],[-1,5.5]]){
      const lower=applyChange(floors[index],{type:'stairs',stairs:{...plainStairs,x,z,direction:'up'}}),upper=applyChange(floors[index+1],{type:'stairs',stairs:{...plainStairs,x,z,direction:'down'}});
      if(!lower.ok||!upper.ok)continue;
      const candidate=structuredClone(home);candidate.commerce.upperFloors[index-1]=lower.state;candidate.commerce.upperFloors[index]=upper.state;candidate.house=houseFromCommerce(candidate.commerce);
      if(!validateStudentHome(candidate,studentId))continue;home=candidate;changed=true;break;
    }
    if(!changed)throw new Error('No valid unserved top-floor staircase fixture');
  }
  let robotActivity=null;const floors=getFloorHomes(home.commerce),stair=getHomeStairs(floors[0]).find(row=>row.direction==='up');
  const candidates=[{x:0,z:2.5},...[-1.5,0,1,2,3,-2].flatMap(x=>[3,0,1,2,4,5].map(z=>({x,z})))];
  for(const point of candidates){
    const candidate={kind:'stand',environment:'interior',storey:0,point,rotation:0};
    if(!robotActivity&&isRobotActivityTargetValid(home,candidate)&&planRobotElevator(floors[0],floors,0,stair.id,point,{radius:.45,height:1.51},servedCount-1).ok)robotActivity=candidate;
  }
  if(!isRobotActivityTargetValid(home,robotActivity)||!validateStudentHome(home,studentId))throw new Error('Invalid keypad starting checkpoint');
  return{home,commands,robotActivity,summary:{id:'elevator-keypad',floors:floorCount,servedCount,recommendedStorey:0,topFloorStairFixtureAdjustment:servedCount<floorCount,commands:commands.length,simulatedSpend:commands.reduce((sum,row)=>sum+row.amount,0)}};
}
