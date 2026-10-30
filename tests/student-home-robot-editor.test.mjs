import {getObjectQuickActions,getQuickActionOwned} from '../public/js/student-home-quick-action-menu.js';
import {getKitchenFit,areKitchenModulesCompatible,getKitchenDockPose} from '../public/js/home-kitchen-fit.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createStudentHome} from '../server/student-homes/profile.mjs';
import {prepareCommerceCommand,houseFromCommerce} from '../server/student-homes/commerce.mjs';
import {reconcileRobotActivityDetail} from '../server/student-homes/robot-activity.mjs';
import {ROBOT_CLOTHING_PRODUCTS} from '../public/js/robot-wardrobe-catalog.js';
import * as commerce from '../public/js/home-commerce.js';
import {applyChange,PALETTE} from '../public/js/home-engine.js';
import {getHomeSwatches,HOME_THEMES} from '../public/js/home-theme.js';
import {getWarmFloorMenu} from '../public/js/student-home-floor-menu.js';
import {FLOOR_FINISHES} from '../public/js/home-floor-finishes.js';
import {roomRect} from '../public/js/home-layout.js';
import {getStoredPlacementGroups} from '../public/js/home-inventory-menu.js';
import {getHomeStairs} from '../public/js/home-staircase-shape.js';
import {cloneRobotActivity,sameRobotActivity,isRobotActivityShape} from '../public/js/student-home-robot-state.js';
import {createStudentHomeRobotOutbox} from '../public/js/student-home-robot-outbox.js';
import {getHomeObjectMenu} from '../public/js/student-home-object-menu.js';
import {getObjectState} from '../public/js/home-object-state.js';
import {createStudentHomeObjectOutbox} from '../public/js/student-home-object-outbox.js';

const source=await readFile(new URL('../public/js/student-home-editor.js',import.meta.url),'utf8');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const outfit='wear-ocean-overalls',hat='wear-baseball-cap';
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
// Boundary copies make production validators see ordinary JSON objects rather
// than a foreign VM Object.prototype. Commerce itself is never mocked.
const jsonCall=fn=>(...args)=>fn(...args.map(clone));
function ownedHome(studentId=A){
  const home=createStudentHome(studentId),prepared=prepareCommerceCommand(home.commerce,{type:'checkout',lines:[{skuId:outfit,quantity:1},{skuId:'bed-classic',quantity:1}]},'robot-editor-fixture-buy');
  return {...home,commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:1};
}
function fixture(initial=ownedHome(),theme=HOME_THEMES.default){
  let saved=clone(initial),savedActivity=null,balance=46_440,serial=0;
  const bindings={},requests=[],statuses=[],retries=[],frames=[],listeners=new Map(),calls={activity:[],commerce:[],interactions:[],stairs:[],placements:[],views:[],stage:[],stageCamera:[],danceRequests:[],exitCamera:0,resumeCamera:0,dance:0,stopDance:0,clear:0,stand:0};
  let stageState={requested:false,active:false},stageFloor=0;
  let stageCameraState={active:false,returning:false,available:false,suppressed:false};
  const setStageCamera=value=>{stageCameraState={...value};bindings.world?.onStageCameraChange?.(stageCameraState);};
  const document={modalOpen:false,querySelector(){return this.modalOpen?{}:null;},addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);}};
  const ui=name=>{const calls={open:[],raw:[],close:0,refresh:0,dispose:0};return {calls,open(...args){calls.open.push(clone(args));calls.raw.push(args);},close(){calls.close++;},refresh(){calls.refresh++;},dispose(){calls.dispose++;}};};
  const shop=ui('shop'),wardrobe=ui('wardrobe'),menu=ui('menu'),floorPlanner=ui('floor'),roomPlanner=ui('room');
  const robotSource={fixtureSource:true},thumbnails={sources:[],image:()=> 'fixture-thumbnail',setRobotSource(value){this.sources.push(value);},dispose(){}};
  const world={
    setCommerce(value,avatar,floor,robotActivity){calls.commerce.push(clone({commerce:value,avatar,floor,robotActivity}));if(floor!==stageFloor)stageState={requested:false,active:false};stageFloor=floor;if(robotActivity?.kind==='dance'&&robotActivity.storey===floor)stageState={requested:true,active:true};},
    setRobotActivity(value){calls.activity.push(clone(value));},
    setObjectStates(value){(calls.objectStates??=[]).push(clone(value));},unlockObjectAudio(){calls.unlock=(calls.unlock??0)+1;},
    getRobotSource:()=>robotSource,setView(value){calls.views.push(value);if(value!=='interior')stageState={requested:false,active:false};},getView:()=>calls.views.at(-1)??'interior',
    getStageState:()=>({...stageState}),
    getStageCameraState:()=>({...stageCameraState}),
    exitStageCamera(){calls.exitCamera++;setStageCamera({active:false,returning:true,available:true,suppressed:true});return {ok:true};},
    resumeStageCamera(){calls.resumeCamera++;setStageCamera({active:true,returning:false,available:true,suppressed:false});return {ok:true};},
    danceAvatar(options){calls.dance++;calls.danceRequests.push(clone(options));if(calls.danceResult?.ok===false){bindings.world.onStatus({message:calls.danceResult.error,error:true});return calls.danceResult;}stageState={requested:true,active:false};bindings.world.onStatus({message:"DisplayText4599, DisplayText4600."});return {ok:true};},
    stopAvatarDance(){calls.stopDance++;stageState={requested:false,active:false};bindings.world.onStatus({message:"DisplayText4601."});return {ok:true};},
    getAvatarInteractions:target=>{
      if(target?.startsWith('furniture:'))return[{id:'lie',label:"DisplayText0252"},{id:'admire',label:"DisplayText4602",disabled:true}];
      const owned=target?.startsWith('outdoor:')?saved.commerce.owned.find(row=>row.id===target.slice(8)&&row.status==='placed'):null;
      return owned?.item.kind==='outdoor-pool-1'?[{id:'swim',label:"DisplayText4141"}]:owned?.item.kind==='outdoor-football-1'?[{id:'football',kind:'football',label:"DisplayText3935"}]:[];
    },
    getAvatarStairs:()=>[{id:'stair-fixture',label:"DisplayText4028"}],
    interactAvatar(target,id){calls.interactions.push({target,id});return {ok:true};},
    useAvatarStairs(id){calls.stairs.push(id);return {ok:true};},
    beginFurniturePlacement(item){calls.placements.push({type:'furniture',item:clone(item)});},
    beginOutdoorPlacement(item){calls.placements.push({type:'outdoor',item:clone(item)});},
    clear(){calls.clear++;stageState={requested:false,active:false};stageFloor=0;setStageCamera({active:false,returning:false,available:false,suppressed:false});},cancelDrag(){},cancelPlacement(){},selectSurface(){},setTool(){},standAvatar(){calls.stand++;},dispose(){},
  };
  const capture=(name,instance)=>options=>{bindings[name]=options;return instance;};
  const getKitchenPair=jsonCall(areKitchenModulesCompatible),getDockPose=jsonCall(getKitchenDockPose);
  const context={getObjectQuickActions,getQuickActionOwned,createStudentHomeQuickActions:options=>{bindings.quick=options;return {show(value){calls.quick=value;},updateStatus(value,options){calls.quickStatus=value;calls.quickStatusOptions=options;},close(){calls.quick=null;},dispose(){}};},createStudentHomeObjectOutbox:()=>{const real=createStudentHomeObjectOutbox({storage:null});return {...real,enqueue:jsonCall(real.enqueue)};},getHomeObjectMenu:(c,o,h)=>getHomeObjectMenu(clone(c),clone(o),h),getObjectState:jsonCall(getObjectState),
    setTimeout,clearTimeout,document,
    cloneRobotActivity:jsonCall(cloneRobotActivity),sameRobotActivity:jsonCall(sameRobotActivity),isRobotActivityShape:jsonCall(isRobotActivityShape),createStudentHomeRobotOutbox:()=>createStudentHomeRobotOutbox({storage:null}),
    getKitchenFit,areKitchenModulesCompatible:getKitchenPair, getKitchenDockPose:getDockPose,
    ROBOT_CLOTHING_PRODUCTS,SHOP_CATALOG:commerce.SHOP_CATALOG,PALETTE,getHomeSwatches:palette=>getHomeSwatches(palette,theme),getWarmFloorMenu:options=>getWarmFloorMenu({...options,theme}),
    ELEVATOR_UPGRADE_PRODUCT:commerce.ELEVATOR_UPGRADE_PRODUCT,quoteStaircaseUpgrade:jsonCall(commerce.quoteStaircaseUpgrade),getHomeStairs,
    listOwnedResaleQuotes:jsonCall(commerce.listOwnedResaleQuotes),
    getFloorHomes:commerce.getFloorHomes,getFloorHome:commerce.getFloorHome,roomRect,
    setCartQuantity:jsonCall(commerce.setCartQuantity),quoteFloorConstruction:jsonCall(commerce.quoteFloorConstruction),
    quoteOwnedRoomPlacement:jsonCall(commerce.quoteOwnedRoomPlacement),getStoreyRoomSlots:jsonCall(commerce.getStoreyRoomSlots),
    placeOwnedItem:jsonCall(commerce.placeOwnedItem),placeOwnedOutdoor:jsonCall(commerce.placeOwnedOutdoor),applyChange:jsonCall(applyChange),
    getStoredPlacementGroups:jsonCall(getStoredPlacementGroups),
    createHomeShop:capture('shop',shop),createStudentHomeWardrobe:capture('wardrobe',wardrobe),
    createSceneContextMenu:()=>menu,createFloorPlanner:capture('floor',floorPlanner),createRoomPlanner:capture('room',roomPlanner),
    createStudentHomeThumbnails:()=>thumbnails,createStudentHomeWorld:async options=>{bindings.world=options;return world;},
    crypto:{randomUUID:()=>`robot-editor-command-${++serial}`},requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},
  };
  runInNewContext(source.replace(/^import[^\n]+\n/gm,'').replace('export function createStudentHomeScene','function createStudentHomeScene')+'\nglobalThis.makeEditor=createStudentHomeScene;',context,{filename:'student-home-editor.js'});
  const editor=context.makeEditor({querySelector:()=>({fixtureCanvas:true})},{
    onStatus(message,retry){statuses.push(message);retries.push(retry);},onStageChange:value=>calls.stage.push(value),onStageCameraChange:value=>calls.stageCamera.push(clone(value)),
    onCommand(value,id){const requestHome=clone(saved),requestActivity=clone(savedActivity);return new Promise((resolve,reject)=>requests.push({command:clone(value),id,
      accept(){const activity=value.type==='setRobotActivity',prepared=activity?{commerce:requestHome.commerce,changed:true,amount:0,detail:{robotActivity:clone(value.activity)}}:prepareCommerceCommand(requestHome.commerce,clone(value),id);
        const responseHome={...requestHome,commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:requestHome.revision+(prepared.changed?1:0)};
        const detail=activity?prepared.detail:reconcileRobotActivityDetail({home:requestHome,operations:[{receipt:{detail:{robotActivity:requestActivity}}}]},responseHome,prepared.detail);
        const responseActivity=Object.hasOwn(detail,'robotActivity')?clone(detail.robotActivity):requestActivity;
        if(saved.studentId===requestHome.studentId){saved=responseHome;savedActivity=responseActivity;balance-=prepared.amount;balance+=prepared.creditAmount??0;}
        resolve({home:clone(responseHome),robotActivity:responseActivity,wallet:{currency:'platform-points',balance},receipt:{amount:prepared.amount,creditAmount:prepared.creditAmount??0,detail}});},
      reject(message='Isolated command rejected',status=422){reject(Object.assign(new Error(message),{status}));},
    }));},
  });
  return {editor,bindings,requests,statuses,retries,frames,calls,shop,wardrobe,menu,thumbnails,robotSource,document,listeners,
    saved:()=>clone(saved),async show(value=initial,activity=null,actorId){saved=clone(value);savedActivity=clone(activity);await editor.show(clone(value),{robotActivity:clone(activity),actorId});editor.setWallet({currency:'platform-points',balance});},
    state:()=>clone(bindings.shop.getState()),owned:sku=>saved.commerce.owned.find(item=>item.skuId===sku),stage:()=>({...stageState}),setStageCamera,
  };
}

