/** Shopping destinations, independent of placement rules and purchased inventory.
 * A shared lamp or storage item may appear in several rooms; its SKU stays the same.
 */
export const SHOP_ROOMS = Object.freeze([
  { id: 'kitchen', label: "DisplayText3133", description: "DisplayText3134, DisplayText3135, DisplayText1388, DisplayText3136" },
  { id: 'bathroom', label: "DisplayText3137", description: "DisplayText0471, DisplayText0460, DisplayText3138, DisplayText3139" },
  { id: 'living', label: "DisplayText3140", description: "DisplayText0779, DisplayText1468, DisplayText3141" },
  { id: 'bedroom', label: "DisplayText3142", description: "DisplayText1464, DisplayText1470, DisplayText3143" },
  { id: 'dining', label: "DisplayText3144", description: "DisplayText3145, DisplayText1042, DisplayText3146" },
  { id: 'study', label: "DisplayText3147", description: "DisplayText1467, DisplayText0775, DisplayText3148" },
  { id: 'playroom', label: "Playroom/DisplayText1433", description: "DisplayText2782, DisplayText3021, DisplayText3149" },
  { id: 'entryway', label: "DisplayText3150", description: "DisplayText3151, DisplayText3152, DisplayText3153" },
  { id: 'utility', label: "DisplayText3154/DisplayText3155", description: "DisplayText2768, DisplayText3156, DisplayText3157" },
  { id: 'decor', label: "DisplayText3158", description: "DisplayText0977, DisplayText2432, DisplayText3159, DisplayText3160" },
  { id: 'outdoor', label: "DisplayText0873/Outdoors", description: "DisplayText2000, DisplayText3161" },
].map(Object.freeze));

const rooms = (...ids) => Object.freeze(ids);
const EMPTY = rooms();
const KITCHEN = rooms('kitchen');
const BATHROOM = rooms('bathroom');
const LIVING = rooms('living');
const BEDROOM = rooms('bedroom');
const STUDY = rooms('study', 'bedroom', 'playroom');
const PLAY = rooms('playroom', 'bedroom');
const ENTRY = rooms('entryway');
const UTILITY = rooms('utility');
const LAUNDRY = rooms('utility', 'bathroom');
const DINING = rooms('dining');
const TABLEWARE = rooms('dining', 'kitchen');
const LIGHTING = rooms('decor', 'living', 'bedroom', 'study', 'dining', 'playroom', 'entryway');
const PLANTS = rooms('decor', 'living', 'bedroom', 'study', 'dining', 'entryway', 'utility');
const DECOR = rooms('decor', 'living', 'bedroom', 'study', 'dining', 'playroom', 'entryway');
const STORAGE = rooms('living', 'bedroom', 'study', 'playroom', 'entryway', 'utility');
const OUTDOOR = rooms('outdoor');

// Older products have broad families such as "storage" or IDs as their family.
// These explicit uses keep a shoe cabinet out of the kitchen and a child's bed findable.
const BY_KIND = Object.freeze({
  bed: BEDROOM, sofa: LIVING, bookcase: rooms('study', 'living', 'playroom'),
  cabinet: STORAGE, wideDresser: rooms('bedroom', 'living'),
  bedsideCabinet: BEDROOM, archedWardrobe: BEDROOM,
  consoleTable: ENTRY, lcEntryBench: ENTRY, lcShoeCabinet: ENTRY, lcHallTree: ENTRY,
  lcClothesRail: rooms('bedroom', 'entryway', 'utility'),
  lcTallChest: BEDROOM, lcFilingCabinet: rooms('study'),
  lcStorageTrunk: rooms('bedroom', 'living', 'utility'),
  lcDisplayCabinet: rooms('living', 'study', 'playroom'),
  lcApothecaryCabinet: rooms('living', 'study', 'playroom'),
  lcWovenScreen: rooms('living', 'bedroom', 'entryway'),
  lcDressingScreen: BEDROOM, lcVanityDesk: BEDROOM,
  lcBunkBed: PLAY, lcLoftBed: PLAY, lcHouseBed: PLAY,
  lcTrundleBed: rooms('bedroom', 'playroom'),
  lcDayBed: rooms('bedroom', 'study'),
  toyChest: PLAY, beanbag: rooms('living', 'study', 'playroom'),
  loungeChair: rooms('living', 'study', 'bedroom'), daybedSofa: LIVING,
  lcPianoBench: rooms('playroom', 'study'),
  lcWovenBench: rooms('living', 'entryway', 'utility'),
  lcOttoman: rooms('living', 'bedroom'),
  deskShelf: STUDY, bookends: STUDY, openBook: STUDY,
  pencilCup: STUDY, deskOrganizer: STUDY, globe: STUDY,
  deskClock: rooms('study', 'bedroom', 'playroom', 'decor'),
  taskLamp: LIGHTING, readingLamp: LIGHTING,
  photoFrame: DECOR, rug: DECOR, statue: DECOR, plant: PLANTS,
  miniPlant: PLANTS, succulent: PLANTS, flowerVase: PLANTS, bonsai: PLANTS,
  chandelier: LIGHTING,
  wallClock: rooms('decor', 'living', 'kitchen', 'dining', 'study', 'bedroom', 'playroom'),
  cuckooClock: rooms('decor', 'living', 'dining', 'study', 'playroom'),
  corkBoard: rooms('study', 'playroom', 'entryway', 'decor'),
  pegboard: rooms('study', 'playroom', 'utility'),
  wallShelf: rooms('study', 'living', 'playroom'),
  flowerWreath: DECOR, starMobile: rooms('decor', 'bedroom', 'playroom'),
  hhWasher: LAUNDRY, hhHamper: LAUNDRY,
  hhBarCart: TABLEWARE, hhPantryHutch: TABLEWARE,
  hhMicrowaveCabinet: KITCHEN,
  hhLetterCabinet: rooms('entryway', 'study'),
  hhStorageTrunk: rooms('bedroom', 'living', 'utility'),
  udBlanketBasket: rooms('bedroom', 'living', 'utility'),
  udFirstAidBox: rooms('utility', 'bathroom'),
  udTissueBox: rooms('living', 'bedroom', 'study', 'dining'),
  udPedalBin: rooms('utility', 'study', 'bedroom'),
  udRecyclingStation: rooms('utility', 'kitchen'),
  udFoldedTowels: LAUNDRY,
  udStepStool: rooms('utility', 'kitchen'),
  udShoeDryer: rooms('utility', 'entryway'),
  udHangerRack: rooms('utility', 'bedroom'),
  bdTissueBox: rooms('bathroom', 'living', 'bedroom', 'study'),
  bdToiletryTray: rooms('bathroom', 'bedroom'),
  bdHairDryer: rooms('bathroom', 'bedroom'),
  bdCottonJar: rooms('bathroom', 'bedroom'),
  bdScale: rooms('bathroom', 'bedroom'),
});

