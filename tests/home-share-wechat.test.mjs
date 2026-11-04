import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeWeChatSharing} from '../public/js/home-share-wechat.js';

const TOKEN='A'.repeat(43);
const PAGE='https://platform.example.invalid/games/homeworld/home-share.html';
const LINK=`${PAGE}?share=${TOKEN}`;
const APIs=['updateAppMessageShareData','updateTimelineShareData'];
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const payload=()=>({enabled:true,config:{appId:'public-app',timestamp:12345,nonceStr:'public-nonce',signature:'public-signature'},share:{title:"My Little World · Home Showcase | Learning Studio",desc:"Explore a little world built through learning and steady progress.",link:LINK,imgUrl:'https://platform.example.invalid/games/homeworld/assets/home-share/share-bunny-v2.jpg'}});
function fixture({href=LINK,ua='Mozilla/5.0 MicroMessenger/8.0',response=payload(),installed=true,scriptOutcomes=[],apiBehavior,configBehavior,fetchBehavior,metaTitle,metaDescription}={}) {
  const calls=[],requests=[],scripts=[],removed=[],events=[];
  let readyCallback,errorCallback;
  const sdk={
    ready(fn){events.push('ready-register');readyCallback=fn;},
    error(fn){events.push('error-register');errorCallback=fn;},
    config(config){events.push('config');calls.push({name:'config',config});configBehavior?.(sdk);},
  };
  for(const name of APIs)sdk[name]=options=>{calls.push({name,options});return apiBehavior?.(name,options);};
  const window={navigator:{userAgent:ua},location:{href},AbortController,...installed?{wx:sdk}:{}};
  const metadata=new Map();
  for(const [id,content] of [['share-meta-title',metaTitle],['share-meta-description',metaDescription]])if(content!==undefined)metadata.set(id,{content,getAttribute(name){return name==='content'?this.content:null;}});
  const document={
    getElementById(id){return metadata.get(id)??null;},
    createElement(tag){assert.equal(tag,'script');return{remove(){removed.push(this.src);}};},
    head:{appendChild(script){scripts.push(script);const outcome=scriptOutcomes[scripts.length-1]??'fail';queueMicrotask(()=>{
      if(outcome==='success'){window.wx=sdk;script.onload?.();}
      else if(outcome==='invalid'){window.wx={};script.onload?.();}
      else if(outcome==='fail')script.onerror?.();
    });}},
  };
  const fetchImpl=async(url,options)=>{requests.push({url,options});return fetchBehavior?fetchBehavior(url,options):{ok:true,json:async()=>response};};
  const options={window,document,fetchImpl,timeoutMs:5000,configTimeoutMs:5000,readyTimeoutMs:5000,callbackTimeoutMs:5000};
  return{window,document,metadata,sdk,options,calls,events,requests,scripts,removed,init:extra=>initializeWeChatSharing({...options,...extra}),ready:()=>readyCallback?.(),error:value=>errorCallback?.(value),shareCalls:()=>calls.filter(value=>APIs.includes(value.name))};
}
async function configured(f){const pending=f.init();for(let i=0;i<8&&!f.calls.length;i++)await turn();assert.equal(f.calls[0]?.name,'config');return{pending};}

test('ordinary browsers leave the page independent and make no SDK or config request',async()=>{
  const f=fixture({ua:'Mozilla/5.0 Chrome/131',metaTitle:"Sam Home",metaDescription:"Sam's home, built in English class. Take a look."});assert.equal(await f.init(),false);assert.equal(f.requests.length,0);assert.equal(f.scripts.length,0);
});

test('only an unambiguous public snapshot at the exact host and path can initialize',async()=>{
  for(const href of[PAGE,PAGE+'?sample=1',LINK+'&sample=1',LINK+'&share='+TOKEN,PAGE+'?share=private',LINK.replace('https:','http:'),LINK.replace('platform.example.invalid','evil.example'),LINK.replace('/home-share.html','/student-homes.html'),LINK.replace('https://','https://user@')]){
    const f=fixture({href});assert.equal(await f.init(),false,href);assert.equal(f.requests.length,0);assert.equal(f.scripts.length,0);
  }
});

test('signing preserves original query order, encoding and duplicate unrelated parameters and removes only hash',async()=>{
  const href=PAGE+'?ref=%2f%2F&share='+TOKEN+'&ref=a%20b&x=%2526#view';
  const f=fixture({href});const{pending}=await configured(f);assert.equal(f.requests[0].url,'/api/wechat/home-share-config');
  assert.deepEqual(JSON.parse(f.requests[0].options.body),{url:href.split('#')[0]});
  assert.equal(f.requests[0].options.method,'POST');assert.equal(f.requests[0].options.credentials,'same-origin');assert.equal(f.requests[0].options.headers['Content-Type'],'application/json');
  f.ready();for(const call of f.shareCalls()){assert.equal(call.options.link,LINK);call.options.success();}
  assert.equal(await pending,true);
});


