import {loadStudentHomeScene} from './student-home-loader.js';
import {createStudentHomeContextMenu} from './student-home-context-menu.js';
import {CATALOG_VERSION} from './home-catalog-version.js';

const $=id=>document.getElementById(id),api='/games/homeworld/api/v1';
const selectedStudentKey='homeworld:student-homes:selected-student:v1';
const shellColors=[["DisplayText0753",'#e9dfc9'],["DisplayText0757",'#a7c7cf'],["DisplayText4205",'#e6b7aa'],["DisplayText4206",'#d4c5dd']];
const accentColors=[["DisplayText4207",'#869779'],["DisplayText4208",'#608ea6'],["DisplayText4209",'#bd7c54'],["DisplayText4210",'#906e82']];
const views=['interior','estate','building'];
let latestWallet=null,robotActivity=null;
let stageCameraState={active:false,returning:false,available:false,suppressed:false};
let session,students=[],selected=null,home=null,scene,selection=0,writing=false,retryAction=null,walletRequest=0,changingStudent=false;
const contextMenu=createStudentHomeContextMenu({
  onMoveTo:world=>{if(home&&!writing&&scene?.moveTo(world))status("DisplayText4211.");},
  onPalette:point=>{if(home&&!writing)openPalette(point);},
  onWave:()=>{if(home)scene?.wave();},onReset:()=>{if(home)scene?.reset();},
});
function openContextMenu(context){if(!home||writing)return;$('palette').hidden=true;contextMenu.open(context);}
function status(message,retry=null,retryLabel="DisplayText3806"){$('status').textContent=message;retryAction=retry;$('retry').hidden=!retry;$('retry').textContent=retryLabel;}
function errorStatus(error,retry=null){if(error.status===401){$('login').hidden=false;$('login').href='/login/?next='+encodeURIComponent('/games/homeworld/student-homes.html');}status(error.message,error.status===401?null:retry);}
function message(text){$('scene-message').textContent=text;$('scene-message').hidden=!text;}
// Remember only this tab's selection; authentication and saves still come from the server.
function rememberStudent(student){
  try{sessionStorage.setItem(selectedStudentKey,JSON.stringify({actorId:session.actor.id,studentId:student.id}));}catch{/* Storage restrictions must not prevent opening a home. */}
}
function rememberedStudent(){
  try{
    const raw=sessionStorage.getItem(selectedStudentKey);if(!raw)return null;
    let saved;try{saved=JSON.parse(raw);}catch{/* Invalid preferences are discarded below. */}
    const student=saved?.actorId===session.actor.id?students.find(item=>item.id===saved.studentId):null;
    if(student)return student;sessionStorage.removeItem(selectedStudentKey);
  }catch{/* Browsing with storage disabled still supports manual selection. */}
  return null;
}
async function request(path,body,method='GET',options={}){
  let response;try{response=await fetch(api+path,{method,credentials:'same-origin',cache:'no-store',...(options.keepalive?{keepalive:true}:{}),headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw new Error("DisplayText4212, DisplayText4213.");}
  let data;try{data=await response.json();}catch{throw new Error("DisplayText4214, DisplayText4016.");}
  if(response.status===401){const error=new Error("DisplayText4215, DisplayText4216.");error.status=401;throw error;}
  if(!response.ok){const error=new Error(data.error?.message||"DisplayText0716, DisplayText0974.");error.status=response.status;error.code=data.error?.code;throw error;}
  return data;
}
function syncStage(active){$('stage-toggle').setAttribute('aria-pressed',String(active));$('stage-toggle').textContent=active?"DisplayText3771 · DisplayText3772":"DisplayText4217";}
function syncStageCamera(value=stageCameraState){
  stageCameraState=value??{active:false,returning:false,available:false,suppressed:false};const button=$('stage-camera-toggle'),camera=stageCameraState;
  button.hidden=!home||scene?.getView()!=='interior'||!(camera.available||camera.active||camera.returning);
  button.disabled=writing||camera.returning||button.hidden;button.setAttribute('aria-pressed',String(camera.active));
  button.textContent=camera.returning?"DisplayText3760…":camera.active?"DisplayText3761":"DisplayText3762";
  button.title=camera.active||camera.returning?"DisplayText3763, DisplayText4218":"DisplayText4219, DisplayText4220";
}
function syncView(view){$('stage-toggle').disabled=writing||view!=='interior';syncStageCamera();for(const key of views)$('view-'+key).setAttribute('aria-pressed',String(key===view));}
function busy(value){writing=value;if(value)contextMenu.close();$('palette-colors').disabled=value;$('wardrobe-open').disabled=value;$('stage-toggle').disabled=value||scene?.getView()!=='interior';syncStageCamera();$('claim').disabled=value;$('search').disabled=value;for(const view of views)$('view-'+view).disabled=value;document.querySelectorAll('.student').forEach(button=>button.disabled=value);}
function renderStudents(){
  const query=$('search').value.trim().toLocaleLowerCase(),visible=students.filter(student=>student.displayName.toLocaleLowerCase().includes(query));
  $('students').replaceChildren();for(const student of visible){const button=document.createElement('button');button.type='button';button.className='student';button.dataset.studentId=student.id;button.setAttribute('aria-pressed',String(selected?.id===student.id));button.disabled=writing;
    const initial=document.createElement('span');initial.className='initial';initial.setAttribute('aria-hidden','true');initial.textContent=Array.from(student.displayName)[0];const name=document.createElement('span');name.className='student-name';name.textContent=student.displayName;
    button.append(initial,name);button.addEventListener('click',()=>selectStudent(student));$('students').append(button);}
  $('roster-note').textContent=visible.length?`${visible.length} DisplayText4221`:(query?"DisplayText4222":"DisplayText4223, DisplayText4224.");
}
function syncPalette(){for(const key of['shell','accent'])document.querySelectorAll(`[data-${key}]`).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset[key]===home?.avatar.colors[key])));}
async function drawHome(own){
  if(own!==selection)return;$('welcome').hidden=!!home;$('home-tools').hidden=true;$('scene-hint').hidden=true;
  if(!home){message('');$('home-caption').textContent="DisplayText4225";status("DisplayText4226, DisplayText4227.");return;}
  $('home-caption').textContent=`${home.house.floors.length} DisplayText4228 · ${home.commerce?.owned.filter(item=>item.status!=='sold').length??0} DisplayText4229 · DisplayText0006`;message("DisplayText4230…");syncPalette();
  try{const createStudentHomeScene=await loadStudentHomeScene();if(own!==selection)return;scene??=createStudentHomeScene($('stage'),{onRobot:openPalette,onCommand:executeCommand,onStatus:status,onViewChange:syncView,onStageChange:syncStage,onStageCameraChange:syncStageCamera});
    const restored=await scene.replayRobotActivity?.({actorId:session.actor.id,studentId:selected.id,home,robotActivity});if(own!==selection)return;
    if(restored?.home){home=restored.home;robotActivity=restored.robotActivity??null;}
    await scene.show(home,{robotActivity,actorId:session.actor.id});if(own!==selection)return;if(latestWallet)scene.setWallet?.(latestWallet);syncView(scene.getView());message('');$('home-tools').hidden=false;$('scene-hint').hidden=false;status(restored?.pending?"DisplayText4231, DisplayText3811.":"DisplayText4232 · DisplayText4233 / Outdoors, DisplayText4202.");}
  catch{if(own!==selection)return;message("DisplayText4234");status("DisplayText4235, DisplayText4236.",()=>drawHome(own));}
}
async function refreshWallet(own=selection,student=selected){
  if(!student||!session)return;const ownWallet=++walletRequest,actorId=session.actor.id;$('refresh-wallet').disabled=true;$('starter-note').textContent="DisplayText4237…";
  try{const result=await request(`/students/${student.id}/wallet/starter-grant`,{expectedUserId:actorId},'POST');if(own!==selection||ownWallet!==walletRequest)return;const wallet=result.wallet;
    if(wallet?.studentId!==student.id||wallet.currency!=='platform-points'||!Number.isSafeInteger(wallet.balance)||wallet.balance<0)throw new Error("DisplayText4238, DisplayText4239.");
    if(result.grant?.programId!=='student-starter-v1'||result.grant.amount!==50000||typeof result.duplicate!=='boolean')throw new Error("DisplayText4240, DisplayText0974.");
    if(result.baseline?.programId!=='student-starter-baseline-v2'||result.baseline.amount!==150000
      ||!Number.isSafeInteger(result.baseline.creditedAmount)||result.baseline.creditedAmount<150000)throw new Error("15 DisplayText4241, DisplayText0974.");
    latestWallet=wallet;scene?.setWallet?.(wallet);$('balance').textContent=wallet.balance.toLocaleString('en');$('balance').title="DisplayText4242 Learning Platform DisplayText4243";
    $('starter-note').textContent="DisplayText4244 150,000 · DisplayText4245, DisplayText4246";
  }catch(error){if(own===selection&&ownWallet===walletRequest){$('balance').textContent='—';$('balance').title=error.message;$('starter-note').textContent="DisplayText4247 · DisplayText4248";if(error.code==='identity_changed')await reloadIdentity();else errorStatus(error,()=>refreshWallet());}}
  finally{if(own===selection&&ownWallet===walletRequest)$('refresh-wallet').disabled=false;}
}
async function executeCommand(command,commandId,options={}){
  const bound=['setRobotActivity','setObjectState'].includes(command?.type)&&options.actorId&&options.studentId;
  const actorId=bound?options.actorId:session?.actor?.id,studentId=bound?options.studentId:selected?.id;
  if(session?.authenticated!==true||!actorId||actorId!==session.actor?.id||!students.some(row=>row.id===studentId))throw Object.assign(new Error("DisplayText4249, DisplayText4239."),{code:'identity_changed',status:409});
  if(!bound&&(!home||!selected||writing))throw new Error("DisplayText4250, DisplayText4016.");
  const expectedRevision=bound?options.expectedRevision:home.revision,own=selection;
  const active=()=>own===selection&&selected?.id===studentId&&session?.actor?.id===actorId;
  const lock=command?.type!=='setRobotActivity'&&active();
  if(lock){++walletRequest;$('refresh-wallet').disabled=true;busy(true);}
  try{const result=await request(`/students/${studentId}/home/commands`,{expectedUserId:actorId,expectedRevision,commandId,command,...command.type==='checkout'?{expectedCatalogVersion:CATALOG_VERSION}:{}},'POST',{keepalive:options.keepalive===true});
    if(!active()){if(bound)return result;throw new Error("DisplayText3783, DisplayText4239.");}
    home=result.home;robotActivity=result.robotActivity??null;
    if(result.wallet){latestWallet=result.wallet;$('balance').textContent=result.wallet.balance.toLocaleString('en');scene?.setWallet?.(result.wallet);}
    $('home-caption').textContent=`${home.house.floors.length} DisplayText4228 · ${home.commerce?.owned.filter(item=>item.status!=='sold').length??0} DisplayText4229 · DisplayText0006`;
    return result;
  }catch(error){
    if(error.code==='identity_changed'){if(active())await reloadIdentity();}
    else if(error.code==='catalog_changed'){if(active())status(error.message,()=>location.reload(),"DisplayText3805");}
    else if(error.status===409){
      const fresh=await request(`/students/${studentId}/home`);error.snapshot=fresh;
      if(active()&&fresh.home){home=fresh.home;robotActivity=fresh.robotActivity??null;
        if(!['setRobotActivity','setObjectState'].includes(command?.type))await scene.show(home,{robotActivity,actorId});}
    }
    throw error;
  }finally{if(lock&&active()){busy(false);$('refresh-wallet').disabled=false;}}
}
async function selectStudent(student){
  if(writing||changingStudent||session?.authenticated!==true||!session.actor?.id)return;
  student=students.find(item=>item.id===student?.id);if(!student)return;
  const leavingActor=session.actor.id;
  if(home&&scene?.prepareLeave){
    changingStudent=true;
    try{await scene.prepareLeave();}catch{status("DisplayText4231, DisplayText3811.");}
    finally{changingStudent=false;}
    if(session?.actor?.id!==leavingActor)return;
  }
  rememberStudent(student);
  contextMenu.close();selected=student;home=null;robotActivity=null;latestWallet=null;const own=++selection;++walletRequest;$('refresh-wallet').disabled=true;$('palette').hidden=true;$('welcome').hidden=true;$('home-tools').hidden=true;$('scene-hint').hidden=true;$('balance').textContent='—';$('balance').title='';$('starter-note').textContent="DisplayText4251 150,000 DisplayText0920";scene?.clear();
  $('home-title').textContent=`${student.displayName}DisplayText4252`;renderStudents();message("DisplayText4253…");status("DisplayText4254…");
  void loadStudentHomeScene().catch(()=>{});
  try{const result=await request(`/students/${student.id}/home`);if(own!==selection)return;home=result.home;robotActivity=result.robotActivity??null;await drawHome(own);}
  catch(error){if(own===selection){message("DisplayText4255");errorStatus(error,()=>selectStudent(student));}}
  if(own===selection)await refreshWallet(own,student);
}
async function claim(){if(!selected||home||writing||!session)return;const own=selection;busy(true);status("DisplayText4256…");
  try{const result=await request(`/students/${selected.id}/home/init`,{expectedUserId:session.actor.id},'POST');if(own!==selection)return;home=result.home;robotActivity=result.robotActivity??null;await drawHome(own);}
  catch(error){if(own===selection){if(error.code==='identity_changed')await reloadIdentity();else errorStatus(error,claim);}}finally{busy(false);}}
