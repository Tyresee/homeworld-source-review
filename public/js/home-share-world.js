import * as THREE from 'three';
import {createHomeShareModel} from './home-share-model.js';
import {createHomeShareController} from './home-share-controller.js';
import {createHomeShareUI} from './home-share-ui.js';

export const SHARE_LIGHTING=Object.freeze({exposure:1.1,hemisphere:1.1,ambient:.1,sun:10,sky:'#eaf2ff',ground:'#a8946e',sunColor:'#fff1dc',sunOffset:Object.freeze([14,48,38])});
const visible=object=>{for(let n=object;n;n=n.parent)if(!n.visible)return false;return true;};

/** Route a visible scene hit through the exterior-only share navigation. */
export function handleHomeSharePick(controller,info,showToast=()=>{}){
  const state=controller.getState();if(state.locked||!info)return false;
  if(state.name==='ORBIT'||state.name==='SPOT'){
    if(['house','furniture','robot'].includes(info.type))return controller.goExploded();
    if(info.spotId){
      if(state.spotId===info.spotId){showToast("Read-only view");return false;}
      return controller.goSpot(info.spotId);
    }
  }
  if(state.name==='EXPLODED'&&Number.isInteger(info.floor))return controller.goFocus(info.floor);
  // The focused floor is the closest allowed view. Clicking a room, its
  // contents or the elevator leaves the orbit camera exactly where it is.
  if(state.name==='FOCUS'&&Number.isInteger(info.floor)&&info.floor<state.floor)return controller.goFocus(info.floor);
  return false;
}

/** A separate viewer: never constructs a game controller, object runtime,
 * account adapter or save outbox. Its inputs are detached public snapshots. */
export function createHomeShareExperience(options={}){
  const {container,onStateChange=()=>{},manualClock=false,pixelRatio,clock=()=>performance.now()}=options;
  if(!container)throw new TypeError('A share container is required.');
  let model,renderer,controller,ui,observer,frame=0,previous=null,active=false,disposed=false;
  const listeners=[];
  const doc=container.ownerDocument,win=doc.defaultView??globalThis.window;
  const host=doc.createElement('div');host.className='share-view-layer';Object.assign(host.style,{position:'absolute',inset:'0'});container.append(host);
  let scene,hemi,sun,intervals=[];
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function release(){if(disposed)return;disposed=true;active=false;cancelAnimationFrame(frame);observer?.disconnect();for(const remove of listeners)remove();controller?.dispose();ui?.dispose();model?.dispose();sun?.shadow.dispose();renderer?.dispose();renderer?.forceContextLoss();host.remove();}
  try{
    model=createHomeShareModel(options);scene=model.scene;
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(pixelRatio??Math.min(win?.devicePixelRatio||1,1.5));
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=SHARE_LIGHTING.exposure;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.localClippingEnabled=true;
    const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label',"Read-only home: drag to rotate, use the wheel or pinch to zoom, and choose a floor to view.");Object.assign(canvas.style,{width:'100%',height:'100%',display:'block',touchAction:'none'});host.prepend(canvas);
    hemi=new THREE.HemisphereLight(SHARE_LIGHTING.sky,SHARE_LIGHTING.ground,SHARE_LIGHTING.hemisphere);scene.add(hemi,new THREE.AmbientLight('#ffffff',SHARE_LIGHTING.ambient));
    const center=model.bounds.getCenter(new THREE.Vector3());sun=new THREE.DirectionalLight(SHARE_LIGHTING.sunColor,SHARE_LIGHTING.sun);sun.position.copy(center).add(new THREE.Vector3(...SHARE_LIGHTING.sunOffset));sun.target.position.copy(center);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0006;sun.shadow.normalBias=.03;sun.shadow.radius=3;
    const reach=Math.max(32,model.bounds.getSize(new THREE.Vector3()).length()*.65);Object.assign(sun.shadow.camera,{left:-reach,right:reach,top:reach,bottom:-reach,near:.1,far:reach*4});sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target);
    const media=win.matchMedia('(prefers-color-scheme: dark)');function color(){const c=media.matches?'#1c2740':'#e9edf0';scene.background=new THREE.Color(c);scene.fog=new THREE.Fog(c,110,260);}
    color();media.addEventListener?.('change',color);listeners.push(()=>media.removeEventListener?.('change',color));
    function stateChanged(s){ui?.update(s);onStateChange(s);}
    controller=createHomeShareController({element:canvas,eventTarget:win,model,onChange:()=>{},onStateChange:stateChanged,onTap:tap});
    ui=createHomeShareUI({container:host,model,controller});
    function resize(){const w=host.clientWidth||container.clientWidth||800,h=host.clientHeight||container.clientHeight||600;renderer.setSize(w,h,false);controller.resize?.(w,h);if(!controller.resize){controller.camera.aspect=w/h;controller.camera.updateProjectionMatrix();}}
    observer=new ResizeObserver(resize);observer.observe(container);resize();
    // No furniture/robot/game handler is registered here. Only this navigation
    // raycaster runs after the camera controller has classified a true tap.
    function tap(event){
      const s=controller.getState();if(s.locked)return;
      const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,controller.camera);scene.updateMatrixWorld(true);
      const hits=ray.intersectObjects(scene.children,true).filter(h=>{
        const o=h.object;if(!visible(o)||o.userData.shareIgnorePick||o.userData.roamBackdrop)return false;
        return [].concat(o.material??[]).some(m=>m.visible!==false&&m.opacity>.5);
      });
      const hit=hits.find(h=>model.pickInfo(h.object,h.point));if(!hit)return;
      handleHomeSharePick(controller,model.pickInfo(hit.object,hit.point),message=>ui.showToast(message));
    }
    function renderNow(dt){
      if(disposed)return;const now=clock();if(dt===undefined)dt=previous===null?0:(now-previous)/1000;previous=now;const step=Math.min(.05,Math.max(0,dt));
      controller.tick(step);const s=controller.getState();model.update(s,controller.camera,step,{transition:s.locked});
      renderer.shadowMap.needsUpdate=true;renderer.render(scene,controller.camera);ui.update(s);ui.project(controller.camera);
      if(dt>0&&dt<1){intervals.push(dt);if(intervals.length>180)intervals.shift();}return s;
    }
    function loop(){frame=0;if(!active||disposed)return;if(!doc.hidden)renderNow();else previous=null;frame=requestAnimationFrame(loop);}
    const experience={model,scene,renderer,controller,ui,estate:model.estate,renderNow,
      start(){if(disposed||active)return false;active=true;controller.start();renderNow(0);if(!manualClock)frame=requestAnimationFrame(loop);return true;},
      viewOverview:()=>controller.goOrbit(),
      getDiagnostics:()=>({readOnly:true,navigation:'orbit-only',state:controller.getState(),model:model.getDiagnostics(),frames:intervals.length,fps:!manualClock&&intervals.length?intervals.length/intervals.reduce((a,b)=>a+b,0):null,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,lighting:SHARE_LIGHTING,gameHandlers:0}),
      dispose:release};return experience;
  }catch(error){release();throw error;}
}