test('formal editor wires exactly 18 robot garments into the account shop and provides its loaded robot to thumbnails',async()=>{
  const f=fixture();await f.show();const catalog=f.bindings.shop.catalog;
  assert.equal(f.bindings.shop.accountMode,true);assert.equal(catalog.filter(p=>p.productType==='clothing').length,18);
  assert.deepEqual(new Set(catalog.filter(p=>p.productType==='clothing').map(p=>p.skuId)),new Set(ROBOT_CLOTHING_PRODUCTS.map(p=>p.skuId)));
  assert.equal(catalog.some(p=>p.skuId==='wear-moon-explorer'||p.productType==='storey'),false);
  assert.equal(f.thumbnails.sources.length,1);assert.equal(f.thumbnails.sources[0],f.robotSource);assert.equal(f.calls.commerce.length,1);
});

test('left-click quick actions target exactly the selected owned furniture and close on navigation or secondary click',async()=>{
  let home=ownedHome();const bed=home.commerce.owned.find(row=>row.item.kind==='bed');
  const placed=prepareCommerceCommand(home.commerce,{type:'placeItem',id:bed.id,pose:{x:0,z:0},storey:0},'quick-menu-fixture-place');
  home={...home,commerce:placed.commerce,house:houseFromCommerce(placed.commerce)};
  const f=fixture(home);await f.show();const request={view:'interior',data:{furnitureId:bed.id,surfaceId:`furniture:${bed.id}`}};
  f.bindings.world.onObjectClick(request);assert.equal(f.calls.quick.targetId,`furniture:${bed.id}`);assert.equal(f.requests.length,0,'selection is not a purchase or saved mutation');
  const action=await f.bindings.quick.onAction('robot:lie',`furniture:${bed.id}`);assert.equal(action.ok,true);assert.deepEqual(f.calls.interactions,[{target:`furniture:${bed.id}`,id:'lie'}]);
  f.bindings.world.onPanStart();assert.equal(f.calls.quick,null);assert.equal((await f.bindings.quick.onAction('robot:lie',`furniture:${bed.id}`)).ok,false);
  f.bindings.world.onObjectClick(request);f.bindings.world.onContextMenu({...request,clientX:200,clientY:200});assert.equal(f.calls.quick,null,'right-click editor owns its own menu');
  f.bindings.world.onObjectClick(request);f.editor.setView('estate');assert.equal(f.calls.quick,null);
  f.editor.setView('interior');f.bindings.world.onObjectClick(request);await f.show(ownedHome(B));assert.equal(f.calls.quick,null);
  assert.equal((await f.bindings.quick.onAction('robot:lie',`furniture:${bed.id}`)).ok,false,'old student action cannot operate on the next student');f.editor.dispose();
});

test('left-clicking the robot exposes its dance action and starts the stage without a purchase or furniture mutation',async()=>{
  const f=fixture();await f.show();f.bindings.world.onObjectClick({view:'interior',data:{surfaceId:'avatar'}});
  assert.equal(f.calls.quick.targetId,'avatar');assert.equal(f.calls.quick.title,"DisplayText3715");
  const dance=f.calls.quick.actions.find(action=>action.id==='stage:dance');assert.ok(dance);assert.equal(dance.disabled,false);
  assert.match(dance.label,/DisplayText4603/);assert.equal(f.calls.dance,0);assert.equal(f.requests.length,0,'merely selecting a robot cannot mutate its home');
  assert.equal((await f.bindings.quick.onAction('stage:dance','avatar')).ok,true);assert.equal(f.calls.dance,1);assert.equal(f.calls.unlock,1);
  assert.equal(f.calls.stage.at(-1),true,'the pending walk already owns the stage toggle');assert.deepEqual(f.stage(),{requested:true,active:false});
  assert.equal(f.requests.length,0,'dance entry must not spend money or issue furniture edits');
  f.editor.setView('estate');assert.equal(f.calls.quick,null);f.bindings.world.onObjectClick({view:'estate',data:{surfaceId:'avatar'}});
  assert.equal(f.calls.quick.actions.find(action=>action.id==='stage:dance').disabled,true);
  assert.equal((await f.bindings.quick.onAction('stage:dance','avatar')).ok,false);assert.equal(f.calls.dance,1,'outdoor avatar menu cannot start an interior stage');f.editor.dispose();
});

test('top stage toggle is interior-only and a second click cancels a requested stage before the dance has begun',async()=>{
  const f=fixture();assert.equal(f.editor.toggleStage().ok,false,'a student must be selected first');await f.show();
  for(const view of ['estate','building']){f.editor.setView(view);assert.equal(f.editor.toggleStage().ok,false);assert.match(f.statuses.at(-1),/DisplayText4604/);}
  assert.equal(f.calls.dance,0);assert.equal(f.calls.stopDance,0);f.editor.setView('interior');
  assert.equal(f.editor.toggleStage().ok,true);assert.equal(f.calls.dance,1);assert.equal(f.calls.quick.targetId,'avatar');
  assert.equal(f.stage().requested,true);assert.equal(f.stage().active,false,'the controller is still walking rather than dancing');assert.equal(f.calls.stage.at(-1),true);
  assert.equal(f.editor.toggleStage().ok,true);assert.equal(f.calls.stopDance,1);assert.equal(f.calls.dance,1,'cancel must not restart a pending dance');assert.equal(f.calls.stand,0,'use the stage cancellation path rather than generic stand');
  assert.equal(f.calls.stage.at(-1),false);assert.equal(f.stage().requested,false);assert.equal(f.requests.length,0);f.editor.dispose();
});

