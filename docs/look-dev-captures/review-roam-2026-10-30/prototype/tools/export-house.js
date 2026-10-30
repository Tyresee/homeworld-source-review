// usage: node export.js preset view out.json '{globals}'
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const [preset,view,out,g]=process.argv.slice(2);const globals=JSON.parse(g||'{}');
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1600,height:1000}});
p.on('console',m=>{if(m.type()==='error')console.log('ERR',m.text().slice(0,200))});
await p.addInitScript(o=>{Object.assign(globalThis,o)},globals);
await p.goto(`http://127.0.0.1:19534/?preset=${preset}&view=${view}`);
await p.waitForFunction(()=>/Ready/.test(document.body.innerText),null,{timeout:180000});
await p.waitForTimeout(1500);
const json=await p.evaluate(()=>{const r=globalThis.__LD_REFS;const sc=r.scene;
  sc.updateMatrixWorld(true);
  // tag walls for the viewer
  sc.traverse(o=>{if(o.isMesh&&o.userData?.roomPart)o.name='part:'+o.userData.roomPart;});
  let BG=null;sc.traverse(o=>{if(!BG&&o.geometry){let c=o.geometry.constructor;while(c&&c.name!=='BufferGeometry')c=Object.getPrototypeOf(c);BG=c;}});
  const cache=new Map();sc.traverse(o=>{if((o.isMesh||o.isLine||o.isPoints)&&o.geometry&&o.geometry.type!=='BufferGeometry'){let g=cache.get(o.geometry);if(!g){g=new BG().copy(o.geometry);g.type='BufferGeometry';cache.set(o.geometry,g);}o.geometry=g;}});
  const data=sc.toJSON();
  return JSON.stringify({scene:data,render:{toneMapping:r.renderer.toneMapping,exposure:r.renderer.toneMappingExposure}});});
fs.writeFileSync(out,json);console.log('bytes',json.length);await b.close();})().catch(e=>{console.error(e);process.exit(1)});
