/** A sixteen-second, thirty-two-beat stage routine. Units are metres/radians.
 * Deliberately authored phrases: accents and holds, heel/toe backslides,
 * side glides, a compact turn and a clean finish. The outer navigation anchor
 * is never moved. Shared by rendering, clearance and save validation. */
export const DANCE_PERIOD=16;
export const DANCE_CLEARANCE_RADIUS=.85;
const TAU=Math.PI*2;
const clamp=value=>Math.max(0,Math.min(1,value));
const ease=value=>{const t=clamp(value);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
function keys(t,rows){
  if(t<=rows[0][0])return rows[0][1];
  for(let i=1;i<rows.length;i++)if(t<=rows[i][0])return mix(rows[i-1][1],rows[i][1],ease((t-rows[i-1][0])/(rows[i][0]-rows[i-1][0])));
  return rows.at(-1)[1];
}
const neutralArm=()=>({shoulderX:-.12,shoulderZ:.06,shoulderY:0,elbowX:-.25,wristZ:0});

function rawDance(time=0){
  const t=Number.isFinite(time)?((time%DANCE_PERIOD)+DANCE_PERIOD)%DANCE_PERIOD:0;
  const weight=1;
  const frame={time:t,blend:weight,beat:Math.floor(t*2),phase:'opening',phaseLabel:"DisplayText4032 · DisplayText4033",
    motion:{x:0,z:0,yaw:0},feet:{L:{x:0,y:0,z:0,pitch:0,planted:true},R:{x:0,y:0,z:0,pitch:0,planted:true}},
    arms:{L:neutralArm(),R:neutralArm()},pelvis:{x:0,y:-.035,turn:0},
    torso:{lean:0,roll:0,turn:0},head:{nod:0,turn:0,roll:0}};
  const {arms,feet,pelvis,torso,head,motion}=frame;
  // Sharp anticipation followed by a readable hold, rather than a sine-wave
  // wobble. The raised hand stays outside the large robot head.
  if(t<2){
    const hit=keys(t,[[0,0],[.22,.2],[.48,1],[1.15,1],[1.55,.35],[2,0]]);
    arms.R={shoulderX:-.12-.33*hit,shoulderY:-.12*hit,shoulderZ:.06-1.26*hit,elbowX:-.25-1.30*hit,wristZ:-.22*hit};
    arms.L.shoulderZ=.06+.19*hit;arms.L.elbowX=-.25-.25*hit;
    torso.roll=-.09*hit;head.nod=.13*hit;head.turn=-.17*hit;pelvis.y=-.035-.025*hit;
    motion.yaw=keys(t,[[0,0],[1.45,0],[2,.48]]);
  }else if(t<6){
    frame.phase='moonwalk';frame.phaseLabel="DisplayText3755 · DisplayText4034";motion.yaw=.48;
    const k=Math.min(3,Math.floor(t-2)),p=t-2-k,slide=ease((p-.14)/.66),stride=.085;
    const positions={L:0,R:0};
    for(let j=0;j<k;j++)positions[j%2?'L':'R']=-(j+1)*stride;
    const support=k%2?'R':'L',moving=support==='L'?'R':'L',from=positions[moving],to=-(k+1)*stride;
    positions[moving]=mix(from,to,slide);
    feet.L.z=positions.L;feet.R.z=positions.R;
    const up=k===0?ease(p/.14):1,exchange=ease((p-.80)/.20);
    feet[support].pitch=.58*up*(1-exchange);feet[moving].pitch=k===3?0:.58*exchange;
    feet[support].planted=true;feet[moving].planted=slide===0||slide===1;
    feet[moving].sliding=slide>0&&slide<1;
    motion.z=(positions.L+positions.R)/2;
    pelvis.x=(support==='L'?.022:-.022)*(1-2*exchange);pelvis.y=-.045;
    torso.lean=-.065;torso.turn=.08;head.nod=.09;head.turn=-.18;
    const sweep=keys(p,[[0,-.28],[.14,-.28],[.64,.28],[.80,.28],[1,-.28]]);
    arms.L.shoulderX=-.22+sweep;arms.R.shoulderX=-.22-sweep;
    arms.L.elbowX=-.65;arms.R.elbowX=-.65;arms.L.shoulderZ=.18;arms.R.shoulderZ=-.18;
  }else if(t<9){
    frame.phase='side-glide';frame.phaseLabel="DisplayText3756 · DisplayText4035";
    const q=t-6;motion.yaw=keys(q,[[0,.48],[.65,0],[3,0]]);
    const steps=[{to:.6,side:'L',x:.14,z:-.255},{to:1.2,side:'R',x:.14,z:-.18},{to:1.8,side:'L',x:-.14,z:-.1},{to:2.4,side:'R',x:-.14,z:0},{to:2.7,side:'L',x:0,z:0},{to:3,side:'R',x:0,z:0}];
    const placed={L:{x:0,z:-.34},R:{x:0,z:-.255}};let start=0;
    for(const step of steps){
      if(q>=step.to){placed[step.side]={x:step.x,z:step.z};start=step.to;continue;}
      const p=clamp((q-start)/(step.to-start)),u=ease(p),from=placed[step.side],support=step.side==='L'?'R':'L';
      placed[step.side]={x:mix(from.x,step.x,u),z:mix(from.z,step.z,u)};
      feet[step.side].planted=false;feet[step.side].sliding=true;
      if(start>=2.4){feet[step.side].y=.035*Math.sin(Math.PI*p)**2;feet[step.side].sliding=false;}
      feet[support].pitch=.28*Math.sin(Math.PI*p)**2;
      break;
    }
    for(const side of ['L','R'])Object.assign(feet[side],placed[side]);
    motion.x=(placed.L.x+placed.R.x)/2;motion.z=(placed.L.z+placed.R.z)/2;
    pelvis.y=-.05;pelvis.x=-motion.x*.15;torso.roll=-motion.x*.40;head.roll=-torso.roll*.65;
    arms.L.shoulderZ=keys(q,[[0,.18],[.65,.65],[1.7,.2],[2.7,.45],[3,.2]]);
    arms.R.shoulderZ=-keys(q,[[0,.18],[.65,.2],[1.7,.65],[2.7,.45],[3,.2]]);
    arms.L.elbowX=-.65;arms.R.elbowX=-.65;
    torso.lean=keys(q,[[0,-.065],[.65,0]]);torso.turn=keys(q,[[0,.08],[.65,0]]);head.nod=keys(q,[[0,.09],[.65,0]]);head.turn=keys(q,[[0,-.18],[.65,0]]);
  }else if(t<11.5){
    frame.phase='accents';frame.phaseLabel="DisplayText4036 · DisplayText4037";const q=t-9;
    const kick=keys(q,[[0,0],[.3,0],[.48,1],[.68,1],[.92,0],[1.25,0],[1.46,.8],[1.68,0],[2.5,0]]);
    feet.R.z=.16*kick;feet.R.y=.095*kick;feet.R.planted=kick===0;
    pelvis.y=-.05-.035*keys(q,[[0,0],[.3,1],[.48,.2],[.92,0],[1.25,.7],[1.46,.2],[1.68,0],[2.5,0]]);
    const pop=keys(q,[[0,0],[.3,0],[.48,1],[.68,1],[.92,0],[1.25,-.7],[1.46,-.7],[1.68,0],[2.5,0]]);
    torso.turn=.20*pop;torso.roll=.08*pop;head.turn=-.18*pop;
    arms.L.shoulderZ=.2+.45*Math.max(0,pop);arms.R.shoulderZ=-.2-.45*Math.max(0,-pop);
    arms.L.elbowX=-.65;arms.R.elbowX=-.65;
  }else if(t<13){
    frame.phase='spin';frame.phaseLabel="DisplayText4038 · DisplayText4039";const q=t-11.5;
    // Anticipate, perform a complete turn, then brake into a full front view.
    motion.yaw=keys(q,[[0,0],[.22,-.16],[.32,-.16],[1.12,TAU],[1.5,TAU]]);
    const fold=keys(q,[[0,0],[.22,1],[1.12,1],[1.5,0]]);
    arms.L.shoulderX=-.30;arms.R.shoulderX=-.30;
    arms.L.shoulderZ=.2-.25*fold;arms.R.shoulderZ=-.2+.25*fold;
    arms.L.elbowX=-.65-1.15*fold;arms.R.elbowX=-.65-1.15*fold;
    pelvis.y=-.05+.024*fold;feet.L.pitch=.13*fold;feet.R.pitch=.13*fold;
    feet.L.planted=false;feet.R.planted=false;feet.L.pivoting=true;feet.R.pivoting=true;
    head.turn=keys(q,[[0,0],[.32,.08],[.75,-.12],[1.12,0],[1.5,0]]);
  }else{
    frame.phase='finish';frame.phaseLabel="DisplayText4040 · DisplayText4033";const q=t-13;
    const hit=keys(q,[[0,0],[.24,1],[1.55,1],[2.15,.5],[2.7,0],[3,0]]);
    arms.L.shoulderX=-.3-.35*hit;arms.L.shoulderZ=.2+1.05*hit;arms.L.elbowX=-.65+.45*hit;
    arms.R.shoulderX=-.3+.18*hit;arms.R.shoulderZ=-.2-.12*hit;arms.R.elbowX=-.65-.35*hit;
    torso.roll=-.10*hit;head.turn=.20*hit;head.roll=.06*hit;pelvis.x=-.028*hit;
    pelvis.y=keys(q,[[0,-.05],[.24,-.075],[1.55,-.075],[2.7,-.035],[3,-.035]]);
    const settle=ease((q-2.7)/.3);
    for(const side of ['L','R'])for(const field of Object.keys(arms[side]))arms[side][field]=mix(arms[side][field],neutralArm()[field],settle);
  }
  return frame;
}

export function sampleRobotDance(time=0,blend=1){
  const frame=rawDance(time),t=frame.time,rawWeight=clamp(Number.isFinite(blend)?blend:1),weight=ease(rawWeight);
  // Ease the joints across phrase boundaries while preserving the authored
  // independent floor contacts. This is an animation blend, not a root jump.
  for(const boundary of [2,6,9,11.5,13])if(t>=boundary&&t<boundary+.2){
    const before=rawDance(boundary-1e-7),u=ease((t-boundary)/.2);
    for(const key of ['pelvis','torso','head'])for(const field of Object.keys(frame[key]))frame[key][field]=mix(before[key][field],frame[key][field],u);
    for(const side of ['L','R'])for(const field of Object.keys(frame.arms[side]))frame.arms[side][field]=mix(before.arms[side][field],frame.arms[side][field],u);
  }
  frame.motion.yaw=Math.atan2(Math.sin(frame.motion.yaw),Math.cos(frame.motion.yaw));
  for(const node of [frame.motion,frame.pelvis,frame.torso,frame.head,...Object.values(frame.arms),...Object.values(frame.feet)])for(const key of Object.keys(node))if(typeof node[key]==='number')node[key]*=weight;
  frame.blend=rawWeight;return frame;
}
