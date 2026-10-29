import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULAR_KITCHEN_COLLECTION} from '../public/js/home-modular-kitchen-collection.js';
import {createHomeState,createFurnitureItem,applyChange,getHomeCandidateVolume} from '../public/js/home-engine.js';
import {getKitchenFit,areKitchenModulesCompatible,getKitchenDockPose} from '../public/js/home-kitchen-fit.js';

const make=spec=>createFurnitureItem({kind:spec.id,id:'appliance',material:spec.material});
const kitchen=()=>createHomeState({profile:'upper',slab:{rects:[{minX:-7,minZ:-7,width:14,depth:14}]}});
test('matching dishwasher, cooker, sink and base modules dock at both sides in all four directions without overlap',()=>{
  for(const series of ['cream','oak','pro']){
    const specs=MODULAR_KITCHEN_COLLECTION.filter(row=>row.kitchenFit.canDock&&row.kitchenFit.series===series);
    for(const rotation of [0,90,180,270])for(const side of ['left','right']){
      const anchorSpec=specs.find(row=>row.kitchenFit.role==='hob'),anchor={...make(anchorSpec),id:'cooker',rotation};
      let result=applyChange(kitchen(),{type:'furniture',...anchor});assert.ok(result.ok,result.error);
      const home=result.state;
      for(const spec of specs.filter(row=>['dishwasher','sink','base'].includes(row.kitchenFit.role))){
        const item={...make(spec),id:`test-${spec.id}`},docked=getKitchenDockPose(home,anchor.id,item,side);
        assert.ok(docked.ok,`${spec.id} ${docked.error}`);assert.equal(docked.pose.rotation,rotation);
        const placed=applyChange(home,{type:'furniture',...item,...docked.pose});assert.ok(placed.ok,`${spec.id} ${rotation}/${side}: ${placed.error}`);
        const first=getHomeCandidateVolume(placed.state,{id:`furniture:${anchor.id}`,item:anchor}),next=placed.state.furniture.find(row=>row.id===item.id),second=getHomeCandidateVolume(placed.state,{id:`furniture:${item.id}`,item:next});
        assert.ok(first.maxX<=second.minX+.001||first.minX>=second.maxX-.001||first.maxZ<=second.minZ+.001||first.minZ>=second.maxZ-.001,'whole appliances stay separate');
        assert.equal(getKitchenFit(anchor.kind).worktopHeight,getKitchenFit(item.kind).worktopHeight);
      }
    }
  }
});
test('fitting refuses a different series, tall cabinet, island or missing anchor rather than forcing incompatible kitchen pieces together',()=>{
  const docked=MODULAR_KITCHEN_COLLECTION.filter(row=>row.kitchenFit.canDock),a=make(docked[0]);
  const other=make(docked.find(row=>row.kitchenFit.series!==getKitchenFit(a.kind).series));
  assert.equal(areKitchenModulesCompatible(a,other),false);
  for(const spec of MODULAR_KITCHEN_COLLECTION.filter(row=>!row.kitchenFit.canDock))assert.equal(areKitchenModulesCompatible(a,make(spec)),false,spec.id);
  assert.equal(getKitchenDockPose(kitchen(),'missing',a,'left').ok,false);assert.equal(getKitchenFit('bed'),null);
});
test('a fitted position still obeys ordinary furniture and wall collision checks',()=>{
  const specs=MODULAR_KITCHEN_COLLECTION.filter(row=>row.kitchenFit.canDock&&row.kitchenFit.series==='cream'),anchor={...make(specs[0]),id:'cooker'};
  const home=applyChange(kitchen(),{type:'furniture',...anchor}).state,item={...make(specs.find(row=>row.kitchenFit.role==='dishwasher')),id:'dishwasher'};
  const dock=getKitchenDockPose(home,anchor.id,item,'right');assert.ok(dock.ok);
  const occupied=applyChange(home,{type:'furniture',...item,...dock.pose});assert.ok(occupied.ok,occupied.error);
  const blocked=applyChange(occupied.state,{type:'furniture',...item,id:'cannot-overlap',...dock.pose});assert.equal(blocked.ok,false);
});
