import {getHomeTheme} from './home-theme.js';
import {FLOOR_FINISHES} from './home-floor-finishes.js';
import {getFloorFinishPreview} from './home-floor-textures.js';

const details={wide:"DisplayText4710",washed:"DisplayText4711",herringbone:"DisplayText4681",narrow:"DisplayText4712",tile:"DisplayText4713"};
/** The optional warm menu only describes a real current-floor paint target.
 * Thumbnail callbacks reuse the renderer's actual texture source. */
export function getWarmFloorMenu({homeFloor,surfaceId,onSelect,theme=getHomeTheme(),getPreview=getFloorFinishPreview}={}){
  if(theme?.id!=='warm'||!homeFloor||!Array.isArray(homeFloor.rooms)||typeof onSelect!=='function')return null;
  let appearance;
  if(surfaceId==='floor.main')appearance=homeFloor.surfaces?.['floor.main'];
  else{
    const match=typeof surfaceId==='string'&&/^room:([a-z\d_.:-]+)\.floor$/i.exec(surfaceId);
    if(!match||match[1]==='living')return null;
    appearance=homeFloor.rooms.find(room=>room.id===match[1])?.floor;
  }
  if(!appearance)return null;
  return {id:'floor-finish',label:"DisplayText4714",icon:'▧',detail:"DisplayText4715 6 DisplayText3237 · DisplayText4716 8 DisplayText3237 · DisplayText4717",children:FLOOR_FINISHES.map(finish=>({
    id:finish.id,finishId:finish.id,label:finish.label,
    group:finish.group,groupLabel:finish.group==='wood'?"DisplayText4715 · 6 DisplayText3237":"DisplayText4716 · 8 DisplayText3237",
    detail:details[finish.pattern]+" · DisplayText4701",
    swatchColor:finish.color,current:appearance.finishId===finish.id,
    image:()=>getPreview(finish),action:()=>onSelect(finish),
  }))};
}
