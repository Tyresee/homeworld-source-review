import {ROOM_KINDS} from './home-layout.js';

// Presentation only. Never import this module into save/wallet validation to
// choose defaults, and never write these resolved colors back to a home.
const freeze = value => {
  if(value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);Object.freeze(value);
  }
  return value;
};
const defaultRooms=Object.fromEntries(ROOM_KINDS.map(kind=>[kind.id,kind]));
const room=(wall,floor,trim)=>({wall,floor,trim});
const surface=(from,to)=>({from,to});
const light=(sunIntensity)=>({
  toneMapping:'neutral',exposure:1,
  hemisphere:{sky:'#eaf6ff',ground:'#c98f5a',intensity:1.2},
  sun:{color:'#fff1d6',intensity:sunIntensity},
  fill:{color:'#bcd8ff',intensity:.6},shadowRadius:2,contactShadow:'#1d2b5c',
});

export const HOME_THEMES=freeze({
  // Empty overrides deliberately leave the existing renderer/CSS defaults in
  // their original owners. Room entries reference the original kind records.
  default:{id:'default',rooms:defaultRooms,surfaceRemap:{},shell:{},manor:{},lighting:{},swatches:null},
  // Floor candidate only until the reviewer supplies the approved warm-v6
  // lighting/wall/backdrop preset. Inheritance is deliberate, not guessed color.
  warm:{id:'warm',rooms:defaultRooms,surfaceRemap:{},shell:{},manor:{},lighting:{},swatches:null,floorFinishes:true,
    appearanceSource:{id:'warm-v6',status:'awaiting-source'}},
  toy:{
    id:'toy',backdrop:{inner:'#bfe6f5',outer:'#7cc3e6'},
    rooms:{
      living:room('#f6f1e6','#d58b48','#2d63b8'),
      bedroom:room('#eef3fb','#c7814f','#3b5bd6'),
      study:room('#f4f0e2','#a86a3c','#15864a'),
      kitchen:room('#f7f5ee','#c8a06e','#e5483d'),
      playroom:room('#fff4d6','#5fb3e0','#ff8a3d'),
      bathroom:room('#eef8fb','#6fb6c9','#2d63b8'),
      gallery:room('#f8f6f1','#9c6b45','#1d2b53'),
      sunroom:room('#f2f8ea','#c49a62','#2d9c46'),
      hallway:room('#f4efe4','#b9773f','#a85f2a'),
    },
    surfaceRemap:{
      'wall.inner':surface('#f7ead7','#f6f1e6'),'wall.outer':surface('#f7ead7','#f6f1e6'),
      'wall.side':surface('#d0dcca','#f6f1e6'),'floor.main':surface('#e7cfaa','#d58b48'),
      'window.frame':surface('#faf0d7','#ffffff'),
      'table.top':surface('#c99362','#a85f2a'),'table.edge':surface('#c99362','#a85f2a'),
      'table.legs':surface('#c99362','#a85f2a'),'shelf.main':surface('#cda67c','#a85f2a'),
      'stool.main':surface('#daae87','#ffc93a'),'plant.pot':surface('#d79d7c','#e85f38'),
      'toy.body':surface('#f8e4c9','#2d63b8'),'rug.main':surface('#d9e3d3','#e5483d'),
    },
    shell:{trim:'#ffffff',plinth:'#6b4129',frame:'#ffffff',glass:'#74c4ee',wallCap:'#ffffff'},
    manor:{wall:'#f4efe4',trim:'#ffffff',base:'#6b4129',wood:'#a85f2a',glass:'#74c4ee',leaf:'#2d9c46',flower:'#e5483d',gold:'#ffc93a'},
    lighting:{editor:light(3.8),student:light(2.9)},
    swatches:[
      {id:'cream',label:"DisplayText4693",color:'#f6f1e6'}, {id:'oak',label:"DisplayText1901",color:'#d58b48'},
      {id:'red',label:"DisplayText4694",color:'#e5483d'}, {id:'green',label:"DisplayText4695",color:'#15864a'},
      {id:'blue',label:"DisplayText4696",color:'#2d63b8'}, {id:'yellow',label:"DisplayText4697",color:'#ffc93a'},
      {id:'orange',label:"DisplayText4698",color:'#ff8a3d'}, {id:'cocoa',label:"DisplayText4699",color:'#6b4129'},
    ],
  },
});

/** Pure parser for the explicit, presentation-only candidate switches. */
export function resolveHomeTheme(search='') {
  try{const id=new URLSearchParams(search).get('theme');return Object.hasOwn(HOME_THEMES,id)?HOME_THEMES[id]:HOME_THEMES.default;}
  catch{return HOME_THEMES.default;}
}
let browserTheme;
/** A Node service always sees default. A browser tab resolves once on load. */
export function getHomeTheme() {
  if(typeof window==='undefined')return HOME_THEMES.default;
  return browserTheme??=resolveHomeTheme(window.location?.search??'');
}
export function applyHomeTheme(target=globalThis.document) {
  const theme=getHomeTheme();if(target?.documentElement)target.documentElement.dataset.theme=theme.id;
  return theme;
}
export function getHomeSwatches(fallbackPalette,theme=getHomeTheme()) {
  return theme.swatches??fallbackPalette;
}
export function getRoomTheme(kind,roomState,theme=getHomeTheme()) {
  const definition=typeof kind==='string'?ROOM_KINDS.find(row=>row.id===kind):kind;
  if(!definition)return null;
  const skin=theme.rooms[definition.baseKind??definition.id]??theme.rooms[definition.id]??definition;
  // createRoom persists the kind's defaults even before a child paints it.
  // Treat that value like a legacy starter default in this optional display
  // pass. A deliberate repaint back to exactly the old default is ambiguous;
  // all other saved colors remain authoritative, with no data migration.
  const color=part=>{
    const saved=roomState?.[part]?.color;
    return ['toy','warm'].includes(theme.id)&&saved?.toLowerCase()===definition[part]?.toLowerCase()
      ?skin[part]??saved:saved??skin[part]??definition[part];
  };
  return {...definition,
    floor:color('floor'),wall:color('wall'),
    trim:skin.trim??theme.shell.trim,
  };
}
/** Only legacy default surface values are remapped, never owned furniture. */
export function getHomeSurfaceAppearance(id,appearance,theme=getHomeTheme(),roomState=null) {
  const mapping=theme.surfaceRemap[id];
  if(!appearance||!mapping||appearance.color?.toLowerCase()!==mapping.from)return appearance;
  const roomColor=roomState&&id.startsWith('wall.')?getRoomTheme(roomState.kind,roomState,theme)?.wall:null;
  return {...appearance,color:roomColor??mapping.to};
}
/** Keep just the whitelisted presentation parameter; no account data is added. */
export function preserveHomeTheme(value,search=typeof window==='undefined'?'':window.location?.search??'') {
  const raw=String(value),chosen=new URLSearchParams(search).get('theme');
  if(!Object.hasOwn(HOME_THEMES,chosen))return raw;
  try {
    const url=new URL(raw,typeof window==='undefined'?'https://example.invalid/':window.location.href);
    url.searchParams.set('theme',chosen);
    return /^[a-z][a-z\d+.-]*:/i.test(raw)?url.href:url.pathname+url.search+url.hash;
  } catch{return raw;}
}
