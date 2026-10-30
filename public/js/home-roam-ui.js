import {getHomeRoamCopy,resolveHomeRoamLocale} from './home-roam-copy.js';

// Viewing-only controls: callbacks stay with the scene owner. No home/account
// state or command transport is imported into this temporary interface.
let nextId=0;
export function createHomeRoamUI({container,document=container?.ownerDocument,onDisplayMode=()=>{},onAutoRotate=()=>{},onOverview=()=>{},onLeave=()=>{},locale}={}){
  if(!container||!document)throw new TypeError('A container is required for viewing controls.');
  const resolvedLocale=resolveHomeRoamLocale(locale,{search:document.defaultView?.location?.search}),copy=getHomeRoamCopy(resolvedLocale);
  const listeners=[],buttons=new Map(),id=`home-roam-help-${++nextId}`;
  const make=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const add=(target,type,callback,options)=>{target.addEventListener(type,callback,options);listeners.push(()=>target.removeEventListener(type,callback,options));};
  const button=(text,label,callback)=>{const node=make('button','home-roam-button',text);node.type='button';node.setAttribute('aria-label',label??text);node.title=label??text;add(node,'click',callback);return node;};
  let snapshot={active:false,phase:'inactive',walking:false,transition:false,view:'exterior',displayMode:'auto',autoRotate:false},visible=false,disposed=false;
  const root=make('div','home-roam-ui');root.hidden=true;root.setAttribute('aria-label',copy.viewLabel);root.setAttribute('lang',resolvedLocale);
  const status=make('div','home-roam-status home-roam-chip',copy.statusExterior);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const instructions=make('p','home-roam-instructions home-roam-chip',copy.instructions);instructions.hidden=true;
  const bar=make('div','home-roam-bar'),modes=make('div','home-roam-modes home-roam-chip');modes.setAttribute('role','group');modes.setAttribute('aria-label',copy.displayGroup);
  for(const[value,text]of[['auto',copy.auto],['exterior',copy.exterior],['interior',copy.interior]]){const node=button(text,text,()=>onDisplayMode(value));node.dataset.roamDisplay=value;node.setAttribute('aria-pressed',String(value==='auto'));buttons.set(value,node);modes.append(node);}
  const actions=make('div','home-roam-actions home-roam-chip');actions.setAttribute('role','group');actions.setAttribute('aria-label',copy.cameraGroup);
  const leave=button(copy.leave,copy.leaveAria,onLeave);leave.classList.add('home-roam-leave');leave.setAttribute('aria-keyshortcuts','Escape');leave.hidden=true;
  const spin=button(copy.spin,copy.spinStart,()=>onAutoRotate(!snapshot.autoRotate));spin.dataset.roamAction='spin';spin.setAttribute('aria-pressed','false');spin.setAttribute('aria-keyshortcuts','Space');
  const overview=button(copy.overview,copy.overview,onOverview);overview.dataset.roamAction='overview';overview.setAttribute('aria-keyshortcuts','R');
  const helpToggle=button('?',copy.helpAria,()=>setHelp(help.hidden));helpToggle.setAttribute('aria-controls',id);helpToggle.setAttribute('aria-expanded','false');
  actions.append(leave,spin,overview,helpToggle);bar.append(modes,actions);
  const help=make('section','home-roam-help home-roam-chip');help.id=id;help.hidden=true;help.setAttribute('aria-label',copy.helpAria);
  const helpTitle=make('strong','home-roam-help-title',copy.helpTitleExterior),helpList=make('dl','home-roam-help-keys'),helpNote=make('p','home-roam-help-note',copy.helpNoteExterior);
  const helpClose=button(copy.helpClose,copy.helpCloseAria,()=>setHelp(false,true));help.append(helpTitle,helpList,helpNote,helpClose);
  const hover=make('div','home-roam-hover');hover.hidden=true;hover.setAttribute('role','tooltip');
  root.append(status,instructions,bar,help,hover);container.append(root);
  function setHelp(open,restoreFocus=false){help.hidden=!open;helpToggle.setAttribute('aria-expanded',String(open));if(!open&&restoreFocus)helpToggle.focus?.({preventScroll:true});}
  function fillHelp(walking){
    helpTitle.textContent=walking?copy.helpTitleInterior:copy.helpTitleExterior;helpList.replaceChildren();for(const[key,description]of walking?copy.insideHelp:copy.outsideHelp)helpList.append(make('dt','',key),make('dd','',description));
    helpNote.textContent=walking?copy.helpNoteInterior:copy.helpNoteExterior;
  }
  let previousWalking=null;
  function paint(){
    root.hidden=!visible||!snapshot.active;
    const walking=snapshot.phase==='free',moving=!!snapshot.transition;root.dataset.phase=snapshot.phase;root.dataset.view=snapshot.view;
    status.hidden=walking||moving;const label=snapshot.view==='interior'?copy.statusInterior:copy.statusExterior;if(status.textContent!==label)status.textContent=label;
    bar.hidden=moving;instructions.hidden=!walking||moving;modes.hidden=walking;spin.hidden=overview.hidden=walking;leave.hidden=!walking;
    for(const[value,node]of buttons){node.setAttribute('aria-pressed',String(snapshot.displayMode===value));node.disabled=moving;}
    spin.setAttribute('aria-pressed',String(!!snapshot.autoRotate));spin.setAttribute('aria-label',snapshot.autoRotate?copy.spinStop:copy.spinStart);spin.title=spin.getAttribute('aria-label');
    if(previousWalking!==walking){previousWalking=walking;fillHelp(walking);setHelp(false);}
    if(moving||!visible||!snapshot.active){setHelp(false);hover.hidden=true;}
  }
  add(document,'keydown',event=>{if(event.code==='Escape'&&!help.hidden){event.preventDefault();event.stopPropagation?.();setHelp(false,true);}},{capture:true});
  add(document,'pointerdown',event=>{if(!help.hidden&&!help.contains(event.target)&&!helpToggle.contains(event.target))setHelp(false);});
  paint();
  return {element:root,update(value){if(disposed)return;snapshot={...snapshot,...value};paint();},setVisible(value){visible=!!value;paint();},setHover(value){if(disposed||!visible||!snapshot.active||snapshot.transition||!value?.text){hover.hidden=true;return;}hover.textContent=value.text;hover.hidden=false;const rect=hover.getBoundingClientRect?.()??{width:0,height:0},viewport=document.defaultView;hover.style.left=`${Math.max(8,Math.min((value.x??0)+14,(viewport?.innerWidth??Infinity)-rect.width-8))}px`;hover.style.top=`${Math.max(8,Math.min((value.y??0)+14,(viewport?.innerHeight??Infinity)-rect.height-8))}px`;},dispose(){if(disposed)return;disposed=true;for(const remove of listeners)remove();root.remove();}};
}
