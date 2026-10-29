import { CELL, getFloorRects, getFloorBounds, getFloorArea, getRoomKind, roomRect } from './home-layout.js';
import { getHomeStairs, getStaircaseVolume } from './home-staircase-shape.js';
import { getPlanOutlineSegments } from './home-plan-outline.js';

const number=value=>Number(Number(value).toFixed(2)).toLocaleString('en');
const element=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
const action=(label,fn,className='floor-plan-button')=>{const button=element('button',className,label);button.type='button';button.addEventListener('click',fn);return button;};
const svgElement=(tag,attributes={},text)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
const slotPose=slot=>({cx:slot.cx,cz:slot.cz,...slot.bounds?{bounds:slot.bounds}:{}});
const overlaps=(a,b)=>a.minX<b.maxX-1e-7&&a.minX+a.width>b.minX+1e-7&&a.minZ<b.maxZ-1e-7&&a.minZ+a.depth>b.minZ+1e-7;

/** Plan a purchased room inside an existing slab. Commerce owns all mutation and pricing. */
export function createRoomPlanner({getFloors,getStock,getBalance,getSlots,quote,place,onBuilt,onShop,onFloorExpansion}) {
  const dialog=element('dialog','floor-planner room-planner');dialog.setAttribute('aria-labelledby','room-plan-title');
  const shell=element('div','floor-plan-shell'),header=element('header','floor-plan-header'),heading=element('div','');
  heading.append(element('small','floor-plan-eyebrow',"DisplayText0877 / DisplayText2494"),element('h2','',"DisplayText0885"));heading.querySelector('h2').id='room-plan-title';
  const closeButton=action('',()=>dialog.close(),'floor-plan-close');closeButton.setAttribute('aria-label',"DisplayText2495");
  const closeIcon=svgElement('svg',{viewBox:'0 0 24 24',width:20,height:20,'aria-hidden':'true',focusable:'false'});closeIcon.append(svgElement('path',{d:'M6 6l12 12M18 6L6 18',fill:'none',stroke:'currentColor','stroke-width':2.4,'stroke-linecap':'round'}));closeButton.append(closeIcon);header.append(heading,closeButton);
  const modes=element('nav','home-plan-modes');modes.setAttribute('aria-label',"DisplayText0883");
  const areaMode=action("DisplayText0879",()=>{close();onFloorExpansion?.(storey);},'home-plan-mode'),roomMode=action("DisplayText0885",()=>{},'home-plan-mode');roomMode.setAttribute('aria-pressed','true');areaMode.setAttribute('aria-pressed','false');
  areaMode.append(element('small','',"DisplayText0884"));roomMode.append(element('small','',"DisplayText0886"));modes.append(areaMode,roomMode);
  const body=element('div','floor-plan-body'),canvasPane=element('section','floor-plan-canvas-pane'),aside=element('aside','floor-plan-summary');
  const tools=element('div','floor-plan-tools'),floorLabel=element('label','floor-plan-floor-label',"DisplayText2496 "),floorSelect=element('select','');floorSelect.setAttribute('aria-label',"DisplayText2497");floorLabel.append(floorSelect);tools.append(floorLabel);
  const floorMetric=element('span','room-plan-area');tools.append(floorMetric);
  const instruction=element('p','home-plan-reference',"DisplayText2498.DisplayText2499, DisplayText2500[+]DisplayText2501; DisplayText2502.");
  const mapWrap=element('div','room-plan-map-wrap'),map=svgElement('svg',{class:'room-plan-map',viewBox:'0 0 760 520',role:'group','aria-label':"DisplayText2503, DisplayText2504, DisplayText2505, DisplayText2506"});mapWrap.append(map);
  const legend=element('div','room-plan-legend');for(const[cls,label]of[['outline',"DisplayText2507"],['room',"DisplayText2505"],['stairs',"DisplayText2508"],['proposal',"DisplayText2509"]]){const row=element('span','',label);row.prepend(element('i',cls));legend.append(row);}
  const mapHint=element('p','room-plan-hint');canvasPane.append(tools,instruction,mapWrap,legend,mapHint);
  const kitHeading=element('h3','',"DisplayText2510"),kitLabel=element('label','room-plan-kit-label',"DisplayText2511"),kitSelect=element('select','room-plan-kit-select');kitSelect.setAttribute('aria-label',"DisplayText2512");kitLabel.append(kitSelect);
  const kitInfo=element('p','room-plan-kit-info'),shop=action("DisplayText2513",()=>{close();onShop?.(storey);}),metrics=element('dl','floor-plan-metrics room-plan-metrics'),report=element('p','floor-plan-report');report.setAttribute('role','status');
  const build=action("DisplayText2514",buildRoom,'floor-plan-purchase'),note=element('p','floor-plan-note',"DisplayText2515, DisplayText2516.DisplayText2517, DisplayText2518; DisplayText2519.");
  aside.append(kitHeading,kitLabel,kitInfo,shop,metrics,report,build,note);body.append(canvasPane,aside);shell.append(header,modes,body);dialog.append(shell);document.body.append(dialog);
  let storey=0,kitId=null,stock=[],slots=[],selectedKey=null,hoverKey=null,currentQuote=null,lastFocus=null,submitting=false,projection=null,proposalLayer=null,markers=new Map(),quoteCache=new Map();
  const home=()=>getFloors()[storey];
  const currentKit=()=>stock.find(row=>row.id===kitId);
  const activeSlot=()=>slots.find(row=>row.key===(hoverKey??selectedKey));
  function close(){if(dialog.open)dialog.close();}
  function changeFloor(index){storey=index;floorSelect.value=String(index);selectedKey=hoverKey=null;reloadSlots();}
  function reloadStock(preferred){
    stock=getStock();kitSelect.replaceChildren();
    if(!stock.length){kitSelect.append(new Option("DisplayText2520",''));kitId=null;kitSelect.disabled=true;}
    else {kitSelect.disabled=false;kitId=stock.some(row=>row.id===preferred)?preferred:stock.some(row=>row.id===kitId)?kitId:stock[0].id;
      for(const row of stock){const kind=getRoomKind(row.item.kind),r=roomRect(row.item)??row.item.bounds,area=row.area??(r?r.width*r.depth:kind?kind.cols*CELL.width*kind.rows*CELL.depth:null);kitSelect.append(new Option(`${row.label??kind?.label??"Room"}${area?` · ${number(area)} sqm`:''}`,row.id));}kitSelect.value=kitId;}
  }
  function reloadSlots(){
    quoteCache.clear();currentQuote=null;const kit=currentKit(),stairs=getHomeStairs(home()).map(getStaircaseVolume).filter(Boolean);
    slots=kit?(getSlots(kit.id,storey)??[]).filter(slot=>!stairs.some(volume=>overlaps(slot.rect??slot.bounds,volume))).map((slot,i)=>({...slot,key:slot.key??`${slot.cx}:${slot.cz}:${i}`})):[];
    selectedKey=hoverKey=null;renderMap();renderSummary();
  }
  function getQuote(slot){if(!slot||!kitId)return null;if(!quoteCache.has(slot.key))quoteCache.set(slot.key,quote(kitId,slotPose(slot),storey));return quoteCache.get(slot.key);}
  function renderSummary(){
    const kit=currentKit(),floor=home(),total=getFloorArea(floor),used=(floor.rooms??[]).reduce((sum,room)=>{const r=roomRect(room);return sum+(r?r.width*r.depth:0);},0);
    floorMetric.textContent=`DisplayText2521 ${number(total)} sqm · DisplayText2522 ${number(used)} sqm`;
    kitInfo.textContent=kit?"DisplayText2523.DisplayText2524.":"DisplayText2525, Kitchen, DisplayText2526, DisplayText2527.";
    mapHint.textContent=!kit?"DisplayText2528, DisplayText2529.":slots.length?`DisplayText2530 ${slots.length} DisplayText2531.DisplayText2532[+]DisplayText2533, DisplayText2534; DisplayText2535.`:"DisplayText2536.DisplayText2537, DisplayText2538[DisplayText0879].";
    const slot=slots.find(row=>row.key===selectedKey);currentQuote=getQuote(slot);const q=currentQuote?.ok?currentQuote.quote:null;
    metrics.replaceChildren();
    const addMetric=(label,value)=>metrics.append(element('dt','',label),element('dd','',value));
    addMetric("DisplayText2539",number(getBalance()));
    if(q){addMetric("DisplayText2540",`${number(q.baseArea)} sqm`);addMetric("DisplayText2541",`${number(q.finalArea)} sqm`);addMetric("DisplayText2542",`${number(q.addedArea)} sqm`);addMetric("DisplayText2543",`${number(q.charge)} DisplayText0920`);addMetric("DisplayText2544",number(q.balanceAfter));}
    report.classList.toggle('is-error',currentQuote?.ok===false);
    report.textContent=currentQuote?.ok===false?currentQuote.error:q?`DisplayText2545.${q.addedArea>0?"DisplayText2547.":"DisplayText2548."}DisplayText2546.`:!kit?"DisplayText2549, DisplayText2550.":!slots.length?"DisplayText2551, DisplayText2552.":"DisplayText2553[+]DisplayText2554.";
    build.disabled=!q||submitting;build.textContent=q?(q.charge>0?`DisplayText2555 ${number(q.charge)} DisplayText0971`:"DisplayText2556"):"DisplayText2514";
  }
  function renderMap(){
    const floor=home(),bounds=getFloorBounds(floor),pad=56,scale=Math.min((760-pad*2)/Math.max(bounds.width,1),(520-pad*2)/Math.max(bounds.depth,1));
    const offsetX=(760-bounds.width*scale)/2,offsetZ=(520-bounds.depth*scale)/2,toX=x=>offsetX+(x-bounds.minX)*scale,toZ=z=>offsetZ+(z-bounds.minZ)*scale;projection={scale,toX,toZ};map.replaceChildren();markers=new Map();
    const rect=(r,attrs={})=>svgElement('rect',{x:toX(r.minX),y:toZ(r.minZ),width:r.width*scale,height:r.depth*scale,...attrs});
    for(const r of getFloorRects(floor))map.append(rect(r,{class:'room-plan-slab'}));
    for(const room of floor.rooms??[]){const r=roomRect(room);if(!r)continue;const group=svgElement('g'),kind=getRoomKind(room.kind);group.append(rect(r,{class:'room-plan-existing'}));group.append(svgElement('text',{class:'room-plan-name',x:toX(r.x),y:toZ(r.z)-5},kind?.label??room.kind),svgElement('text',{class:'room-plan-size',x:toX(r.x),y:toZ(r.z)+14},`${number(r.width*r.depth)} sqm`));map.append(group);}
    for(const stairs of getHomeStairs(floor)){const volume=getStaircaseVolume(stairs);if(!volume)continue;const r={minX:volume.minX,minZ:volume.minZ,width:volume.maxX-volume.minX,depth:volume.maxZ-volume.minZ},group=svgElement('g');group.append(rect(r,{class:'room-plan-stairs'}));const steps=8;for(let i=1;i<steps;i++){const z=r.minZ+r.depth*i/steps;group.append(svgElement('line',{class:'room-plan-stair-step',x1:toX(r.minX),x2:toX(r.minX+r.width),y1:toZ(z),y2:toZ(z)}));}group.append(svgElement('text',{class:'room-plan-name',x:toX(stairs.x),y:toZ(stairs.z)+4},stairs.direction==='up'?"DisplayText2557":"DisplayText2558"));map.append(group);}
    const outline=getPlanOutlineSegments(getFloorRects(floor)).map(s=>`M${toX(s.x1)},${toZ(s.z1)} L${toX(s.x2)},${toZ(s.z2)}`).join(' ');map.append(svgElement('path',{class:'room-plan-boundary',d:outline}));
    map.append(svgElement('text',{class:'room-plan-boundary-label',x:toX(bounds.minX),y:toZ(bounds.minZ)-18},`${storey+1} DisplayText2559 · ${number(getFloorArea(floor))} sqm`));
    proposalLayer=svgElement('g',{'pointer-events':'none'});map.append(proposalLayer);
    for(const[index,slot]of slots.entries()){const r=slot.rect??slot.bounds,cx=toX(r.minX+r.width/2),cz=toZ(r.minZ+r.depth/2),group=svgElement('g',{class:'room-plan-slot',role:'button',tabindex:0,'aria-label':`DisplayText2560 ${index+1} DisplayText2561`,'aria-pressed':'false'});group.dataset.slotKey=slot.key;
      group.append(svgElement('circle',{cx,cy:cz,r:13}),svgElement('text',{x:cx,y:cz+1},'+'));
      const choose=()=>{selectedKey=slot.key;hoverKey=null;renderSummary();renderProposal();};
      group.addEventListener('click',choose);group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}});
      group.addEventListener('pointerenter',()=>{hoverKey=slot.key;renderProposal();});group.addEventListener('pointerleave',()=>{hoverKey=null;renderProposal();});group.addEventListener('focus',()=>{hoverKey=slot.key;renderProposal();});group.addEventListener('blur',()=>{hoverKey=null;renderProposal();});markers.set(slot.key,group);map.append(group);
    }
    map.append(svgElement('text',{class:'room-plan-orientation',x:380,y:506},"↓ DisplayText2562(DisplayText2563) → DisplayText2564"));renderProposal();
  }
  function renderProposal(){
    if(!proposalLayer)return;proposalLayer.replaceChildren();const slot=activeSlot(),result=getQuote(slot),r=result?.ok?result.quote.bounds:slot?.rect??slot?.bounds;
    for(const[key,marker]of markers){marker.classList.toggle('is-selected',key===selectedKey);marker.setAttribute('aria-pressed',String(key===selectedKey));marker.classList.toggle('is-invalid',quoteCache.get(key)?.ok===false);}
    if(!r)return;const{scale,toX,toZ}=projection;proposalLayer.append(svgElement('rect',{class:`room-plan-proposal${result?.ok===false?' is-invalid':''}`,x:toX(r.minX),y:toZ(r.minZ),width:r.width*scale,height:r.depth*scale}));
    const label=`${currentKit()?.label??"DisplayText2565"} · ${number(r.width*r.depth)} sqm`;
    proposalLayer.append(svgElement('text',{class:'room-plan-proposal-label',x:toX(r.minX+r.width/2),y:toZ(r.minZ)+19},label));
  }
  async function buildRoom(){
    const slot=slots.find(row=>row.key===selectedKey);if(submitting||!slot||!kitId||!currentQuote?.ok)return;submitting=true;build.disabled=true;
    try{const result=await place(kitId,slotPose(slot),storey);if(!result?.ok){quoteCache.clear();submitting=false;renderSummary();report.classList.add('is-error');report.textContent=result?.error??"DisplayText2566, DisplayText2567.";return;}close();onBuilt?.(storey,result);}
    catch(error){report.textContent=error.message??"DisplayText2568, DisplayText0974.";report.classList.add('is-error');}
    finally{submitting=false;renderSummary();}
  }
  dialog.addEventListener('cancel',event=>{if(submitting)event.preventDefault();});
  floorSelect.addEventListener('change',()=>changeFloor(Number(floorSelect.value)));
  kitSelect.addEventListener('change',()=>{kitId=kitSelect.value;reloadSlots();});
  dialog.addEventListener('close',()=>{lastFocus?.isConnected&&lastFocus.focus?.({preventScroll:true});});
  return {open(index=0,options={}){lastFocus=document.activeElement;const floors=getFloors();storey=Math.max(0,Math.min(floors.length-1,index));floorSelect.replaceChildren(...floors.map((_,i)=>new Option(`${i+1} DisplayText0931`,String(i))));reloadStock(options.kitId);changeFloor(storey);if(!dialog.open)dialog.showModal();},close,dispose(){close();dialog.remove();}};
}
