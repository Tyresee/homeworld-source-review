import { exactKeys, invalid, isStudentId } from './errors.mjs';
import {createAccountCommerce,validateAccountCommerce,houseFromCommerce} from './commerce.mjs';

export const PROFILE_SCHEMA_VERSION = 2;
export const ROBOT_DEFAULT_COLORS = Object.freeze({ shell:'#e9dfc9', accent:'#869779' });
const STARTER_RECT = Object.freeze({ minX:-2.8, minZ:-2.6, width:5.6, depth:5.2 });
export function starterHouse() {
  return { templateId:'starter-room-v1', floors:[{ id:'floor-0', level:0,
    slab:{rects:[{...STARTER_RECT}]}, rooms:[{id:'student-living',kind:'living',bounds:{...STARTER_RECT}}] }],
  exterior:{style:'starter',level:1} };
}
export function normalizeColors(value) {
  if (!exactKeys(value,['shell','accent']) || !Object.values(value).every(color => typeof color === 'string' && /^#[a-f\d]{6}$/i.test(color))) throw invalid("DisplayText4542.");
  return {shell:value.shell.toLowerCase(),accent:value.accent.toLowerCase()};
}
export function createStudentHome(studentId, now = new Date().toISOString()) {
  if (!isStudentId(studentId)) throw invalid("DisplayText3785 ID DisplayText4543.");
  const commerce=createAccountCommerce();
  return {schemaVersion:PROFILE_SCHEMA_VERSION,gameId:'homeworld',studentId,revision:0,createdAt:now,updatedAt:now,
    house:houseFromCommerce(commerce),avatar:{kind:'robot',modelId:'robot-companion',modelVersion:'v4',colors:{...ROBOT_DEFAULT_COLORS}},inventory:[],commerce};
}
/** v1 is read for migration only. No browser snapshot or legacy demo import. */
export function validateStudentHome(home, studentId) {
  try {
    if (!exactKeys(home,['schemaVersion','gameId','studentId','revision','createdAt','updatedAt','house','avatar','inventory',...home?.schemaVersion===2?['commerce']:[]])
      || ![1,2].includes(home.schemaVersion) || home.gameId !== 'homeworld' || home.studentId !== studentId
      || !isStudentId(studentId) || !Number.isSafeInteger(home.revision) || home.revision < 0
      || ![home.createdAt,home.updatedAt].every(value => typeof value === 'string' && new Date(value).toISOString() === value)
      || home.updatedAt < home.createdAt || !Array.isArray(home.inventory) || home.inventory.length
      || !exactKeys(home.avatar,['kind','modelId','modelVersion','colors']) || home.avatar.kind !== 'robot'
      || home.avatar.modelId !== 'robot-companion' || home.avatar.modelVersion !== 'v4') return false;
    if(home.schemaVersion===1?JSON.stringify(home.house)!==JSON.stringify(starterHouse()):!validateAccountCommerce(home.commerce)||JSON.stringify(home.house)!==JSON.stringify(houseFromCommerce(home.commerce)))return false;
    return JSON.stringify(home.avatar.colors) === JSON.stringify(normalizeColors(home.avatar.colors));
  } catch { return false; }
}
export function migrateStudentHome(home){
  if(!validateStudentHome(home,home?.studentId))throw invalid("DisplayText4544, DisplayText0516.");
  if(home.schemaVersion===2)return structuredClone(home);
  const commerce=createAccountCommerce();
  return {...structuredClone(home),schemaVersion:2,commerce,house:houseFromCommerce(commerce)};
}