function openPalette(point){if(!home||!scene)return;contextMenu.close();$('palette').hidden=false;const b=$('stage').getBoundingClientRect(),panel=$('palette');
  panel.style.top=point?.y?`${Math.max(155,Math.min(b.height-panel.offsetHeight-70,point.y-b.top))}px`:'';
  panel.style.left=point?.x?`${Math.max(12,Math.min(b.width-panel.offsetWidth-12,point.x-b.left+12))}px`:'';panel.style.right=point?.x?'auto':'';
  $('palette-close').focus({preventScroll:true});}
async function changeColor(key,color){
  if(!home||writing||home.avatar.colors[key]===color)return;const own=selection,student=selected,previous=home.avatar.colors,next={...previous,[key]:color};busy(true);scene.palette(next);
  home={...home,avatar:{...home.avatar,colors:next}};syncPalette();status("DisplayText4257…");
  try{const result=await request(`/students/${student.id}/home/avatar`,{expectedUserId:session.actor.id,expectedRevision:home.revision,colors:next},'PATCH');if(own!==selection)return;home=result.home;robotActivity=result.robotActivity??null;await scene.show(home,{robotActivity,actorId:session.actor.id});if(own!==selection)return;scene.palette(home.avatar.colors);syncPalette();status("DisplayText4258, DisplayText4259.");}
  catch(error){if(own!==selection)return;
    if(error.code==='identity_changed'){await reloadIdentity();return;}
    // A timeout or failed acknowledgement may follow a successful atomic write.
    // Read the server before reporting whether the chosen color was saved.
    try{const result=await request(`/students/${student.id}/home`);if(own!==selection)return;
      if(!result.home)throw new Error("DisplayText4260.");home=result.home;robotActivity=result.robotActivity??null;await scene.show(home,{robotActivity,actorId:session.actor.id});if(own!==selection)return;scene.palette(home.avatar.colors);syncPalette();
      const confirmed=home.avatar.colors.shell===next.shell&&home.avatar.colors.accent===next.accent;
      status(confirmed?"DisplayText4258, DisplayText4261.":(error.status===409?"DisplayText4262, DisplayText4263.":"DisplayText4264, DisplayText4265."));
    }catch(readError){if(own!==selection)return;home={...home,avatar:{...home.avatar,colors:previous}};scene.palette(previous);syncPalette();readError.message+=" DisplayText4266, DisplayText4239.";errorStatus(readError,()=>selectStudent(student));}

  }finally{busy(false);}
}
for(const [key,colors]of[['shell',shellColors],['accent',accentColors]])for(const[label,color]of colors){const button=document.createElement('button');button.type='button';button.className='swatch';button.dataset[key]=color;button.style.setProperty('--color',color);button.setAttribute('aria-label',label);button.setAttribute('aria-pressed','false');const swatch=document.createElement('span');swatch.setAttribute('aria-hidden','true');button.append(swatch,document.createTextNode(label));button.addEventListener('click',()=>changeColor(key,color));$(key+'-colors').append(button);}
$('search').addEventListener('input',renderStudents);$('claim').addEventListener('click',claim);$('retry').addEventListener('click',()=>retryAction?.());$('refresh-wallet').addEventListener('click',()=>refreshWallet());
$('wardrobe-open').addEventListener('click',()=>{if(home&&!writing){$('palette').hidden=true;scene?.openWardrobe();}});
$('stage-camera-toggle').addEventListener('click',()=>{if(home&&!writing&&!stageCameraState.returning){const result=scene?.toggleStageCamera();if(result?.error)status(result.error);}});
$('palette-open').addEventListener('click',()=>openPalette());$('palette-close').addEventListener('click',()=>{$('palette').hidden=true;$('palette-open').focus();});$('stage-toggle').addEventListener('click',()=>{if(home&&!writing){$('palette').hidden=true;scene?.toggleStage();}});$('wave').addEventListener('click',()=>scene?.wave());$('reset-view').addEventListener('click',()=>scene?.reset());
for(const view of views)$('view-'+view).addEventListener('click',()=>{if(!home||writing)return;$('palette').hidden=true;scene?.setView(view);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('palette').hidden){$('palette').hidden=true;$('palette-open').focus();}});
addEventListener('pagehide',event=>{contextMenu.close();
  // Capture synchronously before clearing a renderer. The editor persists its
  // identity-bound outbox before attempting an unload-safe request.
  void scene?.prepareLeave?.({keepalive:true});
  if(!event.persisted){contextMenu.dispose();scene?.dispose();}
});
async function reloadIdentity(){
  contextMenu.close();++selection;++walletRequest;selected=null;home=null;robotActivity=null;session=null;students=[];scene?.clear();$('palette').hidden=true;$('welcome').hidden=true;$('home-tools').hidden=true;$('scene-hint').hidden=true;$('balance').textContent='—';$('starter-note').textContent="DisplayText4251 150,000 DisplayText0920";$('home-title').textContent="DisplayText4267?";$('refresh-wallet').disabled=true;renderStudents();message("DisplayText4268, DisplayText4269…");busy(false);await boot();
}

async function boot(){
  try{status("DisplayText4270…");session=await request('/session');if(session.authenticated!==true||!session.actor?.id)throw new Error("DisplayText4271, DisplayText4272.");$('login').hidden=true;$('teacher').textContent=`${session.actor.displayName||"DisplayText4274"} · DisplayText4273`;
    const result=await request('/students');students=result.students;$('search').disabled=false;renderStudents();status(students.length?"DisplayText4275, DisplayText4276.":"DisplayText4277, DisplayText4278.",students.length?null:boot);
    const previous=rememberedStudent();if(previous||students.length===1)await selectStudent(previous??students[0]);
  }catch(error){$('teacher').textContent="DisplayText4279";$('roster-note').textContent="DisplayText4280";errorStatus(error,error.status===401?null:boot);}
}
boot();
