// Deterministic, account-free source fixtures for the local Look Dev console.
// Every object uses its actual catalogue default color and a legal placement.
import {createHomeState,createFurnitureItem,applyChange,validateHomeState,FURNITURE_ITEMS} from '../../public/js/home-engine.js';
import {createRoom} from '../../public/js/home-layout.js';
import {SHOP_CATALOG} from '../../public/js/home-commerce.js';

export const LOOK_DEV_SIZE=Object.freeze({width:1440,height:900});
export const LOOK_DEV_VIEWS=Object.freeze([
  {id:'living',label:'Living room',tabLabel:'Living',description:'Sofa, coffee table, television, floor lamp, rug and plant'},
  {id:'bedroom',label:'Bedroom',description:'Timber bed, bedside cabinet, table lamp, clothes rack and rug'},
  {id:'kitchen',label:'Kitchen',description:'Cooker, sink, base cabinet, dining table and chairs'},
  {id:'bathroom',label:'Bathroom',description:'Toilet, vanity and towel ladder'},
  {id:'house',label:'House',description:'Four furnished rooms on one storey for cutaway review'},
  {id:'exterior',label:'Exterior',description:'Two-storey house and roof generated from the actual floor plan'},
]);
const definitions=new Map(FURNITURE_ITEMS.map(row=>[row.id,row]));
const products=new Map(SHOP_CATALOG.filter(row=>row.productType==='furniture').map(row=>[row.kind,row]));
const clone=value=>JSON.parse(JSON.stringify(value));
const standard={minX:-2.8,minZ:-2.6,width:5.6,depth:5.2};
function room(kind,rect=standard,id='lookdev-room') {
  return createRoom(kind,undefined,undefined,id,rect);
}
function empty(kind,rect=standard) {
  return createHomeState({sandbox:false,profile:kind==='living'?'account':'upper',slab:{rects:[{...rect}]},rooms:[room(kind,rect)]});
}
function place(home,id,kind,x,z,options={}) {
  const definition=definitions.get(kind),product=products.get(kind);
  if(!definition||!product)throw new Error('Missing fixture catalogue kind: '+kind);
  const input={id:'lookdev:'+id,kind,x,z,rotation:0,material:product.material??'oak',...options};
  // color deliberately omitted: createFurnitureItem owns the original default.
  const item=createFurnitureItem(input);
  if(!item||item.color!==definition.defaultColor)throw new Error('Fixture default-color mismatch: '+kind);
  const result=applyChange(home,{type:'furniture',...item});
  if(!result.ok)throw new Error('Illegal fixture placement '+id+': '+result.error);
  return result.state;
}
function living() {
  let home=empty('living');
  home=place(home,'lounge-sofa','sofa',0,-1.1);
  home=place(home,'coffee-table','lcCoffeeTable',0,.12);
  home=place(home,'television','ipRetroTelevision',0,1.7);
  home=place(home,'floor-lamp','hhTripodLamp',-1.8,-1.15);
  home=place(home,'lounge-rug','rug',0,.12);
  home=place(home,'lounge-plant','plant',1.95,1.8);
  return {home,robotPoint:{x:-1.5,z:1.2}};
}
function bedroom() {
  let home=empty('bedroom');
  home=place(home,'timber-bed','bedTimber',-.65,-.45);
  home=place(home,'bedside','bedsideCabinet',.55,-.8);
  home=place(home,'bedside-lamp','taskLamp',0,0,{mount:{type:'table',parentId:'lookdev:bedside',u:.5,v:.5}});
  home=place(home,'clothes-rack','udHangerRack',1.55,-1.5);
  home=place(home,'bedside-rug','rug',-.6,1.1);
  return {home,robotPoint:{x:1.6,z:1.2}};
}
function kitchen() {
  let home=empty('kitchen');
  home=place(home,'cooker','mkDoubleGas',-1.6,-1.65);
  home=place(home,'kitchen-sink','mkSingleSink',-.65,-1.65);
  home=place(home,'base-cabinet','mkBaseDrawers',.3,-1.65);
  home=place(home,'dining-table','diningTable',.3,.55);
  home=place(home,'dining-chair-left','diningChair',-1.15,.55,{rotation:270});
  home=place(home,'dining-chair-right','diningChair',1.75,.55,{rotation:90});
  return {home,robotPoint:{x:-1.7,z:1.8}};
}
function bathroom() {
  let home=empty('bathroom-spacious');
  home=place(home,'toilet','compactToilet',-1.3,-1.1);
  home=place(home,'bathroom-vanity','bathroomVanity',.25,-1.25);
  home=place(home,'towel-ladder','hhTowelLadder',1.8,-1.3);
  return {home,robotPoint:{x:.2,z:1.3}};
}
function exterior() {
  const slab={rects:[{minX:-2.8,minZ:-2.6,width:8.4,depth:5.2}]},right={minX:2.8,minZ:-2.6,width:2.8,depth:5.2};
  let home=createHomeState({sandbox:false,profile:'account',slab,rooms:[room('living'),room('kitchen-compact',right,'lookdev-kitchen')]}),upper=createHomeState({sandbox:false,profile:'upper',slab,rooms:[room('bedroom'),room('bathroom',right,'lookdev-bathroom')]});
  const stair={id:'lookdev-stairs',x:-.9,z:0,rotation:0};
  const lower=applyChange(home,{type:'stairs',stairs:{...stair,direction:'up'}}),higher=applyChange(upper,{type:'stairs',stairs:{...stair,direction:'down'}});
  if(!lower.ok||!higher.ok)throw new Error('Illegal two-storey fixture: '+(lower.error??higher.error));
  home=place(lower.state,'exterior-sofa','sofa',1.6,1.5);
  upper=place(higher.state,'upper-bed','bedTimber',1.5,-.2);
  return {home,upperFloors:[upper],robotPoint:{x:0,z:5.5}};
}
function house() {
  const slab={rects:[{minX:-2.8,minZ:-2.6,width:8.4,depth:10.4}]};
  const region=(kind,minX,minZ,width,depth,id)=>room(kind,{minX,minZ,width,depth},id);
  let home=createHomeState({sandbox:false,profile:'account',slab,rooms:[
    region('living',-2.8,-2.6,5.6,5.2,'lookdev-living'),
    region('kitchen-compact',2.8,-2.6,2.8,5.2,'lookdev-kitchen'),
    region('bedroom',-2.8,2.6,5.6,5.2,'lookdev-bedroom'),
    region('bathroom',2.8,2.6,2.8,5.2,'lookdev-bathroom'),
  ]});
  for(const [id,kind,x,z]of [
    ['h-sofa','sofa',0,-1.1],['h-table','lcCoffeeTable',0,.2],['h-rug','rug',0,.2],
    ['h-lamp','hhTripodLamp',-1.8,-1.15],['h-cooker','mkDoubleGas',3.4,-1.65],
    ['h-sink','mkSingleSink',4.35,-1.65],['h-dining','hhDropLeafTable',4.2,.9],
    ['h-bed','bedTimber',-.9,4.3],['h-bedside','bedsideCabinet',.3,3.4],
    ['h-bedrug','rug',-.6,6.4],['h-toilet','compactToilet',3.5,3.5],
    ['h-vanity','bathroomVanity',4.7,3.4],
  ])home=place(home,id,kind,x,z);
  return {home,robotPoint:{x:-1.4,z:6.4}};
}
const builders={living,bedroom,kitchen,bathroom,house,exterior};
/** Returns fresh, independently validated data. Never account/save-shaped. */
export function createLookDevFixture(id='living') {
  if(!Object.hasOwn(builders,id))throw new RangeError('Unknown Look Dev view: '+id);
  const result=builders[id](),floors=[result.home,...result.upperFloors??[]];
  for(const home of floors)if(!validateHomeState(home))throw new Error('Invalid Look Dev house: '+id);
  const items=floors.flatMap((home,storey)=>home.furniture.map(item=>({id:item.id,kind:item.kind,storey,color:item.color,material:item.material,defaultColor:definitions.get(item.kind).defaultColor,defaultMaterial:products.get(item.kind).material??'oak'})));
  return {id,label:LOOK_DEV_VIEWS.find(view=>view.id===id).label,view:id==='exterior'?'estate':'interior',floors,home:result.home,upperFloors:floors.slice(1),owned:[],robotPoint:result.robotPoint,items,
    avatar:{kind:'robot',modelId:'robot-companion',modelVersion:'v4',colors:{shell:'#e9dfc9',accent:'#869779'},equipped:{}}};
}
export function cloneLookDevFixture(fixture){return clone(fixture);}
