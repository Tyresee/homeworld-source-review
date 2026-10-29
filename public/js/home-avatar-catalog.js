/** Original toy-scale wardrobe. Prices are game points, never retail prices. */
const freezeOptions = options => Object.freeze(options.map(option => Object.freeze(option)));

export const AVATAR_SKIN_TONES = freezeOptions([
  {id:'cream', label:"DisplayText0008", color:'#f5d6bb'},
  {id:'warm', label:"DisplayText0009", color:'#eabb95'},
  {id:'tan', label:"DisplayText0010", color:'#c78d64'},
  {id:'deep', label:"DisplayText0011", color:'#8b5a43'},
]);
export const AVATAR_HAIR_STYLES = freezeOptions([
  {id:'short', label:"DisplayText0012"}, {id:'bob', label:"DisplayText0013"},
  {id:'ponytail', label:"DisplayText0014"}, {id:'curls', label:"DisplayText0015"},
]);
export const AVATAR_HAIR_COLORS = freezeOptions([
  {id:'chestnut', label:"DisplayText0016", color:'#654738'},
  {id:'black', label:"DisplayText0017", color:'#30343b'},
  {id:'honey', label:"DisplayText0018", color:'#c89650'},
  {id:'rose', label:"DisplayText0019", color:'#96646c'},
]);
export const DEFAULT_AVATAR_APPEARANCE = Object.freeze({skinTone:'warm',hairStyle:'short',hairColor:'chestnut'});