const danceFloorRequest=(surfaceId='floor.main',point={x:1.25,y:.08,z:-.75})=>({view:'interior',clientX:240,clientY:180,data:{surfaceId},worldPoint:point,placementAnchor:{view:'interior',hit:{surfaceId,point:{...point},normal:{x:0,y:1,z:0}}}});
const danceMenuAction=f=>f.menu.calls.raw.at(-1)?.[0].items.find(row=>row.id==='stage-dance-here');

test('floor right-click starts dancing at the exact frozen coordinates without a second selection or purchase',async()=>{
  const f=fixture();await f.show();const before=f.saved(),balance=f.state().wallet.balance,request=danceFloorRequest();
  f.bindings.world.onContextMenu(request);const action=danceMenuAction(f);assert.ok(action);assert.equal(f.menu.calls.raw.at(-1)[0].items[0],action);assert.equal(action.label,"DisplayText3895");assert.equal(f.calls.dance,0);
  request.worldPoint.x=99;request.worldPoint.z=99;request.data.surfaceId='wall.inner';
  assert.equal(action.action().ok,true);assert.deepEqual(f.calls.danceRequests,[{point:{x:1.25,z:-.75}}]);assert.equal(f.calls.quick.targetId,'avatar');assert.match(f.calls.quickStatus,/DisplayText4605/);
  assert.equal(f.frames.length,0,'no extra pointer-position selection is scheduled');assert.equal(f.calls.placements.length,0);assert.equal(f.requests.length,0);assert.deepEqual(f.saved(),before);assert.equal(f.state().wallet.balance,balance);assert.equal(f.shop.calls.open.length,0);f.editor.dispose();
});

test('an actual functional room floor also has its location-bound dance entry',async()=>{
  const home=ownedHome();home.commerce.home.rooms.push({id:'studio',kind:'study',cx:5,cz:0});const f=fixture(home);await f.show();
  f.bindings.world.onContextMenu(danceFloorRequest('room:studio.floor',{x:5.25,y:.08,z:.5}));assert.equal(danceMenuAction(f).action().ok,true);assert.deepEqual(f.calls.danceRequests,[{point:{x:5.25,z:.5}}]);f.editor.dispose();
});

test('walls, furniture, unknown rooms and projected floor points cannot offer dance-here',async()=>{
  const f=fixture();await f.show();
  const invalid=[
    danceFloorRequest('wall.inner'),danceFloorRequest('room:living.wall'),danceFloorRequest('table.top'),danceFloorRequest('furniture:bed'),danceFloorRequest('room:deleted.floor'),
    {...danceFloorRequest(),view:'estate'},
    {...danceFloorRequest(),worldPoint:{x:NaN,y:.08,z:0}},
    {...danceFloorRequest(),worldPoint:null},
    {...danceFloorRequest(),data:{surfaceId:'floor.main',furnitureId:'bed'}},
    {...danceFloorRequest(),data:{surfaceId:'floor.main',stairId:'stairs'}},
    {...danceFloorRequest(),placementAnchor:{hit:{surfaceId:'wall.inner',normal:{y:1}}}},
    {...danceFloorRequest(),placementAnchor:{hit:{surfaceId:'floor.main',normal:{y:0}}}},
    {...danceFloorRequest(),placementAnchor:{hit:{surfaceId:'floor.main',normal:{y:1},furnitureId:'bed'}}},
  ];
  for(const request of invalid){f.bindings.world.onContextMenu(request);assert.equal(danceMenuAction(f),undefined,JSON.stringify(request));}
  assert.equal(f.calls.dance,0);assert.equal(f.requests.length,0);f.editor.dispose();
});

test('a stale floor dance menu cannot cross student, floor or view boundaries',async()=>{
  const home=ownedHome();home.commerce.upperFloors=[clone(home.commerce.home)];const f=fixture(home);await f.show();
  f.bindings.world.onContextMenu(danceFloorRequest());const oldFloor=danceMenuAction(f);f.bindings.world.onStoreyChange(1);assert.equal(oldFloor.action().ok,false);assert.equal(f.calls.dance,0);
  f.bindings.world.onContextMenu(danceFloorRequest());const oldView=danceMenuAction(f);f.editor.setView('estate');assert.equal(oldView.action().ok,false);assert.equal(f.calls.dance,0);
  f.editor.setView('interior');f.bindings.world.onContextMenu(danceFloorRequest());const oldStudent=danceMenuAction(f);await f.show(ownedHome(B));assert.equal(oldStudent.action().ok,false);assert.equal(f.calls.dance,0);assert.equal(f.calls.quick,null);assert.equal(f.requests.length,0);f.editor.dispose();
});

test('dance-here rechecks the commerce lock and reports rejected locations in the robot shortcut',async()=>{
  const f=fixture();await f.show();f.bindings.world.onContextMenu(danceFloorRequest());const action=danceMenuAction(f);
  const saving=f.bindings.wardrobe.onEquip(outfit,'outfit');assert.equal(action.action().ok,false);assert.equal(f.calls.dance,0);assert.equal(f.requests.length,1);assert.equal(f.requests[0].command.type,'equipClothing');
  f.requests[0].accept();await saving;
  f.calls.danceResult={ok:false,error:"DisplayText4606, DisplayText4607."};const result=action.action();assert.equal(result.ok,false);assert.equal(f.calls.quick.targetId,'avatar');assert.equal(f.calls.quickStatus,result.error);assert.equal(f.calls.quickStatusOptions.error,true);assert.equal(f.requests.length,1,'a rejected location never triggers a commerce command');f.editor.dispose();
});

test('robot shortcut distinguishes arriving and turning toward the camera from already dancing',async()=>{
  const f=fixture();await f.show();f.bindings.world.onContextMenu(danceFloorRequest());danceMenuAction(f).action();assert.match(f.calls.quickStatus,/DisplayText4608/);assert.doesNotMatch(f.calls.quickStatus,/DisplayText4609/);
  const activity={kind:'dance',storey:0,point:{x:1.25,z:-.75},rotation:.7,time:0,blend:0};
  f.bindings.world.onRobotActivityChange(activity);assert.match(f.calls.quick.status,/DisplayText3719/);f.bindings.world.onStatus({message:"DisplayText3719."});assert.match(f.calls.quickStatus,/DisplayText3719/);
  f.requests[0].accept();await settleActivity();f.editor.dispose();
  const stopping=fixture();await stopping.show(ownedHome(),{...activity,exitRequested:true});stopping.bindings.world.onObjectClick({view:'interior',data:{surfaceId:'avatar'}});assert.match(stopping.calls.quick.status,/DisplayText3717/);stopping.editor.dispose();
});

test('changing floor or student clears the previous stage UI and invalidates the old robot action',async()=>{
  const upper=ownedHome();upper.commerce.upperFloors=[clone(upper.commerce.home)];const f=fixture(upper);await f.show();
  assert.equal(f.editor.toggleStage().ok,true);assert.equal(f.calls.stage.at(-1),true);
  f.bindings.world.onStoreyChange(1);assert.equal(f.calls.commerce.at(-1).floor,1);assert.equal(f.calls.stage.at(-1),false);assert.equal(f.calls.quick,null);
  assert.equal((await f.bindings.quick.onAction('stage:dance','avatar')).ok,false,'old floor quick action is invalid');
  assert.equal(f.editor.toggleStage().ok,true);assert.equal(f.calls.dance,2);assert.equal(f.calls.stage.at(-1),true);
  await f.show(ownedHome(B));assert.equal(f.calls.commerce.at(-1).floor,0);assert.equal(f.calls.stage.at(-1),false);assert.equal(f.stage().requested,false);assert.equal(f.calls.quick,null);
  assert.equal((await f.bindings.quick.onAction('stage:dance','avatar')).ok,false,'old account selection cannot start a dance in another home');assert.equal(f.calls.dance,2);
  f.editor.clear();assert.equal(f.calls.stage.at(-1),false);assert.equal(f.editor.toggleStage().ok,false);f.editor.dispose();
});

