import { getFloorRects, getFloorBounds } from './home-layout.js';
import { CONSTRUCTION_GRID_ORIGIN, getUnionArea, rectDifferenceArea, subtractRectangles } from './home-construction-grid.js';
import { getPlanOutlineSegments } from './home-plan-outline.js';

const origin=CONSTRUCTION_GRID_ORIGIN,unit=1;
const number=value=>Number(Number(value).toFixed(2)).toLocaleString('en');
const element=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
const action=(label,fn,className='floor-plan-button')=>{const button=element('button',className,label);button.type='button';button.addEventListener('click',fn);return button;};
const key=(x,z)=>`${x},${z}`;
const cellRect=(x,z)=>({minX:origin.x+x,minZ:origin.z+z,width:unit,depth:unit});
const intersection=(a,b)=>{
  const minX=Math.max(a.minX,b.minX),minZ=Math.max(a.minZ,b.minZ),maxX=Math.min(a.minX+a.width,b.minX+b.width),maxZ=Math.min(a.minZ+a.depth,b.minZ+b.depth);
  return maxX-minX>1e-7&&maxZ-minZ>1e-7?{minX,minZ,width:Number((maxX-minX).toFixed(8)),depth:Number((maxZ-minZ).toFixed(8))}:null;
};
const columnName=index=>{let name='',n=index+1;while(n>0){n--;name=String.fromCharCode(65+n%26)+name;n=Math.floor(n/26);}return name;};

