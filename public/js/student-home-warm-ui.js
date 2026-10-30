// Optional classroom chrome. Rendering, accounts and commands remain owned by
// the existing page and scene controllers. No account or home values are saved here.
export const WARM_TOAST_MS=5000;
export const WARM_BALANCE_MS=600;
const views=['interior','estate','building','roam'];
const icons={
  interior:'<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M9 20v-4a5 5 0 0 1 5-5h12a5 5 0 0 1 5 5v4" fill="#f2c3a9"/><rect x="7" y="20" width="26" height="11" rx="4" fill="#e9a98a"/><rect x="4" y="17" width="6" height="15" rx="3" fill="#d98f6f"/><rect x="30" y="17" width="6" height="15" rx="3" fill="#d98f6f"/><path d="M10 31v4m20-4v4" stroke="#8a5a3c" stroke-width="3" stroke-linecap="round"/><path d="M12 21h16" stroke="#f8ddcb" stroke-width="2" stroke-linecap="round"/></svg>',
  estate:'<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><ellipse cx="20" cy="34" rx="15" ry="3" fill="#b9d39a"/><path d="M20 19v14" stroke="#9a6a45" stroke-width="5" stroke-linecap="round"/><circle cx="20" cy="14" r="10" fill="#7fb36a"/><circle cx="13" cy="18" r="6" fill="#8fc27a"/><circle cx="26" cy="18" r="7" fill="#6aa35a"/></svg>',
  building:'<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M8 18h24v16H8z" fill="#f4e8d6"/><path d="m4 19 16-13 16 13-3 3L20 12 7 22z" fill="#d27d5d"/><path d="M17 25a3 3 0 0 1 6 0v9h-6z" fill="#9a6a45"/><rect x="10" y="23" width="5" height="5" rx="1" fill="#9fc9d6"/><rect x="26" y="23" width="5" height="5" rx="1" fill="#9fc9d6"/></svg>',
  roam:'<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M7 18h22v16H7z" fill="#f4e8d6"/><path d="m3 19 15-13 15 13-3 3L18 12 6 22z" fill="#d27d5d"/><path d="M13 26a3 3 0 0 1 6 0v8h-6z" fill="#9a6a45"/><path d="M20 25s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z" fill="#fbf9f5" stroke="#8a5a3c" stroke-width="2"/><circle cx="29" cy="25" r="3" fill="#608ea6"/></svg>',
  plus:'<svg viewBox="0 0 26 26" fill="none" aria-hidden="true"><path d="M13 6v14M6 13h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  minus:'<svg viewBox="0 0 26 26" fill="none" aria-hidden="true"><path d="M6 13h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  reset:'<svg viewBox="0 0 26 26" fill="none" aria-hidden="true"><circle cx="13" cy="13" r="8" stroke="currentColor" stroke-width="2"/><circle cx="13" cy="13" r="2.4" fill="#b9755a"/><path d="M13 2v4M13 20v4M2 13h4M20 13h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  stage:'<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M13 6h14l-3 9h-8z" fill="#f2c14e"/><path d="M16 15 5 36h30L24 15z" fill="#f2c14e" opacity=".35"/><circle cx="20" cy="30" r="4" fill="#fbf9f5"/></svg>',
  coin:'<svg viewBox="0 0 30 30" fill="none" aria-hidden="true"><circle cx="15" cy="15" r="12" fill="#e0a64a"/><circle cx="15" cy="15" r="8.5" stroke="#f5cf7c" stroke-width="1.5"/><path d="M16.7 9.5h-2.1a2.4 2.4 0 1 0 0 4.8h.8a2.4 2.4 0 1 1 0 4.8h-2.1M15 7.7v14.6" stroke="#fff1ce" stroke-width="1.7" stroke-linecap="round"/></svg>',
};
export function isWarmTypingTarget(target){
  if(!target)return false;
  if(target.isContentEditable||/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(String(target.tagName).toUpperCase()))return true;
  return !!target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]');
}
export function resolveWarmShortcut(event,{activeElement,modalOpen=false}={}){
  if(!event||event.defaultPrevented||event.repeat||event.ctrlKey||event.metaKey||event.altKey||modalOpen||isWarmTypingTarget(activeElement))return null;
  const path=event.composedPath?.()??[event.target];if(path.some(isWarmTypingTarget))return null;
  const key=String(event.key).toLowerCase();
  return ({'1':{type:'view',view:'interior'},'2':{type:'view',view:'estate'},'3':{type:'view',view:'building'},'4':{type:'view',view:'roam'},'0':{type:'reset'},p:{type:'present'}})[key]??null;
}
/** A new authoritative balance replaces an earlier animation. Changing the
 * student scope cancels the old value instead of animating another account. */
