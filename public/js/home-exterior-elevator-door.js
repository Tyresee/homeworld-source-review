import {getHomeStairs,isExteriorElevator,getElevatorStationContacts,ELEVATOR_DOOR_CLEAR_WIDTH} from './home-staircase-shape.js';

/** The left doorway belongs to the fixed shaft, even when an expanded wall
 * boundary spans several rooms. Return null for unrelated facade segments. */
export function exteriorElevatorDoorOnEdge(home,edge){
  if(edge.side!=='left')return null;
  const stairs=getHomeStairs(home).find(isExteriorElevator);if(!stairs)return null;
  const contacts=getElevatorStationContacts(stairs);if(!contacts)return null;
  const door=contacts.lower.doorPosition;
  if(Math.abs(edge.at-door.x)>.15||door.z-ELEVATOR_DOOR_CLEAR_WIDTH/2<edge.from-1e-6||door.z+ELEVATOR_DOOR_CLEAR_WIDTH/2>edge.to+1e-6)return null;
  return {width:ELEVATOR_DOOR_CLEAR_WIDTH,top:2.10,center:(edge.from+edge.to)/2-door.z,arch:false,coordinate:door.z,stairs};
}