test("DisplayText4610 may exit and resume through the top control without stopping the robot or saving an activity",async()=>{
  const f=fixture();assert.equal(f.editor.toggleStageCamera().ok,false);await f.show();
  assert.equal(f.editor.toggleStageCamera().ok,false,'no dance means no follow camera');
  f.setStageCamera({active:true,returning:false,available:true,suppressed:false});assert.equal(f.editor.toggleStageCamera().ok,true);assert.equal(f.calls.exitCamera,1);
  assert.equal(f.calls.stageCamera.at(-1).returning,true,'world camera status is forwarded to UI');
  f.setStageCamera({active:false,returning:false,available:true,suppressed:true});assert.equal(f.editor.toggleStageCamera().ok,true);assert.equal(f.calls.resumeCamera,1);
  assert.equal(f.calls.stageCamera.at(-1).active,true);assert.equal(f.calls.stand,0);assert.equal(f.calls.stopDance,0);assert.equal(f.calls.dance,0);assert.equal(f.requests.length,0,'view-only changes never create robot or commerce saves');
  f.editor.setView('estate');assert.equal(f.editor.toggleStageCamera().ok,false);assert.equal(f.calls.exitCamera,1);assert.match(f.statuses.at(-1),/DisplayText4604/);
  f.editor.setView('interior');const saving=f.bindings.wardrobe.onEquip(outfit,'outfit');
  assert.equal(f.editor.toggleStageCamera().ok,false,'commerce lock also blocks camera controls');assert.equal(f.calls.exitCamera,1);f.requests[0].accept();await saving;f.editor.dispose();
});

test('robot shortcut shows exit/follow camera state, disables the return transition and clears on a different student',async()=>{
  const f=fixture();await f.show();f.bindings.world.onObjectClick({view:'interior',data:{surfaceId:'avatar'}});
  assert.equal(f.calls.quick.actions.some(row=>row.id==='stage:camera'),false);
  f.setStageCamera({active:true,returning:false,available:true,suppressed:false});let shortcut=f.calls.quick.actions.find(row=>row.id==='stage:camera');assert.equal(shortcut.label,"DisplayText3761");assert.match(shortcut.detail,/DisplayText3764/);
  assert.equal((await f.bindings.quick.onAction('stage:camera','avatar')).ok,true);assert.equal(f.calls.exitCamera,1);
  shortcut=f.calls.quick.actions.find(row=>row.id==='stage:camera');assert.equal(shortcut.disabled,true);assert.match(shortcut.label,/DisplayText4611/);
  assert.equal((await f.bindings.quick.onAction('stage:camera','avatar')).ok,false);assert.equal(f.calls.exitCamera,1,'repeated click during return is ignored by the shortcut');
  f.setStageCamera({active:false,returning:false,available:true,suppressed:true});shortcut=f.calls.quick.actions.find(row=>row.id==='stage:camera');assert.equal(shortcut.label,"DisplayText3762");assert.equal(shortcut.disabled,false);
  assert.equal((await f.bindings.quick.onAction('stage:camera','avatar')).ok,true);assert.equal(f.calls.resumeCamera,1);assert.equal(f.calls.stopDance,0);assert.equal(f.calls.stand,0);assert.equal(f.requests.length,0);
  await f.show(ownedHome(B));assert.equal(f.calls.quick,null);assert.deepEqual(f.calls.stageCamera.at(-1),{active:false,returning:false,available:false,suppressed:false});
  assert.equal((await f.bindings.quick.onAction('stage:camera','avatar')).ok,false);assert.equal(f.editor.toggleStageCamera().ok,false);f.editor.dispose();
});

function quickTelevisionHome(){
  const home=createStudentHome(A);let sequence=0;
  const change=command=>{const prepared=prepareCommerceCommand(home.commerce,command,`quick-status-${++sequence}`);home.commerce=prepared.commerce;home.house=houseFromCommerce(prepared.commerce);home.revision++;};
  change({type:'constructFloor',selection:{storey:0,rects:[{minX:-6,minZ:-6,width:12,depth:12}]}});
  change({type:'checkout',lines:[{skuId:'sofa-classic',quantity:1},{skuId:'ipRetroTelevision-classic',quantity:1}]});
  const television=home.commerce.owned.find(row=>row.item.kind==='ipRetroTelevision'),seat=home.commerce.owned.find(row=>row.item.kind==='sofa');
  change({type:'placeItem',id:television.id,storey:0,pose:{x:0,z:-2.5,rotation:0}});
  change({type:'placeItem',id:seat.id,storey:0,pose:{x:0,z:1.8,rotation:180}});
  return {home,television,seat};
}
test('TV power acknowledgement and scene refresh keep the watch status on either linked TV or sofa',async()=>{
  const {home,television,seat}=quickTelevisionHome();
  const watching={kind:'watch',itemId:television.id,seatId:seat.id,storey:0,phase:'watch',point:{x:0,z:1.8},rotation:Math.PI,originRotation:Math.PI,time:0};
  for(const owned of[seat,television]){
    const f=fixture(home);await f.show(home,watching,'quick-status-actor');
    f.bindings.world.onObjectClick({view:'interior',data:{furnitureId:owned.id}});assert.match(f.calls.quick.status,/DisplayText3958/);
    const saving=f.bindings.world.onObjectAction({id:television.id,storey:0,patch:{power:true}});assert.equal(f.requests.length,1);f.requests[0].accept();await saving;
    assert.match(f.calls.quick.status,/DisplayText3958/,'an object save must not reset the idle invitation');
    f.bindings.world.onCancel();assert.match(f.calls.quick.status,/DisplayText3958/,'a scene refresh derives the current action');
    f.bindings.world.onRobotActivityChange({...watching,phase:'to-return',time:.3});assert.match(f.calls.quick.status,/DisplayText4612/);
    f.requests[1].accept();await settleActivity();f.editor.dispose();
  }
});
test('the swim quick menu owns its status and explicit shore action, without old right-click guidance',async()=>{
  const home=createStudentHome(A);let prepared=prepareCommerceCommand(home.commerce,{type:'checkout',lines:[{skuId:'outdoor-pool-1',quantity:1}]},'quick-swim-buy');home.commerce=prepared.commerce;
  const pool=home.commerce.owned.find(row=>row.skuId==='outdoor-pool-1');prepared=prepareCommerceCommand(home.commerce,{type:'placeOutdoor',id:pool.id,pose:{x:8,z:0,rotation:0}},'quick-swim-place');home.commerce=prepared.commerce;home.house=houseFromCommerce(prepared.commerce);
  const f=fixture(home),swimming={kind:'swim',itemId:pool.id,storey:0,phase:'loop',time:1};await f.show(home,swimming);
  f.bindings.world.onObjectClick({view:'estate',data:{outdoorOwnedId:pool.id}});assert.equal(f.calls.quick.stopLabel,"DisplayText3773");assert.match(f.calls.quick.status,/DisplayText3735/);
  f.bindings.world.onStatus({message:"DisplayText3972 · DisplayText3973\"DisplayText3894\"DisplayText3974."});assert.match(f.calls.quickStatus,/DisplayText3735/);assert.doesNotMatch(f.calls.quickStatus,/DisplayText3901/);f.editor.dispose();
});
test('football completion clears the old finishing message when status precedes the standing checkpoint',async()=>{
  const home=createStudentHome(A);let prepared=prepareCommerceCommand(home.commerce,{type:'checkout',lines:[{skuId:'outdoor-football-1',quantity:1}]},'quick-football-completion-buy');home.commerce=prepared.commerce;
  const field=home.commerce.owned.find(row=>row.item.kind==='outdoor-football-1');prepared=prepareCommerceCommand(home.commerce,{type:'placeOutdoor',id:field.id,pose:{x:12,z:0,rotation:0}},'quick-football-completion-place');home.commerce=prepared.commerce;home.house=houseFromCommerce(prepared.commerce);
  const f=fixture(home),playing={kind:'football',itemId:field.id,storey:0,time:12,originRotation:0,exitRequested:true};await f.show(home,playing);
  f.bindings.world.onObjectClick({view:'estate',data:{outdoorOwnedId:field.id}});assert.equal(f.calls.quick.stopLabel,"DisplayText3774");assert.match(f.calls.quick.status,/DisplayText3736/);
  f.bindings.world.onStatus({message:"DisplayText4025, DisplayText3969."});
  f.bindings.world.onRobotActivityChange({kind:'stand',environment:'estate',storey:0,point:{x:12,z:4.5},rotation:0});
  assert.equal(f.calls.quick.stopLabel,"DisplayText3775");assert.equal(f.calls.quick.status,"DisplayText3776, DisplayText3777.");
  f.requests[0].accept();await settleActivity();assert.doesNotMatch(f.calls.quick.status,/DisplayText4613|DisplayText4614/);f.editor.dispose();
});
for(const action of['tidy','wipe'])for(const cleared of[false,true])test(`${action} completion to ${cleared?'null':'stand'} does not retain its in-progress quick-menu status`,async()=>{
  const home=createStudentHome(A),skuId=action==='tidy'?'sofa-classic':'writingDesk-classic';let prepared=prepareCommerceCommand(home.commerce,{type:'checkout',lines:[{skuId,quantity:1}]},`quick-${action}-completion-buy`);home.commerce=prepared.commerce;
  const owned=home.commerce.owned.find(row=>row.skuId===skuId);prepared=prepareCommerceCommand(home.commerce,{type:'placeItem',id:owned.id,storey:0,pose:{x:0,z:0,rotation:0}},`quick-${action}-completion-place`);home.commerce=prepared.commerce;home.house=houseFromCommerce(prepared.commerce);
  const f=fixture(home);await f.show(home,{kind:'furniture',action,itemId:owned.id,storey:0,time:7,originRotation:0});
  f.bindings.world.onObjectClick({view:'interior',data:{furnitureId:owned.id}});assert.match(f.calls.quick.status,action==='tidy'?/DisplayText4615/:/DisplayText4616/);
  f.bindings.world.onStatus({message:"DisplayText4617, DisplayText0224."});
  f.bindings.world.onRobotActivityChange(cleared?null:{kind:'stand',environment:'interior',storey:0,point:{x:0,z:2},rotation:0});
  assert.equal(f.calls.quick.status,"DisplayText3776, DisplayText3777.");f.requests[0].accept();await settleActivity();assert.doesNotMatch(f.calls.quick.status,/DisplayText4615|DisplayText4616/);f.editor.dispose();
});
test('Escape on the canvas closes the quick menu but yields to modals, text input and handled keys',async()=>{
  let home=ownedHome();const bed=home.commerce.owned.find(row=>row.item.kind==='bed');const placed=prepareCommerceCommand(home.commerce,{type:'placeItem',id:bed.id,pose:{x:0,z:0},storey:0},'quick-escape-place');home={...home,commerce:placed.commerce,house:houseFromCommerce(placed.commerce)};
  const f=fixture(home);await f.show();const open=()=>f.bindings.world.onObjectClick({view:'interior',data:{furnitureId:bed.id}});
  const escape=extra=>{const event={key:'Escape',target:{closest:()=>null},preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};f.listeners.get('keydown')(event);return event;};
  open();assert.equal(escape().prevented,true);assert.equal(f.calls.quick,null);
  open();f.document.modalOpen=true;assert.equal(escape().prevented,undefined);assert.ok(f.calls.quick);f.document.modalOpen=false;
  assert.equal(escape({target:{closest:()=>({})}}).prevented,undefined);assert.ok(f.calls.quick);
  assert.equal(escape({defaultPrevented:true}).prevented,undefined);assert.ok(f.calls.quick);
  f.editor.dispose();assert.equal(f.listeners.has('keydown'),false);
});