export function createWarmBalanceAnimator({render,requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id),now=()=>performance.now(),reducedMotion=()=>false}={}){
  let frame=null,current=null,scope=null,generation=0;
  const cancel=()=>{generation++;if(frame!==null)cancelFrame(frame);frame=null;};
  function clear(){cancel();current=null;scope=null;render(null);}
  function set(value,nextScope){
    if(!Number.isSafeInteger(value)||value<0){clear();return;}
    const changedScope=scope!==nextScope,from=current;cancel();scope=nextScope;
    if(changedScope||from===null||from===value||reducedMotion()){current=value;render(value);return;}
    const token=generation,start=now();
    function tick(time){if(token!==generation)return;const progress=Math.min(1,Math.max(0,(time-start)/WARM_BALANCE_MS)),ease=1-(1-progress)**4;current=Math.round(from+(value-from)*ease);render(current);if(progress<1)frame=requestFrame(tick);else{frame=null;current=value;}}
    frame=requestFrame(tick);
  }
  return {set,clear,dispose:cancel,getValue:()=>current};
}
export function createWarmToast({show,hide,setTimer=setTimeout,clearTimer=clearTimeout,duration=WARM_TOAST_MS}={}){
  let timer=null;const cancel=()=>{if(timer!==null)clearTimer(timer);timer=null;};
  return {notify({persistent=false}={}){cancel();show(persistent);if(!persistent)timer=setTimer(()=>{timer=null;hide();},duration);},dispose:cancel};
}