test('the legacy fixed signing payload configures named SDK copy from the frozen server-rendered title',async()=>{
  const response=payload(),f=fixture({response,metaTitle:"Sample Learner Home",metaDescription:"Sample Learner's home, built in English class. Take a look."});const{pending}=await configured(f);f.ready();
  assert.equal(response.share.title,"My Little World · Home Showcase | Learning Studio",'The signer contract remains unchanged');
  for(const call of f.shareCalls()){assert.equal(call.options.title,"Sample Learner Home");assert.equal(call.options.desc,"Sample Learner's home, built in English class. Take a look.");assert.equal(call.options.link,LINK);assert.equal(call.options.imgUrl,response.share.imgUrl);call.options.success();}
  assert.equal(await pending,true);assert.equal(f.calls[0].config.signature,'public-signature');
});

test('SDK descriptions use the shared frozen-title copy rather than arbitrary rendered description text',async()=>{
  const f=fixture({metaTitle:"Sam Home",metaDescription:'Untrusted promotional text'});const{pending}=await configured(f);f.ready();for(const call of f.shareCalls()){assert.equal(call.options.title,"Sam Home");assert.equal(call.options.desc,"Sam's home, built in English class. Take a look.");call.options.success();}assert.equal(await pending,true);
});

test('missing or invalid frozen title metadata uses the generic home copy without guessing an identity',async()=>{
  for(const metaTitle of [undefined,'',"My Learning Home",'a plain browser title','x'.repeat(61)+" Home"]){
    const f=fixture({metaTitle,metaDescription:"Arbitrary description"});const{pending}=await configured(f);f.ready();for(const call of f.shareCalls()){assert.equal(call.options.title,"My Home");assert.equal(call.options.desc,"A home built in English class. Take a look.");call.options.success();}assert.equal(await pending,true);
  }
});

test('query-supplied title, description, link and image never override frozen metadata or validated share targets',async()=>{
  const href=LINK+'&title='+encodeURIComponent("Another Person Home")+'&desc=forged&link=https%3A%2F%2Fevil.example%2F&imgUrl=https%3A%2F%2Fevil.example%2Fcover.jpg#view';
  const f=fixture({href,metaTitle:"Mia Home",metaDescription:"Mia's home, built in English class. Take a look."});const{pending}=await configured(f);assert.deepEqual(JSON.parse(f.requests[0].options.body),{url:href.split('#')[0]});f.ready();
  for(const call of f.shareCalls()){assert.equal(call.options.title,"Mia Home");assert.equal(call.options.desc,"Mia's home, built in English class. Take a look.");assert.equal(call.options.link,LINK);assert.equal(call.options.imgUrl,payload().share.imgUrl);call.options.success();}assert.equal(await pending,true);
});

test('both asynchronous API success callbacks are required, and a delayed fail is observed',async()=>{
  const f=fixture();let settled=false;const{pending}=await configured(f);pending.then(()=>{settled=true;});f.ready();await turn();assert.equal(settled,false);
  assert.equal(f.shareCalls().length,2);f.shareCalls()[0].options.success();await turn();assert.equal(settled,false);
  await pause(10);f.shareCalls()[1].options.fail({errMsg:'permission denied'});assert.equal(await pending,false);
});

test('success is reported only after both APIs succeed, and bridge callbacks register before config',async()=>{
  const f=fixture({configBehavior:()=>f.ready()});const{pending}=await configured(f);
  assert.deepEqual(f.events,['error-register','ready-register','config']);assert.equal(f.shareCalls().length,2);
  const [friend,timeline]=f.shareCalls();friend.options.success();timeline.options.success();assert.equal(await pending,true);
  assert.deepEqual(f.calls[0].config.jsApiList,APIs);assert.equal(f.calls[0].config.debug,false);
});

test('wx.error prevents share-data API calls and fails safely',async()=>{
  const f=fixture();const{pending}=await configured(f);f.error({errMsg:'config:invalid signature'});f.ready();assert.equal(await pending,false);assert.equal(f.shareCalls().length,0);
});

test('API permission rejection, cancellation, exception and returned rejection fail without unhandled rejection',async()=>{
  for(const behavior of[
    (_name,options)=>options.fail({errMsg:'permission denied'}),
    (_name,options)=>options.cancel(),
    ()=>{throw Error('bridge unavailable');},
    ()=>Promise.reject(Error('bridge unavailable')),
  ]){
    const f=fixture({apiBehavior:behavior});const{pending}=await configured(f);f.ready();assert.equal(await pending,false);
  }
});

