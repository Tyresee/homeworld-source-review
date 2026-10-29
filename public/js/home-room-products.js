/** Room partitions and finishes are purchased separately from structural floor area. */
import { CELL, ROOM_KINDS } from './home-layout.js';

const PRICES = Object.freeze({
  bedroom: [4800, 9200, 16800], study: [4200, 8400, 15200],
  kitchen: [6200, 11400, 19200], playroom: [4600, 8800, 16200],
  bathroom: [3600, 6800, 12400], gallery: [3800, 7400, 14200],
  sunroom: [4400, 8600, 16400], hallway: [2800, 5400, 9800],
});
const SIZES = Object.freeze(['compact', 'standard', 'spacious']);
const TIERS = Object.freeze(['essential', 'comfort', 'signature']);
const number = value => Number(value.toFixed(2));

export const ROOM_PRODUCTS = Object.freeze(ROOM_KINDS.filter(kind => !kind.core).map(kind => {
  const index = SIZES.indexOf(kind.size), width = number(kind.cols * CELL.width), depth = number(kind.rows * CELL.depth);
  return Object.freeze({
    skuId: `room-${kind.id}`, productType: 'room', placement: 'room', kind: kind.id,
    baseKind: kind.baseKind, family: kind.baseKind, category: 'rooms',
    name: kind.label, label: kind.label, icon: kind.icon, size: kind.size, tier: TIERS[index],
    price: PRICES[kind.baseKind][index], width, depth, area: number(width * depth), resizable: true, resizeStep: .2,
    cols: kind.cols, rows: kind.rows, color: kind.floor, wall: kind.wall,
    description: `${kind.description} DisplayText2569, DisplayText2570; DisplayText2059, DisplayText2571.`,
    tags: Object.freeze(["DisplayText0953", "Room", kind.label, `${kind.cols}×${kind.rows}DisplayText2572`]),
  });
}));

export const ROOM_PRODUCT_BY_KIND = new Map(ROOM_PRODUCTS.map(product => [product.kind, product]));
