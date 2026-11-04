import * as THREE from 'three';

/** Original, static learning desktops. No network, keyboard, account data or
 * animation scheduler belongs to a furniture screen. */
export function drawComputerDesktop(ctx,{style='learning',width=512,height=288}={}) {
  const sx=width/512,sy=height/288;ctx.save();ctx.scale(sx,sy);ctx.clearRect(0,0,512,288);
  const rect=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  const text=(label,x,y,size=15,color='#173345')=>{ctx.fillStyle=color;ctx.font=`600 ${size}px sans-serif`;ctx.fillText(label,x,y);};
  const circle=(x,y,r,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
  if(style==='starmap') {
    rect(0,0,512,288,'#102542');rect(0,0,512,28,'#0a1b31');text('ORBIT LAB',18,20,14,'#c0e9f4');
    for(let i=0;i<34;i++)circle(18+(i*83)%476,43+(i*59)%220,i%5===0?2:1,'#b5d8ec');
    ctx.strokeStyle='#4b6c8a';ctx.lineWidth=1;for(const r of[47,81,115]){ctx.beginPath();ctx.ellipse(272,158,r,r*.58,-.25,0,Math.PI*2);ctx.stroke();}
    circle(272,158,25,'#ffd27a');circle(223,143,9,'#6bd0d0');circle(342,147,15,'#92a4ed');circle(178,201,11,'#d397a7');
    text('EXPLORE THE SOLAR SYSTEM',20,265,13,'#b9d9e9');rect(390,243,102,25,'#285673');text('STAR MAP',404,261,12,'#e6f7ff');
  }else if(style==='art') {
    rect(0,0,512,288,'#e4e9e8');rect(0,0,512,30,'#2b5f6a');text('COLOUR STUDIO',17,21,14,'#f7f3df');
    rect(13,44,49,227,'#f7f9ef');for(let i=0;i<7;i++)circle(37,64+i*29,9,['#df795c','#e7bb58','#70a991','#6baac6','#8b8bc0','#d6a1ae','#3e5660'][i]);
    rect(78,44,420,227,'#f9f5e7');circle(394,88,26,'#edcb75');
    ctx.fillStyle='#95c9bd';ctx.beginPath();ctx.moveTo(78,206);ctx.quadraticCurveTo(178,99,275,200);ctx.quadraticCurveTo(391,121,498,198);ctx.lineTo(498,271);ctx.lineTo(78,271);ctx.fill();
    ctx.fillStyle='#4f9286';ctx.beginPath();ctx.moveTo(78,236);ctx.quadraticCurveTo(248,160,498,243);ctx.lineTo(498,271);ctx.lineTo(78,271);ctx.fill();
    text('MY LITTLE LANDSCAPE',103,72,12,'#627c78');
  }else {
    rect(0,0,512,288,'#dce9ef');rect(0,0,512,30,'#255b70');text('LITTLE LEARNING DESK',18,21,14,'#f4f4d9');
    rect(16,46,302,222,'#fffdf2');rect(332,46,164,222,'#ecf2e2');text('WORD OF THE DAY',35,76,14,'#477b8c');text('Explore',35,119,35,'#213e56');
    text('Learn something new today.',35,151,14,'#6b7e84');rect(35,176,263,4,'#e5e8d5');
    for(let i=0;i<3;i++){rect(35,196+i*20,17,12,['#93c2b1','#e9c26c','#92b3d2'][i]);rect(63,199+i*20,157-i*27,5,'#d6dfd8');}
    text('MY PROJECTS',347,76,13,'#47736a');for(let i=0;i<3;i++){rect(348,95+i*49,132,38,['#c4dbbd','#e9d59f','#bed5df'][i]);text(['READ','DISCOVER','CREATE'][i],361,119+i*49,13,'#325463');}
  }
  ctx.restore();
}

/** A disposable binding owns every replacement material and CanvasTexture.
 * Borrowed model materials are restored exactly, including shared live copies.
 * Call before the parent model's ordinary geometry/material retirement. */
export function createComputerDisplayBinding({group,document:doc=globalThis.document,power=false}={}) {
  if(!group?.isObject3D)throw new TypeError('A computer model is required');
  const screens=[],leds=[];let disposed=false,on=null;
  group.traverse(node=>{if(!node.isMesh)return;
    if(node.userData.objectPart==='computer-screen')screens.push({node,original:node.material,texture:null,materials:[],standby:[].concat(node.material).map(original=>new THREE.MeshBasicMaterial({color:'#111d2a',toneMapped:false,side:original.side}))});
    if(node.userData.objectPart==='computer-power-led')leds.push({node,original:node.material,materials:[],standby:[].concat(node.material).map(original=>{const material=original.clone();material.color?.set('#405161');material.emissiveIntensity=0;return material;})});
  });
  function allocate(screen){
    if(screen.texture)return true;const canvas=doc?.createElement?.('canvas'),ctx=canvas?.getContext?.('2d');if(!ctx)return false;
    canvas.width=512;canvas.height=Math.round(512/Math.max(1,Math.min(3,screen.node.userData.screenAspect??16/9)));
    drawComputerDesktop(ctx,{style:screen.node.userData.computerScreenStyle??'learning',width:canvas.width,height:canvas.height});
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.userData.homeRuntimeTransient=true;
    const originals=[].concat(screen.original);screen.texture=texture;screen.materials=originals.map(original=>new THREE.MeshBasicMaterial({map:texture,toneMapped:false,side:original.side}));return true;
  }
  function setPower(value){
    if(disposed)return false;const next=value===true;if(next===on)return false;on=next;
    for(const screen of screens){if(on&&allocate(screen))screen.node.material=Array.isArray(screen.original)?screen.materials:screen.materials[0];else screen.node.material=Array.isArray(screen.original)?screen.standby:screen.standby[0];}
    for(const led of leds){if(on){if(!led.materials.length)led.materials=[].concat(led.original).map(original=>{const material=original.clone();if(material.emissive&&original.color)material.emissive.copy(original.color);material.emissiveIntensity=1.3;return material;});led.node.material=Array.isArray(led.original)?led.materials:led.materials[0];}else led.node.material=Array.isArray(led.original)?led.standby:led.standby[0];}
    return true;
  }
  setPower(power===true);
  return {screens,setPower,getPower:()=>on,getStats:()=>({screens:screens.length,textures:screens.filter(screen=>screen.texture).length,power:on,disposed}),
    dispose(){if(disposed)return;disposed=true;for(const screen of screens){screen.node.material=screen.original;for(const material of [...screen.materials,...screen.standby])material.dispose();screen.texture?.dispose();}for(const led of leds){led.node.material=led.original;for(const material of [...led.materials,...led.standby])material.dispose();}},
  };
}
