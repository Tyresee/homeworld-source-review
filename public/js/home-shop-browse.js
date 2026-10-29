import { productMatchesRoom, shopRoomIds, SHOP_ROOMS } from './home-shop-rooms.js';
/** Bounded catalog browsing: adding products must not add hundreds of live cards. */
export const SHOP_PAGE_SIZE = 24;
export const SHOP_CATEGORY_LABELS = Object.freeze({living:"Living room",bedroom:"Bedroom",storage:"Store",decor:"DisplayText2760",lighting:"DisplayText0977",plants:"DisplayText2761",reading:"DisplayText2762",toys:"DisplayText2763",mood:"DisplayText2311",wall:"DisplayText2764",comfort:"DisplayText2765",dining:"Dining room",kitchen:"DisplayText1002",bathroom:"DisplayText2766",cleaning:"DisplayText2767",laundry:"DisplayText2768",outdoor:"DisplayText2769",rooms:"DisplayText2770",study:"Study",playroom:"DisplayText1433",sunroom:"DisplayText1442",gallery:"DisplayText1439",hallway:"DisplayText1445",hobby:"DisplayText2771",entryway:"DisplayText2772",storeys:"DisplayText2773",clothing:"DisplayText2774",outfit:"DisplayText2775",headwear:"DisplayText2776",footwear:"DisplayText2777"});
const CATEGORY_ORDER = ['kitchen','dining','bathroom','cleaning','laundry','storage','living','bedroom','study','reading','comfort','lighting','plants','toys','hobby','mood','wall','decor','outdoor'];
const OLD_FAMILY = { compactToilet:'toilets', bed:'beds',sofa:'sofas',cabinet:'cabinets',bookcase:'bookcases',rug:'rugs',plant:'large-plants',chandelier:'lighting',statue:'figures',
  deskShelf:'desktop-storage',bookends:'deskStationery',openBook:'deskStationery',pencilCup:'deskStationery',deskOrganizer:'deskStationery',photoFrame:'deskStationery',globe:'creativeStudy',deskClock:'desk-clocks',taskLamp:'table-lamps',
  miniPlant:'small-plants',succulent:'small-plants',flowerVase:'small-plants',toyRobot:'tableTreasures',woodTrain:'toyVehicles',blockCastle:'tableTreasures',teddyBear:'animalFriends',happyCloud:'moodCompanions',shyMushroom:'moodCompanions',braveSun:'moodCompanions',sleepyMoon:'moodCompanions',
  wallClock:'wallClocks',cuckooClock:'wallClocks',landscapeArt:'wallArt',corkBoard:'wallArt',pegboard:'wall-storage',wallShelf:'wall-storage',flowerWreath:'wallArt',starMobile:'wallArt',beanbag:'armchairs',toyChest:'storage-chests',readingLamp:'floor-lamps',bonsai:'large-plants',
  dining:'dining-tables',diningChair:'dining-chairs',loungeChair:'armchairs',daybedSofa:'sofas',bedsideCabinet:'cabinets',wideDresser:'cabinets',archedWardrobe:'wardrobes',consoleTable:'entry-storage',bathroomVanity:'bathroom-vanities',ovalBathtub:'bath-fixtures',
};
const FAMILY_LABELS = {beds:"DisplayText1464",sofas:"DisplayText0779",desks:"DisplayText1467",dining:"DisplayText1019",seating:"DisplayText2778",storage:"DisplayText2779",kitchen:"DisplayText2780",bathroom:"DisplayText2781",play:"DisplayText2782",cabinets:"DisplayText1471",bookcases:"DisplayText0782",rugs:"DisplayText0778",plants:"DisplayText2783",lighting:"DisplayText0783",figures:"DisplayText0790",'desktop-storage':"DisplayText2784",'desk-clocks':"DisplayText2785",'wall-storage':"DisplayText2786",'bathroom-vanities':"DisplayText0460",dressingTables:"DisplayText1472",'dining-tables':"DisplayText1019",armchairs:"DisplayText1465",cabinets:"DisplayText1471",wardrobes:"DisplayText1470",'entry-storage':"DisplayText1132",'bath-fixtures':"DisplayText2787",toilets:"DisplayText0471",'small-plants':"DisplayText1118",'large-plants':"DisplayText1103",'table-lamps':"DisplayText1086",'floor-lamps':"DisplayText1075",'storage-chests':"DisplayText1143",deskStationery:"DisplayText2464",creativeStudy:"DisplayText2369",tableTreasures:"DisplayText2434",toyVehicles:"DisplayText2237",animalFriends:"DisplayText2270",moodCompanions:"DisplayText2311",wallClocks:"DisplayText2411",wallArt:"DisplayText2421"};
export const shopCategory = product => product.productType === 'clothing' ? product.slot : product.productType === 'storey' ? 'storeys' : product.productType === 'room' ? product.baseKind : product.category === 'comfort' ? 'living' : product.category;
export const shopPlacement = product => product.productType === 'clothing' ? product.slot : product.productType === 'storey' ? 'storey' : product.productType === 'room' ? 'room' : product.placement ?? (product.kind === 'chandelier' ? 'ceiling' : 'floor');
const FAMILY_ALIASES = { 'bath-organisers':'bath-storage', 'kitchen-appliances':'small-appliances' };
export const shopFamily = product => product.family==='vanities' ? (product.category==='bathroom'?'bathroom-vanities':'dressingTables') : OLD_FAMILY[product.kind] ?? OLD_FAMILY[product.family] ?? FAMILY_ALIASES[product.family] ?? product.family ?? product.kind;
const CLOTHING_FAMILY_LABELS = {everyday:"DisplayText2788",outdoor:"DisplayText2789",roleplay:"DisplayText2790",sport:"DisplayText2791",dress:"DisplayText2792",formal:"DisplayText2793",fantasy:"DisplayText2794",hat:"DisplayText0134",accessory:"DisplayText2795",shoes:"DisplayText2777"};
export const shopFamilyLabel = product => (product.productType === 'clothing' ? CLOTHING_FAMILY_LABELS[product.family] : null) ?? FAMILY_LABELS[shopFamily(product)] ?? product.familyLabel ?? product.label ?? product.name;
export const shopTier = product => ({1:'essential',2:'comfort',3:'signature'})[product.tier] ?? product.tier ?? 'comfort';
const collectionPriority=product=>product.collection==='interactive-home-2026-10'?3:['modular-kitchen-2026-10-25','roomy-furniture-2026-10-25'].includes(product.collection)?2:0;
export const isDailyShopProduct = product => ['daily-kitchen-2026-10-17','daily-bath-2026-10-17','daily-utility-2026-10-17'].includes(product.collection);
export const isNewShopProduct = product => collectionPriority(product)>0 || isDailyShopProduct(product) || ['living-2026-10b','household-2026-10b','play-2026-10b','outdoor-2026-10','avatar-wardrobe-2026-10-17'].includes(product.collection);
export const getShopDepartment = (products, tab='shop') => products.filter(product => product.productType !== 'storey'
  && (tab === 'clothing' ? product.productType === 'clothing' : tab === 'rooms' ? product.productType === 'room' : tab === 'outdoor' ? product.productType === 'outdoor' : !['room','clothing'].includes(product.productType)));