const wardrobe = [
  // Entire silhouettes, rather than color variants of one shirt.
  ['ocean-overalls','outfit',"DisplayText0020",360,'#648fa8','everyday','essential',"DisplayText0021, DisplayText0022.",["DisplayText0023","DisplayText0024","DisplayText0025","DisplayText0026"]],
  ['cloud-hoodie','outfit',"DisplayText0027",520,'#86afa3','everyday','comfort',"DisplayText0028, DisplayText0029, DisplayText0030.",["DisplayText0031","DisplayText0032","DisplayText0033","DisplayText0034"]],
  ['sunny-raincoat','outfit',"DisplayText0035",680,'#e6b648','outdoor','comfort',"DisplayText0036, DisplayText0037, DisplayText0038.",["DisplayText0039","Outdoors","DisplayText0040","DisplayText0041"]],
  ['little-chef','outfit',"DisplayText0042",840,'#f4eee0','roleplay','comfort',"DisplayText0043, DisplayText0044.",["DisplayText0045","Kitchen","DisplayText0046","DisplayText0047"]],
  ['moon-explorer','outfit',"DisplayText0048",2400,'#e9e5d8','roleplay','signature',"DisplayText0049, DisplayText0050, DisplayText0051.",["DisplayText0052","DisplayText0053","DisplayText0054","DisplayText0055"]],
  ['field-sports','outfit',"DisplayText0056",420,'#519b8c','sport','essential',"DisplayText0057, DisplayText0058.",["DisplayText0033","DisplayText0059","DisplayText0060","DisplayText0061"]],
  ['petal-dress','outfit',"DisplayText0062",920,'#d99eaa','dress','comfort',"DisplayText0063, DisplayText0064.",["DisplayText0065","DisplayText0066","DisplayText0067","DisplayText0068"]],
  ['velvet-suit','outfit',"DisplayText0069",1400,'#6b789b','formal','signature',"DisplayText0070, DisplayText0071, DisplayText0072.",["DisplayText0073","DisplayText0068","DisplayText0074","DisplayText0075"]],
  ['star-wizard','outfit',"DisplayText0076",2000,'#7c71aa','fantasy','signature',"DisplayText0077, DisplayText0078.",["DisplayText0079","DisplayText0080","DisplayText0081","DisplayText0082"]],
  ['forest-explorer','outfit',"DisplayText0083",1100,'#a79561','outdoor','comfort',"DisplayText0084, DisplayText0085, DisplayText0086.",["DisplayText0055","DisplayText0087","DisplayText0025","DisplayText0088"]],
  ['sea-sailor','outfit',"DisplayText0089",780,'#7396b8','roleplay','comfort',"DisplayText0090, DisplayText0091.",["DisplayText0092","DisplayText0093","DisplayText0074","DisplayText0047"]],
  ['garden-apron','outfit',"DisplayText0094",540,'#b98c70','everyday','essential',"DisplayText0095, DisplayText0096.",["DisplayText0046","DisplayText0097","DisplayText0098","DisplayText0099"]],
  ['winter-parka','outfit',"DisplayText0100",1600,'#b28579','outdoor','signature',"DisplayText0101, DisplayText0102, DisplayText0103.",["DisplayText0104","DisplayText0105","DisplayText0106","DisplayText0107"]],
  ['cozy-pajamas','outfit',"DisplayText0108",640,'#9baac2','everyday','comfort',"DisplayText0109, DisplayText0110.",["DisplayText0111","DisplayText0112","DisplayText0113","DisplayText0114"]],
  ['ribbon-tutu','outfit',"DisplayText0115",1300,'#c7a3bd','dress','signature',"DisplayText0116, DisplayText0117.",["DisplayText0118","DisplayText0119","DisplayText0120","DisplayText0121"]],
  ['storybook-knight','outfit',"DisplayText0122",1800,'#84a3a7','fantasy','signature',"DisplayText0123, DisplayText0124, DisplayText0125.",["DisplayText0126","DisplayText0127","DisplayText0128","DisplayText0129"]],
  ['baseball-cap','headwear',"DisplayText0130",240,'#d89569','hat','essential',"DisplayText0131, DisplayText0132.",["DisplayText0133","DisplayText0134","DisplayText0135"]],
  ['artist-beret','headwear',"DisplayText0136",340,'#b66f65','hat','comfort',"DisplayText0137, DisplayText0138.",["DisplayText0139","DisplayText0140","DisplayText0141"]],
  ['straw-sunhat','headwear',"DisplayText0142",580,'#c7a06d','hat','comfort',"DisplayText0143, DisplayText0144, DisplayText0145.",["DisplayText0146","DisplayText0147","DisplayText0148"]],
  ['little-crown','headwear',"DisplayText0149",900,'#d9b761','accessory','signature',"DisplayText0150, DisplayText0151.",["DisplayText0152","DisplayText0153","DisplayText0154"]],
  ['bunny-headband','headwear',"DisplayText0155",650,'#e7d9ce','accessory','comfort',"DisplayText0156, DisplayText0157.",["DisplayText0158","DisplayText0159","DisplayText0160"]],
  ['pom-beanie','headwear',"DisplayText0161",480,'#9a9fba','hat','comfort',"DisplayText0162, DisplayText0163.",["DisplayText0164","DisplayText0165","DisplayText0166"]],
  ['music-headphones','headwear',"DisplayText0167",760,'#93b8ad','accessory','comfort',"DisplayText0168, DisplayText0169.",["DisplayText0170","DisplayText0171","DisplayText0172"]],
  ['chef-toque','headwear',"DisplayText0173",660,'#f3eee1','hat','comfort',"DisplayText0174, DisplayText0175.",["DisplayText0176","Kitchen","DisplayText0177"]],
  ['canvas-sneakers','footwear',"DisplayText0178",280,'#658d9c','shoes','essential',"DisplayText0179, DisplayText0180, DisplayText0181.",["DisplayText0182","DisplayText0183","DisplayText0184"]],
  ['ankle-boots','footwear',"DisplayText0185",620,'#a77850','shoes','comfort',"DisplayText0186, DisplayText0187, DisplayText0188.",["DisplayText0189","DisplayText0190","DisplayText0191"]],
  ['puddle-boots','footwear',"DisplayText0192",560,'#cfaa48','shoes','comfort',"DisplayText0193, DisplayText0194, DisplayText0195.",["DisplayText0196","DisplayText0197","DisplayText0193"]],
  ['summer-sandals','footwear',"DisplayText0198",220,'#c99178','shoes','essential',"DisplayText0199, DisplayText0200, DisplayText0201.",["DisplayText0202","DisplayText0203","DisplayText0204"]],
  ['ballet-flats','footwear',"DisplayText0205",480,'#c697ac','shoes','comfort',"DisplayText0206, DisplayText0207.",["DisplayText0208","DisplayText0119","DisplayText0121"]],
  ['bear-slippers','footwear',"DisplayText0209",460,'#b59371','shoes','comfort',"DisplayText0210, DisplayText0211.",["DisplayText0212","DisplayText0213","DisplayText0214"]],
];

export const AVATAR_CLOTHING_PRODUCTS = Object.freeze(wardrobe.map(([id,slot,name,price,color,family,tier,description,tags]) => Object.freeze({
  skuId:`wear-${id}`,
  kind:`wear${id.split('-').map(part=>part[0].toUpperCase()+part.slice(1)).join('')}`,
  productType:'clothing', slot, name, label:name, price, color, defaultColor:color,
  category:'clothing', categoryLabel:"DisplayText0215", family, tier, description,
  collection:'avatar-wardrobe-2026-10-17',
  tags:Object.freeze(["DisplayText0216","DisplayText0217","DisplayText0218",...tags]),
})));
const bySku = new Map(AVATAR_CLOTHING_PRODUCTS.map(product=>[product.skuId,product]));
export function getClothingProduct(skuId) { return bySku.get(skuId) ?? null; }
