const SHARE_ID=/^[A-Za-z0-9_-]{43}$/;
const SHARE_PATH='/games/homeworld/home-share.html';
let nextDialog=0;

/** This controller owns presentation only. The authenticated page supplies
 * request callbacks; mounting, selecting a student and opening never publish. */
export function createStudentHomeShareDialog({document,window,getState=()=>({}),onCreate,onRevoke,onList,onError=()=>{}}={}){
  if(!document?.body||typeof onCreate!=='function'||typeof onRevoke!=='function')throw new TypeError('Share controls need a document and authenticated callbacks.');
  const mount=document.querySelector('.warm-display-tools')??document.querySelector('.home-heading');
  if(!mount)return null;
  const listeners=[],uid=`student-home-share-${++nextDialog}`;
  const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const add=(node,event,fn,options)=>{node.addEventListener(event,fn,options);listeners.push(()=>node.removeEventListener(event,fn,options));};
  const button=(label,className,action)=>{const node=make('button',className,label);node.type='button';add(node,'click',action);return node;};
  const entry=button("DisplayText4975",'student-home-share-entry',()=>open());entry.hidden=true;entry.setAttribute('aria-haspopup','dialog');entry.setAttribute('aria-controls',uid);mount.append(entry);
  const dialog=make('dialog','student-home-share-dialog');dialog.id=uid;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby',`${uid}-title`);dialog.setAttribute('aria-describedby',`${uid}-description`);document.body.append(dialog);
  const header=make('header','student-home-share-header'),heading=make('div');heading.append(make('p','student-home-share-eyebrow',"DisplayText4976, DisplayText4977"));
  const title=make('h2','',"DisplayText4978");title.id=`${uid}-title`;heading.append(title);
  const closeButton=button('','student-home-share-close',()=>close());closeButton.setAttribute('aria-label',"DisplayText4979");
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M6 6 18 18 M18 6 6 18');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2');path.setAttribute('stroke-linecap','round');svg.append(path);closeButton.append(svg);header.append(heading,closeButton);
  const content=make('div','student-home-share-content'),intro=make('p','student-home-share-intro',"DisplayText4980, DisplayText4981.");intro.id=`${uid}-description`;
  const note=make('div','student-home-share-note');note.append(make('span','student-home-share-badge',"DisplayText4982"),make('p','',"DisplayText4983, DisplayText4330, DisplayText4984, DisplayText4985.DisplayText4986, DisplayText4987; DisplayText4988, DisplayText4989."));
  const snapshotNote=make('p','student-home-share-explanation',"DisplayText4990.DisplayText4991, DisplayText4992.");
  const history=make('div','student-home-share-history'),historyLabel=make('label','',"DisplayText4993"),picker=make('select');picker.id=`${uid}-history`;historyLabel.setAttribute('for',picker.id);picker.setAttribute('aria-label',"DisplayText4994");history.append(historyLabel,picker);history.hidden=true;
  const linkPanel=make('section','student-home-share-result');linkPanel.hidden=true;linkPanel.setAttribute('aria-label',"DisplayText4995");
  const linkLabel=make('label','',"DisplayText4996"),link=make('input','student-home-share-url');link.type='url';link.readOnly=true;link.id=`${uid}-url`;linkLabel.setAttribute('for',link.id);link.setAttribute('aria-label',"DisplayText4995");link.autocomplete='off';link.spellcheck=false;
  const published=make('p','student-home-share-date'),linkActions=make('div','student-home-share-link-actions');
  const copy=button("DisplayText4997",'student-home-share-copy',()=>copyLink()),openLink=make('a','student-home-share-open',"DisplayText4998 ↗");openLink.target='_blank';openLink.rel='noopener noreferrer';openLink.referrerPolicy='no-referrer';
  linkActions.append(copy,openLink);const revoke=button("DisplayText4999",'student-home-share-revoke',()=>revokeShare());linkPanel.append(linkLabel,link,published,linkActions,revoke);
  const status=make('p','student-home-share-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
  const create=button("DisplayText5000",'student-home-share-create',()=>createShare());
  content.append(intro,note,snapshotNote,history,linkPanel,status,create);dialog.append(header,content);
  let disposed=false,scope=null,serial=0,pending=false,notice='',failed=false,shares=[],selectedId=null,lastFocus=null;
  const state=()=>getState()??{};
  const ready=value=>value.ready===true&&typeof value.scope==='string'&&value.scope.length>0;
  const selected=()=>shares.find(row=>row.id===selectedId)??null;
  const current=(token,owner)=>!disposed&&token===serial&&scope===owner&&state().scope===owner&&ready(state());
  function normalize(value){
    const row=value?.share??value;if(!row||!SHARE_ID.test(row.id)||row.status&& !['active','revoked'].includes(row.status))throw new Error("DisplayText5001, DisplayText4239.");
    const base=new URL(window?.location?.href??'http://localhost/'),url=new URL(row.url??`${SHARE_PATH}?share=${row.id}`,base);
    if(url.origin!==base.origin||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!==SHARE_PATH||url.hash||url.searchParams.size!==1||url.searchParams.get('share')!==row.id)throw new Error("DisplayText5001, DisplayText4239.");
    return Object.freeze({id:row.id,url:url.href,createdAt:row.createdAt??row.publishedAt??null,status:row.status??'active'});
  }
  function date(value){const stamp=new Date(value??NaN);return Number.isFinite(stamp.getTime())?stamp.toLocaleString('en',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):"DisplayText5002";}
  function setNotice(text,error=false){notice=text;failed=error;paint();}
  function paint(){
    if(disposed)return;const value=state(),active=selected(),disabled=!ready(value)||!!value.busy||pending;
    entry.hidden=!ready(value);entry.disabled=disabled;entry.setAttribute('aria-expanded',String(!!dialog.open));
    create.disabled=disabled;create.textContent=pending?"DisplayText5003…":shares.length?"DisplayText5004":"DisplayText5000";
    history.hidden=shares.length<2;picker.disabled=disabled;picker.replaceChildren();
    for(const row of shares){const option=make('option','',date(row.createdAt));option.value=row.id;picker.append(option);}picker.value=selectedId??'';
    linkPanel.hidden=!active;if(active){link.value=active.url;openLink.href=active.url;published.textContent=`DisplayText5005 ${date(active.createdAt)} · DisplayText5006`;}
    else{link.value='';openLink.removeAttribute('href');published.textContent='';}
    copy.disabled=revoke.disabled=disabled||!active;openLink.setAttribute('aria-disabled',String(pending||!active));openLink.tabIndex=pending||!active?-1:0;
    status.textContent=notice;status.hidden=!notice;status.classList.toggle('is-error',failed);dialog.setAttribute('aria-busy',String(pending));
  }
  function close({restoreFocus=true}={}){
    if(dialog.open)dialog.close();entry.setAttribute('aria-expanded','false');
    if(restoreFocus&&lastFocus?.isConnected!==false&&typeof lastFocus?.focus==='function')lastFocus.focus({preventScroll:true});lastFocus=null;
  }
  function refresh(){
    if(disposed)return;const value=state(),next=ready(value)?value.scope:null;
    if(next!==scope){serial++;scope=next;pending=false;shares=[];selectedId=null;notice='';failed=false;close({restoreFocus:false});}
    if(!ready(value)&&dialog.open)close({restoreFocus:false});paint();
  }
  async function perform(callback,update,message){
    refresh();const value=state();if(!ready(value)||value.busy||pending)return false;
    const token=++serial,owner=scope;pending=true;notice=message;failed=false;paint();
    try{const result=await callback(owner);if(!current(token,owner))return false;update(result);return true;}
    catch(error){if(current(token,owner)){notice=error?.message??"DisplayText5007, DisplayText4016.";failed=true;if(error?.status===401||error?.code==='identity_changed'){shares=[];selectedId=null;paint();close({restoreFocus:false});}try{onError(error);}catch{/* Keep the local error visible. */}}return false;}
    finally{if(current(token,owner)){pending=false;paint();}}
  }
  async function load(){return perform(owner=>onList({scope:owner}),result=>{if(!Array.isArray(result?.shares))throw new Error("DisplayText5008, DisplayText0974.");const rows=result.shares.slice(0,100).map(normalize).filter(row=>row.status==='active');shares=rows;selectedId=rows.some(row=>row.id===selectedId)?selectedId:rows[0]?.id??null;notice=rows.length?"DisplayText5009.DisplayText5010.":'';},"DisplayText5011…");}
  async function createShare(){return perform(owner=>onCreate({scope:owner}),result=>{const row=normalize(result);if(row.status!=='active')throw new Error("DisplayText5012, DisplayText5013.");shares=[row,...shares.filter(old=>old.id!==row.id)];selectedId=row.id;notice="DisplayText5014, DisplayText5015.";},"DisplayText5016…");}
  async function revokeShare(){const active=selected();if(!active)return false;return perform(owner=>onRevoke({share:active,scope:owner}),()=>{shares=shares.filter(row=>row.id!==active.id);selectedId=shares[0]?.id??null;notice="DisplayText5012, DisplayText5017.DisplayText5018.";},"DisplayText5019…");}
  async function copyLink(){
    refresh();const active=selected(),value=state();if(!active||pending||!ready(value)||value.busy)return false;
    const owner=scope,token=serial;
    try{if(typeof window?.navigator?.clipboard?.writeText!=='function')throw new Error('clipboard unavailable');await window.navigator.clipboard.writeText(active.url);if(current(token,owner))setNotice("DisplayText5020, DisplayText5021.");return true;}
    catch{if(current(token,owner)){link.focus({preventScroll:true});link.select();link.setSelectionRange?.(0,link.value.length);setNotice("DisplayText5022, DisplayText5023 ⌘C DisplayText3351 Ctrl+C DisplayText5024.");}return false;}
  }
  function open(){refresh();if(!ready(state())||state().busy||pending)return false;lastFocus=document.activeElement;notice='';failed=false;paint();if(!dialog.open)dialog.showModal();paint();closeButton.focus({preventScroll:true});if(typeof onList==='function')void load();return true;}
  add(picker,'change',()=>{if(pending)return;selectedId=shares.some(row=>row.id===picker.value)?picker.value:shares[0]?.id??null;notice='';failed=false;paint();});
  add(link,'click',()=>link.select());add(openLink,'click',event=>{if(pending||!selected()||state().scope!==scope){event.preventDefault();refresh();}});
  add(dialog,'cancel',event=>{event.preventDefault();close();});
  add(dialog,'close',()=>{entry.setAttribute('aria-expanded','false');});
  add(dialog,'keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation?.();close();return;}if(event.key!=='Tab')return;const available=[closeButton,...(history.hidden?[]:[picker]),...(linkPanel.hidden?[]:[link,copy,openLink,revoke]),create].filter(node=>!node.disabled&&node.tabIndex!==-1);const first=available[0],last=available.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}});
  add(dialog,'click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();});
  refresh();
  return {button:entry,element:dialog,open,close,refresh,dispose(){if(disposed)return;disposed=true;serial++;pending=false;close({restoreFocus:false});for(const remove of listeners)remove();entry.remove();dialog.remove();}};
}
