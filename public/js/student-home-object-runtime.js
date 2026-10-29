import * as THREE from 'three';
import {getObjectCapabilities,getObjectState,TELEVISION_CHANNELS} from './home-object-state.js';
import {getFloorRects} from './home-layout.js';

export const OBJECT_LIGHT_LIMIT=4;
export const TV_CHANNELS=TELEVISION_CHANNELS;
const TAU=Math.PI*2;
const brightness=level=>[0,.38,.68,1][level]??.68;
const ease=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

/** Clock time is live, while the user's power/channel settings are durable. */
export function sampleObjectClock(date,elapsed=0){
  const seconds=date.getSeconds()+date.getMilliseconds()/1000;
  const minutes=date.getMinutes()+seconds/60;
  const hours=date.getHours()%12+minutes/60;
  const t=Math.max(0,elapsed),door=ease(t/.65)*(1-ease((t-4.2)/.65));
  return {hour:-hours*TAU/12,minute:-minutes*TAU/60,second:-Math.floor(seconds)*TAU/60,
    pendulum:Math.sin(date.getTime()/1000*TAU*.8)*.20,
    door,bird:door*ease((t-.45)/.55),wing:Math.sin(t*TAU*3.6)*.42*door};
}

/** Small original channel loops, drawn only while the television is on. */
export function drawTelevisionFrame(ctx,{power,channel=0},time=0){
  const w=512,h=288,t=time/1000;
  ctx.clearRect(0,0,w,h);ctx.fillStyle=power?'#a4d9dc':'#15242c';ctx.fillRect(0,0,w,h);
  const circle=(x,y,r,color)=>{ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=color;ctx.fill();};
  const rect=(x,y,a,b,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,a,b);};
  if(!power){rect(224,139,64,4,'#344a53');return;}
  if(channel===0){
    circle(430,50,29,'#ffe39a');rect(0,195,w,93,'#79b078');
    for(let n=0;n<6;n++){const x=n*110-30;rect(x+27,141,12,88,'#8b694b');circle(x+33,122,44,'#4e957d');}
    const x=256+Math.sin(t*.6)*95,y=191+Math.sin(t*4)*4;
    circle(x-12,y-60,13,'#fff1cf');circle(x+12,y-60,13,'#fff1cf');
    circle(x,y-34,30,'#fff1cf');circle(x,y+3,32,'#ebba76');
    circle(x-10,y-38,3,'#304755');circle(x+10,y-38,3,'#304755');circle(x,y-26,4,'#df927c');
    rect(x-25,y+26,20,10,'#f7dfaf');rect(x+5,y+26,20,10,'#f7dfaf');
  }else if(channel===1){
    ctx.fillStyle='#83bed5';ctx.fillRect(0,0,w,h);circle(137,91,42,'#ffdc70');
    const dx=Math.sin(t*.35)*20;for(const[x,y,r]of[[255,86,34],[298,70,43],[339,89,33]])circle(x+dx,y,r,'#fff8e8');
    for(let n=0;n<7;n++){const y=125+(t*55+n*24)%105;rect(239+n*19,y,4,12,'#e8f7ff');}
    ctx.fillStyle='#294e65';ctx.font='bold 45px sans-serif';ctx.fillText('24°',64,211);
    ctx.font='20px sans-serif';ctx.fillText('SUN & SHOWERS',218,224);
  }else if(channel===2){
    rect(0,0,w,h,'#3f916e');ctx.strokeStyle='#e7f0cd';ctx.lineWidth=3;ctx.strokeRect(24,25,464,236);
    ctx.beginPath();ctx.moveTo(256,25);ctx.lineTo(256,261);ctx.stroke();ctx.beginPath();ctx.arc(256,143,48,0,TAU);ctx.stroke();
    for(let n=0;n<6;n++){circle(80+n*69,83+Math.sin(t*1.4+n)*27,10,n%2?'#f2bb70':'#c3e3f3');circle(80+n*69,209+Math.cos(t*1.6+n)*17,10,n%2?'#c3e3f3':'#f2bb70');}
    const bx=256+Math.sin(t*.9)*155,by=143+Math.sin(t*1.8)*57;circle(bx+3,by+4,9,'#276653');circle(bx,by,9,'#fff8e7');circle(bx,by,3,'#34454e');
  }else{
    rect(0,0,w,h,'#384571');const colors=['#efb66d','#e498a6','#a5c7b0','#99bddb','#c0a5df','#f1d784'];
    for(let n=0;n<12;n++){const height=35+(Math.sin(t*(2+n*.08)+n)+1)*65;rect(28+n*39,231-height,26,height,colors[n%6]);}
    ctx.fillStyle='#fff1d1';ctx.font='bold 45px sans-serif';ctx.fillText('♪',72,68);ctx.fillText('♫',376,67);
  }
  rect(0,0,w,30,'#183f4d');ctx.fillStyle='#fff3ce';ctx.font='bold 15px sans-serif';ctx.fillText(['FOREST TV','WEATHER','SPORTS','MUSIC'][channel]??'FOREST TV',16,21);
  ctx.fillStyle='#fff3ce';ctx.font='13px sans-serif';ctx.fillText(`CH ${channel+1}`,453,21);
}

