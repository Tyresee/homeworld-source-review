// Loopback-only review harness. Production controller/model code is imported
// unchanged; the page owns a controllable RAF queue, never saves or wallets.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url)),port=18804;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.glb':'model/gltf-binary','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const html=String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DisplayText4419 · DisplayText4375</title>
<style>*{box-sizing:border-box}body{margin:0;font:15px system-ui,sans-serif;background:#edf0ed;color:#29433e}main{display:grid;grid-template-columns:minmax(0,1fr) 380px;height:100vh}#stage{position:relative;min-width:0;overflow:hidden}canvas{display:block;width:100%;height:100%}aside{background:#fffdf7;border-left:1px solid #d7dfd7;padding:24px;overflow:auto}h1{font-size:23px;margin:0 0 8px}p{line-height:1.6;color:#6b7970;margin:8px 0 20px}label{display:block;margin:16px 0 7px;font-weight:650}select,button{font:inherit;border:1px solid #c4d3c8;border-radius:10px;background:#fff;padding:11px 13px;color:#29433e}select{width:100%}button{cursor:pointer}button:hover{background:#eef4eb}button:disabled{opacity:.5;cursor:default}.row{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap}.row button{flex:1}.primary{background:#386c56;color:white}.primary:hover{background:#2b5745}.badge{position:absolute;top:22px;left:22px;background:#fffdf7ef;padding:13px 18px;border-radius:12px;pointer-events:none}.badge strong{display:block;margin-bottom:4px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;background:#edf2ec;padding:12px;border-radius:10px;max-height:390px;overflow:auto}#status{min-height:46px;padding:10px;background:#e5eee2;border-radius:8px}.metric{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0}.metric div{background:#edf2ec;padding:12px;border-radius:8px}.metric small{display:block;color:#758374}.metric b{font-size:20px}fieldset{border:0;padding:0;margin:0}@media(max-width:900px){main{grid-template-columns:minmax(0,1fr) 320px}aside{padding:16px}}</style>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/examples/jsm/"}}</script></head>
<body><main><section id="stage" aria-label="DisplayText4420"><div class="badge"><strong>DisplayText4421 v4 · DisplayText4422</strong><span id="scene-label">DisplayText4423…</span></div></section><aside><h1>DisplayText4424</h1><p>DisplayText4425.DisplayText4426, DisplayText4427; DisplayText4428, DisplayText4429.</p>
<fieldset id="controls" disabled><label for="furniture">Furniture / DisplayText3501</label><select id="furniture"><option value="bedTimber">DisplayText2797</option><option value="compactToilet">DisplayText4430</option><option value="sofa">DisplayText4431</option><option value="stairs">DisplayText4432</option></select>
<div id="stair-controls" hidden><label for="direction">DisplayText4433</label><select id="direction"><option value="up">DisplayText4434: DisplayText4435 → DisplayText4436</option><option value="down">DisplayText4437: DisplayText4436 → DisplayText4435</option></select><label for="framing">DisplayText4438</label><select id="framing"><option value="full">DisplayText4439</option><option value="close">DisplayText4440</option></select><label><input id="hide-rails" type="checkbox"> DisplayText4441, DisplayText4442</label><label><input id="show-foot-markers" type="checkbox"> DisplayText4443(DisplayText4444)</label><div id="foot-status" role="status">L DisplayText4445 · R DisplayText4446; DisplayText4447: DisplayText4448=DisplayText4449, DisplayText4450=DisplayText4451, DisplayText4452=DisplayText4453</div></div>
<label for="rotation">DisplayText4454</label><select id="rotation"><option value="0">0°</option><option value="90">90°</option></select>
<div class="row"><button id="side">Side</button><button id="front">Front</button><button id="iso">Isometric</button></div>
<label for="action">DisplayText4455</label><select id="action"></select>
<div class="row"><button id="begin" class="primary">Start interaction</button><button id="stand">Get up and leave</button></div>
<div class="row"><button id="play">Play</button><button id="pause">Pause</button></div><div class="row"><button id="step-small">DisplayText4456 0.05 DisplayText4378</button><button id="step">DisplayText4456 0.1 DisplayText4378</button></div>
<div class="row"><button id="reset">DisplayText4457</button><button id="approach">DisplayText4458</button></div></fieldset>
<div class="metric"><div><small>DisplayText4459</small><b id="phase">DisplayText4460</b></div><div><small>DisplayText4461</small><b id="progress">0%</b></div></div><div id="status" role="status">DisplayText4462 GLB…</div><label for="snapshot">DisplayText4463</label><pre id="snapshot" aria-live="off">{}</pre></aside></main><script type="module" src="/review.js"></script></body></html>`;

const javascript=String.raw`
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createStudentHomeRobotController} from '/js/student-home-robot-controller.js';
import {createHomeState,applyChange,getFurniturePose} from '/js/home-engine.js';
import {createLuxuryItem} from '/js/home-luxury-models.js';
import {createStaircase} from '/js/home-staircase.js';
import {STOREY_HEIGHT,FLOOR_Y} from '/js/home-staircase-shape.js';

