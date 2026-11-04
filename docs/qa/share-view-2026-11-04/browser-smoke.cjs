// Playwright CLI function. Start the standalone preview on loopback port 19631,
// open a fresh about:blank browser, then run this file with run-code --filename.
// The preview uses bundled Three.js only. Playwright is an optional QA tool.
async (page) => {
  const ensure=(condition,message)=>{if(!condition)throw new Error(message);};
  const audit={consoleErrors:[],pageErrors:[],httpErrors:[],requestFailures:[],requests:[],steps:[]};
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({colorScheme:'light'});
  page.on('console',message=>{if(message.type()==='error')audit.consoleErrors.push(message.text());});
  page.on('pageerror',error=>audit.pageErrors.push(error.message));
  page.on('requestfailed',request=>audit.requestFailures.push({path:new URL(request.url()).pathname,error:request.failure()?.errorText}));
  page.on('response',response=>{if(response.status()>=400)audit.httpErrors.push({path:new URL(response.url()).pathname,status:response.status()});});
  page.on('request',request=>audit.requests.push({path:new URL(request.url()).pathname,method:request.method()}));
  await page.addInitScript(()=>{
    window.__shareWriteAudit={storage:[],cookies:[],indexedDB:[],beacons:[]};
    const wrap=(prototype,key,bucket)=>{if(!prototype||typeof prototype[key]!=='function')return;const original=prototype[key];prototype[key]=function(...args){window.__shareWriteAudit[bucket].push({method:key,key:typeof args[0]==='string'?args[0]:null});return original.apply(this,args);};};
    for(const key of ['setItem','removeItem','clear'])wrap(Storage.prototype,key,'storage');
    for(const key of ['add','put','delete','clear'])wrap(globalThis.IDBObjectStore?.prototype,key,'indexedDB');
    wrap(Navigator.prototype,'sendBeacon','beacons');
    const cookie=Object.getOwnPropertyDescriptor(Document.prototype,'cookie');if(cookie?.set)Object.defineProperty(Document.prototype,'cookie',{...cookie,set(value){window.__shareWriteAudit.cookies.push('cookie');return cookie.set.call(this,value);}});
  });
  const unlocked=()=>page.waitForFunction(()=>document.querySelector('#share-loading')?.hidden&&document.querySelector('.share-view-ui')?.dataset.locked==='false',null,{timeout:60000});
  const record=async(state)=>{
    await unlocked();
    const observed=await page.evaluate(()=>({title:document.title,badge:document.querySelector('.share-view-badge')?.textContent,hint:document.querySelector('.share-view-hint')?.textContent,trail:[...document.querySelectorAll('.share-view-crumbs button')].map(node=>node.textContent),controls:[...document.querySelectorAll('.share-view-actions button')].map(node=>node.textContent),roomLabels:[...document.querySelectorAll('.share-view-labels span.share-view-label')].map(node=>({tag:node.tagName,text:node.textContent,pointerEvents:getComputedStyle(node).pointerEvents,tabindex:node.getAttribute('tabindex')}))}));
    ensure(observed.title==='Sample Learner Home','Readable fictional title must be preserved');
    ensure(observed.badge==='Read-only view','Read-only badge must stay visible');
    audit.steps.push({state,...observed});
    await page.locator('body').ariaSnapshot();
    return observed;
  };
  await page.goto('http://127.0.0.1:19631/games/homeworld/home-share.html?sample=1');
  const overview=await record('ORBIT');
  ensure(overview.controls.includes('Explode house'),'Overview must expose exterior house navigation');
  await page.screenshot({path:'output/playwright/overview.png',fullPage:true});
  await page.getByRole('button',{name:'Outdoor features',exact:true}).click({noWaitAfter:true,timeout:60000});
  const spot=await record('SPOT');ensure(spot.hint==='Drag to look around','Spot remains an exterior orbit');
  await page.getByRole('button',{name:'Back to overview',exact:true}).click({noWaitAfter:true,timeout:60000});
  await record('ORBIT');
  await page.getByRole('button',{name:'Explode house',exact:true}).click({noWaitAfter:true,timeout:60000});
  const exploded=await record('EXPLODED');ensure(exploded.hint==='Choose a floor','Exploded view must offer floors');
  await page.locator('.share-view-actions').getByRole('button',{name:'2F',exact:true}).click({noWaitAfter:true,timeout:60000});
  const focus=await record('FOCUS');ensure(focus.hint==='Drag to look around this floor','Focus remains outside the selected floor');
  ensure(focus.roomLabels.length>0,'Focused floor must have actual room labels');
  ensure(focus.roomLabels.every(label=>label.tag==='SPAN'&&label.pointerEvents==='none'&&label.tabindex===null),'Room labels must be passive');
  const passiveLabel=page.locator('.share-view-labels span.share-view-label').filter({visible:true}).first();
  const box=await passiveLabel.boundingBox();ensure(!!box,'A passive room label must be visible');
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await page.keyboard.press('w');await page.keyboard.press('ArrowUp');
  const after=await record('FOCUS_AFTER_ROOM_CLICK_AND_MOVEMENT_KEYS');
  ensure(after.hint==='Drag to look around this floor','Room clicks and movement keys cannot enter first person');
  ensure(after.controls.every(label=>!['Take elevator','Exit elevator','Enter room'].includes(label)),'No room or transport controls may appear');
  await page.screenshot({path:'output/playwright/focus.png',fullPage:true});
  const browser=await page.evaluate(()=>{
    const canvas=document.querySelector('#share-stage canvas'),gl=canvas?.getContext('webgl2'),extension=gl?.getExtension('WEBGL_debug_renderer_info');
    return{userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},webgl2:!!gl,webglRenderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):null,webglError:gl?.getError(),description:document.getElementById('share-meta-description')?.content,storageWrites:window.__shareWriteAudit,localStorageKeys:Object.keys(localStorage),sessionStorageKeys:Object.keys(sessionStorage)};
  });
  ensure(browser.webgl2&&browser.webglError===0,'Actual WebGL2 render must remain healthy');
  ensure(Object.values(browser.storageWrites).every(writes=>writes.length===0),'Share viewing must not write client state');
  ensure(browser.localStorageKeys.length===0&&browser.sessionStorageKeys.length===0,'Fresh browser storage must stay empty');
  const nonReadRequests=audit.requests.filter(request=>!['GET','HEAD'].includes(request.method));
  const accountRequests=audit.requests.filter(request=>request.path.includes('/api/'));
  ensure(nonReadRequests.length===0&&accountRequests.length===0,'Standalone viewing cannot call account or write APIs');
  ensure([audit.consoleErrors,audit.pageErrors,audit.httpErrors,audit.requestFailures].every(errors=>errors.length===0),'Browser smoke must finish without errors');
  return{status:'pass',scope:'Fresh desktop browser; fictional bundled snapshot; exterior share-view navigation only',preview:{npmRequired:false,nodeModulesPresent:false,vendor:'Three.js 0.186.1 bundled runtime'},browser,statesVisited:['ORBIT','SPOT','EXPLODED','FOCUS'],roomLabelPassivityVerified:true,firstPersonEntryObserved:false,nonReadRequests,accountRequests,consoleErrors:audit.consoleErrors,pageErrors:audit.pageErrors,httpErrors:audit.httpErrors,requestFailures:audit.requestFailures,requestCount:audit.requests.length,steps:audit.steps,artifacts:['overview.png','focus.png'],limits:['Desktop loopback preview only; no physical mobile or real WeChat share action was tested.']};
}