export function createStudentHomeWarmUI({document,window,themeId,getState=()=>({}),onView=()=>{},onStage=()=>{},onStageCamera=()=>{},onZoom=()=>{},onReset=()=>{},onRefit=()=>{},onSelectStudent=()=>{},onError=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
  if(themeId!=='warm'||!document?.querySelector)return null;
  const $=id=>document.getElementById(id),home=document.querySelector('.home'),body=document.body;
  if(!home||!body)return null;
  const listeners=[],buttons=new Map(),add=(target,event,fn)=>{target.addEventListener(event,fn);listeners.push(()=>target.removeEventListener(event,fn));};
  const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  const icon=(name,className)=>{const el=make('span',className);el.setAttribute('aria-hidden','true');el.innerHTML=icons[name];return el;};
  const button=(label,className,fn)=>{const el=make('button',className);el.type='button';el.setAttribute('aria-label',label);el.title=label;add(el,'click',fn);return el;};
  let ready=false,busy=false,present=false,disposed=false,refitFrame=null;
  function scheduleRefit(){if(refitFrame!==null)window.cancelAnimationFrame(refitFrame);refitFrame=window.requestAnimationFrame(()=>{refitFrame=null;if(!disposed)onRefit();});}
  const heading=$('home-title').parentElement,titleRow=make('div','warm-title-row');heading.insertBefore(titleRow,$('home-title'));titleRow.append($('home-title'));
  const pickerLabel=make('label','warm-student-picker'),pickerName=make('span','warm-sr-only',"DisplayText0002"),picker=make('select','warm-student-select');picker.id='warm-student-select';picker.setAttribute('aria-label',"DisplayText0002");pickerLabel.append(pickerName,picker);titleRow.append(pickerLabel);
  const headingActions=make('div','warm-heading-actions'),displayTools=make('div','warm-display-tools');headingActions.append(displayTools);heading.append(headingActions);
  const presentButton=button("DisplayText4744",'warm-present-toggle',()=>setPresentation(!present));presentButton.textContent="Present";presentButton.setAttribute('aria-keyshortcuts','P');presentButton.setAttribute('aria-pressed','false');
  const helpButton=button("Help",'warm-help-button',()=>toggleHelp());helpButton.textContent='?';helpButton.setAttribute('aria-expanded','false');helpButton.setAttribute('aria-controls','warm-help-popover');displayTools.append(presentButton,helpButton);
  const help=make('section','warm-help-popover');help.id='warm-help-popover';help.hidden=true;help.setAttribute('aria-label',"DisplayText4745");
  help.append(make('strong','',"DisplayText4746"),make('p','',"DisplayText4747, DisplayText4748; DisplayText4749."),make('p','',"DisplayText4366 + DisplayText4367, DisplayText4750."),make('p','',"1 / 2 / 3 DisplayText4751, 4 DisplayText4773, 0 DisplayText4752, P DisplayText4753.DisplayText4754."));
  const helpClose=button("DisplayText4755",'warm-help-close',()=>toggleHelp(false));helpClose.textContent="DisplayText4756";help.append(helpClose);headingActions.append(help);
  function toggleHelp(open=help.hidden){help.hidden=!open;helpButton.setAttribute('aria-expanded',String(open));if(!open&&document.activeElement===helpClose)helpButton.focus({preventScroll:true});}
  const viewDock=make('div','warm-view-dock');viewDock.setAttribute('role','group');viewDock.setAttribute('aria-label',"DisplayText4353");
  for(const[view,label]of [['interior',"Interior"],['estate',"Outdoors"],['building',"House"],['roam',"Visit"]]){const b=button(label,'warm-view-option',()=>{if(ready&&!busy&&!getState().roam?.transition)onView(view);});b.dataset.warmView=view;b.setAttribute('aria-keyshortcuts',String(views.indexOf(view)+1));b.append(icon(view,'warm-view-icon'),make('span','warm-view-label',label));buttons.set(view,b);viewDock.append(b);}
  const show=button("Showtime",'warm-show',()=>{if(ready&&!busy&&getState().view==='interior')onStage();});show.append(icon('stage','warm-show-icon'),make('span','warm-show-label',"Showtime"));
  const stageCamera=button("DisplayText3762",'warm-stage-camera',()=>{if(ready&&!busy)onStageCamera();});stageCamera.hidden=true;
  const cameraDock=make('div','warm-camera-dock');cameraDock.setAttribute('role','group');cameraDock.setAttribute('aria-label',"DisplayText4757");
  for(const[id,label,action]of [['plus',"DisplayText4758",()=>onZoom(1)],['minus',"DisplayText4759",()=>onZoom(-1)],['reset',"DisplayText4760",onReset]]){const b=button(label,'warm-camera-button',()=>{if(ready&&!busy)action();});b.dataset.warmCamera=id;b.append(icon(id));if(id==='reset')b.setAttribute('aria-keyshortcuts','0');buttons.set(id,b);cameraDock.append(b);}
  home.append(viewDock,show,stageCamera,cameraDock);
  const feedback=document.querySelector('.feedback');feedback.classList.add('warm-status-toast');
  const toast=createWarmToast({setTimer,clearTimer,show(persistent){feedback.classList.add('is-visible');feedback.classList.toggle('is-persistent',persistent);},hide(){feedback.classList.remove('is-visible');feedback.classList.remove('is-persistent');}});
  const balance=$('balance'),balanceGroup=make('span','warm-balance-group');balance.parentElement.insertBefore(balanceGroup,balance);balanceGroup.append(icon('coin','warm-coin'),balance);
  const balanceAnimator=createWarmBalanceAnimator({render:value=>{balance.textContent=value===null?'—':value.toLocaleString('en');},requestFrame:fn=>window.requestAnimationFrame(fn),cancelFrame:id=>window.cancelAnimationFrame(id),now:()=>window.performance.now(),reducedMotion:()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true});
  function setPresentation(value,{updateUrl=true}={}){
    present=!!value;body.classList.toggle('warm-present',present);presentButton.setAttribute('aria-pressed',String(present));presentButton.textContent=present?"Exit present":"Present";presentButton.setAttribute('aria-label',present?"DisplayText4761":"DisplayText4744");presentButton.title=presentButton.getAttribute('aria-label');pickerLabel.hidden=!present;
    document.querySelector('.skip')?.setAttribute('href',present?'#warm-student-select':'#students');
    if(updateUrl&&window.history?.replaceState){try{const url=new URL(window.location.href);if(present)url.searchParams.set('view','present');else if(url.searchParams.get('view')==='present')url.searchParams.delete('view');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}catch{/* Presentation still works when URL updates are restricted. */}}
    toggleHelp(false);scheduleRefit();
  }
  function syncStudents(students,selectedId){
    const rows=Array.isArray(students)?students:[],signature=JSON.stringify(rows.map(row=>[row.id,row.displayName]));
    if(picker.dataset.options!==signature){picker.replaceChildren();const option=make('option','',"DisplayText0002");option.value='';option.disabled=true;picker.append(option);for(const row of rows){const option=make('option','',row.displayName);option.value=row.id;picker.append(option);}picker.dataset.options=signature;}
    picker.value=selectedId??'';picker.disabled=busy||!rows.length;
  }
  function refresh(){const state=getState(),roam=state.roam??{},roaming=state.view==='roam'||roam.active===true,moving=roaming&&roam.transition===true;ready=!!state.ready;busy=!!state.busy;for(const[view,b]of buttons){b.disabled=!ready||busy||moving||view==='roam'&&roam.entering===true;if(views.includes(view))b.setAttribute('aria-pressed',String(state.view===view));}
    body.classList.toggle('home-roam-active',roaming);home.dataset.roamPhase=roaming?(roam.phase??'orbit'):'inactive';
    if(roaming)toggleHelp(false);
    viewDock.hidden=!ready||moving;show.hidden=cameraDock.hidden=!ready||roaming;
    show.disabled=!ready||busy||state.view!=='interior';show.setAttribute('aria-pressed',String(!!state.stageActive));show.querySelector('.warm-show-label').textContent=state.stageActive?"DisplayText3771":"Showtime";show.setAttribute('aria-label',state.stageActive?"DisplayText3771":"Showtime");show.title=show.getAttribute('aria-label');
    const camera=state.stageCamera??{};stageCamera.hidden=!ready||roaming||state.view!=='interior'||!(camera.available||camera.active||camera.returning);stageCamera.disabled=busy||camera.returning||stageCamera.hidden;stageCamera.textContent=camera.returning?"DisplayText4762…":camera.active?"DisplayText3761":"DisplayText3762";stageCamera.setAttribute('aria-label',stageCamera.textContent);stageCamera.title=stageCamera.textContent;stageCamera.setAttribute('aria-pressed',String(!!camera.active));
    syncStudents(state.students,state.selectedId);
  }
  add(picker,'change',async()=>{if(busy)return refresh();const id=picker.value;picker.disabled=true;try{await onSelectStudent(id);}catch(error){onError(error);}finally{refresh();}});
  add(document,'keydown',event=>{
    if(event.key==='Escape'&&!help.hidden){event.preventDefault();toggleHelp(false);return;}
    const modalOpen=[...document.querySelectorAll('[role="dialog"],[role="menu"],#palette:not([hidden])')].some(el=>el.getClientRects().length>0);
    const action=resolveWarmShortcut(event,{activeElement:document.activeElement,modalOpen});if(!action)return;
    const state=getState();if(state.roam?.transition||((state.view==='roam'||state.roam?.active)&&action.type!=='view'))return;
    if(action.type!=='present'&&(!ready||busy))return;
    event.preventDefault();if(action.type==='present')setPresentation(!present);else if(action.type==='view')onView(action.view);else onReset();
  });
  add(window,'resize',scheduleRefit);
  add(document,'pointerdown',event=>{if(!help.hidden&&!help.contains(event.target)&&!helpButton.contains(event.target))toggleHelp(false);});
  setPresentation(new URLSearchParams(window.location.search).get('view')==='present',{updateUrl:false});refresh();
  return {refresh,setPresentation,getPresentation:()=>present,notify:value=>toast.notify(value),setBalance:(value,scope)=>balanceAnimator.set(value,scope),clearBalance:()=>balanceAnimator.clear(),focusHome:()=>$('stage').querySelector('canvas')?.focus({preventScroll:true}),dispose(){if(disposed)return;disposed=true;body.classList.remove('home-roam-active');home.dataset.roamPhase='inactive';toast.dispose();balanceAnimator.dispose();if(refitFrame!==null)window.cancelAnimationFrame(refitFrame);for(const remove of listeners)remove();}};
}
