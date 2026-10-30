import {getRoomKind} from './home-layout.js';

// Optional presentation metadata only: no prices, ownership, geometry or GPU objects.
export const WALL_STYLES=Object.freeze([
  {id:'wall-plain',label:"DisplayText4702",pattern:'plain'},
  {id:'wall-stripe-fine',label:"DisplayText4703",pattern:'stripe-fine'},
  {id:'wall-dots',label:"DisplayText4704",pattern:'dots'},
].map(Object.freeze));
export const WALL_COLORS=Object.freeze([
  {id:'wall-warm-white',label:"DisplayText4705",color:'#f4efe6'},
  {id:'wall-apricot',label:"DisplayText4706",color:'#f1d9cc'},
  {id:'wall-mist-blue',label:"DisplayText4693",color:'#d4dfe7'},
  {id:'wall-lavender',label:"DisplayText4707",color:'#e1dbe8'},
  {id:'wall-slate-blue',label:"DisplayText4708",color:'#a8b8c4'},
].map(Object.freeze));
export const WALL_STYLE_IDS=Object.freeze(WALL_STYLES.map(row=>row.id));
export const WALL_COLOR_IDS=Object.freeze(WALL_COLORS.map(row=>row.id));
export const DEFAULT_WALL_STYLE_ID='wall-plain';
export const DEFAULT_WALL_COLOR_ID='wall-warm-white';
export const STARTER_WALL_SURFACE_IDS=Object.freeze(['wall.inner','wall.outer','wall.side']);
const stylesById=new Map(WALL_STYLES.map(row=>[row.id,row]));
const colorsById=new Map(WALL_COLORS.map(row=>[row.id,row]));
export const isWallStyleId=id=>typeof id==='string'&&stylesById.has(id);
export const isWallColorId=id=>typeof id==='string'&&colorsById.has(id);
export const getWallStyle=id=>isWallStyleId(id)?stylesById.get(id):null;
export const getWallColor=id=>isWallColorId(id)?colorsById.get(id):null;
const hex=value=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value);

/** Warm-only display resolution. Legacy raw color/material values are never
 * rewritten. Starter callers pass the matching wall surface's original skin;
 * room callers can use their kind's original wall color. Style and color are
 * independent: a style-only choice must retain an earlier custom paint color. */
export function resolveHomeWallFinish(roomKind,appearance,{themeId='default',legacyDefault}={}) {
  if(themeId!=='warm'||!appearance||!hex(appearance.color)||typeof appearance.material!=='string')return null;
  const kind=typeof roomKind==='string'?getRoomKind(roomKind):roomKind;
  if(!kind||!hex(kind.wall))return null;
  const explicitStyle=Object.hasOwn(appearance,'styleId'),explicitColor=Object.hasOwn(appearance,'colorId');
  const style=getWallStyle(explicitStyle?appearance.styleId:DEFAULT_WALL_STYLE_ID);
  const originalColor=legacyDefault?.color??kind.wall;
  const untouched=hex(originalColor)&&appearance.color.toLowerCase()===originalColor.toLowerCase();
  const color=explicitColor?getWallColor(appearance.colorId):untouched?getWallColor(DEFAULT_WALL_COLOR_ID):null;
  if(!style||explicitColor&&!color)return null;
  const colorSource=explicitColor?'explicit':untouched?'default':'legacy-custom';
  return {...style,styleId:style.id,pattern:style.pattern,colorId:color?.id??null,
    color:color?.color??appearance.color,source:colorSource,colorSource,styleSource:explicitStyle?'explicit':'default'};
}
