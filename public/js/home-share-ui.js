import * as THREE from 'three';

/** Exterior navigation only. Room names are labels, never entrance controls. */
export function createHomeShareUI({container,model,controller,onToast=()=>{}}){
  const doc=container.ownerDocument,host=doc.createElement('div');host.className='share-view-ui';
  const crumbs=doc.createElement('nav');crumbs.className='share-view-crumbs';crumbs.setAttribute('aria-label',"Viewing location");
  const badge=doc.createElement('div');badge.className='share-view-badge';badge.textContent="Read-only view";badge.setAttribute('aria-label',"Read-only view");
  const dock=doc.createElement('div');dock.className='share-view-dock';
  const hint=doc.createElement('p');hint.className='share-view-hint';hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');
  const row=doc.createElement('div');row.className='share-view-actions';row.setAttribute('role','group');row.setAttribute('aria-label',"View navigation");dock.append(hint,row);
  const labels=doc.createElement('div');labels.className='share-view-labels';
  const toast=doc.createElement('div');toast.className='share-view-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.hidden=true;
  host.append(crumbs,badge,dock,labels,toast);container.append(host);
  let signature='',timer=null,anchors=[],disposed=false;
  function button(text,action,{active=false,className='',disabled=false}={}){
    const b=doc.createElement('button');b.type='button';b.textContent=text;b.className=className;b.disabled=disabled;
    if(active)b.setAttribute('aria-pressed','true');
    b.addEventListener('click',()=>{if(!controller.getState().locked)action?.();});return b;
  }
  function floors(active){for(const f of model.floors)row.append(button(`${f.index+1}F`,()=>controller.goFocus(f.index),{active:active===f.index}));}
  function showToast(text){if(disposed)return;clearTimeout(timer);toast.textContent=text;toast.hidden=false;onToast(text);timer=setTimeout(()=>{toast.hidden=true;},2200);}
  function anchor(text,position,action){
    const el=action?button(text,action,{className:'share-view-label'}):doc.createElement('span');
    if(!action){el.className='share-view-label';el.textContent=text;el.style.pointerEvents='none';el.style.cursor='default';}
    labels.append(el);anchors.push({el,position});
  }
  function update(state=controller.getState()){
    const key=JSON.stringify([state.name,state.floor,state.spotId,state.locked]);if(key===signature)return;signature=key;
    const name=state.name,floor=state.floor??0,trail=[["Overview",()=>controller.goOrbit()]];
    if(name==='SPOT')trail.push([model.spots.find(s=>s.id===state.spotId)?.name??"Outdoors",null]);
    if(['EXPLODED','FOCUS'].includes(name))trail.push(["Explode house",()=>controller.goExploded()]);
    if(name==='FOCUS')trail.push([`${floor+1}F`,null]);
    crumbs.replaceChildren();trail.forEach(([text,action],i)=>{if(i){const sep=doc.createElement('span');sep.textContent='›';sep.setAttribute('aria-hidden','true');crumbs.append(sep);}const b=button(text,action,{disabled:state.locked||i===trail.length-1});if(i===trail.length-1)b.setAttribute('aria-current','location');crumbs.append(b);});
    row.replaceChildren();
    if(name==='ORBIT'){hint.textContent="Drag to rotate. Use the wheel or pinch to zoom.";row.append(button("Explode house",()=>controller.goExploded(),{className:'primary'}));}
    if(name==='SPOT'){hint.textContent="Drag to look around";row.append(button("Back to overview",()=>controller.goOrbit()));}
    if(name==='EXPLODED'){hint.textContent="Choose a floor";floors(-1);row.append(button("Assemble house",()=>controller.goOrbit()));}
    if(name==='FOCUS'){hint.textContent="Drag to look around this floor";floors(floor);row.append(button("Back",()=>controller.goExploded()));}
    for(const b of row.querySelectorAll('button'))b.disabled=state.locked;
    host.dataset.locked=String(state.locked);host.setAttribute('aria-busy',String(state.locked));
    labels.replaceChildren();anchors=[];
    if(state.locked)return;
    if(name==='ORBIT')for(const s of model.spots)anchor(s.name,s.labelPosition??s.center,()=>controller.goSpot(s.id));
    if(name==='FOCUS')for(const r of model.floors[floor].rooms)anchor(r.name,new THREE.Vector3(r.center.x,model.floors[floor].baseY+1.6,r.center.z));
  }
  const tmp=new THREE.Vector3();
  function project(camera){const w=container.clientWidth,h=container.clientHeight,dockTop=dock.getBoundingClientRect().top-container.getBoundingClientRect().top;for(const a of anchors){tmp.copy(a.position).project(camera);const x=(tmp.x*.5+.5)*w,y=(-tmp.y*.5+.5)*h;a.el.hidden=tmp.z < -1||tmp.z > 1||x<12||x>w-12||y<12||y>Math.min(h-85,dockTop-12);a.el.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;}}
  return{update,project,showToast,host,dispose(){if(disposed)return;disposed=true;clearTimeout(timer);host.remove();}};
}
