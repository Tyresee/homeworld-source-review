/** Account-home commands only. This menu has no demo storage, currency or
 * commerce dependency. Callers may supply their own items when real features
 * are available; no placeholder purchase action is presented here. */
export function studentHomeContextItems(context={},{onMoveTo,onPalette,onWave,onReset}={}){
  return [
    {id:'move',label:"DisplayText3707",icon:'↗',disabled:context.kind!=='floor'||!context.world||!onMoveTo,
      detail:context.kind==='floor'?"DisplayText3708":"DisplayText3709",action:()=>onMoveTo?.(context.world)},
    {id:'palette',label:"DisplayText3710",icon:'◐',disabled:!onPalette,action:()=>onPalette?.(context.screen)},
    {id:'wave',label:"DisplayText3711",icon:'✋',disabled:!onWave,action:()=>onWave?.()},
    {id:'reset',label:"DisplayText3712",icon:'⌂',disabled:!onReset,action:()=>onReset?.()},
  ];
}

/** Viewport coordinates match scene.onContextMenu.screen. The floating menu
 * lives outside the clipped stage and is repositioned before receiving focus. */
export function createStudentHomeContextMenu({host,document:doc=globalThis.document,window:view=globalThis.window,onClose,...actions}={}){
  host??=doc.body;
  const menu=doc.createElement('section');menu.className='student-home-context-menu';menu.hidden=true;
  menu.setAttribute('role','menu');menu.setAttribute('aria-label',"DisplayText3713");menu.tabIndex=-1;host.append(menu);
  let restoreTarget=null,lastExternalFocus=doc.activeElement,buttons=[],disposed=false;
  function close(restoreFocus=false){
    if(menu.hidden)return;
    menu.hidden=true;const previous=restoreTarget;restoreTarget=null;
    if(restoreFocus&&previous?.isConnected!==false)previous?.focus?.({preventScroll:true});
    onClose?.();
  }
  function open(context,items){
    if(disposed)return;
    close();
    if(!context?.screen||!Number.isFinite(context.screen.x)||!Number.isFinite(context.screen.y))return;
    items??=studentHomeContextItems(context,actions);if(!items.length)return;
    if(doc.activeElement&&!menu.contains(doc.activeElement))lastExternalFocus=doc.activeElement;
    restoreTarget=lastExternalFocus;
    const title=doc.createElement('div');title.className='student-home-context-title';
    title.textContent=context.kind==='floor'?"DisplayText3714":context.kind==='robot'?"DisplayText3715":"DisplayText3713";title.setAttribute('aria-hidden','true');
    buttons=items.map(item=>{
      const button=doc.createElement('button');button.type='button';button.className='student-home-context-item';button.tabIndex=-1;
      button.dataset.action=item.id;button.setAttribute('role','menuitem');button.disabled=Boolean(item.disabled||typeof item.action!=='function');
      button.setAttribute('aria-disabled',String(button.disabled));
      const icon=doc.createElement('span');icon.className='student-home-context-icon';icon.textContent=item.icon??'·';icon.setAttribute('aria-hidden','true');
      const copy=doc.createElement('span'),label=doc.createElement('strong');copy.className='student-home-context-copy';label.textContent=item.label;copy.append(label);
      if(item.detail){const detail=doc.createElement('small');detail.textContent=item.detail;copy.append(detail);}
      button.append(icon,copy);button.addEventListener('click',()=>{if(button.disabled)return;close(true);item.action(context);});return button;
    });
    menu.replaceChildren(title,...buttons);menu.hidden=false;
    const viewport=view.visualViewport,offsetX=viewport?.offsetLeft??0,offsetY=viewport?.offsetTop??0;
    const width=viewport?.width??view.innerWidth,height=viewport?.height??view.innerHeight,margin=10;
    menu.style.maxWidth=`${Math.max(0,width-margin*2)}px`;menu.style.maxHeight=`${Math.max(0,height-margin*2)}px`;
    const bounds=menu.getBoundingClientRect();
    menu.style.left=`${Math.max(offsetX+margin,Math.min(offsetX+width-bounds.width-margin,context.screen.x+7))}px`;
    menu.style.top=`${Math.max(offsetY+margin,Math.min(offsetY+height-bounds.height-margin,context.screen.y+7))}px`;
    (buttons.find(button=>!button.disabled)??menu).focus({preventScroll:true});
  }
  function outside(event){if(!menu.hidden&&!menu.contains(event.target))close();}
  function keydown(event){
    if(menu.hidden)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(event.key==='Tab'){close();return;}
    const enabled=buttons.filter(button=>!button.disabled),index=enabled.indexOf(doc.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?enabled.length-1
      :event.key==='ArrowDown'?(index+1)%enabled.length:event.key==='ArrowUp'?(index<0?enabled.length-1:(index-1+enabled.length)%enabled.length):null;
    if(next!==null){event.preventDefault();event.stopPropagation();enabled[next]?.focus({preventScroll:true});}
  }
  function scroll(event){if(!menu.hidden&&!menu.contains(event.target))close();}
  function resized(){close();}
  function suppressNative(event){event.preventDefault();}
  doc.addEventListener('pointerdown',outside,true);doc.addEventListener('keydown',keydown,true);doc.addEventListener('scroll',scroll,true);
  view.addEventListener('resize',resized);view.addEventListener('blur',resized);menu.addEventListener('contextmenu',suppressNative);
  return {open,close,get isOpen(){return !menu.hidden;},dispose(){
    if(disposed)return;disposed=true;close();doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('keydown',keydown,true);doc.removeEventListener('scroll',scroll,true);
    view.removeEventListener('resize',resized);view.removeEventListener('blur',resized);menu.remove();
  }};
}
