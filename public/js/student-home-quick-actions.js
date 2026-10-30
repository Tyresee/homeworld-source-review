const ART_BASE=new URL('../assets/quick-actions/',import.meta.url);
const actionArt={'sofa-sit':'sit.webp',watch:'watch.webp','watch-sofa':'watch.webp',tidy:'tidy.webp','tidy-cushion':'tidy.webp'};
const iconPaths={
  wardrobe:'M5 3h14v18H5zM12 3v18M9 11v3m6-3v3',
  palette:'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.5H18A4 4 0 0 0 22 11 10 10 0 0 0 12 3ZM6.5 10h.01M10 6.5h.01M15 7h.01M18 10.5h.01',
  back:'M10 5 3 12l7 7M3 12h18',
  dance:'M14 3h.01M9 7l5 1 3 5 4-1M14 8l-3 6 5 7M11 14l-5 6M9 7l-4 5-3-2M19 3v4m-2-2h4',
  sit:'M5 13V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5M5 11H3v8h18v-8h-2M5 16h14M6 19v2m12-2v2',
  watch:'M4 6h16v12H4zM8 22h8M12 18v4M9 2l3 3 3-3',
  sleep:'M3 18V8m18 10V8M3 13h18M7 13V9h10v4M3 18h18M3 21v-3m18 3v-3',
  lie:'M3 18V8m18 10V8M3 13h18M7 13V9h10v4M3 18h18M3 21v-3m18 3v-3',
  swim:'M2 17q2-2 4 0t4 0 4 0 4 0 4 0M2 21q2-2 4 0t4 0 4 0 4 0 4 0M6 13l5-5 4 3 4 2M11 8l-4-3M18 5h.01',
  read:'M12 5C9 3 5 3 2 5v14c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-2-10 0v14',
  cook:'M5 11h14v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7M2 12h3m14 0h3M8 8c-3-3 3-3 0-6m4 6c-3-3 3-3 0-6m4 6c-3-3 3-3 0-6',
  wash:'M5 13h14l-2 8H7zM12 13V5a3 3 0 0 1 6 0M18 6v2M2 13h20',
  dishwash:'M5 3h14v18H5zM5 7h14M8 5h.01M10 5h.01M9 11v7m3-7v7m3-7v7',
  tidy:'M4 8h16v12H4zM7 8V5h10v3M8 12h8m-8 4h8M18 1v4m-2-2h4',
  wipe:'M3 18h18M5 21v-3m14 3v-3M8 14l4-7 8 3-4 7zM4 3v6M1 6h6',
  football:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8l4 3-2 5h-4l-2-5zM12 3v5m9 3-5 0m2 8-4-3m-8 3 4-3m-7-5h5',
  admire:'M12 3l2.5 5.5 6 .7-4.4 4.2 1.3 6.1-5.4-3-5.4 3 1.3-6.1L3.5 9.2l6-.7z',
  stand:'M12 2h.01M12 7v6m0-4-5 4m5-4 5 3m-5 1-4 8m4-8 5 8',
  stairs:'M3 20h5v-5h5v-5h5V5h4M3 5h9M9 2l3 3-3 3',
  toilet:'M7 3h10v8H7zM5 11h14v3a6 6 0 0 1-6 6H8v-6H5zM9 20v2h8M10 6h4',
  lamp:'M7 3h10l4 11H3L7 3ZM12 14v7M7 21h10',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
};

function artFor(action){
  const key=action.icon??action.kind??action.id;
  // The sofa illustration is only used when the caller requests it; a toilet
  // sit command must never be represented by a sofa thumbnail.
  const name=actionArt[key];return name?new URL(name,ART_BASE).href:null;
}

/** A non-modal, object-bound action dock. It never changes selection, camera,
 * robot state or account state by itself; those remain owned by the editor. */