test('inventory clothing awaits equipClothing acknowledgement and never starts furniture placement',async()=>{
  const f=fixture();await f.show();const owned=f.owned(outfit),before=f.calls.commerce.length;
  const wear=f.bindings.shop.onPlace(owned.id);assert.equal(typeof wear.then,'function');assert.equal(f.requests.length,1);
  assert.deepEqual(f.requests[0].command,{type:'equipClothing',skuId:outfit,slot:'outfit'});
  assert.equal(f.calls.commerce.length,before);assert.equal(f.state().avatar.equipped.outfit,null);assert.equal(f.calls.placements.length,0);assert.equal(f.frames.length,0);
  f.requests[0].accept();const result=await wear;assert.equal(result.ok,true);assert.equal(result.receipt.amount,0);
  assert.equal(f.state().avatar.equipped.outfit,outfit);assert.equal(f.calls.commerce.at(-1).commerce.avatar.equipped.outfit,outfit);
  assert.deepEqual(f.calls.commerce.at(-1).avatar,f.saved().avatar);assert.equal(f.calls.placements.length,0);
});

test('rejected clothing save keeps the old scene equipment and allows a new retry',async()=>{
  const f=fixture();await f.show();const first=f.bindings.wardrobe.onEquip(outfit,'outfit');f.requests[0].reject();
  assert.equal((await first).ok,false);assert.equal(f.state().avatar.equipped.outfit,null);assert.equal(f.calls.commerce.at(-1).commerce.avatar.equipped.outfit,null);
  const again=f.bindings.wardrobe.onEquip(outfit,'outfit');assert.notEqual(f.requests[0].id,f.requests[1].id);f.requests[1].accept();assert.equal((await again).ok,true);
  const remove=f.bindings.wardrobe.onEquip(null,'outfit');assert.deepEqual(f.requests[2].command,{type:'equipClothing',skuId:null,slot:'outfit'});f.requests[2].accept();
  assert.equal((await remove).receipt.amount,0);assert.equal(f.calls.commerce.at(-1).commerce.avatar.equipped.outfit,null);
});

test('shop trial opens the robot wardrobe without payment, equip or mutation of saved clothes',async()=>{
  const f=fixture();await f.show();const before=f.saved(),worldBefore=f.calls.commerce.length,closed=f.shop.calls.close;
  f.bindings.shop.onTryClothing(hat);
  assert.deepEqual(f.wardrobe.calls.open.at(-1),[{previewSku:hat}]);assert.equal(f.shop.calls.close,closed+1);
  assert.equal(f.requests.length,0);assert.equal(f.calls.commerce.length,worldBefore);assert.deepEqual(f.saved(),before);assert.equal(f.state().cart.length,0);
  const add=f.bindings.wardrobe.onAddToCart(hat);assert.equal(add.ok,true);assert.deepEqual(f.state().cart,[{skuId:hat,quantity:1}]);
  assert.equal(f.requests.length,0);assert.deepEqual(f.saved(),before);
  f.bindings.wardrobe.onShop();assert.deepEqual(f.shop.calls.open.at(-1),['clothing']);
});

test('furniture context menu sends robot actions and staircase actions to the world without account commands',async()=>{
  const f=fixture();await f.show();const bed=f.owned('bed-classic'),target=`furniture:${bed.id}`;
  f.bindings.world.onContextMenu({data:{furnitureId:bed.id},view:'interior',clientX:100,clientY:150});
  const menu=f.menu.calls.open.at(-1)[0],actions=menu.items.find(item=>item.id==='robot-use');
  assert.ok(actions);assert.deepEqual(actions.children.map(item=>[item.id,item.disabled]),[['lie',false],['admire',true]]);
  // Retain actual callbacks separately because the menu spy snapshots JSON.
  let opened;f.menu.open=value=>{opened=value;};f.bindings.world.onContextMenu({data:{surfaceId:target},view:'interior',clientX:100,clientY:150});
  opened.items.find(item=>item.id==='robot-use').children.find(item=>item.id==='lie').action();
  assert.deepEqual(f.calls.interactions,[{target,id:'lie'}]);
  opened.items.find(item=>item.id==='robot-stairs').children[0].action();assert.deepEqual(f.calls.stairs,['stair-fixture']);
  const stock=opened.items.find(item=>item.id==='place-owned').children();assert.equal(stock.some(group=>group.id===f.owned(outfit).id),false);
  f.bindings.world.onContextMenu({data:{surfaceId:'floor.main'},view:'estate',clientX:100,clientY:150});
  assert.equal(opened.items.some(item=>item.id==='robot-use'||item.id==='robot-stairs'),false);assert.equal(f.requests.length,0);
});