test('a missing API callback reaches its own deadline rather than reporting success',async()=>{
  const f=fixture();const pending=f.init({callbackTimeoutMs:10});for(let i=0;i<8&&!f.calls.length;i++)await turn();f.ready();f.shareCalls()[0].options.success();assert.equal(await pending,false);
});

test('late ready still installs share data after the observation deadline',async()=>{
  const f=fixture();const pending=f.init({readyTimeoutMs:10});for(let i=0;i<8&&!f.calls.length;i++)await turn();assert.equal(await pending,false);assert.equal(f.shareCalls().length,0);
  f.ready();assert.equal(f.shareCalls().length,2);for(const call of f.shareCalls())call.options.success();
  f.ready();assert.equal(f.shareCalls().length,2,'duplicate ready cannot configure twice');
});

test('failed official SDK host falls back to second official host and configures normally',async()=>{
  const f=fixture({installed:false,scriptOutcomes:['fail','success']});const{pending}=await configured(f);
  assert.deepEqual(f.scripts.map(script=>script.src),['https://res.wx.qq.com/open/js/jweixin-1.6.0.js','https://res2.wx.qq.com/open/js/jweixin-1.6.0.js']);
  assert.equal(f.removed.length,1);f.ready();for(const call of f.shareCalls())call.options.success();assert.equal(await pending,true);
});

test('SDK load failures, invalid SDKs and missing load events leave the viewer independent',async()=>{
  for(const outcomes of[['fail','fail'],['invalid','invalid'],['timeout','timeout']]){
    const f=fixture({installed:false,scriptOutcomes:outcomes});assert.equal(await f.init({timeoutMs:10}),false);assert.equal(f.calls.length,0);assert.equal(f.scripts.length,2);assert.equal(f.removed.length,2);
  }
});

test('config HTTP and JSON failures are contained before loading the SDK',async()=>{
  for(const fetchBehavior of[async()=>({ok:false,json:async()=>payload()}),async()=>{throw Error('offline');},async()=>({ok:true,json:async()=>{throw Error('invalid JSON');}})]){
    const f=fixture({installed:false,fetchBehavior});assert.equal(await f.init(),false);assert.equal(f.scripts.length,0);
  }
});

test('config timeout aborts its own request; a slow valid config has an independent budget',async()=>{
  const stalled=fixture({fetchBehavior:()=>new Promise(()=>{})});assert.equal(await stalled.init({configTimeoutMs:10}),false);assert.equal(stalled.requests[0].options.signal.aborted,true);assert.equal(stalled.scripts.length,0);
  const slow=fixture({fetchBehavior:async()=>{await pause(25);return{ok:true,json:async()=>payload()};}});
  const pending=slow.init({timeoutMs:10,configTimeoutMs:100});await pause(35);assert.equal(slow.calls[0]?.name,'config');slow.ready();for(const call of slow.shareCalls())call.options.success();assert.equal(await pending,true);
});

test('disabled, malformed and unexpected share metadata cannot configure browser sharing',async()=>{
  const mutations=[value=>{value.enabled=false;},value=>{value.config.signature='';},value=>{value.share.link='https://evil.example/';},value=>{value.share.link=PAGE+'?share='+'B'.repeat(43);},value=>{value.share.imgUrl='http://platform.example.invalid/cover.jpg';},value=>{value.share.title='browser supplied title';},value=>{value.share.desc='unexpected';}];
  for(const mutate of mutations){const value=payload();mutate(value);const f=fixture({installed:false,response:value});assert.equal(await f.init(),false);assert.equal(f.scripts.length,0);assert.equal(f.calls.length,0);}
});

test('named rendered metadata never bypasses the fixed signer payload or safe link and image checks',async()=>{
  for(const mutate of [value=>{value.share.title="Sample Learner Home";},value=>{value.share.desc="Sample Learner's home, built in English class. Take a look.";},value=>{value.share.link='https://evil.example/';},value=>{value.share.imgUrl='https://evil.example/cover.jpg';}]){
    const response=payload();mutate(response);const f=fixture({installed:false,response,metaTitle:"Sample Learner Home",metaDescription:"Sample Learner's home, built in English class. Take a look."});assert.equal(await f.init(),false);assert.equal(f.scripts.length,0);assert.equal(f.calls.length,0);
  }
});

test('repeated initialization on one window shares one config request and SDK setup',async()=>{
  const f=fixture();const{pending}=await configured(f);const repeated=f.init();assert.equal(f.requests.length,1);f.ready();for(const call of f.shareCalls())call.options.success();assert.equal(await pending,true);assert.equal(await repeated,true);assert.equal(f.calls.filter(call=>call.name==='config').length,1);
});