/** One bounded scheduler for the selected student's visible floor. It owns
 * its lights, textures and sound nodes; furniture owns all model geometry. */
export function createStudentHomeObjectRuntime({requestRender=()=>{},now=()=>performance.now(),dateNow=()=>new Date(),document:doc=globalThis.document,
  requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id),setTimer=setTimeout,clearTimer=clearTimeout}={}){
  const records=new Map(),heldRemotes=new Set(),voices=new Set();let visible=true,disposed=false,frame=0,timer=0,audio=null,muted=false,poolTexture=null;
  function silence(){for(const voice of voices){try{voice.oscillator.stop();}catch{/* An ended oscillator is already silent. */}voice.oscillator.disconnect();voice.gain.disconnect();}voices.clear();}
  function lightPoolTexture(){if(poolTexture)return poolTexture;const size=64,data=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const offset=(y*size+x)*4,r=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2));data[offset]=data[offset+1]=data[offset+2]=255;data[offset+3]=Math.round(Math.pow(Math.max(0,1-r),1.35)*255);
  }poolTexture=new THREE.DataTexture(data,size,size);poolTexture.needsUpdate=true;return poolTexture;}
  function stop(){if(frame)cancelFrame(frame);if(timer)clearTimer(timer);frame=timer=0;}
  function canRun(){return visible&&!disposed&&!doc?.hidden;}
  function parts(group){const result=new Map();group.traverse(node=>{const name=node.userData?.objectPart;if(name){if(!result.has(name))result.set(name,[]);result.get(name).push({node,position:node.position.clone(),rotation:node.rotation.clone(),visible:node.visible});}});return result;}
  function nodes(row,name){return row.parts.get(name)??[];}
  function release(row){
    for(const entries of row.parts.values())for(const {node,position,rotation,visible:wasVisible}of entries){node.position.copy(position);node.rotation.copy(rotation);node.visible=wasVisible;}
    for(const {node,original,material,texture}of row.screens){node.material=original;material.dispose();texture.dispose();}
    for(const [material,base]of row.emission){material.color.copy(base.color);material.emissive.copy(base.emissive);material.emissiveIntensity=base.intensity;}
    row.light?.removeFromParent();row.pool?.removeFromParent();row.pool?.geometry.dispose();row.pool?.material.dispose();
  }
  function createRecord(model,cap){
    const row={...model,cap,parts:parts(model.group),screens:[],emission:new Map(),demoAt:null,lastHour:null,lastStamp:null,lastBeat:null,state:null};
    if(cap.type==='lamp'){
      for(const part of ['lamp-emitter','lamp-shade'])for(const {node}of nodes(row,part))node.traverse(child=>{for(const material of[].concat(child.material??[]))if(material.emissive&&!row.emission.has(material))row.emission.set(material,{color:material.color.clone(),emissive:material.emissive.clone(),intensity:material.emissiveIntensity,strength:part==='lamp-shade'?.7:2.4});});
      row.light=new THREE.PointLight('#ffd28b',0,4,2);row.light.castShadow=false;row.light.userData.objectRuntime=true;model.group.add(row.light);
      row.pool=new THREE.Mesh(new THREE.PlaneGeometry(3.4,3.4),new THREE.MeshBasicMaterial({color:'#ffcf77',map:lightPoolTexture(),transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
      row.pool.rotation.x=-Math.PI/2;row.pool.castShadow=false;row.pool.receiveShadow=false;row.pool.renderOrder=1;row.pool.userData.objectRuntime=true;model.group.add(row.pool);
    }
    if(cap.type==='television')for(const {node}of nodes(row,'tv-screen'))if(node.isMesh){
      const canvas=doc?.createElement?.('canvas'),ctx=canvas?.getContext?.('2d');if(!ctx)continue;canvas.width=512;canvas.height=288;
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
      const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});row.screens.push({node,original:node.material,material,texture,ctx});node.material=material;
    }
    return row;
  }
  function sync(commerce,models,storey=0){
    if(disposed)return;const alive=new Set(),floor=storey===0?commerce?.home:commerce?.upperFloors?.[storey-1],rects=floor?getFloorRects(floor):null,floorKey=JSON.stringify(rects);
    for(const model of models??[]){const owned=commerce?.owned?.find(item=>item.id===model.itemId&&item.status==='placed'&&item.storey===storey),cap=owned&&getObjectCapabilities(owned.item.kind);
      if(!cap)continue;const state=getObjectState(commerce,owned.id);if(!state)continue;alive.add(owned.id);let row=records.get(owned.id);
      if(row?.group!==model.group){if(row)release(row);row=createRecord(model,cap);records.set(owned.id,row);}
      if(row.floorKey!==floorKey){row.floorKey=floorKey;row.floorRects=rects;row.poolKey=null;}
      if(JSON.stringify(row.state)!==JSON.stringify(state)){row.lastStamp=null;if(row.state&&cap.type==='television'&&state.power&&canRun())tone(880,.055,.012*(state.volume??1));}row.state=state;
    }
    for(const[id,row]of records)if(!alive.has(id)){release(row);records.delete(id);heldRemotes.delete(id);}
    tick(now());
  }
  function applyLamp(row,index){
    const amount=row.state.power?brightness(row.state.brightness):0;
    for(const[material,base]of row.emission){material.color.copy(base.color);if(amount)material.color.lerp(new THREE.Color('#fff3c8'),.65);material.emissive.set('#ffd28b');material.emissiveIntensity=amount*base.strength;}
    const emitter=nodes(row,'lamp-emitter')[0]?.node;
    if(emitter){emitter.getWorldPosition(row.light.position);row.group.worldToLocal(row.light.position);}else row.light.position.set(0,1,0);
    // Zero intensity alone still enters Three.js' light list and expands the
    // material shader. Hidden excess lights keep the actual GPU budget bounded.
    row.light.visible=canRun()&&amount>0&&index<OBJECT_LIGHT_LIMIT;
    row.light.intensity=row.light.visible?amount*9:0;
    const centre=row.group.localToWorld(row.light.position.clone()),radius=1.7*(.85+amount*.45);
    const poolKey=[centre.x,centre.z,row.group.position.y,row.group.rotation.y,radius].join(':');
    if(row.poolKey!==poolKey){
      const positions=[],uv=[],indices=[],inverse=row.group.matrixWorld.clone().invert(),vertex=new THREE.Vector3();
      const floor=row.floorRects??[{minX:centre.x-radius,minZ:centre.z-radius,width:radius*2,depth:radius*2}];
      for(const rect of floor){const x0=Math.max(centre.x-radius,rect.minX),x1=Math.min(centre.x+radius,rect.minX+rect.width),z0=Math.max(centre.z-radius,rect.minZ),z1=Math.min(centre.z+radius,rect.minZ+rect.depth);if(x1<=x0||z1<=z0)continue;
        const start=positions.length/3;for(const[x,z]of[[x0,z0],[x1,z0],[x1,z1],[x0,z1]]){vertex.set(x,.105,z).applyMatrix4(inverse);positions.push(vertex.x,vertex.y,vertex.z);uv.push((x-centre.x+radius)/(radius*2),(z-centre.z+radius)/(radius*2));}indices.push(start,start+1,start+2,start,start+2,start+3);
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
      row.pool.geometry.dispose();row.pool.geometry=geometry;row.pool.position.set(0,0,0);row.pool.rotation.set(0,0,0);row.pool.scale.setScalar(1);row.poolKey=poolKey;
    }
    row.pool.material.opacity=amount*.5;row.pool.visible=!!amount&&canRun();
  }
  function sound(row){
    if(muted||!audio||audio.state!=='running'||row.state.chime===false||!canRun()||voices.size>6)return;
    const at=audio.currentTime;for(let n=0;n<2;n++){const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';oscillator.frequency.value=n?523.25:659.25;
      gain.gain.setValueAtTime(0,at+n*.34);gain.gain.linearRampToValueAtTime(.035,at+n*.34+.025);gain.gain.exponentialRampToValueAtTime(.0001,at+n*.34+.28);
      const voice={oscillator,gain};voices.add(voice);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(at+n*.34);oscillator.stop(at+n*.34+.3);oscillator.onended=()=>{voices.delete(voice);oscillator.disconnect();gain.disconnect();};}
  }
  function tone(frequency,duration=.16,volume=.02){
    if(muted||!audio||audio.state!=='running'||!volume||!canRun()||voices.size>=8)return;
    const oscillator=audio.createOscillator(),gain=audio.createGain(),at=audio.currentTime;
    oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.012);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    const voice={oscillator,gain};voices.add(voice);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(at);oscillator.stop(at+duration+.01);oscillator.onended=()=>{voices.delete(voice);oscillator.disconnect();gain.disconnect();};
  }
  function applyClock(row,date,time){
    const key=`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
    if(row.lastHour===null)row.lastHour=key;
    if(row.lastHour!==key){row.lastHour=key;if(row.state.chime&&date.getMinutes()===0&&date.getSeconds()<3){row.demoAt=time;sound(row);}}
    const elapsed=row.demoAt===null?10:(time-row.demoAt)/1000,pose=sampleObjectClock(date,elapsed);
    for(const[name,value]of[['clock-hour',pose.hour],['clock-minute',pose.minute],['clock-second',pose.second],['clock-pendulum',pose.pendulum]])for(const{node,rotation}of nodes(row,name))node.rotation.z=rotation.z+value;
    for(const[name,sign]of[['cuckoo-door-left',-1],['cuckoo-door-right',1]])for(const{node,rotation}of nodes(row,name))node.rotation.y=rotation.y+sign*pose.door*1.35;
    for(const{node,position}of nodes(row,'cuckoo-bird')){node.position.z=position.z+pose.bird*(node.userData.objectTravel??.09);node.visible=pose.bird>.01;}
    for(const[name,sign]of[['cuckoo-wing-left',1],['cuckoo-wing-right',-1]])for(const{node,rotation}of nodes(row,name))node.rotation.z=rotation.z+pose.wing*sign;
    if(elapsed>=5)row.demoAt=null;
  }
  function cadence(){let delay=1000;for(const row of records.values()){
    if(row.cap.type==='clock'&&(row.demoAt!==null||nodes(row,'clock-pendulum').length))delay=Math.min(delay,40);
    if(row.cap.type==='television'&&row.state.power)delay=Math.min(delay,125);
  }return delay;}
  function schedule(){stop();if(!canRun()||![...records.values()].some(row=>row.cap.type==='clock'||row.cap.type==='television'&&row.state.power))return;
    timer=setTimer(()=>{timer=0;frame=requestFrame(time=>{frame=0;tick(time);});},cadence());}
  function tick(time){
    if(disposed)return;const date=dateNow();let lamps=0,changed=false,musicPlayed=false;
    for(const row of records.values()){
      if(row.cap.type==='lamp'){applyLamp(row,row.state.power?lamps++:OBJECT_LIGHT_LIMIT);changed=true;}
      if(!canRun())continue;
      if(row.cap.type==='clock'){applyClock(row,date,time);changed=true;}
      if(row.cap.type==='television'){
        for(const{node}of nodes(row,'tv-remote'))node.visible=!heldRemotes.has(row.itemId);
        const stamp=row.state.power?Math.floor(time/125):'off';if(row.lastStamp!==stamp){for(const screen of row.screens){drawTelevisionFrame(screen.ctx,row.state,time);screen.texture.needsUpdate=true;}row.lastStamp=stamp;changed=true;}
        if(!musicPlayed&&row.state.power&&row.state.channel===3){const beat=Math.floor(time/420);if(row.lastBeat!==beat){tone([261.63,329.63,392,523.25,440,392,329.63,293.66][beat%8],.26,.012*row.state.volume);row.lastBeat=beat;}musicPlayed=true;}
      }
    }
    if(changed)requestRender();schedule();
  }
  function demonstrate(id){const row=records.get(id);if(!row||row.cap.type!=='clock'||!canRun())return false;row.demoAt=now();sound(row);tick(now());return true;}
  async function unlockAudio(){if(disposed)return;const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;if(!Audio)return;audio??=new Audio();try{await audio.resume();}catch{/* Visual interactions work when browser sound is unavailable. */}}
  function setVisible(next){visible=!!next;tick(now());if(!canRun()){silence();void audio?.suspend?.();}}
  const visibility=()=>{if(!canRun()){stop();silence();void audio?.suspend?.();}else tick(now());};doc?.addEventListener?.('visibilitychange',visibility);
  return {sync,demonstrate,unlockAudio,setVisible,
    releaseModel(group){for(const[id,row]of records)if(row.group===group){release(row);records.delete(id);}},
    setRemoteHeld(id,held){if(held)heldRemotes.add(id);else heldRemotes.delete(id);const row=records.get(id);if(row)for(const{node}of nodes(row,'tv-remote'))node.visible=!held;requestRender();},
    setMuted(value){muted=!!value;if(muted)silence();},
    getStats(){return {objects:records.size,activePointLights:[...records.values()].filter(row=>row.light?.intensity>0).length,textures:[...records.values()].reduce((sum,row)=>sum+row.screens.length,0)+(poolTexture?1:0),scheduled:!!frame||!!timer};},
    clear(){stop();silence();for(const row of records.values())release(row);records.clear();heldRemotes.clear();poolTexture?.dispose();poolTexture=null;void audio?.suspend?.();requestRender();},
    dispose(){if(disposed)return;stop();silence();for(const row of records.values())release(row);records.clear();heldRemotes.clear();poolTexture?.dispose();poolTexture=null;disposed=true;doc?.removeEventListener?.('visibilitychange',visibility);void audio?.close?.();audio=null;},
  };
}