const $=id=>document.getElementById(id),stage=$('stage');
const nativeRAF=window.requestAnimationFrame.bind(window),pending=new Map();let sequence=0,playing=false,simulationSeconds=0;
// No production test hooks: only this page redirects the controller's RAF calls.
// The queued real-time origin makes controller dt deterministic while preserving
// its own 50 ms cap. A 0.1 second step executes two real controller ticks.
window.requestAnimationFrame=callback=>{const id=++sequence;pending.set(id,{callback,origin:performance.now()});return id;};
window.cancelAnimationFrame=id=>pending.delete(id);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#e7ece9');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;stage.prepend(renderer.domElement);
const scene=new THREE.Scene(),world=new THREE.Group();scene.add(world);scene.add(new THREE.HemisphereLight('#fff8e8','#a5b6ac',2));
const key=new THREE.DirectionalLight('#fff1d5',3.2);key.position.set(-3,6,5);scene.add(key);const fill=new THREE.DirectionalLight('#dceafa',1.2);fill.position.set(4,3,-3);scene.add(fill);
const ground=new THREE.Mesh(new THREE.BoxGeometry(5.6,.08,5.2),new THREE.MeshStandardMaterial({color:'#cdd8cc',roughness:.95}));ground.position.y=.04;scene.add(ground);
const grid=new THREE.GridHelper(6,12,'#adbfb2','#c0cdc2');grid.position.y=.082;scene.add(grid);
const camera=new THREE.OrthographicCamera(-3,3,3,-3,.01,50);camera.position.set(5,3.5,5);const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,.85,.25);orbit.enableDamping=false;orbit.minZoom=.65;orbit.maxZoom=2.8;orbit.maxPolarAngle=Math.PI*.51;orbit.addEventListener('change',render);
let controller=null,source=null,furniture=null,home=null,floors=null,view='side',supportSurfaces=[],footContacts={};
const footMarkers=new THREE.Group();footMarkers.name='qa-foot-contact-markers';scene.add(footMarkers);
const markerBySide={};
for(const[side,color]of[['L','#158eb7'],['R','#d96750']]){
  const point=new THREE.Mesh(new THREE.SphereGeometry(.033,12,8),new THREE.MeshBasicMaterial({color,depthTest:false}));point.renderOrder=100;
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.075,.01,6,20),new THREE.MeshBasicMaterial({color:'#4aa570',depthTest:false}));ring.rotation.x=-Math.PI/2;ring.renderOrder=99;footMarkers.add(point,ring);
  const label=document.createElement('span');label.textContent=side;Object.assign(label.style,{position:'absolute',fontWeight:'800',fontSize:'14px',color,pointerEvents:'none',padding:'2px 5px',borderRadius:'5px',background:'#fffdf7dc'});stage.append(label);markerBySide[side]={point,ring,label};
}
const ray=new THREE.Raycaster(),vertex=new THREE.Vector3(),projection=new THREE.Vector3(),soleSamples=new WeakMap();
// Sample the actual downward-facing sole triangles, including their interiors.
// A heel can legitimately overhang a lower tread while the toes carry weight;
// neither one averaged point nor the target IK anchor proves physical contact.
function bottomSamples(geometry){
  if(soleSamples.has(geometry))return soleSamples.get(geometry);
  const positions=geometry.getAttribute('position'),indices=geometry.index,samples=new Map(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),edge=new THREE.Vector3(),normal=new THREE.Vector3();
  const add=p=>samples.set(p.toArray().map(n=>Math.round(n*100000)).join(':'),p);
  for(let i=0;i<(indices?.count??positions.count);i+=3){
    a.fromBufferAttribute(positions,indices?indices.getX(i):i);b.fromBufferAttribute(positions,indices?indices.getX(i+1):i+1);c.fromBufferAttribute(positions,indices?indices.getX(i+2):i+2);
    normal.crossVectors(edge.copy(b).sub(a),new THREE.Vector3().copy(c).sub(a)).normalize();if(normal.y>=-.05)continue;
    const segments=Math.max(1,Math.ceil(Math.max(a.distanceTo(b),a.distanceTo(c),b.distanceTo(c))/.025));
    for(let u=0;u<=segments;u++)for(let v=0;v<=segments-u;v++)add(new THREE.Vector3().copy(a).multiplyScalar(1-(u+v)/segments).addScaledVector(b,u/segments).addScaledVector(c,v/segments));
  }
  const result=[...samples.values()];soleSamples.set(geometry,result);return result;
}
function measureSoleContact(sole,surfaces){
  const samples=bottomSamples(sole.geometry).map(local=>{
    const point=local.clone().applyMatrix4(sole.matrixWorld);ray.set(new THREE.Vector3(point.x,8,point.z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(surfaces,false).find(hit=>hit.face?.normal.y>.9),surfaceY=hit?.point.y??FLOOR_Y;
    return{point,surfaceY,gap:point.y-surfaceY,surface:hit?.object.name??'ground'};
  });
  const penetrating=samples.filter(sample=>sample.gap<-.004),touching=samples.filter(sample=>Math.abs(sample.gap)<=.008);
  const mode=penetrating.length?'DisplayText4453':touching.length?'DisplayText4449':'DisplayText4451';
  const chosen=(penetrating.length?penetrating:touching.length?touching:samples).reduce((best,sample)=>!best||(penetrating.length?sample.gap<best.gap:Math.abs(sample.gap)<Math.abs(best.gap))?sample:best,null);
  return{...chosen,mode,sampleCount:samples.length,touchingSamples:touching.length,penetratingSamples:penetrating.length,minGap:Math.min(...samples.map(s=>s.gap)),maxGap:Math.max(...samples.map(s=>s.gap))};
}
function isStairs(){return $('furniture').value==='stairs';}
function updateFootContacts(){
  const showMarkers=isStairs()&&$('show-foot-markers').checked;footMarkers.visible=showMarkers;for(const marker of Object.values(markerBySide))marker.label.hidden=!showMarkers;footContacts={};
  if(!isStairs()||!controller)return;
  scene.updateMatrixWorld(true);const robot=controller.group.getObjectByName('robot-avatar');
  for(const side of['L','R']){
    const measured=measureSoleContact(robot.getObjectByName('FootSole'+side),supportSurfaces),{point:contact,surfaceY,gap,mode}=measured;
    footContacts[side]={solePoint:contact.toArray().map(n=>Number(n.toFixed(4))),surfaceY:Number(surfaceY.toFixed(4)),gapMm:Number((gap*1000).toFixed(1)),status:mode,surface:measured.surface,
      sampleCount:measured.sampleCount,touchingSamples:measured.touchingSamples,penetratingSamples:measured.penetratingSamples,minGapMm:Number((measured.minGap*1000).toFixed(1)),maxGapMm:Number((measured.maxGap*1000).toFixed(1))};
    const marker=markerBySide[side];marker.point.position.copy(contact).y+=.018;marker.ring.position.set(contact.x,surfaceY+.008,contact.z);marker.ring.material.color.set(mode==='DisplayText4449'?'#409666':mode==='DisplayText4453'?'#ce4c41':'#d7a035');
    projection.copy(contact).add(new THREE.Vector3(0,.15,0)).project(camera);marker.label.style.left=((projection.x+1)*stage.clientWidth/2+8)+'px';marker.label.style.top=((1-projection.y)*stage.clientHeight/2)+'px';
  }
  $('foot-status').textContent=['L','R'].map(side=>side+' '+footContacts[side].status+' · '+footContacts[side].touchingSamples+'DisplayText4464 / '+footContacts[side].penetratingSamples+'DisplayText4465 · '+footContacts[side].gapMm+' mm').join(' | ');
}
function report(){if(!controller)return;const state=controller.getState(),robot=controller.group.getObjectByName('robot-avatar');
  const phase=state.phase??(state.inTransition?'transition':state.action);const progress=state.transitionProgress??0;
  $('phase').textContent=phase;$('progress').textContent=Math.round(progress*100)+'%';
  $('snapshot').textContent=JSON.stringify({...state,simulationSeconds:Number(simulationSeconds.toFixed(3)),paused:!playing,queuedFrames:pending.size,footContacts,worldFloorOffset:controller.group.position.y,robotRoot:{position:robot.position.toArray(),rotation:robot.rotation.toArray().slice(0,3)}},null,2);
  $('scene-label').textContent=$('furniture').selectedOptions[0].textContent+' · '+$('rotation').value+'° · '+(playing?'DisplayText4466':'DisplayText4467');
}
function cameraOffset(){const angle=Number($('rotation').value)*Math.PI/180;return(view==='side'?new THREE.Vector3(-6,.7,0):view==='front'?new THREE.Vector3(0,.7,6):new THREE.Vector3(-5,3.8,5)).applyAxisAngle(new THREE.Vector3(0,1,0),angle);}
function followCamera(){if(!controller||!isStairs()||$('framing').value!=='close')return;const hip=controller.group.getObjectByName('HipRoot');controller.group.updateWorldMatrix(true,true);hip.getWorldPosition(orbit.target);orbit.target.y+=.12;camera.position.copy(orbit.target).add(cameraOffset());camera.lookAt(orbit.target);camera.updateMatrixWorld(true);}
function render(){followCamera();updateFootContacts();renderer.render(scene,camera);report();}
function resize(){const width=stage.clientWidth,height=stage.clientHeight;renderer.setSize(width,height);const half=isStairs()?($('framing').value==='close'?1.2:3.15):2.15;camera.left=-half*width/height;camera.right=half*width/height;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();render();}
function setView(){orbit.target.set(0,isStairs()?2.25:.85,isStairs()?0:.35);camera.position.copy(orbit.target).add(cameraOffset());camera.zoom=1;resize();orbit.update();render();}
function disposeFurniture(){if(!furniture)return;const geometry=new Set(),materials=new Set();furniture.traverse(n=>{if(n.isMesh){geometry.add(n.geometry);for(const m of[].concat(n.material))materials.add(m);}});furniture.removeFromParent();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());furniture=null;}
function interactions(){const values=isStairs()?controller.listStairs():controller.interactions('furniture:review-item');$('action').replaceChildren(...values.map(value=>new Option(value.label,value.id)));return values;}
function rebuild(){playing=false;controller?.dispose();controller=null;pending.clear();disposeFurniture();simulationSeconds=0;
  const kind=$('furniture').value,rotation=Number($('rotation').value),color=kind==='bedTimber'?'#c99362':kind==='sofa'?'#93b2a5':'#f3e9d4';
  $('stair-controls').hidden=!isStairs();supportSurfaces=[ground];ground.scale.set(isStairs()?8/5.6:1,1,isStairs()?8/5.2:1);grid.scale.setScalar(isStairs()?8/6:1);
  if(isStairs()){
    const slab={rects:[{minX:-4,minZ:-4,width:8,depth:8}]},stair={id:'review-stairs',x:0,z:0,rotation};
    floors=['account','upper'].map((profile,index)=>{const result=applyChange(createHomeState({profile,slab}),{type:'stairs',stairs:{...stair,direction:index?'down':'up'}});if(!result.ok)throw new Error(result.error);return result.state;});
    furniture=new THREE.Group();const model=createStaircase({...stair,direction:'up'});furniture.add(model);
    model.traverse(node=>{if(node.isMesh&&/straight-tread|lower-landing|upper-landing/.test(node.name))supportSurfaces.push(node);});
    const landing=new THREE.Mesh(new THREE.BoxGeometry(4,.08,2.4),new THREE.MeshStandardMaterial({color:'#c3d2c5',roughness:.9}));landing.name='qa-upper-floor-platform';landing.position.set(0,STOREY_HEIGHT+.04,-2.8).applyAxisAngle(new THREE.Vector3(0,1,0),rotation*Math.PI/180);landing.rotation.y=rotation*Math.PI/180;furniture.add(landing);supportSurfaces.push(landing);world.add(furniture);
    controller=createStudentHomeRobotController({source,parent:world,requestRender:render,onStatus:({message})=>$('status').textContent=message,onStoreyChange({index,point}){controller.group.position.y=index*STOREY_HEIGHT;home=floors[index];$('direction').value=index?'down':'up';controller.setWorld(home,index,{floors,arrivalPoint:point});interactions();render();}});
    const index=$('direction').value==='down'?1:0;home=floors[index];controller.group.position.y=index*STOREY_HEIGHT;
    const start=new THREE.Vector3(0,0,index?-2.3:2.3).applyAxisAngle(new THREE.Vector3(0,1,0),rotation*Math.PI/180);controller.setWorld(home,index,{floors,arrivalPoint:{x:start.x,z:start.z}});
    applyRailVisibility();interactions();setView();$('status').textContent='DisplayText4468; DisplayText4469 L/R DisplayText4470.';report();return;
  }
  floors=null;
  const result=applyChange(createHomeState({profile:'account'}),{type:'furniture',id:'review-item',kind,x:0,z:0,rotation,color});if(!result.ok)throw new Error(result.error);home=result.state;
  const item=home.furniture[0],pose=getFurniturePose(home,item);furniture=createLuxuryItem(item);furniture.position.set(pose.x,pose.y,pose.z);furniture.rotation.y=rotation*Math.PI/180;world.add(furniture);
  controller=createStudentHomeRobotController({source,parent:world,requestRender:render,onStatus:({message})=>$('status').textContent=message});
  const direction=new THREE.Vector3(0,0,2.05).applyAxisAngle(new THREE.Vector3(0,1,0),rotation*Math.PI/180);controller.setWorld(home,0,{arrivalPoint:{x:direction.x,z:direction.z}});interactions();setView();$('status').textContent='DisplayText4471.DisplayText4472, DisplayText4473.';report();
}
function advance(seconds){let remaining=seconds;while(remaining>1e-6){const dt=Math.min(.05,remaining),callbacks=[...pending.values()];pending.clear();for(const frame of callbacks)frame.callback(frame.origin+dt*1000);simulationSeconds+=dt;remaining-=dt;}render();}
$('begin').addEventListener('click',()=>{const result=isStairs()?controller.useStairs('review-stairs'):controller.interact('furniture:review-item',$('action').value);if(!result.ok)$('status').textContent=result.error;report();});
$('stand').addEventListener('click',()=>{controller.stand();report();});
$('play').addEventListener('click',()=>{playing=true;report();});$('pause').addEventListener('click',()=>{playing=false;report();});
$('step').addEventListener('click',()=>{playing=false;advance(.1);});$('step-small').addEventListener('click',()=>{playing=false;advance(.05);});$('reset').addEventListener('click',rebuild);
$('approach').addEventListener('click',()=>{playing=false;if(isStairs()){const index=controller.getState().floor,angle=Number($('rotation').value)*Math.PI/180,margin=controller.getState().navigation.radius+.08,p=new THREE.Vector3(0,0,(index?-1:1)*(1.6+margin)).applyAxisAngle(new THREE.Vector3(0,1,0),angle);controller.setWorld(home,index,{floors,arrivalPoint:{x:p.x,z:p.z}});interactions();report();return;}const options=interactions(),target=options.find(row=>row.id===$('action').value)??options[0];if(target){controller.setWorld(home,0,{arrivalPoint:target.approach});interactions();report();}});
function applyRailVisibility(){if(!isStairs()||!furniture)return;furniture.traverse(node=>{if(node.isMesh&&/baluster|handrail|exit-post/.test(node.name))node.visible=!$('hide-rails').checked;});render();}
$('furniture').addEventListener('change',rebuild);$('rotation').addEventListener('change',rebuild);$('direction').addEventListener('change',rebuild);$('hide-rails').addEventListener('change',applyRailVisibility);$('show-foot-markers').addEventListener('change',render);$('framing').addEventListener('change',()=>{orbit.enableRotate=!isStairs()||$('framing').value!=='close';setView();});$('side').addEventListener('click',()=>{view='side';setView();});$('front').addEventListener('click',()=>{view='front';setView();});$('iso').addEventListener('click',()=>{view='iso';setView();});
let lastTime=performance.now();function pump(now){const delta=Math.min(.05,(now-lastTime)/1000);lastTime=now;if(playing)advance(delta);nativeRAF(pump);}nativeRAF(pump);
new ResizeObserver(resize).observe(stage);resize();
try {source=(await new GLTFLoader().loadAsync('/assets/asset-lab/robot-v1/models/v4/robot.glb')).scene;rebuild();$('controls').disabled=false;document.body.dataset.ready='true';}
catch(error){$('status').textContent='DisplayText4418: '+error.message;document.body.dataset.ready='error';console.error(error);}
`;

const server=createServer(async(req,res)=>{
  try {
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    const path=new URL(req.url,`http://127.0.0.1:${port}`).pathname;
    let bytes,type;
    if(path==='/'||path==='/review.html'){bytes=Buffer.from(html);type=mime['.html'];}
    else if(path==='/review.js'){bytes=Buffer.from(javascript);type=mime['.js'];}
    else {
      const allowed=path.startsWith('/js/')||path.startsWith('/assets/')?resolve(root,'public'):path.startsWith('/vendor/three/')?resolve(root,'node_modules/three'):null;
      if(!allowed){res.writeHead(404);res.end();return;}
      const target=resolve(allowed,'.'+decodeURIComponent(path.startsWith('/vendor/three/')?path.slice('/vendor/three'.length):path));
      if(!target.startsWith(allowed+sep)){res.writeHead(403);res.end();return;}
      bytes=await readFile(target);type=mime[extname(target)]??'application/octet-stream';
    }
    res.writeHead(200,{'content-type':type,'content-length':bytes.length,'cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);
  } catch {res.writeHead(404);res.end('Review resource not found.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Robot motion review: http://127.0.0.1:${port}/`));
for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
