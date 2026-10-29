import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ROOF_CANDIDATES, createRoofCandidate } from './home-roof-candidates.js';

const viewers=[], pageAbort=new AbortController();
let syncing=false,frame=0,shape='starter',disposed=false,viewSize=10;
const status=document.querySelector('#selection');
function invalidate(){if(!disposed&&!frame)frame=requestAnimationFrame(render);}
function render(){frame=0;for(const v of viewers){const r=v.stage.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)continue;v.renderer.render(v.scene,v.camera);} }
function syncFrom(active){if(syncing)return;syncing=true;for(const v of viewers){if(v===active)continue;v.camera.position.copy(active.camera.position);v.camera.quaternion.copy(active.camera.quaternion);v.camera.zoom=active.camera.zoom;v.controls.target.copy(active.controls.target);v.camera.updateProjectionMatrix();v.controls.update();}syncing=false;invalidate();}
function frameModel(angle='iso'){
  const box=new THREE.Box3();for(const v of viewers)box.union(new THREE.Box3().setFromObject(v.model));
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  viewSize=Math.max(size.x,size.z)*1.22+size.y*.55;
  syncing=true;for(const v of viewers){
    v.camera.zoom=1;v.controls.target.copy(center);const direction=angle==='front'?new THREE.Vector3(0,.20,1):angle==='top'?new THREE.Vector3(.03,1,.03):new THREE.Vector3(1,.78,1.18);
    v.camera.position.copy(center).addScaledVector(direction.normalize(),30);v.controls.update();resizeViewer(v);
  }syncing=false;invalidate();
}
function resizeViewer(v){const {width,height}=v.stage.getBoundingClientRect();if(!width||!height)return;const aspect=width/height;v.camera.left=-viewSize*aspect/2;v.camera.right=viewSize*aspect/2;v.camera.top=viewSize/2;v.camera.bottom=-viewSize/2;v.camera.updateProjectionMatrix();v.renderer.setSize(width,height,false);invalidate();}
function updateStats(){const calls=viewers.reduce((n,v)=>n+v.model.userData.drawCalls+1,0),triangles=viewers.reduce((n,v)=>{let t=0;v.model.traverse(m=>{if(m.isMesh)t+=m.geometry.attributes.position.count/3;});return n+t;},0);document.querySelector('#render-stats').textContent=`DisplayText3694: ${calls} DisplayText3695, DisplayText3696 ${Math.round(triangles).toLocaleString()} DisplayText3697.DisplayText3698; DisplayText3699.`;document.body.dataset.renderCalls=String(calls);document.body.dataset.shape=shape;}
try{
  for(const option of ROOF_CANDIDATES){
    const stage=document.querySelector(`[data-candidate="${option.id}"] .viewport`);
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setClearColor('#fffef9',1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-8,8,8,-8,.1,120);
    scene.add(new THREE.HemisphereLight('#fff7e4','#8b9f80',2.9));
    const key=new THREE.DirectionalLight('#ffebcc',3.6);key.position.set(-7,12,8);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-16;key.shadow.camera.right=16;key.shadow.camera.top=16;key.shadow.camera.bottom=-16;key.shadow.normalBias=.045;key.shadow.bias=-.0002;scene.add(key);
    const fill=new THREE.DirectionalLight('#d5ecff',1);fill.position.set(9,6,-5);scene.add(fill);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.ShadowMaterial({opacity:.12}));floor.rotation.x=-Math.PI/2;floor.position.y=-.32;floor.receiveShadow=true;scene.add(floor);
    const model=createRoofCandidate({id:option.id,shape});scene.add(model);
    stage.replaceChildren(renderer.domElement);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enablePan=false;controls.rotateSpeed=.65;controls.minPolarAngle=.10;controls.maxPolarAngle=Math.PI*.46;controls.minZoom=.65;controls.maxZoom=2.4;controls.zoomSpeed=.8;
    const v={option,stage,renderer,scene,camera,controls,model,floor};viewers.push(v);controls.addEventListener('change',()=>syncFrom(v));
    stage.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key))return;e.preventDefault();const offset=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(offset);if(e.key==='ArrowLeft')s.theta-=.12;if(e.key==='ArrowRight')s.theta+=.12;if(e.key==='ArrowUp')s.phi=Math.max(.1,s.phi-.10);if(e.key==='ArrowDown')s.phi=Math.min(Math.PI*.46,s.phi+.10);if(['+','=','-'].includes(e.key))camera.zoom=THREE.MathUtils.clamp(camera.zoom*(e.key==='-'?.88:1.12),.65,2.4);camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));camera.updateProjectionMatrix();controls.update();syncFrom(v);},{signal:pageAbort.signal});
  }
  const observer=new ResizeObserver(()=>{for(const v of viewers)resizeViewer(v);});viewers.forEach(v=>observer.observe(v.stage));
  for(const button of document.querySelectorAll('[data-shape]'))button.addEventListener('click',()=>{shape=button.dataset.shape;for(const b of document.querySelectorAll('[data-shape]'))b.setAttribute('aria-pressed',String(b===button));for(const v of viewers){v.scene.remove(v.model);v.model.dispose();v.model=createRoofCandidate({id:v.option.id,shape});v.scene.add(v.model);}frameModel();updateStats();},{signal:pageAbort.signal});
  for(const button of document.querySelectorAll('[data-angle]'))button.addEventListener('click',()=>frameModel(button.dataset.angle),{signal:pageAbort.signal});
  document.querySelector('#reset-camera').addEventListener('click',()=>frameModel(),{signal:pageAbort.signal});
  for(const button of document.querySelectorAll('[data-choice]'))button.addEventListener('click',()=>{const id=button.dataset.choice;for(const b of document.querySelectorAll('[data-choice]')){const selected=b===button;b.setAttribute('aria-pressed',String(selected));b.textContent=selected?`DisplayText3700: ${id} DisplayText3237`:`DisplayText3701 ${b.dataset.choice}`;b.closest('article').classList.toggle('selected',selected);}status.textContent=`DisplayText3702 ${id} · ${ROOF_CANDIDATES.find(s=>s.id===id).name}.DisplayText3703, DisplayText3704.`;},{signal:pageAbort.signal});
  window.addEventListener('scroll',invalidate,{passive:true,signal:pageAbort.signal});
  document.addEventListener('visibilitychange',invalidate,{signal:pageAbort.signal});
  window.addEventListener('pageshow',invalidate,{signal:pageAbort.signal});
  window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();pageAbort.abort();for(const v of viewers){v.controls.dispose();v.model.dispose();v.floor.geometry.dispose();v.floor.material.dispose();v.scene.traverse(o=>{if(o.isLight)o.shadow?.map?.dispose();});v.renderer.dispose();}},{signal:pageAbort.signal});
  frameModel();updateStats();document.body.dataset.ready='true';
}catch(error){status.textContent=`DisplayText3705: ${error.message}.DisplayText3706.`;console.error(error);}
