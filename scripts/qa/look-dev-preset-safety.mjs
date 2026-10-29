// Reject special object keys before UI edits or render overlays touch a preset.
export const MAX_LOOK_DEV_PRESET_BYTES=1024*1024;
const forbiddenKeys=new Set(['__proto__','constructor','prototype']);
export function assertSafePresetKeys(value,ancestors=new Set()){
  if(value===null||typeof value!=='object')return;
  if(ancestors.has(value))throw new TypeError('Preset must not contain circular objects.');
  ancestors.add(value);
  for(const[key,child]of Object.entries(value)){
    if(forbiddenKeys.has(key))throw new TypeError('Unsafe preset key: '+key);
    assertSafePresetKeys(child,ancestors);
  }
  ancestors.delete(value);
}