export const shopInventoryScope = product => product?.productType === 'clothing' ? 'clothing' : product?.productType === 'outdoor' ? 'outdoor' : 'indoor';
/** Clothing stays stored in the ledger; its use state is read from the equipped slot. */
export const inventoryUsageStatus = (owned, product, avatar) => product?.productType === 'clothing'
  ? avatar?.equipped?.[product.slot] === product.skuId ? 'placed' : 'stored' : owned.status;
export function getShopPage(products, {room='all',category='all',placement='all',family='all',tier='all',role='all',sport='all',query='',sort='newest',newOnly=false,page=1} = {}) {
  const keywords=String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered=products.filter(product => productMatchesRoom(product,room) && (category==='all'||shopCategory(product)===category)
    && (placement==='all'||shopPlacement(product)===placement) && (family==='all'||shopFamily(product)===family)
    && (tier==='all'||shopTier(product)===tier) && (role==='all'||product.role===role) && (sport==='all'||Boolean(product.sport)===sport) && (!newOnly||isNewShopProduct(product))
    && keywords.every(word=>[product.name,product.label,product.description,SHOP_CATEGORY_LABELS[shopCategory(product)],shopFamilyLabel(product),...shopRoomIds(product).map(id=>SHOP_ROOMS.find(room=>room.id===id)?.label),...(product.tags??[])].filter(Boolean).join(' ').toLocaleLowerCase().includes(word)));
  const categoryRank=product=>{const rank=CATEGORY_ORDER.indexOf(shopCategory(product));return rank<0?CATEGORY_ORDER.length:rank;};
  const kitchenRoleRank=product=>({dishwasher:0,hob:1,sink:2,base:3,corner:4,island:4,'oven-tower':5,pantry:5,fridge:5,hood:6,'wall-cabinet':6,'countertop-appliance':7})[product.kitchenFit?.role]
    ?? (['rangeCooker','kitchenSink','kitchenIsland','retroFridge'].includes(product.kind)?5:8);
  filtered.sort((a,b)=> {
    if(sort==='price-asc'||sort==='price-desc') return (a.price-b.price)*(sort==='price-asc'?1:-1)||a.skuId.localeCompare(b.skuId);
    if(room==='kitchen' && ['newest','featured'].includes(sort) && kitchenRoleRank(a)!==kitchenRoleRank(b)) return kitchenRoleRank(a)-kitchenRoleRank(b);
    if(room==='bathroom' && ['newest','featured'].includes(sort) && (shopFamily(a)==='toilets')!==(shopFamily(b)==='toilets')) return Number(shopFamily(b)==='toilets')-Number(shopFamily(a)==='toilets');
    if(['newest','featured'].includes(sort) && shopFamily(a)==='toilets' && shopFamily(b)==='toilets') {
      const order={bdSplitToilet:0,bdMonoblocToilet:1,bdSmartToilet:2};
      return (order[a.kind]??3)-(order[b.kind]??3)||a.price-b.price;
    }
    if(sort==='newest' && collectionPriority(a)!==collectionPriority(b)) return collectionPriority(b)-collectionPriority(a);
    if(sort==='newest' && isDailyShopProduct(a)!==isDailyShopProduct(b)) return Number(isDailyShopProduct(b))-Number(isDailyShopProduct(a));
    if(sort==='newest' && isNewShopProduct(a)!==isNewShopProduct(b)) return Number(isNewShopProduct(b))-Number(isNewShopProduct(a));
    return categoryRank(a)-categoryRank(b)||shopFamily(a).localeCompare(shopFamily(b))||a.price-b.price||a.skuId.localeCompare(b.skuId);
  });
  const pages=Math.max(1,Math.ceil(filtered.length/SHOP_PAGE_SIZE));
  const current=Math.max(1,Math.min(pages,Number.isFinite(page)?Math.floor(page):1));
  const offset=(current-1)*SHOP_PAGE_SIZE;
  return {items:filtered.slice(offset,offset+SHOP_PAGE_SIZE),total:filtered.length,page:current,pages,from:filtered.length?offset+1:0,to:Math.min(offset+SHOP_PAGE_SIZE,filtered.length)};
}
