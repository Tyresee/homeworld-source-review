import {getHomeTheme} from './home-theme.js';
import {getDefaultWallAppearance} from './home-engine.js';
import {WALL_STYLES,WALL_COLORS,resolveHomeWallFinish} from './home-wall-finishes.js';
import {getWallFinishPreview} from './home-wall-textures.js';

/** Resolve only an actual wall on the currently displayed floor. */
export function getWallMenuTarget(homeFloor,surfaceId){
  if(!homeFloor||!Array.isArray(homeFloor.rooms))return null;
  if(['wall.inner','wall.outer','wall.side'].includes(surfaceId)){
    const appearance=homeFloor.surfaces?.[surfaceId];
    return appearance?{appearance,kind:'living',legacyDefault:getDefaultWallAppearance(surfaceId)}:null;
  }
  const match=typeof surfaceId==='string'&&/^room:([a-z\d_.:-]+)\.wall$/i.exec(surfaceId);
  if(!match||match[1]==='living')return null;
  const room=homeFloor.rooms.find(room=>room.id===match[1]);
  return room?.wall?{appearance:room.wall,kind:room.kind}:null;
}

/** Wall choices reuse the live renderer's texture and never mutate a save. */
export function getWarmWallMenu({homeFloor,surfaceId,onSelect,theme=getHomeTheme(),getPreview=getWallFinishPreview}={}){
  if(theme?.id!=='warm'||typeof onSelect!=='function')return null;
  const target=getWallMenuTarget(homeFloor,surfaceId);if(!target)return null;
  const finish=resolveHomeWallFinish(target.kind,target.appearance,{themeId:'warm',legacyDefault:target.legacyDefault});if(!finish)return null;
  return {id:'wall-finish',label:"DisplayText0785",icon:'▥',detail:"3 DisplayText4709 · 5 DisplayText4710 · DisplayText4711",children:[
    ...WALL_STYLES.map(style=>({id:style.id,wallStyleId:style.id,label:style.label,
      group:'wall-style',groupLabel:"DisplayText4712 · 3 DisplayText3237",detail:"DisplayText4713 · DisplayText4714",icon:'',
      current:finish.styleId===style.id,
      image:()=>getPreview({pattern:style.pattern,color:finish.color}),
      action:()=>onSelect({styleId:style.id},style),
    })),
    ...WALL_COLORS.map(color=>({id:color.id,wallColorId:color.id,label:color.label,
      group:'wall-color',groupLabel:"DisplayText4715 · 5 DisplayText3237",icon:'',swatchColor:color.color,
      current:finish.colorId===color.id,action:()=>onSelect({colorId:color.id},color),
    })),
  ]};
}
