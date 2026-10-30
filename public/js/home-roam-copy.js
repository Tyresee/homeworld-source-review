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
  doorTip:'Click the door to enter',helpAria:'Visit controls',helpClose:'Got it',helpCloseAria:'Close visit controls',
  helpTitleExterior:'Orbit around the house',helpTitleInterior:'Move freely indoors',
  instructions:'W S forward/back · A D sideways · E Q up/down · Shift faster · Drag to look · Click floor to move · Click taps, toilets, lights, drawers, doors or hobs to use · Pass through walls · Esc to leave',
  helpNoteExterior:'Click the front door in exterior view. It opens and you walk inside.',
  helpNoteInterior:'There are no collisions: pass through walls or fly. Lights, drawers and water remain temporary for this visit.',
  outsideHelp:[['Left drag','Orbit around the house'],['Wheel','Move closer / farther'],['Right drag','Pan'],['W A S D','Pan the camera'],['Q / E','Orbit left / right'],['Space','Slow orbit'],['R','Overview']],
  insideHelp:[['W / S','Forward / back'],['A / D','Sideways'],['E or Space / Q','Up / down'],['← / →','Turn in place'],['Shift','Move faster'],['Drag','Look around'],['Wheel','Forward / back'],['Click floor','Walk there'],['Click object','Use it'],['Esc','Leave']],
  flush:'Flush',floorLampOn:'Turn floor lamp on',floorLampOff:'Turn floor lamp off',faucetOn:'Turn tap on',faucetOff:'Turn tap off',
  hobOn:'Light hob',hobOff:'Turn hob off',drawerOpen:'Open drawer',drawerClose:'Close drawer',cabinetOpen:'Open cabinet door',cabinetClose:'Close cabinet door',ceilingOn:'Turn light on',ceilingOff:'Turn light off',
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