test('placed outdoor pool context routes swimming through the same robot menu and keeps a reachable stop action',async()=>{
  const initial=ownedHome();let sequence=0;
  const change=command=>{const result=prepareCommerceCommand(initial.commerce,command,`robot-editor-pool-${++sequence}`);initial.commerce=result.commerce;initial.house=houseFromCommerce(result.commerce);initial.revision++;};
  change({type:'checkout',lines:[{skuId:'outdoor-pool-1',quantity:1},{skuId:'outdoor-lamp',quantity:1},{skuId:'outdoor-pool-2',quantity:1}]});
  const pool=initial.commerce.owned.find(row=>row.skuId==='outdoor-pool-1'),lamp=initial.commerce.owned.find(row=>row.skuId==='outdoor-lamp'),storedPool=initial.commerce.owned.find(row=>row.skuId==='outdoor-pool-2');
  change({type:'placeOutdoor',id:pool.id,pose:{x:8,z:0,rotation:0}});
  change({type:'placeOutdoor',id:lamp.id,pose:{x:8,z:5,rotation:0}});
  const f=fixture(initial);await f.show();f.editor.setView('estate');
  let opened;f.menu.open=value=>{opened=value;};
  f.bindings.world.onContextMenu({data:{outdoorOwnedId:pool.id,estateFeature:'pool'},view:'estate',clientX:200,clientY:300});
  assert.equal(opened.title,"DisplayText2001");
  assert.equal(opened.items.some(item=>item.id==='robot-stairs'),false,'outdoor menu does not offer indoor stairs');
  const swim=opened.items.find(item=>item.id==='robot-use')?.children.find(item=>item.id==='swim');
  assert.ok(swim,'a placed owned pool exposes its provided swim action');assert.equal(swim.label,"DisplayText4141");
  swim.action();assert.deepEqual(f.calls.interactions,[{target:`outdoor:${pool.id}`,id:'swim'}]);
  opened.items.find(item=>item.id==='robot-stand').action();assert.equal(f.calls.stand,1,'the existing stop action reaches the controller for a continuous exit');
  for(const data of [{outdoorOwnedId:lamp.id},{outdoorOwnedId:storedPool.id},{estateFeature:'lawn'}]){
    f.bindings.world.onContextMenu({data,view:'estate',clientX:200,clientY:300});
    assert.equal(opened.items.some(item=>item.id==='robot-use'),false,'non-pools, stored pools and empty ground do not invent swimming');
  }
  assert.equal(f.requests.length,0,'entering the animation menu does not purchase or mutate the account');
});

test('clear closes the wardrobe and removes account cart and equipment before another student opens',async()=>{
  const f=fixture();await f.show();f.editor.openWardrobe();f.bindings.wardrobe.onAddToCart(hat);
  const before=f.wardrobe.calls.close;f.editor.clear();assert.equal(f.wardrobe.calls.close,before+1);assert.equal(f.calls.clear,1);assert.equal(f.state(),null);
  f.editor.openWardrobe();assert.equal(f.wardrobe.calls.open.length,1,'empty editor cannot reopen previous student wardrobe');
  await f.show(createStudentHome(B));assert.equal(f.state().owned.length,0);assert.equal(f.state().cart.length,0);
  assert.deepEqual(f.calls.commerce.at(-1).commerce.avatar.equipped,{outfit:null,headwear:null,footwear:null});assert.equal(f.requests.length,0);
});

const settleActivity=()=>new Promise(done=>setImmediate(done));
const sleepFor=bed=>({kind:'sleep',itemId:bed.id,storey:0});
test('saved sleep loads on its own floor and activity acknowledgement never rebuilds the room',async()=>{
  const f=fixture(),sleep=sleepFor(f.owned('bed-classic'));await f.show(undefined,sleep);
  assert.deepEqual(f.calls.commerce.at(-1).robotActivity,sleep);
  f.bindings.world.onRobotActivityChange(sleep);await settleActivity();assert.equal(f.requests.length,0,'restoring the same sleep must not write it again');
  f.bindings.world.onRobotActivityChange(null);assert.deepEqual(f.requests[0].command,{type:'setRobotActivity',activity:null});
  const before=f.calls.commerce.length;f.requests[0].accept();await settleActivity();
  assert.equal(f.calls.commerce.length,before,'the completed wake save must not reset the current exit animation');assert.deepEqual(f.calls.activity,[null]);
  assert.equal(f.state().wallet.balance,46_440,'activity has no payment');
});

test('sleep followed by wake is serialized and the late sleep reply cannot put the robot back in bed',async()=>{
  const f=fixture();await f.show();const sleep=sleepFor(f.owned('bed-classic')),before=f.calls.commerce.length;
  f.bindings.world.onRobotActivityChange(sleep);f.bindings.world.onRobotActivityChange(null);
  assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].command,{type:'setRobotActivity',activity:sleep});
  f.requests[0].accept();await settleActivity();assert.equal(f.requests.length,2);assert.deepEqual(f.requests[1].command,{type:'setRobotActivity',activity:null});
  assert.deepEqual(f.calls.activity,[],'an obsolete sleep reply cannot overwrite the newer runtime wake intent');
  f.requests[1].accept();await settleActivity();assert.deepEqual(f.calls.activity,[null]);assert.equal(f.calls.commerce.length,before);
});

test('sleep waits behind a clothing save and then uses the latest account snapshot',async()=>{
  const f=fixture();await f.show();const sleep=sleepFor(f.owned('bed-classic'));
  const equip=f.bindings.wardrobe.onEquip(outfit,'outfit');f.bindings.world.onRobotActivityChange(sleep);assert.equal(f.requests.length,1);
  f.requests[0].accept();await equip;await settleActivity();assert.equal(f.requests.length,2);assert.equal(f.requests[1].command.type,'setRobotActivity');
  f.requests[1].accept();await settleActivity();assert.equal(f.saved().commerce.avatar.equipped.outfit,outfit);assert.deepEqual(f.calls.activity,[sleep]);
});

test('an unknown sleep write retries its original command before a newer wake, without overwriting live motion',async()=>{
  const f=fixture();await f.show();const sleep=sleepFor(f.owned('bed-classic'));
  f.bindings.world.onRobotActivityChange(sleep);const originalId=f.requests[0].id;f.requests[0].reject('Lost activity reply',503);await settleActivity();
  assert.match(f.statuses.at(-1),/DisplayText4618/);assert.equal(typeof f.retries.at(-1),'function');
  f.bindings.world.onRobotActivityChange(null);assert.equal(f.requests.length,1);
  f.retries.at(-1)();await settleActivity();assert.equal(f.requests[1].id,originalId);assert.deepEqual(f.requests[1].command.activity,sleep);
  f.requests[1].accept();await settleActivity();assert.equal(f.requests.length,3);assert.equal(f.requests[2].command.activity,null);assert.deepEqual(f.calls.activity,[]);
  f.requests[2].accept();await settleActivity();assert.deepEqual(f.calls.activity,[null]);
});

test('switching students while an activity reply is pending never writes the previous account into the new room',async()=>{
  const f=fixture();await f.show();const sleep=sleepFor(f.owned('bed-classic'));f.bindings.world.onRobotActivityChange(sleep);
  f.editor.clear();await f.show(createStudentHome(B));const bSnapshot=f.saved(),before=f.calls.commerce.length;
  f.requests[0].accept();await settleActivity();assert.deepEqual(f.saved(),bSnapshot);assert.equal(f.calls.commerce.length,before);assert.deepEqual(f.calls.commerce.at(-1).robotActivity,null);assert.deepEqual(f.calls.activity,[]);
  f.bindings.world.onRobotActivityChange(null);await settleActivity();assert.equal(f.requests.length,1,'B idle is independent of A pending sleep');
});

test('reopening a sleeping student starts on the saved upper storey and other students start on their own floor',async()=>{
  const upper=ownedHome();upper.commerce.upperFloors=[clone(upper.commerce.home)];
  const f=fixture(upper),activity={...sleepFor(f.owned('bed-classic')),storey:1};await f.show(upper,activity);
  assert.equal(f.calls.commerce.at(-1).floor,1);assert.deepEqual(f.calls.commerce.at(-1).robotActivity,activity);
  f.editor.setView('estate');f.editor.setView('interior');assert.equal(f.requests.length,0,'view changes cannot write an idle activity');
  f.editor.clear();await f.show(createStudentHome(B));assert.equal(f.calls.commerce.at(-1).floor,0);assert.equal(f.calls.commerce.at(-1).robotActivity,null);
});

test('a definite rejected old sleep does not block a newer confirmed wake intent',async()=>{
  const f=fixture();await f.show();const sleep=sleepFor(f.owned('bed-classic'));
  f.bindings.world.onRobotActivityChange(sleep);f.bindings.world.onRobotActivityChange(null);f.requests[0].reject('Bed has been stored',422);await settleActivity();
  assert.equal(f.requests.length,1,'wake already equals the authoritative idle state, so no extra write is needed');
  assert.equal(f.calls.activity.length,0);assert.doesNotMatch(f.statuses.at(-1),/DisplayText4618/);
});

