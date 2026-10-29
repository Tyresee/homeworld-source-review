import {AVATAR_CLOTHING_PRODUCTS} from './home-avatar-catalog.js';

// Only publish garments with a model fitted to the shipped rigid robot. Keeping
// the original SKU means purchases remain valid when the wardrobe grows later.
const supported = new Set([
  'ocean-overalls','cloud-hoodie','little-chef','forest-explorer',
  'cozy-pajamas','sea-sailor','garden-apron','storybook-knight',
  'baseball-cap','artist-beret','chef-toque','little-crown','bunny-headband','pom-beanie',
  'canvas-sneakers','puddle-boots','bear-slippers','ankle-boots',
].map(id=>`wear-${id}`));

export const ROBOT_CLOTHING_PRODUCTS = Object.freeze(AVATAR_CLOTHING_PRODUCTS
  .filter(product=>supported.has(product.skuId))
  .map(product=>Object.freeze({...product,
    collection:'robot-wardrobe-v1',
    description:`DisplayText3693 · ${product.description}`,
    tags:Object.freeze(["DisplayText3022",...product.tags.filter(tag=>tag!=="DisplayText0216")]),
  })));

export function isRobotClothingSku(skuId) { return supported.has(skuId); }