/** Marketplace construction checkout. Draft selections never alter the actual house. */
export function createFloorPlanner({getFloors,getBalance,quote,purchase,onBuilt,onRoomPlanning,unitPrice=300,stairPrice=6000}) {
  const dialog=element('dialog','floor-planner');dialog.setAttribute('aria-labelledby','floor-plan-title');
  const shell=element('div','floor-plan-shell'),header=element('header','floor-plan-header'),heading=element('div','');
  heading.append(element('small','floor-plan-eyebrow',"DisplayText0877 / DisplayText0878"),element('h2','',"DisplayText0879"));
  heading.querySelector('h2').id='floor-plan-title';
  const close=action('',()=>dialog.close(),'floor-plan-close');close.setAttribute('aria-label',"DisplayText0880");
  const closeIcon=document.createElementNS('http://www.w3.org/2000/svg','svg'),closePath=document.createElementNS('http://www.w3.org/2000/svg','path');
  for(const[name,value]of Object.entries({viewBox:'0 0 24 24',width:'20',height:'20','aria-hidden':'true',focusable:'false'}))closeIcon.setAttribute(name,value);
  for(const[name,value]of Object.entries({d:'M6 6 18 18 M18 6 6 18',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round'}))closePath.setAttribute(name,value);
  closeIcon.append(closePath);close.append(closeIcon);header.append(heading,close);
  const body=element('div','floor-plan-body'),canvasPane=element('section','floor-plan-canvas-pane'),aside=element('aside','floor-plan-summary');
  const tools=element('div','floor-plan-tools'),floorLabel=element('label','floor-plan-floor-label',"DisplayText0881 "),floorSelect=element('select','');floorSelect.setAttribute('aria-label',"DisplayText0882");floorLabel.append(floorSelect);
  let storey=0,selected=new Set(),drag=null,buttons=new Map(),range,baseBounds,lastFocus,currentQuote,submitting=false;
  const modes=element('nav','home-plan-modes');modes.setAttribute('aria-label',"DisplayText0883");
  const areaMode=action("DisplayText0879",()=>{},'home-plan-mode');areaMode.setAttribute('aria-pressed','true');areaMode.append(element('small','',"DisplayText0884"));
  const roomMode=action("DisplayText0885",()=>{dialog.close();onRoomPlanning?.(Math.min(storey,floors().length-1));},'home-plan-mode');roomMode.setAttribute('aria-pressed','false');roomMode.append(element('small','',"DisplayText0886"));
  modes.append(areaMode,roomMode);
  const add=action("DisplayText0887",()=>{grid.querySelector('button')?.focus({preventScroll:true});report.textContent="DisplayText0888; DisplayText0889, DisplayText0890.";});add.setAttribute('aria-pressed','true');
  tools.append(floorLabel,add,action("DisplayText0891",()=>{selected.clear();refresh();}));
  const instruction=element('p','floor-plan-instruction',"DisplayText0892, DisplayText0893 L DisplayText0894.DisplayText0895, DisplayText0896; DisplayText0897.DisplayText0898 1sqm, DisplayText0899.");
  const reference=element('p','home-plan-reference');reference.setAttribute('aria-live','polite');
  const scroll=element('div','floor-plan-scroll'),grid=element('div','floor-plan-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label',"DisplayText0900, DisplayText0901, DisplayText0902");scroll.append(grid);
  const ns='http://www.w3.org/2000/svg',outline=document.createElementNS(ns,'svg');outline.classList.add('floor-plan-outline');outline.setAttribute('role','img');
  const footer=element('div','floor-plan-footer'),legend=element('div','floor-plan-legend');
  const boundaryLegend=element('div','home-plan-boundary-legend');
  for(const [cls,label]of[['reference',"DisplayText0903"],['current',"DisplayText0904"],['draft',"DisplayText0905"]]){const item=element('span','',label);item.prepend(element('i',cls));boundaryLegend.append(item);}
  for(const [cls,label]of[['owned',"DisplayText0906"],['available',"DisplayText0907"],['selected',"DisplayText0908"],['blocked',"DisplayText0909"]]){const item=element('span','',label);item.prepend(element('i',cls));legend.append(item);}
  const shortcuts=element('div','floor-plan-shortcuts');
  const widthInput=element('input',''),depthInput=element('input','');
  for(const input of[widthInput,depthInput]){input.type='number';input.min='1';input.max='80';input.step='1';input.value='10';}
  widthInput.setAttribute('aria-label',"DisplayText0910, DisplayText0650");depthInput.setAttribute('aria-label',"DisplayText0911, DisplayText0650");
  shortcuts.append(element('span','',"DisplayText0912"),widthInput,element('span','','×'),depthInput,element('span','','m'),action("DisplayText0913",()=>{
    const w=Number(widthInput.value),d=Number(depthInput.value);if(!Number.isInteger(w)||!Number.isInteger(d)||w<1||d<1||w>80||d>80){report.textContent="DisplayText0914 1–80 DisplayText0915; DisplayText0916.";return;}
    const cx=Math.floor(((baseBounds?.minX??origin.x)-origin.x)+1e-7),cz=Math.floor(((baseBounds?.minZ??origin.z)-origin.z)+1e-7);
    for(let x=cx;x<cx+w;x++)for(let z=cz;z<cz+d;z++)if(isAvailable(x,z))selected.add(key(x,z));
    range.maxX=Math.max(range.maxX,cx+w+1);range.maxZ=Math.max(range.maxZ,cz+d+1);renderGrid();refresh();
  }));
  footer.append(boundaryLegend,legend,shortcuts,action("DisplayText0917",()=>{range.minX-=4;range.minZ-=4;range.maxX+=4;range.maxZ+=4;renderGrid();refresh();}));
  canvasPane.append(tools,reference,instruction,scroll,footer);
  const summaryTitle=element('h3','',"DisplayText0918"),preview=element('div','floor-plan-preview'),metrics=element('dl','floor-plan-metrics'),report=element('p','floor-plan-report');report.setAttribute('role','status');
  const pricing=element('p','floor-plan-pricing',`DisplayText0919 ${number(unitPrice)} DisplayText0920/sqm.DisplayText0921 ${number(stairPrice)} DisplayText0922; DisplayText0923.`);
  const buy=action("DisplayText0924",buySelection,'floor-plan-purchase');
  const note=element('p','floor-plan-note',"DisplayText0925.DisplayText0926; DisplayText0927.DisplayText0928, DisplayText0929.");
  aside.append(summaryTitle,preview,metrics,pricing,report,buy,note);body.append(canvasPane,aside);shell.append(header,modes,body);dialog.append(shell);document.body.append(dialog);
  function floors(){return getFloors();}
  function support(){return storey>0?getFloorRects(floors()[storey-1]):null;}
  function isAvailable(x,z){const parts=support();return !parts||parts.some(r=>intersection(cellRect(x,z),r));}
  function selectedRects(cells=selected){
    const parts=support(),rows=new Map();
    for(const value of cells){const[x,z]=value.split(',').map(Number);if(!rows.has(z))rows.set(z,[]);rows.get(z).push(x);}
    const rects=[];
    for(const[z,xs]of rows){xs.sort((a,b)=>a-b);let start=xs[0],end=start;const push=()=>rects.push({minX:origin.x+start,minZ:origin.z+z,width:end-start+1,depth:1});
      for(let i=1;i<xs.length;i++){if(xs[i]===end+1)end=xs[i];else{push();start=end=xs[i];}}if(xs.length)push();}
    // Merge identical spans vertically, then clip upper selection to the exact lower silhouette.
    rects.sort((a,b)=>a.minX-b.minX||a.width-b.width||a.minZ-b.minZ);const merged=[];
    for(const r of rects){const last=merged.at(-1);if(last&&last.minX===r.minX&&last.width===r.width&&Math.abs(last.minZ+last.depth-r.minZ)<1e-7)last.depth++;else merged.push({...r});}
    return parts?merged.flatMap(r=>parts.map(p=>intersection(r,p)).filter(Boolean)):merged;
  }
  function existingRects(){return floors()[storey]?getFloorRects(floors()[storey]):[];}
  function measuredSelection(){
    const rects=selectedRects(),existing=existingRects(),addedRects=subtractRectangles(rects,existing);
    const selectedArea=getUnionArea(rects),addedArea=getUnionArea(addedRects),deductedArea=Number((selectedArea-addedArea).toFixed(6));
    return {rects,existing,addedRects,selectedArea,addedArea,deductedArea,before:getUnionArea(existing)};
  }
  function changeFloor(index){
    storey=index;selected.clear();drag=null;currentQuote=null;
    roomMode.disabled=storey===floors().length;
    roomMode.querySelector('small').textContent=roomMode.disabled?`DisplayText0930 ${storey+1} DisplayText0931, DisplayText0932`:"DisplayText0886";
    baseBounds=getFloorBounds(floors()[storey]??floors()[storey-1]);
    // A downstairs extension must be visible in the upstairs picker immediately.
    // Keep very large imported houses from creating an unbounded initial DOM grid.
    const availableBounds=storey>0?getFloorBounds(floors()[storey-1]):baseBounds;
    const minX=Math.floor((availableBounds.minX-origin.x))-2,minZ=Math.floor((availableBounds.minZ-origin.z))-2;
    range={minX,minZ,maxX:Math.min(minX+80,Math.max(minX+22,Math.ceil((availableBounds.maxX-origin.x))+3)),maxZ:Math.min(minZ+80,Math.max(minZ+18,Math.ceil((availableBounds.maxZ-origin.z))+3))};
    floorSelect.value=String(index);renderGrid();refresh();
    reference.textContent=storey>0?`DisplayText0933 ${storey} DisplayText0934 · ${number(getUnionArea(support()))} sqm.${storey+1} DisplayText0935.`:"DisplayText0936.DisplayText0937, DisplayText0938.";
    boundaryLegend.querySelector('span').hidden=storey===0;
    outline.setAttribute('aria-label',storey>0?`${storey} DisplayText0939 ${storey+1} DisplayText0940`:"DisplayText0941");
  }
  floorSelect.addEventListener('change',()=>changeFloor(Number(floorSelect.value)));
  function renderGrid(){
    const cols=range.maxX-range.minX,rows=range.maxZ-range.minZ;buttons=new Map();grid.replaceChildren();grid.style.gridTemplateColumns=`30px repeat(${cols},26px)`;
    grid.append(element('span','floor-plan-axis','m'));
    for(let x=range.minX;x<range.maxX;x++)grid.append(element('span','floor-plan-axis',columnName(x-range.minX)));
    const owned=existingRects(),parts=support();
    for(let z=range.minZ;z<range.maxZ;z++){
      grid.append(element('span','floor-plan-axis',String(z-range.minZ+1)));
      for(let x=range.minX;x<range.maxX;x++){
        const cell=element('button','floor-plan-cell');cell.type='button';cell.dataset.cx=x;cell.dataset.cz=z;
        const rect=cellRect(x,z),clipped=parts?parts.map(p=>intersection(rect,p)).filter(Boolean):[rect],covered=owned.map(r=>intersection(rect,r)).filter(Boolean),allowed=clipped.length>0,existing=covered.length>0;
        cell.dataset.newArea=String(rectDifferenceArea(clipped,covered));
        cell.classList.toggle('is-owned',existing);cell.classList.toggle('is-blocked',!allowed);cell.setAttribute('aria-disabled',String(!allowed));
        cell.setAttribute('aria-label',`${columnName(x-range.minX)}${z-range.minZ+1}, ${existing?"DisplayText0942":allowed?"DisplayText0943":"DisplayText0909"}`);
        cell.addEventListener('click',event=>{if(event.detail===0&&allowed){const k=key(x,z);selected.has(k)?selected.delete(k):selected.add(k);refresh();}});
        cell.addEventListener('keydown',event=>{const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const delta=directions[event.key];if(delta){event.preventDefault();buttons.get(key(x+delta[0],z+delta[1]))?.focus({preventScroll:false});}});
        buttons.set(key(x,z),cell);grid.append(cell);
      }
    }
    outline.setAttribute('width',30+cols*26);outline.setAttribute('height',26+rows*26);grid.append(outline);
  }
  function cellAt(event){const box=grid.getBoundingClientRect();const x=range.minX+Math.floor((event.clientX-box.left-30)/26),z=range.minZ+Math.floor((event.clientY-box.top-26)/26);return x>=range.minX&&x<range.maxX&&z>=range.minZ&&z<range.maxZ?{x,z}:null;}
  grid.addEventListener('pointerdown',event=>{
    if(event.button!==0||submitting)return;const p=cellAt(event);if(!p)return;event.preventDefault();
    if(!isAvailable(p.x,p.z)){report.textContent="DisplayText0944.DisplayText0945, DisplayText0946.";return;}
    grid.setPointerCapture(event.pointerId);drag={id:event.pointerId,start:p,end:p,base:new Set(selected)};previewDrag();
  });
  grid.addEventListener('pointermove',event=>{if(!drag)return;const p=cellAt(event);if(!p||p.x===drag.end.x&&p.z===drag.end.z)return;drag.end=p;previewDrag();});
  function previewDrag(){selected=new Set(drag.base);const a=drag.start,b=drag.end;
    for(let x=Math.min(a.x,b.x);x<=Math.max(a.x,b.x);x++)for(let z=Math.min(a.z,b.z);z<=Math.max(a.z,b.z);z++)if(isAvailable(x,z)){if(a.x===b.x&&a.z===b.z&&drag.base.has(key(x,z)))selected.delete(key(x,z));else selected.add(key(x,z));}
    paintCells();const measured=measuredSelection();drawPreview(measured.addedRects);renderMetrics(measured);
    report.textContent=`DisplayText0947 ${number(measured.selectedArea)} sqm − DisplayText0948 ${number(measured.deductedArea)} sqm = DisplayText0949 ${number(measured.addedArea)} sqm.DisplayText0950.`;buy.disabled=true;
  }
  function endDrag(event){if(!drag||event.pointerId!==drag.id)return;drag=null;if(grid.hasPointerCapture(event.pointerId))grid.releasePointerCapture(event.pointerId);refresh();}
  grid.addEventListener('pointerup',endDrag);grid.addEventListener('pointercancel',event=>{if(drag){selected=drag.base;endDrag(event);}});
  function paintCells(){for(const[k,cell]of buttons){const on=selected.has(k)&&Number(cell.dataset.newArea)>1e-7;cell.classList.toggle('is-selected',on);cell.setAttribute('aria-pressed',String(on));}}
  function drawPreview(rects){
    preview.replaceChildren();const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 240 160');svg.setAttribute('aria-label',"DisplayText0951");
    const own=floors()[storey]?getFloorRects(floors()[storey]):[],under=support()??[];const all=[...own,...under,...rects];if(!all.length)return;
    const minX=Math.min(...all.map(r=>r.minX)),minZ=Math.min(...all.map(r=>r.minZ)),width=Math.max(...all.map(r=>r.minX+r.width))-minX,depth=Math.max(...all.map(r=>r.minZ+r.depth))-minZ;
    const scale=Math.min(216/width,136/depth),ox=(240-width*scale)/2,oz=(160-depth*scale)/2;
    for(const[list,cls]of[[under,'under'],[own,'owned'],[rects,'selected']])for(const r of list){const n=document.createElementNS(ns,'rect');n.setAttribute('x',ox+(r.minX-minX)*scale);n.setAttribute('y',oz+(r.minZ-minZ)*scale);n.setAttribute('width',r.width*scale);n.setAttribute('height',r.depth*scale);n.setAttribute('class',cls);svg.append(n);}
    const pathFor=(parts,toX,toZ)=>getPlanOutlineSegments(parts).map(s=>`M${toX(s.x1)} ${toZ(s.z1)}L${toX(s.x2)} ${toZ(s.z2)}`).join(' ');
    outline.replaceChildren();
    // Colour only the exact unpaid fragments, including partial boundary cells.
    for(const r of rects){const fill=document.createElementNS(ns,'rect');for(const[k,v]of Object.entries({x:30+(r.minX-origin.x-range.minX)*26,y:26+(r.minZ-origin.z-range.minZ)*26,width:r.width*26,height:r.depth*26,class:'floor-plan-new-area'}))fill.setAttribute(k,v);outline.append(fill);}

    for(const[parts,cls]of[[under,'reference'],[rects,'draft'],[own,'current']]){
      const draw=(target,d)=>{const p=document.createElementNS(ns,'path');p.setAttribute('class',`plan-outline-stroke ${cls}`);p.setAttribute('d',d);p.setAttribute('vector-effect','non-scaling-stroke');target.append(p);};
      draw(outline,pathFor(parts,x=>30+(x-origin.x-range.minX)*26,z=>26+(z-origin.z-range.minZ)*26));
      draw(svg,pathFor(parts,x=>ox+(x-minX)*scale,z=>oz+(z-minZ)*scale));
    }
    preview.append(svg);
  }
  function renderMetrics(measured,q=null){
    const {before,selectedArea,deductedArea,addedArea}=measured;
    summaryTitle.textContent=storey===floors().length?`DisplayText0952 ${storey+1} DisplayText0931`:`DisplayText0953 ${storey+1} DisplayText0931`;
    const rows=[["DisplayText0954",`${number(before)} sqm`]];
    if(storey>0)rows.push(["DisplayText0955",`${number(getUnionArea(support()))} sqm`]);
    rows.push(["DisplayText0956",`${number(selectedArea)} sqm`],["DisplayText0957",`− ${number(deductedArea)} sqm`],["DisplayText0958",`${number(addedArea)} sqm`],["DisplayText0959",`${number(before+addedArea)} sqm`],["DisplayText0960",`${number(q?.areaCost??Math.round(addedArea*unitPrice))} DisplayText0920`],["DisplayText0961",`${number(q?.stairCost??(addedArea>0&&storey===floors().length?stairPrice:0))} DisplayText0920`],["DisplayText0962",`${number(getBalance())} DisplayText0920`]);
    metrics.replaceChildren();for(const[label,value]of rows)metrics.append(element('dt','',label),element('dd','',value));
  }
  function refresh(){
    paintCells();const measured=measuredSelection();drawPreview(measured.addedRects);
    currentQuote=measured.addedRects.length?quote({storey,rects:measured.addedRects}):null;const q=currentQuote?.quote;renderMetrics(measured,q);
    const hasNewArea=Boolean(currentQuote?.ok&&q?.changed);
    report.textContent=!measured.rects.length?"DisplayText0963, DisplayText0889.":!measured.addedArea?"DisplayText0964, DisplayText0949 0 sqm, DisplayText0965.":currentQuote.ok?`DisplayText0966 ${number(measured.deductedArea)} sqmDisplayText0967, DisplayText0968 ${number(measured.addedArea)} sqmDisplayText0969.`:currentQuote.error;
    report.classList.toggle('is-error',Boolean(currentQuote&&!currentQuote.ok));buy.disabled=!hasNewArea||submitting;buy.textContent=hasNewArea?`DisplayText0970 ${number(q.total)} DisplayText0971`:"DisplayText0972";
  }
  async function buySelection(){
    if(submitting||!currentQuote?.ok||!currentQuote.quote.changed)return;
    const chosenStorey=storey,selection={storey,rects:measuredSelection().addedRects};submitting=true;
    const controls=[...dialog.querySelectorAll('button,input,select')];const disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
    try{const result=await purchase(selection,crypto.randomUUID());if(result?.ok){dialog.close();onBuilt(chosenStorey,result);}else{report.textContent=result?.error??"DisplayText0973, DisplayText0974.";report.classList.add('is-error');}}
    catch(error){report.textContent=error.message??"DisplayText0975, DisplayText0974.";report.classList.add('is-error');}
    finally{submitting=false;controls.forEach((c,i)=>c.disabled=disabled[i]);}
  }
  dialog.addEventListener('cancel',event=>{if(submitting)event.preventDefault();});
  dialog.addEventListener('close',()=>{drag=null;if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});});
  return {open(index=0){lastFocus=document.activeElement;floorSelect.replaceChildren(...Array.from({length:floors().length+1},(_,i)=>{const option=element('option','',i===floors().length?`+ DisplayText0952 ${i+1} DisplayText0931`:`${i+1} DisplayText0931 · DisplayText0976`);option.value=i;return option;}));changeFloor(Math.min(index,floors().length));dialog.showModal();},close(){dialog.close();},dispose(){dialog.remove();}};
}
