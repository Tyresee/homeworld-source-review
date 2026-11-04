import {areElevatorsAligned,STOREY_HEIGHT} from './home-staircase-shape.js';
import {resolveHomeRoamLocale} from './home-roam-copy.js';

function elevatorComponent(model,transport){
  if(!Array.isArray(model?.transports)||!Array.isArray(model.floorModels)||!model.transports.includes(transport)||transport.type!=='elevator')return null;
  const floors=new Set(model.floorModels.map(row=>row.storey));
  const links=model.transports.filter(row=>row.type==='elevator'&&Number.isInteger(row.from)&&row.from>=0&&row.to===row.from+1&&floors.has(row.from)&&floors.has(row.to)&&areElevatorsAligned(row.stairs,transport.stairs));
  if(!links.includes(transport))return null;
  const served=new Set([transport.from,transport.to]),connected=new Set([transport]);let changed=true;
  while(changed){changed=false;for(const row of links)if(!connected.has(row)&&(served.has(row.from)||served.has(row.to))){connected.add(row);served.add(row.from);served.add(row.to);changed=true;}}
  return {links:[...connected],served};
}

/** Only the contiguous, physically aligned shaft that was actually clicked.
 * Same-axis links across an unbuilt gap and other elevators stay separate. */
export function getHomeRoamElevatorTargets({model,transport,storey}={}){
  const component=elevatorComponent(model,transport);if(!component||!component.served.has(storey))return [];
  const up=[...component.served].filter(index=>index>storey).sort((a,b)=>a-b),down=[...component.served].filter(index=>index<storey).sort((a,b)=>b-a);
  return [...up.map(index=>({storey:index,direction:'up'})),...down.map(index=>({storey:index,direction:'down'}))];
}

/** Landing meshes identify their real floor. Generic cabin/frame meshes carry
 * the first link's tag, so that tag must not override the current floor. */
export function resolveHomeRoamElevatorStorey({model,transport,hit,preferredStorey}={}){
  const component=elevatorComponent(model,transport);if(!component)return null;
  const data=hit?.object?.userData;
  if(data&&['lower','upper'].includes(data.elevatorStationSide)){
    const link=component.links.find(row=>row.stairId===data.elevatorConnectionId);
    if(link){const floor=data.elevatorStationSide==='lower'?link.from:link.to;if(component.served.has(floor))return floor;}
  }
  if(component.served.has(preferredStorey))return preferredStorey;
  if(!Number.isFinite(hit?.point?.y))return null;
  // Floor volume centres keep the top of a wall in the room below it.
  const middle=index=>(model.floorModels?.find(row=>row.storey===index)?.baseY??index*STOREY_HEIGHT)+STOREY_HEIGHT/2;
  return [...component.served].sort((a,b)=>Math.abs(hit.point.y-middle(a))-Math.abs(hit.point.y-middle(b))||a-b)[0]??null;
}