export function createStudentHomeQuickActions({onAction=()=>{},onStop=()=>{},onClose=()=>{},document:doc=globalThis.document}={}){
  const el=(tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const root=el('aside','home-quick-remote');root.hidden=true;root.setAttribute('aria-label',"DisplayText3945");
  const antenna=el('span','home-quick-antenna');antenna.setAttribute('aria-hidden','true');
  const closeButton=el('button','home-quick-close');closeButton.type='button';closeButton.setAttribute('aria-label',"DisplayText3946");
  closeButton.append(el('span','home-quick-close-mark'));
  const screen=el('div','home-quick-screen');screen.setAttribute('aria-hidden','true');
  const face=el('span','home-quick-face');face.append(el('i','home-quick-eye home-quick-eye-left'),el('i','home-quick-eye home-quick-eye-right'),el('i','home-quick-smile'));screen.append(face);
  const heading=el('div','home-quick-heading'),thumbnail=el('img','home-quick-object'),title=el('h2','home-quick-title');thumbnail.alt='';thumbnail.hidden=true;heading.append(thumbnail,title);
  const actions=el('div','home-quick-actions');actions.setAttribute('role','group');actions.setAttribute('aria-label',"DisplayText3947");
  const status=el('p','home-quick-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
  const footer=el('div','home-quick-footer'),stopButton=el('button','home-quick-stop'),stopIcon=el('span','home-quick-stop-icon'),stopText=el('span','',"DisplayText3775");stopButton.type='button';stopIcon.setAttribute('aria-hidden','true');
  stopIcon.innerHTML=svgIcon('stand');stopButton.append(stopIcon,stopText);footer.append(stopButton,el('span','home-quick-speaker'));
  root.append(antenna,closeButton,screen,heading,actions,status,footer);doc.body.append(root);
  let current=null,signature=null,rows=[],serial=0,pending=false,disposed=false;
  const isolate=event=>event.stopPropagation();
  for(const type of['pointerdown','pointerup','dblclick','contextmenu','wheel'])root.addEventListener(type,isolate,{passive:true});
  function svgIcon(key){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[key]??iconPaths.admire}"/></svg>`;}
  function updateStatus(text,{error=false}={}){if(disposed)return;const value=typeof text==='string'?text:'';status.textContent=value;status.hidden=!value;root.dataset.error=String(error);}
  function setBusy(){root.setAttribute('aria-busy',String(pending||current?.busy===true));for(const row of rows)row.button.disabled=pending||current?.busy===true||row.action.disabled===true;stopButton.disabled=pending||current?.busy===true;}
  async function run(id){
    const row=rows.find(item=>item.action.id===id);
    if(!current||root.hidden||pending||current.busy||row?.action.disabled||disposed)return;
    const token=serial,targetId=current.targetId;pending=true;setBusy();
    try{const result=await (id==='__stop'?onStop(targetId):onAction(id,targetId));if(disposed||token!==serial)return;
      if(result?.ok===false)updateStatus(result.error??"DisplayText3948.",{error:true});
      else if(result?.message)updateStatus(result.message);
    }catch(error){if(!disposed&&token===serial)updateStatus(error?.message??"DisplayText3949, DisplayText0717.",{error:true});}
    finally{if(token===serial&&!disposed){pending=false;setBusy();}}
  }
  function close({notify=false}={}){if(disposed||root.hidden)return;serial++;pending=false;current=null;signature=null;root.hidden=true;if(notify)onClose();}
  closeButton.addEventListener('click',()=>close({notify:true}));stopButton.addEventListener('click',()=>{void run('__stop');});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close({notify:true});}else if(event.key===' '||event.key==='Spacebar')event.stopPropagation();});
  function show(value){
    if(disposed)return;
    if(!value?.targetId){close();return;}
    const nextActions=Array.isArray(value.actions)?value.actions.filter(action=>action&&typeof action.id==='string'&&typeof action.label==='string'):[];
    const changed=current?.targetId!==value.targetId;
    if(changed){serial++;pending=false;updateStatus('');actions.scrollTop=0;}
    current={...value,actions:nextActions};root.hidden=false;root.dataset.targetId=value.targetId;title.textContent=value.title??"DisplayText3950";
    if(value.image&&typeof value.image==='string'){thumbnail.src=value.image;thumbnail.hidden=false;}else thumbnail.hidden=true;
    const shape=JSON.stringify([value.targetId,nextActions.map(action=>[action.id,action.icon??action.kind??action.id])]);
    if(signature!==shape){signature=shape;rows=nextActions.map(action=>{
      const button=el('button','home-quick-action');button.type='button';button.dataset.actionId=action.id;
      const art=el('span','home-quick-action-art'),image=artFor(action);art.setAttribute('aria-hidden','true');
      if(image){const node=el('img');node.src=image;node.alt='';node.draggable=false;node.decoding='async';art.append(node);}else art.innerHTML=svgIcon(action.icon??action.kind??action.id);
      const copy=el('span','home-quick-action-copy'),label=el('strong'),detail=el('small');copy.append(label,detail);button.append(art,copy);
      button.addEventListener('click',()=>{void run(action.id);});return {action,button,label,detail};
    });actions.replaceChildren(...rows.map(row=>row.button));}
    rows.forEach((row,index)=>{row.action=nextActions[index];row.label.textContent=row.action.label;const hint=row.action.disabled?(row.action.reason??row.action.detail??"DisplayText3951"):(row.action.detail??'');row.detail.textContent=hint;row.detail.hidden=!hint;row.button.title=hint;row.button.dataset.tone=row.action.tone??['green','blue','coral','amber'][index%4];});
    if(!nextActions.length){const empty=el('p','home-quick-empty',"DisplayText3952.");actions.replaceChildren(empty);}
    if(Object.hasOwn(value,'status'))updateStatus(value.status);
    stopText.textContent=value.stopLabel??"DisplayText3775";setBusy();
  }
  return {show,updateStatus,close,get isOpen(){return !root.hidden;},get targetId(){return current?.targetId??null;},dispose(){if(disposed)return;close();disposed=true;serial++;root.remove();}};
}