test('a fitted kitchen context offers matching stock at either side and still waits for the normal server placement receipt',async()=>{
  const initial=ownedHome();let sequence=0;
  const change=command=>{const result=prepareCommerceCommand(initial.commerce,command,`editor-kitchen-fixture-${++sequence}`);initial.commerce=result.commerce;initial.house=houseFromCommerce(result.commerce);initial.revision++;};
  change({type:'checkout',lines:[{skuId:'mkSingleHob-classic',quantity:1},{skuId:'mkDishwasher-classic',quantity:1},{skuId:'mkIntegratedDishwasher-classic',quantity:1}]});
  const cooker=initial.commerce.owned.find(row=>row.skuId==='mkSingleHob-classic'),dishwasher=initial.commerce.owned.find(row=>row.skuId==='mkDishwasher-classic'),otherSeries=initial.commerce.owned.find(row=>row.skuId==='mkIntegratedDishwasher-classic');
  change({type:'placeItem',id:cooker.id,pose:{x:0,z:0,rotation:0},storey:0});
  const f=fixture(initial);await f.show();let opened;f.menu.open=value=>{opened=value;};
  f.bindings.world.onContextMenu({data:{furnitureId:cooker.id},view:'interior',clientX:100,clientY:150});
  const right=opened.items.find(item=>item.id==='kitchen-dock-right'),left=opened.items.find(item=>item.id==='kitchen-dock-left');assert.ok(left&&right);
  assert.ok(right.children.some(item=>item.id===dishwasher.id));assert.equal(right.children.some(item=>item.id===otherSeries.id),false,'other series must not be silently docked as matching');
  opened.items.find(item=>item.id==='kitchen-shop').action();assert.deepEqual(f.shop.calls.open.at(-1),['shop',null,{room:'kitchen',query:"DisplayText1779"}]);
  const before=f.saved(),result=right.children.find(item=>item.id===dishwasher.id).action();assert.equal(f.requests.length,1);assert.equal(f.requests[0].command.type,'placeItem');assert.equal(f.requests[0].command.id,dishwasher.id);
  assert.ok(f.requests[0].command.pose.x>.7);assert.deepEqual(f.saved(),before,'clicking does not invent local ownership or skip the receipt');
  f.requests[0].accept();assert.equal((await result).ok,true);assert.equal(f.owned('mkDishwasher-classic').status,'placed');
});

function elevatorHome(){
  const home=createStudentHome(A),rect={minX:-2.8,minZ:-3.8,width:5.6,depth:7.8};
  for(const storey of [0,1]){
    const result=prepareCommerceCommand(home.commerce,{type:'constructFloor',selection:{storey,rects:[rect]}},`editor-elevator-floor-${storey}`);
    home.commerce=result.commerce;home.house=houseFromCommerce(result.commerce);home.revision++;
  }
  return home;
}
test('right-clicking either landing offers one priced elevator installation and waits for the authoritative paired receipt',async()=>{
  for(const floor of [0,1]){
    const f=fixture(elevatorHome());await f.show();let opened;f.menu.open=value=>{opened=value;};
    if(floor)f.bindings.world.onStoreyChange(1);
    const id=getHomeStairs(f.saved().commerce.home)[0].id,before=f.saved(),balance=f.state().wallet.balance;
    f.bindings.world.onContextMenu({data:{stairId:id},view:'interior',clientX:125,clientY:180});
    const choice=opened.items.find(item=>item.stairId===id);assert.ok(choice);assert.match(choice.label,/12,000.*DisplayText4619/);assert.equal(choice.disabled,false);
    const saving=choice.action();assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].command,{type:'upgradeStaircase',id,storey:0});
    assert.deepEqual(f.saved(),before);assert.equal(f.state().wallet.balance,balance);
    f.requests[0].accept();assert.equal((await saving).ok,true);assert.equal(f.state().wallet.balance,balance-12000);
    assert.equal(getHomeStairs(f.saved().commerce.home)[0].type,'elevator');assert.equal(getHomeStairs(f.saved().commerce.upperFloors[0])[0].type,'elevator');
    f.bindings.world.onContextMenu({data:{stairId:id},view:'interior',clientX:125,clientY:180});
    assert.equal(opened.items.find(item=>item.stairId===id).disabled,true,'installed landing does not invite another payment');
  }
});
test('shop elevator service chooses installed connections, reports an insufficient balance, and never adds stock to the cart',async()=>{
  const f=fixture(elevatorHome());await f.show();let opened;f.menu.open=value=>{opened=value;};
  assert.equal(f.bindings.shop.catalog.some(row=>row.skuId==='home-elevator-upgrade'),false);
  f.bindings.shop.onChooseElevator();assert.equal(opened.title,"DisplayText0747");assert.equal(opened.items.length,1);assert.equal(opened.items[0].disabled,false);
  f.editor.setWallet({balance:11999});f.bindings.shop.onChooseElevator();assert.equal(opened.items[0].disabled,true);assert.match(opened.items[0].detail,/DisplayText0579/);
  assert.equal(f.requests.length,0);assert.equal(f.state().cart.length,0);
  const empty=fixture(createStudentHome(B));await empty.show();empty.menu.open=value=>{opened=value;};empty.bindings.shop.onChooseElevator();
  assert.equal(opened.items[0].label,"DisplayText3828");opened.items[0].action();assert.deepEqual(empty.bindings.floor.getFloors().length,1);
});
test('a rejected elevator purchase preserves the staircase and wallet and allows a normal retry',async()=>{
  const f=fixture(elevatorHome());await f.show();let opened;f.menu.open=value=>{opened=value;};f.bindings.shop.onChooseElevator();
  const before=f.saved(),balance=f.state().wallet.balance,saving=opened.items[0].action();f.requests[0].reject("DisplayText4620",422);
  assert.equal((await saving).ok,false);assert.deepEqual(f.saved(),before);assert.equal(f.state().wallet.balance,balance);assert.match(f.statuses.at(-1),/DisplayText4621/);
  f.bindings.shop.onChooseElevator();const retry=opened.items[0].action();assert.notEqual(f.requests[0].id,f.requests[1].id);f.requests[1].accept();assert.equal((await retry).ok,true);
});

test('right-click resale shows half the original paid price and waits for the credited receipt before removing a sleeping bed',async()=>{
  const initial=ownedHome(),bed=initial.commerce.owned.find(row=>row.skuId==='bed-classic'),order=initial.commerce.orders[0];
  // Retain the historical receipt price even though the current bed costs 1,800.
  order.lines.find(row=>row.skuId==='bed-classic').unitPrice=3200;order.total+=1400;initial.commerce.wallet.initialBalance+=1400;
  const placed=prepareCommerceCommand(initial.commerce,{type:'placeItem',id:bed.id,pose:{x:0,z:0},storey:0},'editor-resale-place');
  initial.commerce=placed.commerce;initial.house=houseFromCommerce(placed.commerce);initial.revision++;
  const f=fixture(initial),sleep=sleepFor(bed);await f.show(initial,sleep);let opened;f.menu.open=value=>{opened=value;};
  f.bindings.world.onContextMenu({data:{furnitureId:bed.id},view:'interior',clientX:125,clientY:180});
  const sale=opened.items.find(item=>item.id==='sell-item');assert.ok(sale);assert.equal(sale.disabled,false);
  assert.match(sale.label,/\+1,600 DisplayText0920/);assert.match(sale.detail,/DisplayText3471 3,200.*DisplayText3403 50%.*DisplayText3859/);
  const before=f.saved(),balance=f.state().wallet.balance,worldBefore=f.calls.commerce.length,saving=sale.action();
  assert.deepEqual(f.requests[0].command,{type:'sellItem',id:bed.id});assert.deepEqual(f.saved(),before);assert.equal(f.state().wallet.balance,balance);
  assert.equal(f.calls.commerce.length,worldBefore);assert.deepEqual(f.calls.commerce.at(-1).robotActivity,sleep);
  f.requests[0].accept();const result=await saving;assert.equal(result.ok,true);assert.equal(result.receipt.creditAmount,1600);
  assert.equal(f.state().wallet.balance,balance+1600);assert.equal(f.owned('bed-classic').status,'sold');assert.equal(f.saved().commerce.home.furniture.length,0);
  assert.equal(f.saved().commerce.resaleLedger.length,1);assert.equal(f.saved().commerce.orders[0].lines.find(row=>row.skuId==='bed-classic').unitPrice,3200);
  assert.equal(f.calls.commerce.at(-1).commerce.owned.find(row=>row.id===bed.id).status,'sold');assert.equal(f.calls.commerce.at(-1).robotActivity,null);
  assert.match(f.statuses.at(-1),/1,600 DisplayText3821/);
});

test('a definite rejected resale retains owned furniture and wallet and a new retry can succeed',async()=>{
  const f=fixture();await f.show();const bed=f.owned('bed-classic');let opened;f.menu.open=value=>{opened=value;};
  const context=()=>f.bindings.world.onContextMenu({data:{furnitureId:bed.id},view:'interior',clientX:100,clientY:150});
  context();const before=f.saved(),balance=f.state().wallet.balance,saving=opened.items.find(item=>item.id==='sell-item').action();
  f.requests[0].reject("DisplayText4622",422);assert.equal((await saving).ok,false);
  assert.deepEqual(f.saved(),before);assert.equal(f.state().wallet.balance,balance);assert.equal(f.state().resaleLedger,undefined);
  assert.equal(f.calls.commerce.at(-1).commerce.owned.find(row=>row.id===bed.id).status,'stored');assert.match(f.statuses.at(-1),/DisplayText4623/);
  context();const retry=opened.items.find(item=>item.id==='sell-item').action();assert.notEqual(f.requests[0].id,f.requests[1].id);
  f.requests[1].accept();assert.equal((await retry).ok,true);assert.equal(f.owned('bed-classic').status,'sold');assert.equal(f.state().wallet.balance,balance+900);
});

