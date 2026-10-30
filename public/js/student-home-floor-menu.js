import {getHomeTheme} from './home-theme.js';
import {FLOOR_FINISHES} from './home-floor-finishes.js';
import {getFloorFinishPreview} from './home-floor-textures.js';

const details={wide:"DisplayText4730",washed:"DisplayText4731",herringbone:"DisplayText4683",narrow:"DisplayText4732",tile:"DisplayText4733"};
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
  return {id:'floor-finish',label:"DisplayText4734",icon:'▧',detail:"DisplayText4735 6 DisplayText3237 · DisplayText4736 8 DisplayText3237 · DisplayText4711",children:FLOOR_FINISHES.map(finish=>({
    id:finish.id,finishId:finish.id,label:finish.label,
    group:finish.group,groupLabel:finish.group==='wood'?"DisplayText4735 · 6 DisplayText3237":"DisplayText4736 · 8 DisplayText3237",
    detail:details[finish.pattern]+" · DisplayText4714",
    swatchColor:finish.color,current:appearance.finishId===finish.id,
    image:()=>getPreview(finish),action:()=>onSelect(finish),
  }))};
}
