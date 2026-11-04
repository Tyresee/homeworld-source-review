import {getFurniturePose} from './home-item-placement.js';

const point=(x,y,z)=>Object.freeze({x,y,z});
const POT_RADIUS=.12,POT_HEIGHT=.15;

// These are model-local datums after the original appliance has been fitted.
// The legacy cooker is uniformly fitted; modular worktops keep their authored
// height. A presentation accessory must never participate in either fitting.
const datums={
  rangeCooker:[-.18324307988502533,-.06584664181959955,.9215105269536706,'gas'],
  mkSingleHob:[0,-.03,1.0945,'gas'],
  mkDoubleGas:[-.1725,-.03,1.0945,'gas'],
  mkFourGas:[-.26,.12,1.0945,'gas'],
  // The decorative outer ring is outside the pot's foot. The existing small
  // centre cap is the highest physical surface underneath that foot.
  mkInduction:[-.26,.12,1.046,'induction'],
  mkRangeOven:[-.26,.12,1.0945,'gas'],
  mkWideRange:[0,.12,1.0945,'gas'],
  // The right-hand half is a griddle, so use the inner front gas burner.
  mkSteelRange:[-.017,.12,1.0945,'gas'],
};
const stations=new Map(Object.entries(datums).map(([kind,[x,z,baseY,heatType]])=>[kind,Object.freeze({
  id:'primary',kind,heatType,center:point(x,baseY,z),baseY,
  radius:POT_RADIUS,height:POT_HEIGHT,rimY:baseY+POT_HEIGHT,
  handleTarget:point(x-.142,baseY+.095,z),
  stirTarget:point(x,baseY+.115,z),front:Object.freeze({x:0,z:1}),rotation:0,
})]));

export const COOKING_STATION_KINDS=Object.freeze([...stations.keys()]);

/** A built-in visual accessory, independent of inventory and saved actions. */
export function getCookingStation(kind){return stations.get(kind)??null;}

/** Current-floor coordinates, like getFurniturePose; no storey offset is added.
 * The controller/renderer already moves the enclosing group between storeys. */
export function getHomeCookingStation(home,item){
  const station=getCookingStation(item?.kind);if(!station)return null;
  const pose=getFurniturePose(home,item);
  if(![pose.x,pose.y,pose.z,pose.rotation].every(Number.isFinite))return null;
  const angle=pose.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const rotate=p=>({x:p.x*cos+p.z*sin,z:-p.x*sin+p.z*cos});
  const project=p=>{const r=rotate(p);return{x:pose.x+r.x,y:pose.y+p.y,z:pose.z+r.z};};
  const center=project(station.center);
  return{...station,center,baseY:center.y,rimY:pose.y+station.rimY,
    handleTarget:project(station.handleTarget),stirTarget:project(station.stirTarget),
    front:rotate(station.front),rotation:pose.rotation};
}
