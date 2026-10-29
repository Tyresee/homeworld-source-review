/** Serializable character identity. Clothing ownership remains in the shared commerce ledger. */
import {
  AVATAR_SKIN_TONES, AVATAR_HAIR_STYLES, AVATAR_HAIR_COLORS,
  DEFAULT_AVATAR_APPEARANCE, getClothingProduct,
} from './home-avatar-catalog.js';

export const AVATAR_EQUIPMENT_SLOTS = Object.freeze(['outfit', 'headwear', 'footwear']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keysAre = (value, keys) => record(value) && Object.keys(value).length === keys.length
  && Object.keys(value).every(key => keys.includes(key));
const OPTIONS = {
  skinTone: new Set(AVATAR_SKIN_TONES.map(option => option.id)),
  hairStyle: new Set(AVATAR_HAIR_STYLES.map(option => option.id)),
  hairColor: new Set(AVATAR_HAIR_COLORS.map(option => option.id)),
};

export function createAvatarState() {
  return { version: 1, appearance: { ...DEFAULT_AVATAR_APPEARANCE },
    equipped: { outfit: null, headwear: null, footwear: null } };
}

export function validateAvatarAppearance(appearance) {
  return keysAre(appearance, Object.keys(OPTIONS))
    && Object.entries(OPTIONS).every(([key, options]) => options.has(appearance[key]));
}

/** A malformed or unowned garment is rejected rather than silently granted or removed. */
export function validateAvatarState(avatar, owned = []) {
  if (!keysAre(avatar, ['version', 'appearance', 'equipped']) || avatar.version !== 1
    || !validateAvatarAppearance(avatar.appearance)
    || !keysAre(avatar.equipped, AVATAR_EQUIPMENT_SLOTS) || !Array.isArray(owned)) return false;
  return AVATAR_EQUIPMENT_SLOTS.every(slot => {
    const skuId = avatar.equipped[slot];
    if (skuId === null) return true;
    const product = getClothingProduct(skuId);
    return !!product && product.skuId === skuId && product.slot === slot
      && owned.some(row => row?.skuId === skuId && row?.item?.kind === product.kind
        && row.status === 'stored' && row.storey === null);
  });
}
