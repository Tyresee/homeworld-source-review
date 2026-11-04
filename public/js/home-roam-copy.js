// Product copy lives here, separately from camera, lighting and account logic.
// The source product defaults to its classroom locale. A normalized review
// build may choose English and omit the classroom translation table.
export const HOME_ROAM_DEFAULT_LOCALE='en';

function freezeCopy(value){
  if(Array.isArray(value))return Object.freeze(value.map(freezeCopy));
  if(value&&typeof value==='object')return Object.freeze(Object.fromEntries(Object.entries(value).map(([key,item])=>[key,freezeCopy(item)])));
  return value;
}

const english=freezeCopy({
  dock:'Visit',homeTitle:"{name}'s home · Free visit",exampleTitle:'Example home · Free visit',
  canvasLabel:'Free visit: drag to orbit, click the door to enter, and move freely without collisions',
  viewLabel:'Free visit',statusExterior:'Viewing: Exterior',statusInterior:'Viewing: Interior',
  auto:'Auto',exterior:'Exterior',interior:'Interior',displayGroup:'Visit display',cameraGroup:'Visit camera',
  leave:'Leave',leaveAria:'Leave and return to exterior orbit',spin:'Slow orbit',spinStart:'Start slow orbit',spinStop:'Stop slow orbit',overview:'Overview',
  outdoorWalk:'Garden walk',outdoorTip:'Explore the real garden, pool and sports grounds',enterHouse:'Enter house',houseTip:'Return to the front door and go inside',gardenUnavailable:'No clear garden ground is available. Leave some open lawn beside the house.',doorTip:'Click the door to enter',helpAria:'Visit controls',helpClose:'Got it',helpCloseAria:'Close visit controls',
  helpTitleExterior:'Orbit around the house',helpTitleInterior:'Explore the home and garden',
  instructions:'W S forward/back · A D sideways · E Q up/down · Shift faster · Drag to look · Click floor to move · Click TVs, remotes, taps, toilets, lights, drawers, doors or hobs to use · Pass through walls · Esc to leave',
  helpNoteExterior:'Click the door to go inside, or choose Garden walk / click the lawn to explore the actual garden, pool and sports grounds.',
  helpNoteInterior:'Choose Garden walk to go outdoors, then Enter house to return. Manual movement has no collisions. Lights, drawers and water remain temporary for this visit.',
  outsideHelp:[['Left drag','Orbit around the house'],['Wheel','Move closer / farther'],['Right drag','Pan'],['W A S D','Pan the camera'],['Q / E','Orbit left / right'],['Space','Slow orbit'],['R','Overview']],
  insideHelp:[['W / S','Forward / back'],['A / D','Sideways'],['E or Space / Q','Up / down'],['← / →','Turn in place'],['Shift','Move faster'],['Drag','Look around'],['Wheel','Forward / back'],['Click floor','Walk there'],['Click object','Use it'],['Esc','Leave']],
  flush:'Flush',floorLampOn:'Turn floor lamp on',floorLampOff:'Turn floor lamp off',faucetOn:'Turn tap on',faucetOff:'Turn tap off',
  hobOn:'Light hob',hobOff:'Turn hob off',drawerOpen:'Open drawer',drawerClose:'Close drawer',cabinetOpen:'Open cabinet door',cabinetClose:'Close cabinet door',ceilingOn:'Turn light on',ceilingOff:'Turn light off',
  computerOn:'Turn computer on',computerOff:'Turn computer off',greenhouseOpen:'Open greenhouse door',greenhouseClose:'Close greenhouse door',
  tvOn:'Turn television on',tvOff:'Turn television off',tvNextChannel:'Change channel · {channel}',tvChannels:['Forest animation','Weather','Sports','Music','Aquarium','Space explorer','Dinosaur valley','Little kitchen','Toy railway','Robot dance','Art studio','Discovery lab'],
  floorLabel:'{floor}F',floorsAria:'Visit a floor',stairsUp:'Walk upstairs',stairsDown:'Walk downstairs',elevatorUp:'Take elevator up',elevatorDown:'Take elevator down',elevatorChoose:'Click the elevator to choose up or down',
  travelBlocked:'The floor passage or elevator doorway is blocked. Please clear its entrance.',
  travelHeight:'Return to normal walking height on this floor before using the stairs or elevator.',
  travelDestinationBlocked:'The destination landing is blocked. Clear its doorway before travelling.',
  elevatorEnter:'Click the elevator to walk inside',elevatorPanelChoose:'Choose a floor on the panel inside the car',elevatorPanelRiding:'Travelling to {floor}F',elevatorPanelExit:'Step out of elevator',elevatorPanelAria:'In-car elevator floor panel',elevatorPanelGo:'Elevator · Go to {floor}F',elevatorPanelHere:'{floor}F · Current floor',elevatorPanelUnavailable:'{floor}F · Not served',elevatorPanelKeyboard:'Click a floor button · Number keys 1–9',elevatorBoarding:'Walking into the elevator…',elevatorArrived:'Arrived at {floor}F',
  showcaseLabel:'My classroom creation',showcaseInterior:'Look inside',showcaseModel:'Floor model',showcaseWalk:'Walk inside',showcaseNoWalkArea:'This floor has no clear viewing spot. Choose another floor or use Floor model.',showcaseInstructions:'Drag to look · W A S D to walk · Click clear floor to move closer · Choose another floor to keep exploring',showcaseNote:'Walk inside for a first-person visit, or choose Floor model for a cutaway overview. These controls only move the camera; furniture and the original home cannot be changed.',
  showcaseHelp:[['Walk inside','Explore the room at eye level'],['Drag','Look around'],['Click floor','Walk closer'],['Wheel','Move closer / farther'],['W A S D','Move the camera'],['Floor buttons','Explore another floor'],['Garden walk','Explore the garden'],['Overview','View the complete creation']],
});

const chinese=english;

export const HOME_ROAM_COPY=Object.freeze({en:english});

export function resolveHomeRoamLocale(locale,{search=globalThis.location?.search??''}={}){
  const requested=locale??new URLSearchParams(search).get('locale');
  if(typeof requested!=='string')return HOME_ROAM_DEFAULT_LOCALE;
  const normalized=requested.trim().toLowerCase().replaceAll('_','-');
  if(normalized==='en'||normalized==='en')return 'en';
  if(normalized==='en'||normalized.startsWith('en-'))return 'en';
  return HOME_ROAM_DEFAULT_LOCALE;
}

export function getHomeRoamCopy(locale,options){return HOME_ROAM_COPY[resolveHomeRoamLocale(locale,options)];}

export function formatHomeRoamTitle(studentName,locale,options){
  const copy=getHomeRoamCopy(locale,options),name=typeof studentName==='string'?studentName.trim():'';
  return name?copy.homeTitle.replace('{name}',()=>name):copy.exampleTitle;
}
