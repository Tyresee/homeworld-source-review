import {getHomeStairs,areElevatorsAligned,isExteriorElevator} from './home-staircase-shape.js';

/** Adjacent pair records remain the persisted contract. This read-only index
 * groups correctly paired, contiguous records for one logical service route. */
export function getHomeElevatorStacks(floors=[]){
  const links=[];
  for(let from=0;from<floors.length-1;from++)for(const stairs of getHomeStairs(floors[from])){
    if(stairs.direction!=='up'||stairs.type!=='elevator')continue;
    const peer=getHomeStairs(floors[from+1]).find(row=>row.id===stairs.id&&row.direction==='down');
    if(peer&&areElevatorsAligned(stairs,peer))links.push({from,to:from+1,stairs});
  }
  const stacks=[];
  for(const link of links){const stack=stacks.find(rows=>rows.at(-1).to===link.from&&areElevatorsAligned(rows.at(-1).stairs,link.stairs));if(stack)stack.push(link);else stacks.push([link]);}
  return stacks;
}

/** Rendering identity differs from route entitlement. Paid exterior segments
 * share the one fixed physical shaft/car even if an intervening ordinary
 * stair link has not been upgraded. Logical routing must keep using the
 * contiguous getHomeElevatorStacks above, so a rendering merge grants no trip. */
export function getHomeElevatorPhysicalStacks(floors=[]){
  const physical=[];
  for(const links of getHomeElevatorStacks(floors)){
    const first=links[0].stairs;
    const existing=isExteriorElevator(first)?physical.find(stack=>isExteriorElevator(stack[0].stairs)&&areElevatorsAligned(stack[0].stairs,first)):null;
    if(existing){existing.push(...links);existing.sort((a,b)=>a.from-b.from);}
    else physical.push([...links]);
  }
  return physical;
}