test('warehouse resale callback uses owned stock and the second-hand menu opens the resale shop',async()=>{
  const f=fixture();await f.show();const bed=f.owned('bed-classic'),quote=f.bindings.shop.getResaleQuote(bed.id);
  assert.equal(quote.ok,true);assert.equal(quote.quote.amount,900);assert.equal(f.bindings.shop.getResaleQuote(f.owned(outfit).id).ok,false);
  let opened;f.menu.open=value=>{opened=value;};f.bindings.world.onContextMenu({data:{surfaceId:'floor.main'},view:'interior',clientX:100,clientY:150});
  const shop=opened.items.find(item=>item.id==='resale-shop');assert.ok(shop);assert.match(shop.detail,/DisplayText4624 50%/);shop.action();assert.deepEqual(f.shop.calls.open.at(-1),['resale']);
  const balance=f.state().wallet.balance,saving=f.bindings.shop.onSell(bed.id);assert.deepEqual(f.requests[0].command,{type:'sellItem',id:bed.id});assert.equal(f.state().wallet.balance,balance);
  assert.equal(f.owned('bed-classic').status,'stored');f.requests[0].accept();assert.equal((await saving).ok,true);
  assert.equal(f.state().wallet.balance,balance+900);assert.equal(f.bindings.shop.getResaleQuote(bed.id).ok,false);
  assert.equal(f.calls.placements.length,0);assert.equal(f.state().cart.length,0);assert.equal(f.frames.length,0);
});

test('a lost resale reply keeps the original command identity and visible stock until its retry succeeds',async()=>{
  const f=fixture();await f.show();const bed=f.owned('bed-classic'),balance=f.state().wallet.balance;
  const saving=f.bindings.shop.onSell(bed.id),first=f.requests[0];first.reject("DisplayText4625",503);
  assert.equal((await saving).ok,false);assert.equal(f.owned('bed-classic').status,'stored');assert.equal(f.state().wallet.balance,balance);assert.equal(typeof f.retries.at(-1),'function');
  f.retries.at(-1)();assert.equal(f.requests.length,2);assert.equal(f.requests[1].id,first.id);assert.deepEqual(f.requests[1].command,first.command);
  assert.equal(f.state().wallet.balance,balance);f.requests[1].accept();await settleActivity();
  assert.equal(f.owned('bed-classic').status,'sold');assert.equal(f.state().wallet.balance,balance+900);assert.equal(f.saved().commerce.resaleLedger.length,1);
});

function homeWithLamp(){
  let home=ownedHome();for(const [index,command]of [{type:'checkout',lines:[{skuId:'readingLamp-classic',quantity:1}]},{type:'placeItem',id:'owned-2-1',storey:0,pose:{x:1.8,z:1.4,rotation:0}}].entries()){
    const prepared=prepareCommerceCommand(home.commerce,command,`lamp-menu-fixture-${index}`);home={...home,commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:home.revision+1};
  }return home;
}
test('lamp right-click gives an immediate light preview and acknowledges state without rebuilding or waking the robot',async()=>{
  const f=fixture(homeWithLamp());await f.show(undefined,null,'actor-fixture');const unit=f.owned('readingLamp-classic'),before=f.calls.commerce.length;
  f.bindings.world.onContextMenu({view:'interior',data:{furnitureId:unit.id},clientX:100,clientY:100});
  const menu=f.menu.calls.raw.at(-1)[0],toggle=menu.items.find(row=>row.id==='object-power');assert.equal(toggle.label,"DisplayText3906");
  const change=toggle.action();assert.equal(f.calls.objectStates.at(-1).objectStates[unit.id].power,true,'preview happens before a network acknowledgement');
  assert.deepEqual(f.requests[0].command,{type:'setObjectState',id:unit.id,storey:0,patch:{power:true}});
  f.requests[0].accept();assert.equal((await change).ok,true);assert.equal(f.calls.commerce.length,before,'a light change must never redraw or reset the avatar');assert.equal(f.saved().commerce.objectStates[unit.id].power,true);assert.equal(f.calls.unlock,1);
});
test('rejected lamp save rolls its preview back to the acknowledged setting without rebuilding the world',async()=>{
  const f=fixture(homeWithLamp());await f.show(undefined,null,'actor-fixture');const unit=f.owned('readingLamp-classic'),before=f.calls.commerce.length;
  f.bindings.world.onContextMenu({view:'interior',data:{furnitureId:unit.id},clientX:100,clientY:100});const change=f.menu.calls.raw.at(-1)[0].items.find(row=>row.id==='object-power').action();
  assert.equal(f.calls.objectStates.at(-1).objectStates[unit.id].power,true);f.requests[0].reject('isolated storage rejection',503);assert.equal((await change).ok,false);assert.equal(getObjectState(f.calls.objectStates.at(-1),unit.id).power,false);assert.equal(f.calls.commerce.length,before);
});

for(const theme of [HOME_THEMES.default,HOME_THEMES.toy])test(`right-click color options use ${theme.id} samples without recoloring a saved item`,async()=>{
  const initial=ownedHome(),owned=initial.commerce.owned.find(item=>item.skuId==='bed-classic');
  const placed=prepareCommerceCommand(initial.commerce,{type:'placeItem',id:owned.id,pose:{x:0,z:0},storey:0},'theme-fixture-place-bed');
  initial.commerce=placed.commerce;initial.house=houseFromCommerce(placed.commerce);
  const f=fixture(initial,theme);await f.show();const before=f.saved(),bed=f.owned('bed-classic');
  f.bindings.world.onContextMenu({view:'interior',data:{furnitureId:bed.id,surfaceId:`furniture:${bed.id}`}});
  const menu=f.menu.calls.raw.at(-1)[0],choices=menu.items.find(item=>item.id==='colors').children;
  assert.deepEqual(choices.map(item=>item.label),getHomeSwatches(PALETTE,theme).map(item=>item.label));
  assert.equal(choices.length,8);assert.deepEqual(f.saved(),before);assert.equal(f.requests.length,0,'opening theme colors does not mutate a home');
  choices[0].action();assert.equal(f.requests.length,1);assert.equal(f.requests[0].command.type,'updateItem');assert.equal(f.requests[0].command.id,bed.id);
  assert.equal(f.requests[0].command.patch.color,getHomeSwatches(PALETTE,theme)[0].color);f.requests[0].accept();await new Promise(resolve=>setImmediate(resolve));f.editor.dispose();
});

test('warm floor click saves once for free, restores the chosen sample and refuses stale student actions',async()=>{
  const f=fixture(ownedHome(),{id:'warm'});await f.show();const before=f.saved(),balance=f.state().wallet.balance;
  const open=()=>{f.bindings.world.onContextMenu({view:'interior',data:{surfaceId:'floor.main'},clientX:100,clientY:180});return f.menu.calls.raw.at(-1)[0].items.find(item=>item.id==='floor-finish');};
  const menu=open();assert.equal(menu.children.length,14);assert.equal(f.requests.length,0);
  const pending=menu.children[6].action();assert.equal(f.requests.length,1);
  assert.deepEqual(f.requests[0].command,{type:'setFloorFinish',surfaceId:'floor.main',finishId:FLOOR_FINISHES[6].id,storey:0});
  f.requests[0].accept();assert.equal((await pending).ok,true);
  assert.equal(f.saved().commerce.home.surfaces['floor.main'].finishId,FLOOR_FINISHES[6].id);
  assert.equal(f.saved().revision,before.revision+1);assert.equal(f.state().wallet.balance,balance);
  const repeat=open().children[6];assert.equal(repeat.current,true);assert.equal((await repeat.action()).unchanged,true);assert.equal(f.requests.length,1);
  const stale=open().children[2].action;await f.show(ownedHome(B));assert.equal((await stale()).ok,false);assert.equal(f.requests.length,1);
  f.editor.dispose();
});
for(const theme of [HOME_THEMES.default,HOME_THEMES.toy])test('the '+theme.id+' context menu keeps its pre-warm floor actions',async()=>{
  const f=fixture(ownedHome(),theme);await f.show();f.bindings.world.onContextMenu({view:'interior',data:{surfaceId:'floor.main'}});
  assert.equal(f.menu.calls.raw.at(-1)[0].items.some(item=>item.id==='floor-finish'),false);assert.equal(f.requests.length,0);f.editor.dispose();
});
