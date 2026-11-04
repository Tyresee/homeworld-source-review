/** Original lightweight animated programmes: no external media, network or
 * autoplay video. Sampled by the shared TV runtime at eight frames/second. */
export const TELEVISION_CHANNEL_TITLES=Object.freeze(['FOREST TV','WEATHER','SPORTS','MUSIC','AQUARIUM','SPACE EXPLORER','DINO VALLEY','LITTLE KITCHEN','TOY RAILWAY','ROBOT DANCE','ART STUDIO','DISCOVERY LAB']);
export function drawExtraTelevisionChannel(ctx,channel,t){
  const TAU=Math.PI*2;
  const rect=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  const dot=(x,y,r,color)=>{ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=color;ctx.fill();};
  const line=(points,color,width=3)=>{ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
  const text=(value,x,y,size,color='#fff2cf')=>{ctx.fillStyle=color;ctx.font=`bold ${size}px sans-serif`;ctx.fillText(value,x,y);};
  const triangle=(x,y,size,color,angle=0)=>{ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(-size,-size);ctx.lineTo(size,0);ctx.lineTo(-size,size);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.restore();};
  if(channel===4){
    rect(0,0,512,288,'#176a89');rect(0,252,512,36,'#ddc78c');
    for(let n=0;n<8;n++){const x=20+n*68;line([[x,262],[x+Math.sin(t+n)*12,228],[x-7,195]],'#55ae9c',7);dot((n*79+t*11)%512,260-(t*28+n*29)%225,3+n%3,'#b4e6eb');}
    for(let n=0;n<5;n++){const x=(t*(25+n*5)+n*116)%620-55,y=90+n*32+Math.sin(t*1.8+n)*9,c=['#ffc971','#f29d9d','#a2dbe1'][n%3];triangle(x-20,y,13,c);ctx.save();ctx.translate(x,y);ctx.scale(1.5,.8);dot(0,0,19,c);ctx.restore();dot(x+15,y-4,3,'#183f4d');}
  }else if(channel===5){
    rect(0,0,512,288,'#252c59');for(let n=0;n<35;n++)dot((n*139)%512,40+(n*47)%239,1+(n%3===0?Math.sin(t+n)*.5:0),'#f8e5b5');
    dot(404,179,63,'#b8a1d3');ctx.save();ctx.translate(404,179);ctx.rotate(-.38);ctx.scale(1,.26);ctx.beginPath();ctx.arc(0,0,92,0,TAU);ctx.strokeStyle='#e8c67d';ctx.lineWidth=15;ctx.stroke();ctx.restore();
    const x=155+Math.sin(t*.6)*35,y=144+Math.sin(t*1.3)*15;rect(x-16,y-29,32,76,'#e4ece1');triangle(x,y-35,23,'#df8b70',-Math.PI/2);triangle(x-24,y+26,15,'#df8b70',Math.PI/2);triangle(x+24,y+26,15,'#df8b70',Math.PI/2);dot(x,y-4,12,'#7bc5db');triangle(x,y+60+Math.sin(t*10)*5,18,'#f6cb70',Math.PI/2);
  }else if(channel===6){
    rect(0,0,512,288,'#a6cfbd');rect(0,228,512,60,'#739663');for(let n=0;n<6;n++){triangle(n*117-20,180,90,'#8ab19a',-Math.PI/2);}
    const x=225+Math.sin(t*.6)*75,y=192+Math.sin(t*3)*3;ctx.save();ctx.translate(x,y);ctx.scale(1.45,.7);dot(0,0,49,'#83b69a');ctx.restore();dot(x+42,y-44,30,'#83b69a');dot(x+56,y-51,3,'#273e46');triangle(x-75,y+1,25,'#83b69a',Math.PI);
    for(const side of[-1,1]){const dx=side*23+Math.sin(t*3+side)*7;rect(x+dx-9,y+16,18,39,'#6a9a80');}for(let n=0;n<4;n++)triangle(x-34+n*19,y-27,10,'#e0bd78',-Math.PI/2);
  }else if(channel===7){
    rect(0,0,512,288,'#f1d8b4');rect(34,176,444,112,'#b78359');rect(24,169,464,16,'#fff1ce');rect(110,118,148,60,'#50666c');rect(94,112,180,12,'#324b56');
    for(let n=0;n<4;n++){const y=98-((t*20+n*18)%63),x=143+n*28+Math.sin(t*3+n)*8;dot(x,y,8,'#fff0d2');}
    dot(372,106,38,'#e9b985');dot(354,77,24,'#fff4d6');dot(380,68,29,'#fff4d6');dot(403,79,23,'#fff4d6');dot(361,106,3,'#324b56');dot(381,106,3,'#324b56');rect(344,143,61,37,'#8ab8a5');line([[344,152],[300,128+Math.sin(t*3)*8]],'#e9b985',12);text('STIR · SIZZLE · SHARE',75,264,22);
  }else if(channel===8){
    rect(0,0,512,288,'#b9dae2');rect(0,210,512,78,'#95b476');line([[0,258],[512,258]],'#766d63',5);line([[0,244],[512,244]],'#766d63',5);for(let n=0;n<18;n++)rect(n*33,237,8,27,'#b78e60');
    const x=(t*54)%760-210;for(let n=0;n<3;n++){rect(x+n*99,166,85,65,['#d88570','#e4bd73','#89afba'][n]);rect(x+9+n*99,176,26,25,'#e0ecdf');rect(x+48+n*99,176,26,25,'#e0ecdf');for(const dx of[17,68]){dot(x+n*99+dx,238,13,'#52666a');line([[x+n*99+dx,238],[x+n*99+dx+Math.cos(t*4)*10,238+Math.sin(t*4)*10]],'#e3ddc9',2);}}
    for(let n=0;n<4;n++)dot(x+235+n*8,139-n*18,9+n*4,'#f3ecd9');
  }else if(channel===9){
    rect(0,0,512,288,'#43345c');for(let n=0;n<6;n++)triangle(256,290,190,'#4f4972',n*1.0+t*.12);rect(0,245,512,43,'#252f48');
    const x=256+Math.sin(t*2)*35,y=134+Math.abs(Math.sin(t*3))*10;rect(x-34,y-63,68,44,'#e5dec2');rect(x-25,y-52,50,24,'#344f57');dot(x-13,y-40,4,'#97ddd4');dot(x+13,y-40,4,'#97ddd4');rect(x-24,y-12,48,57,'#e5dec2');dot(x,y+8,11,'#e4b365');
    for(const side of[-1,1]){line([[x+side*24,y],[x+side*52,y-15+Math.sin(t*4+side)*24],[x+side*64,y-35+Math.sin(t*4+side)*32]],'#d6d9c6',13);line([[x+side*13,y+44],[x+side*23+Math.sin(t*3+side)*13,y+78],[x+side*30+Math.sin(t*3+side)*20,y+103]],'#d6d9c6',13);}text('MOVE WITH ME!',153,65,22);
  }else if(channel===10){
    rect(0,0,512,288,'#e6cbb7');line([[167,74],[116,276]],'#a17c56',10);line([[328,74],[379,276]],'#a17c56',10);rect(132,57,236,186,'#f8efdc');
    const stages=Math.floor(t*.8)%5;for(let n=0;n<=stages;n++){const colors=['#82af9a','#e2b66d','#b6a3cf','#d58d85','#82b5cc'];line([[153+n*9,217-n*22],[233+n*13,91+n*17],[348-n*8,215-n*13]],colors[n],10);}
    for(let n=0;n<5;n++)dot(67+n*94,268,12,['#82af9a','#e2b66d','#b6a3cf','#d58d85','#82b5cc'][n]);
  }else{
    rect(0,0,512,288,'#304d60');for(let n=0;n<3;n++){const x=118+n*135,fill=['#a5d9c7','#e5b68d','#bca4d7'][n];rect(x-15,93,30,53,'#b7d8d5');ctx.beginPath();ctx.moveTo(x-15,141);ctx.lineTo(x-51,218);ctx.quadraticCurveTo(x,246,x+51,218);ctx.lineTo(x+15,141);ctx.closePath();ctx.fillStyle=fill;ctx.fill();for(let b=0;b<5;b++)dot(x+Math.sin(t+b+n)*22,214-(t*20+b*17)%58,3+b%3,'#eff9dd');}
    text('WHAT HAPPENS NEXT?',94,69,24);line([[48,259],[462,259]],'#b5cbbf',8);
  }
}
