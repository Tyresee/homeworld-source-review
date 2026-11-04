import {MODULAR_KITCHEN_COLLECTION} from './home-modular-kitchen-collection.js';
import {ROOMY_FURNITURE_COLLECTION} from './home-roomy-furniture-collection.js';

/** Shared semantic capabilities; rendering and stored sleep agree on new beds. */
const actions=new Map([
  ...['bed','bedTimber','bedUpholstered','bedCanopy','lcDrawerBed','lcBunkBed','lcLoftBed','lcTrundleBed','lcHouseBed','lcDayBed','lcRoyalBed'].map(kind=>[kind,'lie']),
  ...['bookcase','bookends','lcArchBookcase','lcLadderShelf','lcCubeShelf','lcSteppedShelf'].map(kind=>[kind,'read']),
  ...['kitchenSink','bathroomVanity','hhPedestalSink','hhDoubleVanity','bdCompactVanity'].map(kind=>[kind,'wash']),
  ['rangeCooker','cook'],
  ...[...MODULAR_KITCHEN_COLLECTION,...ROOMY_FURNITURE_COLLECTION].filter(row=>row.robotAction).map(row=>[row.id,row.robotAction]),
]);
export const getFurnitureRobotAction=kind=>actions.get(kind)??null;
export const isRobotBedKind=kind=>getFurnitureRobotAction(kind)==='lie';
export const ROBOT_SEAT_KINDS=Object.freeze(['sofa','daybedSofa','diningChair','loungeChair','lcCloudSofa','lcSpindleSofa','lcCurvedSofa','lcChaise','lcWingChair','lcRockingChair','lcBarrelChair','lcRecliner','lcWovenBench','lcPianoBench','lcEntryBench','lcOttoman','hhSpindleChair','hhTulipChair','hhBarStool','hhDiningBench','hhShoeBench','bdBathStool']);