const BY_FAMILY = Object.freeze({
  beds: BEDROOM, sofas: LIVING, desks: STUDY,
  wardrobes: BEDROOM, vanities: null, // Bathroom vanities and bedroom dressing tables share this family.
  bookcases: rooms('study', 'living', 'playroom'),
  armchairs: rooms('living', 'study', 'bedroom'),
  coffee: LIVING, sideTables: rooms('living', 'bedroom'),
  entry: ENTRY, 'entry-storage': ENTRY,
  'dining-tables': DINING, 'dining-chairs': DINING, sideboards: DINING,
  tableware: TABLEWARE, drinkware: TABLEWARE, 'kitchen-carts': TABLEWARE,
  toilets: BATHROOM, 'bath-fixtures': BATHROOM, 'toilet-cleaning': BATHROOM,
  laundry: LAUNDRY, 'laundry-care': LAUNDRY, 'laundry-supplies': LAUNDRY,
  'laundry-machines': LAUNDRY, 'laundry-sorting': LAUNDRY,
  ironing: UTILITY, 'drying-racks': UTILITY,
  'repair-supplies': UTILITY, sewing: UTILITY, 'household-helpers': UTILITY,
  'health-storage': rooms('utility', 'bathroom'),
  'air-care': rooms('living', 'bedroom', 'study', 'utility'),
  'everyday-storage': STORAGE,
  'floor-lamps': LIGHTING, 'table-lamps': LIGHTING, 'wall-lamps': LIGHTING,
  tableLighting: LIGHTING,
  'large-plants': PLANTS, 'small-plants': PLANTS, 'wall-plants': PLANTS,
  wallClocks: rooms('decor', 'living', 'kitchen', 'dining', 'study', 'bedroom', 'playroom'),
  wallMirrors: rooms('decor', 'entryway', 'bedroom', 'bathroom'),
  wallArt: DECOR,
  deskStationery: STUDY, creativeStudy: rooms('study', 'playroom'),
  musicalInstruments: rooms('playroom', 'study'),
  moodCompanions: rooms('decor', 'playroom', 'study', 'bedroom', 'living'),
});

const BY_CATEGORY = Object.freeze({
  kitchen: KITCHEN, bathroom: BATHROOM, dining: DINING,
  living: LIVING, comfort: LIVING, bedroom: BEDROOM,
  study: STUDY, reading: STUDY, storage: STORAGE,
  toys: PLAY, playroom: PLAY, hobby: rooms('playroom', 'study'),
  mood: rooms('decor', 'playroom', 'study', 'bedroom', 'living'),
  lighting: LIGHTING, plants: PLANTS, decor: DECOR, wall: DECOR,
  cleaning: UTILITY, laundry: LAUNDRY, entryway: ENTRY, hallway: ENTRY,
});

export function shopRoomIds(product) {
  if (!product || typeof product !== 'object') return EMPTY;
  if (product.productType === 'outdoor') return OUTDOOR;
  if (product.productType !== 'furniture') return EMPTY;
  if (BY_KIND[product.kind]) return BY_KIND[product.kind];
  if (BY_FAMILY[product.family]) return BY_FAMILY[product.family];
  if (BY_CATEGORY[product.category]) return BY_CATEGORY[product.category];
  // A future toilet can be introduced with semantic tags before a category is set.
  if (product.tags?.some(tag => /^(DisplayText0471|DisplayText0468|DisplayText0482|DisplayText0472|DisplayText0477)$/.test(tag))) return BATHROOM;
  return EMPTY;
}

/** "all" deliberately retains construction/clothing for their own shopping tabs. */
export function productMatchesRoom(product, room = 'all') {
  return room === 'all' || shopRoomIds(product).includes(room);
}