let menuSequence=0;
export function createHomeRoamElevatorMenu({container,document=container?.ownerDocument,onChoose=()=>{},onOpenChange=()=>{},locale}={}){
  if(!container||!document)throw new TypeError('An elevator menu needs a viewing container.');
  const english=resolveHomeRoamLocale(locale)==='en',view=document.defaultView,listeners=[];
  const make=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const add=(target,type,callback,options)=>{target?.addEventListener?.(type,callback,options);listeners.push(()=>target?.removeEventListener?.(type,callback,options));};
  const popup=make('section','home-roam-elevator-menu');popup.hidden=true;popup.tabIndex=-1;popup.setAttribute('role','menu');
  const titleId='roam-elevator-title-'+(++menuSequence);popup.setAttribute('aria-labelledby',titleId);popup.setAttribute('lang',english?'en':'en');
  // Escape scene clipping/overflow while the scene owner retains disposal.
  (document.body??container).append(popup);
  let session=null,disposed=false;
  function close({restoreFocus=false,reason='close',event}={}){
    if(!session)return false;const previous=session;session=null;popup.hidden=true;popup.replaceChildren();
    onOpenChange(false,{reason,event});
    if(restoreFocus&&previous.returnFocus?.isConnected!==false)previous.returnFocus?.focus?.({preventScroll:true});
    return true;
  }
  function position(){
    if(!session)return;const visual=view?.visualViewport;
    const width=Number(visual?.width??view?.innerWidth)||1024,height=Number(visual?.height??view?.innerHeight)||768;
    const left=Number(visual?.offsetLeft)||0,top=Number(visual?.offsetTop)||0,pad=12,availableWidth=Math.max(0,width-pad*2),availableHeight=Math.max(0,height-pad*2);
    popup.style.width=Math.min(300,availableWidth)+'px';popup.style.maxWidth=availableWidth+'px';popup.style.maxHeight=availableHeight+'px';
    const rect=popup.getBoundingClientRect?.()??{},w=Math.min(rect.width||300,availableWidth),h=Math.min(rect.height||240,availableHeight),gap=10;
    let x=session.x+gap,y=session.y+gap;if(x+w>left+width-pad)x=session.x-w-gap;if(y+h>top+height-pad)y=session.y-h-gap;
    popup.style.left=Math.round(Math.max(left+pad,Math.min(left+width-pad-w,x)))+'px';
    popup.style.top=Math.round(Math.max(top+pad,Math.min(top+height-pad-h,y)))+'px';
  }
  function open({fromStorey,targets,x,y,returnFocus}={}){
    if(disposed)return false;
    close({reason:'replace'});
    if(!Number.isInteger(fromStorey)||fromStorey<0||!Array.isArray(targets))return false;
    const seen=new Set(),choices=targets.filter(row=>{
      if(!Number.isInteger(row?.storey)||row.storey<0||row.storey===fromStorey||seen.has(row.storey)||row.direction!==(row.storey>fromStorey?'up':'down'))return false;
      seen.add(row.storey);return true;
    }).map(row=>({storey:row.storey,direction:row.direction}));
    if(!choices.length)return false;
    const current={fromStorey,choices,buttons:[],x:Number.isFinite(x)?x:24,y:Number.isFinite(y)?y:100,returnFocus:returnFocus??document.activeElement};session=current;
    const heading=make('div','home-roam-elevator-heading'),title=make('strong','home-roam-elevator-title',english?'Elevator · '+(fromStorey+1)+'F':"DisplayText4898 · DisplayText3296 "+(fromStorey+1)+" DisplayText0931");title.id=titleId;heading.setAttribute('role','presentation');
    const dismiss=make('button','home-roam-elevator-close','×');dismiss.type='button';dismiss.tabIndex=-1;dismiss.setAttribute('role','menuitem');dismiss.setAttribute('aria-label',english?'Close elevator menu':"DisplayText4899");
    dismiss.addEventListener('click',event=>{event.stopPropagation?.();if(session===current)close({restoreFocus:true,reason:'dismiss',event});});heading.append(title,dismiss);
    const hint=make('p','home-roam-elevator-hint',english?'Choose your destination':"DisplayText4900");hint.setAttribute('role','presentation');
    const options=make('div','home-roam-elevator-options');options.setAttribute('role','presentation');
    for(const choice of choices){
      const label=english?(choice.direction==='up'?'Up':'Down')+' to '+(choice.storey+1)+'F':(choice.direction==='up'?"DisplayText4901":"DisplayText4902")+"DisplayText4903 "+(choice.storey+1)+" DisplayText0931";
      const button=make('button','home-roam-elevator-option');button.type='button';button.tabIndex=-1;button.setAttribute('role','menuitem');button.setAttribute('aria-label',label);button.dataset.direction=choice.direction;button.dataset.targetStorey=String(choice.storey);
      const arrow=make('span','home-roam-elevator-arrow',choice.direction==='up'?'↑':'↓');arrow.setAttribute('aria-hidden','true');button.append(arrow,make('span','',label));
      button.addEventListener('click',event=>{event.stopPropagation?.();if(session!==current)return;close({restoreFocus:true,reason:'choose',event});onChoose({fromStorey,targetStorey:choice.storey});});
      options.append(button);current.buttons.push(button);
    }
    current.buttons.push(dismiss);popup.replaceChildren(heading,hint,options);popup.hidden=false;position();onOpenChange(true,{reason:'open'});current.buttons[0].focus?.({preventScroll:true});return true;
  }
  add(document,'keydown',event=>{
    if(!session)return;event.stopPropagation?.();
    const key=event.key??({Escape:'Escape',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',Home:'Home',End:'End',Tab:'Tab'}[event.code]);
    if(key==='Escape'){event.preventDefault?.();close({restoreFocus:true,reason:'escape',event});return;}
    if(key==='Tab'){close({restoreFocus:true,reason:'tab',event});return;}
    if(!['ArrowUp','ArrowDown','Home','End'].includes(key))return;
    event.preventDefault?.();const buttons=session.buttons,at=buttons.indexOf(document.activeElement);
    const index=key==='Home'?0:key==='End'?buttons.length-1:key==='ArrowDown'?(at+1+buttons.length)%buttons.length:(at-1+buttons.length)%buttons.length;
    buttons[index].focus?.({preventScroll:true});
  },{capture:true});
  add(document,'pointerdown',event=>{if(session&&!popup.contains(event.target))close({reason:'outside',event});});
  add(popup,'contextmenu',event=>{event.preventDefault?.();event.stopPropagation?.();});
  add(view,'resize',event=>close({restoreFocus:true,reason:'resize',event}));
  add(view?.visualViewport,'resize',event=>close({restoreFocus:true,reason:'resize',event}));
  return {element:popup,open,close,get isOpen(){return !!session;},dispose(){if(disposed)return;close({reason:'dispose'});disposed=true;for(const remove of listeners)remove();popup.remove();}};
}
