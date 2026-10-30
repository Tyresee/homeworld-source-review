import {createLookDevRuntime} from '/qa/look-dev-runtime.mjs';
import {LOOK_DEV_VIEWS} from '/qa/look-dev-fixtures.mjs';
import {ROOM_KINDS} from '/js/home-layout.js';
import {FLOOR_FINISHES,getFloorFinish} from '/js/home-floor-finishes.js';
import {WALL_STYLES,WALL_COLORS,getWallStyle,getWallColor} from '/js/home-wall-finishes.js';
import {paintLookDevBackdrop} from '/qa/look-dev-backdrop.mjs';
import {zipFiles} from '/qa/look-dev-zip.mjs';
import {assertSafePresetKeys,MAX_LOOK_DEV_PRESET_BYTES} from '/qa/look-dev-preset-safety.mjs';

const $=id=>document.getElementById(id);
const views=LOOK_DEV_VIEWS.map(view=>[view.id,view.tabLabel??view.label]);
$('capture-all').textContent='All '+views.length+' PNGs · ZIP';
const rooms=[['living','Living'],['bedroom','Bedroom'],['study','Study'],['kitchen','Kitchen'],['playroom','Playroom'],['bathroom','Bathroom'],['gallery','Gallery'],['sunroom','Sunroom'],['hallway','Hallway']];
const materials=[['','Inherit actual material'],['oak','Oak'],['walnut','Walnut'],['stone','Stone'],['marble','Marble'],['ceramic','Ceramic'],['linen','Linen'],['wool','Wool'],['velvet','Velvet']];
const filename=/^[a-z0-9][a-z0-9-]{0,63}\.json$/;
const hex=/^#[\da-f]{6}$/i;
const clone=value=>structuredClone(value);
const get=(value,path)=>path.reduce((result,key)=>result?.[key],value);
function put(path,value){let target=preset;for(const key of path.slice(0,-1))target=target[key]??={};target[path.at(-1)]=value;queueApply();}
function node(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
function status(message,error=false){$('status').textContent=message;$('status').dataset.error=String(error);}
let preset,loadedPreset,runtime,roomId='living',renderRoomControlsView=()=>{},activeView='living',pendingPreset,pendingView,applyNotice=null,applying=false,applyPromise=Promise.resolve(),capturing=false,dirty=false,sourceCanvas;
const query=new URLSearchParams(location.search);
if(views.some(([id])=>id===query.get('view')))activeView=query.get('view');
if(rooms.some(([id])=>id===activeView))roomId=activeView;
const context=$('preview-canvas').getContext('2d');
function displayFrame(canvas){sourceCanvas=canvas;context.clearRect(0,0,1440,900);paintLookDevBackdrop(context,1440,900,preset?.backdrop);context.drawImage(canvas,0,0,1440,900);}
function resizePreview(){const area=$('preview-area'),scale=Math.min(1,Math.max(1,area.clientWidth-40)/1440,Math.max(1,area.clientHeight-40)/900);$('stage-shell').style.width=1440*scale+'px';$('stage-shell').style.height=900*scale+'px';$('preview-scale').textContent='Preview '+Math.round(scale*100)+'% · capture stays 1440 × 900';}
new ResizeObserver(resizePreview).observe($('preview-area'));
function snapshot(){if(!runtime)return;const value=runtime.getSnapshot();$('snapshot').textContent=JSON.stringify(value,null,2);$('render-ready').textContent=(value.ready===false?'Rendering…':'Ready')+' · '+activeView;$('capture-all').disabled=$('capture-view').disabled=value.ready===false||capturing;const items=$('fixture-items');if(items)items.textContent=(value.items??[]).map(item=>item.id+' · '+item.kind+'\n  '+(item.defaultColor??'inherited')+' / '+(item.defaultMaterial??'inherited')).join('\n');}
function queueApply(){dirty=true;$('preset-name').textContent=preset.label+' *';pendingPreset=clone(preset);void drain();}
function queueView(value){pendingView=value;void drain();}
function drain(){
  if(applying||!runtime)return applyPromise;
  applying=true;
  applyPromise=(async()=>{
    try{
      while(pendingPreset||pendingView){
        if(pendingPreset){const next=pendingPreset;pendingPreset=null;await runtime.setPreset(next);}
        if(pendingView){const next=pendingView;pendingView=null;await runtime.setFixture(next);activeView=next;if(rooms.some(([id])=>id===next)){roomId=next;renderRoomControlsView();}renderViews();}
      }
      snapshot();status(applyNotice??(dirty?'Candidate updated in memory. Export JSON to keep it.':'Preset loaded. No account or home data is read or written.'));applyNotice=null;
    }catch(error){status(error.message||String(error),true);}
    finally{applying=false;if(pendingPreset||pendingView)void drain();}
  })();return applyPromise;
}
function fieldLabel(text,optional=false){const line=node('div','control-label'),label=node('span','',text);line.append(label);if(optional){const toggle=node('label','inherit-label'),check=document.createElement('input');check.type='checkbox';toggle.append(check,document.createTextNode('Inherit'));line.append(toggle);return {line,check};}return {line};}
function colorControl(parent,label,path,{fallback='#808080',inherit=true}={}){
  const row=node('div','control-row'),heading=fieldLabel(label,inherit),controls=node('div','color-controls'),color=document.createElement('input'),text=document.createElement('input');color.type='color';text.type='text';text.setAttribute('aria-label',label+' hex color');color.setAttribute('aria-label',label+' color');text.spellcheck=false;text.maxLength=7;
  const value=get(preset,path),initial=hex.test(value??'')?value:fallback;color.value=text.value=initial;
  if(heading.check){heading.check.checked=value==null;color.disabled=text.disabled=heading.check.checked;if(heading.check.checked)text.value='Inherited (per part)';heading.check.addEventListener('change',()=>{color.disabled=text.disabled=heading.check.checked;text.value=heading.check.checked?'Inherited (per part)':color.value;text.setCustomValidity('');put(path,heading.check.checked?null:color.value);});}
  color.addEventListener('input',()=>{text.value=color.value;put(path,color.value);});
  text.addEventListener('input',()=>{text.setCustomValidity(hex.test(text.value)?'':'Use a six-digit hex color');if(hex.test(text.value)){color.value=text.value;put(path,text.value);}});
  text.addEventListener('blur',()=>{if(!hex.test(text.value)){text.value=color.value;text.setCustomValidity('');}});
  controls.append(color,text);row.append(heading.line,controls);parent.append(row);return row;
}
function numberControl(parent,label,path,{min=0,max=5,step=.05,fallback=0,inherit=false,unit=''}={}){
  const row=node('div','control-row'),heading=fieldLabel(label,inherit),controls=node('div','number-controls'),range=document.createElement('input'),number=document.createElement('input');range.type='range';number.type='number';range.min=number.min=min;range.max=number.max=max;range.step=number.step=step;
  const current=get(preset,path);range.value=number.value=Number.isFinite(current)?current:fallback;
  number.setAttribute('aria-label',label+(unit?' ('+unit+')':''));range.setAttribute('aria-label',label+' slider');
  if(heading.check){heading.check.checked=current==null;range.disabled=number.disabled=heading.check.checked;heading.check.addEventListener('change',()=>{range.disabled=number.disabled=heading.check.checked;put(path,heading.check.checked?null:Number(number.value));});}
  const update=(from,to)=>{const value=Number(from.value);if(Number.isFinite(value)&&value>=min&&value<=max){to.value=value;put(path,value);}};
  range.addEventListener('input',()=>update(range,number));number.addEventListener('input',()=>update(number,range));controls.append(range,number);row.append(heading.line,controls);parent.append(row);
}
function selectControl(parent,label,path,options){const row=node('label','control-row'),title=node('span','control-label',label),select=document.createElement('select');for(const[value,text]of options){const option=new Option(text,value);select.append(option);}select.value=get(preset,path)??'';select.addEventListener('change',()=>put(path,select.value||null));row.append(title,select);parent.append(row);return select;}
function floorFinishControl(parent,path){
  const row=node('label','control-row'),title=node('span','control-label','Floor material / finish'),select=document.createElement('select');
  for(const[value,text]of materials)select.append(new Option(text,value));
  for(const group of ['wood','tile']){
    const section=document.createElement('optgroup');section.label=group==='wood'?'Wood finishes · 6':'Tile finishes · 8';
    for(const finish of FLOOR_FINISHES.filter(finish=>finish.group===group))section.append(new Option(finish.id.split('-').slice(1).join(' ').replace(/\b[a-z]/g,letter=>letter.toUpperCase()),'finish:'+finish.id));
    select.append(section);
  }
  const role=get(preset,path),finish=getFloorFinish(role?.floorFinishId);select.value=finish?'finish:'+finish.id:role?.floorMaterial??'';
  select.addEventListener('change',()=>{
    const role=get(preset,path),finish=select.value.startsWith('finish:')?getFloorFinish(select.value.slice(7)):null;
    role.floorFinishId=finish?.id??null;role.floorMaterial=finish?null:select.value||null;
    if(finish&&preset.build.theme.id!=='warm'){preset.build.theme.id='warm';applyNotice='Warm floor candidate enabled. Your other room and lighting edits are preserved.';}
    queueApply();renderRoomControlsView();
  });
  row.append(title,select);parent.append(row);
}
const wallStyleLabels={'wall-plain':'Plain paint','wall-stripe-fine':'Fine vertical stripes','wall-dots':'Dot pattern'};
const wallColorLabels={'wall-warm-white':'Warm white','wall-apricot':'Apricot','wall-mist-blue':'Mist blue','wall-lavender':'Lavender','wall-slate-blue':'Slate blue'};
function wallFinishControls(parent,path){
  const role=get(preset,path),styleRow=node('label','control-row'),colorRow=node('label','control-row'),style=document.createElement('select'),color=document.createElement('select');
  style.append(new Option('Default wall style / inherit',''));
  for(const item of WALL_STYLES)style.append(new Option(wallStyleLabels[item.id]??item.id,item.id));
  color.append(new Option('Custom / inherited wall color',''));
  for(const item of WALL_COLORS)color.append(new Option((wallColorLabels[item.id]??item.id)+' · '+item.color,item.id));
  style.value=getWallStyle(role?.wallStyleId)?.id??'';color.value=getWallColor(role?.wallColorId)?.id??'';
  const update=(key,value)=>{
    get(preset,path)[key]=value||null;
    if(value&&preset.build.theme.id!=='warm'){preset.build.theme.id='warm';applyNotice='Warm wall candidate enabled. Your floor, room and lighting edits are preserved.';}
    queueApply();renderRoomControlsView();
  };
  style.setAttribute('aria-label','Wall style');color.setAttribute('aria-label','Wall color');
  style.addEventListener('change',()=>update('wallStyleId',style.value));color.addEventListener('change',()=>update('wallColorId',color.value));
  styleRow.append(node('span','control-label','Wall style'),style);colorRow.append(node('span','control-label','Wall color'),color);parent.append(styleRow,colorRow);
}
function section(title,note,open=false){const details=node('details','control-section');details.open=open;details.append(node('summary','',title));const body=node('div','section-body');if(note)body.append(node('p','section-note',note));details.append(body);$('controls').append(details);return body;}
const subtitle=(parent,text)=>parent.append(node('h3','control-subtitle',text));
function renderControls(){
  $('controls').replaceChildren();$('preset-name').textContent=preset.label+(dirty?' *':'');
  const rendering=section('Rendering & lighting','The source canvas and all downloaded PNGs stay at exactly 1440 × 900.',true);
  selectControl(rendering,'Tone mapping',['render','toneMapping'],[['aces','ACES Filmic'],['neutral','Neutral'],['agx','AgX']]);
  numberControl(rendering,'Exposure',['render','exposure'],{min:0,max:3,step:.01,fallback:1.1});
  subtitle(rendering,'HEMISPHERE');
  colorControl(rendering,'Sky',['render','hemisphere','sky'],{fallback:'#fff8e6',inherit:false});
  colorControl(rendering,'Ground',['render','hemisphere','ground'],{fallback:'#9daa98',inherit:false});
  numberControl(rendering,'Intensity',['render','hemisphere','intensity'],{min:0,max:6,step:.05,fallback:2.1});
  subtitle(rendering,'MAIN LIGHT');
  colorControl(rendering,'Color',['render','sun','color'],{fallback:'#fff4d9',inherit:false});
  numberControl(rendering,'Intensity',['render','sun','intensity'],{min:0,max:10,step:.05,fallback:3.4});
  numberControl(rendering,'Azimuth',['render','sun','azimuth'],{min:-180,max:180,step:.1,fallback:26.565,inherit:true,unit:'degrees'});
  numberControl(rendering,'Altitude',['render','sun','altitude'],{min:5,max:90,step:.1,fallback:50.02,inherit:true,unit:'degrees'});
  subtitle(rendering,'FILL & SHADOW');
  colorControl(rendering,'Fill color',['render','fill','color'],{fallback:'#dceceb',inherit:false});
  numberControl(rendering,'Fill intensity',['render','fill','intensity'],{min:0,max:5,step:.05,fallback:1});
  numberControl(rendering,'Shadow radius',['render','shadowRadius'],{min:0,max:10,step:.1,fallback:4});
  const roomSection=section('Room finishes','Warm finishes use independent wall style and color choices plus catalogue floors. Default and Toy retain their original material controls.',true),tabs=node('div','room-tabs'),roomControls=node('div','room-controls');roomSection.append(tabs,roomControls);
  for(const[id,label]of rooms){const button=node('button','',label);button.type='button';button.setAttribute('aria-pressed',String(id===roomId));button.addEventListener('click',()=>{roomId=id;renderRoomControls();});tabs.append(button);}
  function renderRoomControls(){
    [...tabs.children].forEach((button,index)=>button.setAttribute('aria-pressed',String(rooms[index][0]===roomId)));roomControls.replaceChildren();
    const kind=ROOM_KINDS.find(kind=>kind.id===roomId),path=['build','theme','rooms',roomId];
    wallFinishControls(roomControls,path);
    const wallColor=colorControl(roomControls,'Custom wall color',[...path,'wall'],{fallback:kind.wall}),wallFinishColor=getWallColor(get(preset,[...path,'wallColorId']));
    if(wallFinishColor){
      wallColor.classList.add('is-finish-controlled');wallColor.title='Choose Custom / inherited wall color to edit a custom hex color.';
      for(const input of wallColor.querySelectorAll('input')){input.disabled=true;if(input.type==='color'||input.type==='text')input.value=wallFinishColor.color;}
    }
    const legacyMaterial=selectControl(roomControls,'Wall material (legacy baseline only)',[...path,'wallMaterial'],materials),warmWall=preset.build.theme.id==='warm';
    legacyMaterial.disabled=warmWall;legacyMaterial.title=warmWall?'Warm uses its real wall-style texture. Legacy materials are available in Default or Toy presets.':'';
    roomControls.append(node('p','section-note',warmWall?'Wall style and color are independent. Choose Custom / inherited wall color to edit a hex tint. Warm uses wall-style textures; legacy materials remain available with Default or Toy presets.':'Wall finish choices enable Warm. Custom color and legacy material continue to preview the original baseline.'));
    const floorColor=colorControl(roomControls,'Floor color',[...path,'floor'],{fallback:kind.floor}),finish=getFloorFinish(get(preset,[...path,'floorFinishId']));
    if(finish){
      floorColor.classList.add('is-finish-controlled');floorColor.title='Color is included in the selected finish.';
      for(const input of floorColor.querySelectorAll('input')){input.disabled=true;if(input.type==='color'||input.type==='text')input.value=finish.color;}
    }
    floorFinishControl(roomControls,path);
    roomControls.append(node('p','section-note',finish?'This finish includes its own color and texture. Choose a legacy material or Inherit to edit Floor color.':'Finish presets include color and texture. Legacy materials remain available for custom-color experiments.'));
    colorControl(roomControls,'Room trim',[...path,'trim'],{fallback:'#e6c49e'});
  }
  renderRoomControlsView=renderRoomControls;renderRoomControls();
  const shell=section('Architecture & backdrop','Original trim, plinth and frames have several local defaults. Inherit keeps every original value; it does not collapse them into one color.');
  subtitle(shell,'INTERIOR SHELL');
  for(const[key,label,fallback]of[['trim','Trim','#e6c49e'],['plinth','Plinth','#d0bb9b'],['frame','Window frame','#f8efdc'],['glass','Glass','#c5e0db'],['wallCap','Wall cap','#e6c49e']])colorControl(shell,label,['build','theme','shell',key],{fallback});
  subtitle(shell,'EXTERIOR FACADE');
  for(const[key,label,fallback]of[['wall','Exterior wall','#f4f0e6'],['trim','Exterior trim','#f3dca7'],['base','Exterior base','#98714c'],['wood','Exterior wood','#8f5839'],['glass','Exterior glass','#426f77']])colorControl(shell,label,['build','theme','manor',key],{fallback});
  subtitle(shell,'BACKDROP');
  colorControl(shell,'Inner color',['backdrop','inner'],{fallback:'#fcf7df',inherit:false});colorControl(shell,'Outer color',['backdrop','outer'],{fallback:'#e5edce',inherit:false});
  const furniture=section('Furniture color policy',"Default uses each real product's own color and material. Examples only changes this isolated fixture; it never creates a product or a student color.");
  selectControl(furniture,'Palette mode',['build','furniture','mode'],[['default','Product defaults'],['examples','Explicit examples']]);
  const examples=document.createElement('textarea');examples.id='furniture-examples';examples.className='examples-editor';examples.setAttribute('aria-label','Furniture example overrides JSON');examples.value=JSON.stringify(preset.build.furniture?.examples??{},null,2);examples.spellcheck=false;furniture.append(examples);
  const actions=node('div','example-actions'),apply=node('button','','Apply example JSON'),clear=node('button','','Clear examples');apply.type=clear.type='button';apply.addEventListener('click',()=>{try{const value=JSON.parse(examples.value);if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('Examples must be a JSON object keyed by item ID or kind.');for(const[key,patch]of Object.entries(value)){if(!key||['__proto__','constructor','prototype'].includes(key))throw new Error('Invalid example key');const color=typeof patch==='string'?patch:patch?.color;if(color!==undefined&&!hex.test(color))throw new Error('Example colors must use #rrggbb.');if(typeof patch!=='string'&&(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!['color','material'].includes(key))))throw new Error('An example may only include color and material.');if(patch?.material&&!materials.some(([id])=>id===patch.material))throw new Error('Unknown example material');}put(['build','furniture','examples'],value);status('Example table updated. Choose Explicit examples to preview it.');}catch(error){status(error.message,true);}});
  clear.addEventListener('click',()=>{examples.value='{}';put(['build','furniture','examples'],{});});actions.append(apply,clear);furniture.append(actions,node('pre','fixture-items'));furniture.querySelector('.fixture-items').id='fixture-items';
  subtitle(furniture,'CURRENT FIXTURE ITEMS');snapshot();
}
function renderViews(){const tabs=$('fixture-tabs');tabs.replaceChildren();for(const[id,label]of views){const button=node('button','',label);button.type='button';button.setAttribute('aria-pressed',String(activeView===id));button.addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('view',id);history.replaceState(null,'',url);queueView(id);});tabs.append(button);}}
function checkedPreset(value){
  assertSafePresetKeys(value);
  if(!value||typeof value!=='object'||Array.isArray(value)||value.schemaVersion!==1||!value.build?.theme||!value.render||!value.backdrop)throw new Error('Expected a schemaVersion 1 look-development preset.');
  if(typeof value.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value.id))throw new Error('Preset ID must use lowercase letters, numbers and hyphens.');
  if(typeof value.label!=='string'||!value.label.trim())throw new Error('Preset label is required.');
  if(!['aces','neutral','agx'].includes(value.render.toneMapping))throw new Error('Unsupported tone mapping.');
  value=clone(value);value.build.theme.rooms??={};value.build.theme.shell??={};value.build.furniture??={mode:'default',examples:{}};
  for(const[id]of rooms)value.build.theme.rooms[id]??={};
  return value;
}
async function loadPreset(name){
  if(!filename.test(name))throw new Error('Preset name must be a simple whitelisted JSON file name.');
  const response=await fetch('/presets/'+encodeURIComponent(name),{cache:'no-store'});if(!response.ok)throw new Error('Preset could not be loaded: '+name);
  const value=checkedPreset(await response.json());preset=value;loadedPreset=clone(value);dirty=false;renderControls();$('preset-select').value=name;
  const url=new URL(location.href);url.searchParams.set('preset',name);history.replaceState(null,'',url);
  if(runtime){pendingPreset=clone(preset);await drain();}
}
function download(bytes,name,type){const blob=bytes instanceof Blob?bytes:new Blob([bytes],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function capture(all){
  if(!runtime||capturing)return;capturing=true;$('capture-all').disabled=$('capture-view').disabled=true;$('controls').inert=true;
  try{
    await drain();const ids=all?views.map(([id])=>id):[activeView],files=[];
    for(let index=0;index<ids.length;index++){status('Capturing '+(index+1)+' / '+ids.length+' · '+ids[index]+' · 1440 × 900…');const image=await runtime.captureView(ids[index]);if(!(image instanceof Blob))throw new Error('The runtime did not return a PNG Blob.');files.push({name:preset.id+'--'+ids[index]+'.png',bytes:new Uint8Array(await image.arrayBuffer())});}
    if(all){download(zipFiles(files),preset.id+'--all-'+ids.length+'-views.zip');status('Downloaded one ZIP containing all '+ids.length+' named PNGs at 1440 × 900.');}
    else{download(files[0].bytes,files[0].name,'image/png');status('Downloaded '+files[0].name+' at 1440 × 900.');}
  }catch(error){status('Capture failed: '+error.message,true);}
  finally{capturing=false;$('controls').inert=false;snapshot();}
}
$('capture-all').addEventListener('click',()=>capture(true));$('capture-view').addEventListener('click',()=>capture(false));
$('grayscale').addEventListener('change',()=>document.body.classList.toggle('is-gray',$('grayscale').checked));
$('preset-select').addEventListener('change',()=>loadPreset($('preset-select').value).catch(error=>status(error.message,true)));
$('reset-preset').addEventListener('click',()=>{preset=clone(loadedPreset);dirty=false;renderControls();pendingPreset=clone(preset);void drain();});
$('export-preset').addEventListener('click',()=>download(JSON.stringify(preset,null,2)+'\n',preset.id+'.json','application/json'));
$('import-preset').addEventListener('click',()=>$('preset-file').click());
$('preset-file').addEventListener('change',async()=>{const file=$('preset-file').files?.[0];if(!file)return;try{if(file.size>MAX_LOOK_DEV_PRESET_BYTES)throw new Error('Preset exceeds the 1 MB review limit.');preset=checkedPreset(JSON.parse(await file.text()));loadedPreset=clone(preset);dirty=false;$('preset-select').querySelector('option[value="@imported"]')?.remove();const importedOption=new Option('Imported: '+preset.label,'@imported',true,true);importedOption.disabled=true;$('preset-select').append(importedOption);renderControls();pendingPreset=clone(preset);await drain();status('Imported '+file.name+' into memory. No file was written to the server.');}catch(error){status(error.message,true);}finally{$('preset-file').value='';}});
async function boot(){
  let name=query.get('preset')??'default.json';
  try{
    try{await loadPreset(name);}catch(error){if(name==='default.json')throw error;status(error.message+' Loading shipped default instead.',true);name='default.json';await loadPreset(name);}
    renderViews();resizePreview();
    runtime=await createLookDevRuntime({container:$('scene-canvas'),preset:clone(preset),fixtureId:activeView,onFrame:displayFrame,onStatus:message=>status(typeof message==='string'?message:message?.message??'Rendering…'),onReady:snapshot});
    snapshot();status('Ready. Same real builders, isolated fixtures, no account writes.');
  }catch(error){status('Workstation could not start: '+error.message,true);$('render-ready').textContent='Not ready';console.error(error);}
}
addEventListener('pagehide',()=>runtime?.dispose());
boot();
