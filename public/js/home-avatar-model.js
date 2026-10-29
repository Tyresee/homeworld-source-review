import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  AVATAR_SKIN_TONES, AVATAR_HAIR_STYLES, AVATAR_HAIR_COLORS,
  DEFAULT_AVATAR_APPEARANCE, getClothingProduct,
} from './home-avatar-catalog.js';

const TAU = Math.PI * 2;
// Box3.setFromObject includes invisible descendants. Pose anchors must follow rendered surfaces.
function visibleMeshBounds(object) {
  object.updateWorldMatrix(true,true);
  const bounds=new THREE.Box3(),vertex=new THREE.Vector3();
  object.traverseVisible(node=>{
    if(!node.isMesh)return;
    const positions=node.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++)bounds.expandByPoint(vertex.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld));
  });
  return bounds;
}
const freezeAppearance = appearance => ({
  skinTone:AVATAR_SKIN_TONES.find(v=>v.id===appearance?.skinTone)?.id ?? DEFAULT_AVATAR_APPEARANCE.skinTone,
  hairStyle:AVATAR_HAIR_STYLES.find(v=>v.id===appearance?.hairStyle)?.id ?? DEFAULT_AVATAR_APPEARANCE.hairStyle,
  hairColor:AVATAR_HAIR_COLORS.find(v=>v.id===appearance?.hairColor)?.id ?? DEFAULT_AVATAR_APPEARANCE.hairColor,
});

/** The renderer consumes equipped SKU IDs; ownership is checked by the commerce/state layer. */
export function createHomeAvatar({appearance=DEFAULT_AVATAR_APPEARANCE,equipped={}}={}) {
  appearance=freezeAppearance(appearance);
  const selected={};
  for(const slot of ['outfit','headwear','footwear']) {
    const product=getClothingProduct(equipped?.[slot]);
    selected[slot]=product?.slot===slot?product:null;
  }
  const root=new THREE.Group();root.name='home-avatar';
  const motion=new THREE.Group();motion.name='avatar-pose';root.add(motion);
  const hip=new THREE.Group();hip.name='avatar-hips';motion.add(hip);
  const skin=AVATAR_SKIN_TONES.find(v=>v.id===appearance.skinTone).color;
  const hair=AVATAR_HAIR_COLORS.find(v=>v.id===appearance.hairColor).color;
  const outfit=selected.outfit?.skuId.slice(5)??'default';
  const color=selected.outfit?.color??'#94b6a5';
  const shade=new THREE.Color(color).multiplyScalar(.75),pale=new THREE.Color(color).lerp(new THREE.Color('#fff6e5'),.38);
  const cream='#f3eddd',dark='#4a535d',gold='#d6b361',navy='#5a6d82';

  function add(parent,geometry,position,color,part,roughness=.8,metalness=0) {
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness,metalness}));
    mesh.position.set(...position);mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.name=`avatar-${part}`;mesh.userData={avatarPart:part};parent.add(mesh);return mesh;
  }
  const box=(p,size,pos,c,part,radius=.025)=>add(p,new RoundedBoxGeometry(...size,1,Math.min(radius,Math.min(...size)*.42)),pos,c,part);
  function ball(p,size,pos,c,part) { const m=add(p,new THREE.SphereGeometry(1,16,10),pos,c,part);m.scale.set(...size);return m; }
  const capsule=(p,r,h,pos,c,part)=>add(p,new THREE.CapsuleGeometry(r,Math.max(.001,h-r*2),4,10),pos,c,part);
  const cylinder=(p,rt,rb,h,pos,c,part,segments=16)=>add(p,new THREE.CylinderGeometry(rt,rb,h,segments),pos,c,part);
  function tube(p,points,r,c,part) {
    return add(p,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point))),12,r,6,false),[0,0,0],c,part);
  }
  function band(p,r,t,pos,c,part) { const m=add(p,new THREE.TorusGeometry(r,t,6,24),pos,c,part);m.rotation.x=Math.PI/2;return m; }
  function star(p,r,pos,c,part) {
    const shape=new THREE.Shape();
    for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,d=i%2?r*.45:r;const x=Math.cos(a)*d,y=Math.sin(a)*d;i?shape.lineTo(x,y):shape.moveTo(x,y);}shape.closePath();
    return add(p,new THREE.ExtrudeGeometry(shape,{depth:.008,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1}),pos,c,part);
  }
  function ribbon(p,pos,c,part) {
    for(const s of [-1,1]){const wing=ball(p,[.035,.023,.012],[pos[0]+s*.025,pos[1],pos[2]],c,`${part}-loop`);wing.rotation.z=s*.24;}
    ball(p,[.013,.014,.015],pos,c,`${part}-knot`);
  }

  // Narrow shoulders, generous round head and mitten hands: a soft toy, not a cuboid figure.
  box(hip,[.275,.10,.19],[0,0,0],navy,'pelvis',.04);
  const torso=box(hip,[.315,.30,.215],[0,.17,0],color,'torso',.065);
  capsule(hip,.048,.10,[0,.34,0],skin,'neck');
  const head=new THREE.Group();head.name='avatar-head';head.position.y=.42;hip.add(head);
  ball(head,[.180,.195,.163],[0,.10,0],skin,'head');
  for(const s of [-1,1]){
    ball(head,[.034,.044,.026],[s*.173,.09,0],skin,'ear');
    ball(head,[.012,.021,.008],[s*.058,.12,.153],dark,'eye');
    ball(head,[.004,.005,.003],[s*.058-.003,.129,.160],cream,'eye-light');
    ball(head,[.028,.013,.005],[s*.102,.068,.141],new THREE.Color(skin).lerp(new THREE.Color('#cf7d79'),.32),'cheek');
  }
  ball(head,[.017,.018,.017],[0,.082,.163],skin,'nose');
  tube(head,[[-.023,.044,.153],[0,.037,.158],[.023,.044,.153]],.0045,'#8f6557','smile');
  const hairCap=add(head,new THREE.SphereGeometry(1,16,8,0,TAU,0,Math.PI*.51),[0,.12,-.006],hair,'hair-cap');
  hairCap.scale.set(.185,.188,.170);
  for(const [x,y,z,sx,sy] of [[-.105,.232,.099,.065,.035],[-.025,.246,.124,.078,.033],[.067,.239,.113,.067,.032]]) {
    const bang=ball(head,[sx,sy,.028],[x,y,z],hair,'hair-fringe');bang.rotation.z=-.2;
  }
  if(appearance.hairStyle==='bob') {
    for(const s of [-1,1])ball(head,[.052,.139,.11],[s*.151,.095,-.035],hair,'hair-bob');
    ball(head,[.155,.119,.075],[0,.08,-.117],hair,'hair-bob-back');
  } else if(appearance.hairStyle==='ponytail') {
    ball(head,[.072,.13,.073],[0,.23,-.185],hair,'hair-ponytail');
    band(head,.053,.012,[0,.27,-.170],color,'hair-tie').rotation.x=0;
  } else if(appearance.hairStyle==='curls') {
    for(let i=0;i<6;i++){const a=i*TAU/6;ball(head,[.065,.068,.061],[Math.sin(a)*.139,.24+Math.cos(a)*.015,Math.cos(a)*.118],hair,'hair-curl');}
  }

  const arms=[],legs=[];
  const longSleeve=['cloud-hoodie','sunny-raincoat','little-chef','moon-explorer','velvet-suit','star-wizard','winter-parka','cozy-pajamas'].includes(outfit);
  const shorts=['field-sports','forest-explorer','sea-sailor'].includes(outfit);
  const bareLeg=['petal-dress','ribbon-tutu'].includes(outfit);
  for(const s of [-1,1]) {
    const shoulder=new THREE.Group();shoulder.name=s<0?'avatar-arm-left':'avatar-arm-right';shoulder.position.set(s*.19,.275,0);hip.add(shoulder);
    capsule(shoulder,.052,.16,[0,-.07,0],outfit==='ocean-overalls'||outfit==='garden-apron'?cream:color,'sleeve');
    const elbow=new THREE.Group();elbow.position.y=-.13;shoulder.add(elbow);
    ball(elbow,[.041,.041,.040],[0,0,0],longSleeve?color:skin,'elbow');
    capsule(elbow,.041,.13,[0,-.065,0],longSleeve?color:skin,'forearm');
    if(longSleeve)cylinder(elbow,.043,.045,.026,[0,-.123,0],outfit==='winter-parka'?cream:pale,'sleeve-cuff',12);
    const hand=ball(elbow,[.043,.049,.038],[0,-.151,.007],skin,'hand');
    arms.push({shoulder,elbow,hand,sign:s});

    const thigh=new THREE.Group();thigh.name=s<0?'avatar-leg-left':'avatar-leg-right';thigh.position.set(s*.082,0,0);hip.add(thigh);
    capsule(thigh,.057,.18,[0,-.09,0],bareLeg?skin:shorts?color:outfit==='ocean-overalls'?color:navy,'thigh');
    const knee=new THREE.Group();knee.position.y=-.18;thigh.add(knee);
    const legColor=shorts||bareLeg?skin:outfit==='cozy-pajamas'?pale:outfit==='ocean-overalls'?color:navy;
    ball(knee,[.052,.054,.051],[0,0,0],legColor,'knee');
    capsule(knee,.048,.18,[0,-.09,0],legColor,'shin');
    ball(knee,[.046,.045,.045],[0,-.17,0],shorts||bareLeg?skin:legColor,'ankle');
    const foot=new THREE.Group();foot.name='avatar-foot';knee.add(foot);
    legs.push({thigh,knee,foot,sign:s});
  }

  const front=.117;
  const buttons=(xs,ys,c=gold)=>{for(const x of xs)for(const y of ys)ball(hip,[.011,.011,.007],[x,y,front+.012],c,'button');};
  const pocket=(x,y,w=.08,h=.075,c=pale)=>box(hip,[w,h,.018],[x,y,front+.012],c,'pocket',.012);
  const collar=(c=cream)=>{for(const s of[-1,1]){const flap=box(hip,[.078,.09,.019],[s*.049,.291,front+.005],c,'collar',.012);flap.rotation.z=s*.5;}};
  const belt=(c=gold)=>{box(hip,[.306,.029,.224],[0,.052,0],c,'waistband',.01);box(hip,[.042,.034,.018],[0,.052,.124],cream,'belt-buckle',.006);};
  const cape=(c,wide=.35,height=.31)=>{
    const mesh=box(hip,[wide,height,.038],[0,.12,-.139],c,'cape',.025);mesh.rotation.x=-.10;
    for(const s of[-1,1]){const edge=box(hip,[.073,height*.84,.04],[s*wide*.40,.12,-.13],c,'cape-fold',.02);edge.rotation.z=s*.12;}
  };
  switch(outfit) {
    case 'ocean-overalls':
      torso.material.color.set(cream);box(hip,[.19,.22,.028],[0,.12,.119],color,'overall-bib',.025);
      for(const s of[-1,1]){box(hip,[.04,.16,.027],[s*.086,.27,.118],color,'overall-strap',.01);ball(hip,[.013,.013,.009],[s*.086,.224,.137],gold,'overall-buckle');}
      pocket(0,.105,.115,.08,pale);for(const l of legs)cylinder(l.knee,.058,.058,.036,[0,-.16,0],pale,'trouser-roll',12);break;
    case 'cloud-hoodie':
      torso.scale.set(1.08,1,1.1);ball(hip,[.145,.14,.081],[0,.30,-.125],color,'hood');
      pocket(0,.11,.19,.082,shade);box(hip,[.30,.035,.226],[0,.033,0],shade,'ribbed-hem',.014);
      for(const s of[-1,1])tube(hip,[[s*.035,.30,.14],[s*.044,.22,.144],[s*.038,.18,.145]],.006,cream,'hood-drawstring');break;
    case 'sunny-raincoat': {
      const skirt=cylinder(hip,.145,.192,.22,[0,.005,0],color,'raincoat-skirt');skirt.scale.z=.70;
      collar(pale);box(hip,[.032,.34,.020],[0,.17,.127],pale,'raincoat-placket',.008);buttons([0],[.08,.17,.26],cream);
      for(const s of[-1,1]){const p=pocket(s*.095,.075,.072,.07,shade);p.rotation.z=s*.24;}break;
    }
    case 'little-chef':
      collar(cream);buttons([-.055,.055],[.12,.20,.27],dark);box(hip,[.25,.16,.027],[0,-.01,.12],cream,'chef-waist-apron',.025);
      box(hip,[.30,.025,.23],[0,.085,0],'#b77f68','apron-belt',.008);ribbon(hip,[0,.31,.127],'#b77f68','chef-neckerchief');break;
    case 'moon-explorer':
      torso.scale.set(1.12,1.08,1.10);band(hip,.088,.026,[0,.327,0],dark,'space-collar');
      box(hip,[.21,.13,.045],[0,.19,.142],navy,'space-control-panel',.022);box(hip,[.13,.033,.012],[0,.218,.17],'#8ec6ba','space-screen',.006);
      for(const s of[-1,1])ball(hip,[.018,.018,.008],[s*.044,.16,.173],s<0?gold:'#c08c7b','space-button');
      box(hip,[.29,.27,.13],[0,.19,-.176],cream,'space-backpack',.04);belt(navy);
      for(const l of legs)cylinder(l.knee,.057,.057,.045,[0,-.07,0],cream,'space-knee',12);break;
    case 'field-sports':
      for(const s of[-1,1]){box(hip,[.028,.25,.016],[s*.118,.16,.119],cream,'jersey-stripe',.006);box(legs[s===-1?0:1].thigh,[.014,.13,.064],[s*.054,-.07,0],cream,'shorts-stripe',.005);}
      star(hip,.035,[0,.21,.124],cream,'team-star');break;
    case 'petal-dress': {
      const skirt=cylinder(hip,.13,.235,.25,[0,-.055,0],color,'dress-skirt',24);skirt.scale.z=.75;
      const hem=cylinder(hip,.224,.239,.035,[0,-.171,0],pale,'dress-hem',24);hem.scale.z=.75;
      box(hip,[.28,.03,.223],[0,.064,0],cream,'dress-waist',.01);ribbon(hip,[0,.065,.128],pale,'dress-bow');break;
    }
    case 'velvet-suit':
      box(hip,[.16,.24,.023],[0,.18,.119],cream,'formal-shirt',.014);
      for(const s of[-1,1]){const lapel=box(hip,[.07,.20,.025],[s*.072,.22,.138],shade,'suit-lapel',.013);lapel.rotation.z=s*.25;}
      ribbon(hip,[0,.293,.147],gold,'bowtie');buttons([0],[.105,.15],gold);pocket(-.112,.13,.055,.045,pale);break;
    case 'star-wizard': {
      const robe=cylinder(hip,.141,.203,.35,[0,-.055,0],color,'wizard-robe',20);robe.scale.z=.70;
      cape(shade,.38,.37);collar(gold);box(hip,[.027,.43,.024],[0,.11,.14],gold,'robe-front-trim',.008);
      star(hip,.045,[.077,.22,.128],cream,'robe-star');belt(shade);break;
    }
    case 'forest-explorer':
      torso.material.color.set(cream);for(const s of[-1,1]){box(hip,[.132,.26,.027],[s*.083,.17,.117],color,'explorer-vest',.018);pocket(s*.08,.14,.075,.095,pale);}
      const strap=box(hip,[.028,.37,.020],[0,.16,.150],shade,'satchel-strap',.008);strap.rotation.z=-.48;
      box(hip,[.12,.13,.065],[.17,.045,.075],'#b38765','satchel',.02);break;
    case 'sea-sailor':
      torso.material.color.set(cream);box(hip,[.27,.11,.025],[0,.287,-.114],color,'sailor-back-collar',.012);
      for(const s of[-1,1]){const fl=box(hip,[.085,.15,.024],[s*.06,.267,.122],color,'sailor-front-collar',.009);fl.rotation.z=s*.46;}
      box(hip,[.027,.12,.018],[0,.214,.143],shade,'sailor-tie',.005);box(hip,[.30,.03,.222],[0,.066,0],color,'sailor-waist',.009);break;
    case 'garden-apron':
      torso.material.color.set('#d1c8ad');box(hip,[.19,.19,.03],[0,.205,.129],color,'apron-bib',.018);
      const apron=cylinder(hip,.15,.185,.21,[0,.015,0],color,'apron-skirt',16);apron.scale.z=.73;
      pocket(0,.07,.19,.08,pale);for(const s of[-1,1])box(hip,[.027,.12,.024],[s*.064,.31,.118],shade,'apron-strap',.008);break;
    case 'winter-parka':
      torso.scale.set(1.12,1.03,1.14);for(const y of[.08,.17,.26]){const puff=box(hip,[.34,.078,.245],[0,y,0],color,'puffer-channel',.035);puff.scale.x=y===.17?1.04:1;}
      band(hip,.088,.033,[0,.327,0],cream,'winter-fleece-collar');box(hip,[.068,.23,.028],[.057,.23,.153],pale,'scarf-tail',.013);
      box(hip,[.022,.29,.014],[0,.18,.133],shade,'parka-zip',.005);break;
    case 'cozy-pajamas':
      collar(cream);box(hip,[.023,.27,.018],[0,.17,.124],cream,'pajama-piping',.006);buttons([0],[.10,.17,.24],shade);pocket(-.085,.20,.065,.060,pale);
      for(const l of legs)cylinder(l.knee,.057,.057,.035,[0,-.16,0],cream,'pajama-cuff',12);break;
    case 'ribbon-tutu':
      torso.scale.x=.84;for(const [y,r,c]of[[.005,.25,color],[-.045,.275,pale]]){const tutu=cylinder(hip,.105,r,.095,[0,y,0],c,'tutu-layer',24);tutu.scale.z=.75;}
      box(hip,[.26,.045,.218],[0,.076,0],cream,'tutu-waist',.012);ribbon(hip,[.07,.08,.131],color,'tutu-ribbon');break;
    case 'storybook-knight':
      box(hip,[.25,.23,.055],[0,.19,.119],pale,'knight-breastplate',.05);cape('#bc8a80',.33,.30);
      for(const arm of arms)ball(arm.shoulder,[.074,.060,.076],[0,0,0],pale,'knight-pauldron');
      star(hip,.044,[0,.20,.152],gold,'knight-emblem');belt(shade);break;
    default:
      pocket(-.075,.205,.07,.065,cream);break;
  }

  // Shoes have real openings/straps/shafts; barefoot geometry remains visible in sandals.
  const footwear=selected.footwear?.skuId.slice(5)??'default';
  const shoeColor=selected.footwear?.color??'#cfb292';
  const shoePale=new THREE.Color(shoeColor).lerp(new THREE.Color(cream),.42);
  for(const {foot} of legs) {
    const sole=box(foot,[.142,.035,.205],[0,-.2325,.034],cream,'shoe-sole',.016);
    if(footwear==='summer-sandals') {
      sole.material.color.set(shoeColor);ball(foot,[.058,.034,.080],[0,-.199,.025],skin,'bare-foot');
      for(const z of[-.002,.072]){const strap=box(foot,[.14,.028,.040],[0,-.174,z],shoeColor,'sandal-strap',.01);strap.rotation.z=z===.072?.14:-.14;}
      const back=box(foot,[.13,.065,.027],[0,-.183,-.056],shoeColor,'sandal-back',.01);back.rotation.x=.1;
    } else if(footwear==='puddle-boots') {
      box(foot,[.14,.080,.20],[0,-.193,.032],shoeColor,'rainboot-foot',.032);
      cylinder(foot,.069,.058,.17,[0,-.12,0],shoeColor,'rainboot-shaft',14);
      band(foot,.065,.011,[0,-.038,0],shoePale,'rainboot-rim');
    } else if(footwear==='ankle-boots') {
      box(foot,[.142,.085,.202],[0,-.19,.033],shoeColor,'boot-foot',.027);
      cylinder(foot,.066,.058,.092,[0,-.13,-.008],shoeColor,'boot-shaft',12);
      band(foot,.064,.013,[0,-.086,-.008],cream,'boot-cuff');
      box(foot,[.015,.037,.039],[.070,-.128,.001],gold,'boot-buckle',.006);
    } else if(footwear==='ballet-flats') {
      sole.scale.set(.86,.6,1);sole.position.y=-.2395;
      ball(foot,[.063,.029,.097],[0,-.215,.029],shoeColor,'dance-shoe');
      band(foot,.052,.008,[0,-.124,0],shoeColor,'ankle-ribbon');
      const strap=box(foot,[.026,.012,.10],[0,-.186,.015],shoeColor,'instep-ribbon',.006);strap.rotation.z=.18;
      ribbon(foot,[0,-.18,.081],shoePale,'shoe-bow');
    } else if(footwear==='bear-slippers') {
      ball(foot,[.087,.058,.108],[0,-.190,.041],shoeColor,'slipper-puff');
      for(const s of[-1,1])ball(foot,[.025,.027,.021],[s*.053,-.144,.083],shoeColor,'slipper-ear');
      ball(foot,[.019,.012,.009],[0,-.177,.145],dark,'slipper-nose');
    } else {
      box(foot,[.137,.061,.195],[0,-.201,.035],shoeColor,'sneaker-body',.025);
      box(foot,[.131,.037,.064],[0,-.200,.112],cream,'sneaker-toecap',.016);
      if(footwear==='canvas-sneakers')for(const z of[.014,.045])box(foot,[.09,.012,.017],[0,-.166,z],cream,'shoelace',.005);
    }
  }

  const hat=selected.headwear?.skuId.slice(5),hatColor=selected.headwear?.color??cream;
  if(hat==='baseball-cap') {
    const dome=add(head,new THREE.SphereGeometry(1,16,8,0,TAU,0,Math.PI/2),[0,.24,-.008],hatColor,'cap-dome');dome.scale.set(.195,.12,.181);
    ball(head,[.172,.019,.125],[0,.241,.158],hatColor,'cap-brim');ball(head,[.020,.014,.019],[0,.365,-.008],hatColor,'cap-button');
  } else if(hat==='artist-beret') {
    const beret=ball(head,[.218,.069,.192],[.023,.30,-.01],hatColor,'beret');beret.rotation.z=-.15;
    capsule(head,.013,.045,[.035,.374,-.015],hatColor,'beret-stem');
  } else if(hat==='straw-sunhat') {
    const brim=cylinder(head,.278,.281,.023,[0,.25,-.006],hatColor,'sunhat-brim',24);brim.scale.z=.90;
    ball(head,[.17,.10,.155],[0,.294,-.007],hatColor,'sunhat-crown');
    const trim=band(head,.169,.013,[0,.27,-.007],'#8b9f7a','sunhat-band');trim.scale.z=.93;
  } else if(hat==='little-crown') {
    band(head,.139,.025,[0,.29,0],hatColor,'crown-base');
    for(const [x,y,z]of[[-.11,.34,.057],[0,.365,.12],[.11,.34,.057]]){
      const tooth=cylinder(head,.007,.033,.10,[x,y,z],hatColor,'crown-point',8);tooth.rotation.z=-x*2;
      ball(head,[.018,.018,.018],[x*1.09,y+.052,z],hatColor,'crown-tip');
    }
    ball(head,[.025,.026,.014],[0,.302,.145],'#90b7ae','crown-gem');
  } else if(hat==='bunny-headband') {
    tube(head,[[-.181,.18,0],[-.155,.32,0],[0,.35,0],[.155,.32,0],[.181,.18,0]],.017,hatColor,'bunny-headband');
    for(const s of[-1,1]){
      const ear=ball(head,[.046,.151,.031],[s*.09,.465,0],hatColor,'bunny-ear');ear.rotation.z=-s*.12;
      const center=ball(head,[.023,.112,.013],[s*.09,.471,.026],'#dca6a5','bunny-inner-ear');center.rotation.z=-s*.12;
    }
  } else if(hat==='pom-beanie') {
    const dome=add(head,new THREE.SphereGeometry(1,16,8,0,TAU,0,Math.PI/2),[0,.24,0],hatColor,'beanie-dome');dome.scale.set(.193,.16,.177);
    const rim=band(head,.179,.026,[0,.24,0],hatColor,'beanie-fold');rim.scale.z=.91;
    ball(head,[.061,.061,.060],[0,.43,0],cream,'beanie-pompom');
  } else if(hat==='music-headphones') {
    tube(head,[[-.195,.09,0],[-.195,.26,0],[-.12,.36,0],[.12,.36,0],[.195,.26,0],[.195,.09,0]],.020,hatColor,'headphone-band');
    for(const s of[-1,1]){
      const pad=cylinder(head,.069,.069,.038,[s*.195,.09,0],cream,'headphone-cushion',16);pad.rotation.z=Math.PI/2;
      const shell=cylinder(head,.061,.061,.035,[s*.225,.09,0],hatColor,'headphone-shell',16);shell.rotation.z=Math.PI/2;
    }
  } else if(hat==='chef-toque') {
    cylinder(head,.135,.153,.12,[0,.309,0],hatColor,'chef-hat-band');
    for(const [x,z]of[[-.07,-.05],[.07,-.05],[-.065,.06],[.065,.06]])ball(head,[.107,.09,.10],[x,.402,z],hatColor,'chef-hat-cloud');
  }

  const book=new THREE.Group();book.name='avatar-reading-book';hip.add(book);book.position.set(0,.15,.255);
  for(const s of[-1,1]){const cover=box(book,[.11,.027,.15],[s*.052,0,0],'#b98b6b','book-cover',.007);cover.rotation.z=-s*.20;box(book,[.095,.019,.13],[s*.05,.018,0],cream,'book-pages',.004).rotation.z=-s*.20;}
  const utensil=new THREE.Group();utensil.name='avatar-cooking-spoon';arms[1].elbow.add(utensil);utensil.position.set(0,-.18,.015);
  capsule(utensil,.009,.15,[0,-.055,0],'#b88d61','spoon-handle');ball(utensil,[.028,.036,.012],[0,-.15,0],'#b88d61','spoon-bowl');
  book.visible=false;utensil.visible=false;

  const seatDrapes=[],seatTrims=[],lieRemovables=[],lieFolds=[];
  const headwearParts=/^(cap-|beret|sunhat-|crown-|bunny-|beanie-|headphone-|chef-hat-)/;
  root.traverse(node=>{
    if(!node.isMesh)return;
    const part=node.userData.avatarPart;
    if(['raincoat-skirt','wizard-robe','dress-skirt','dress-hem','tutu-layer','apron-skirt','chef-waist-apron'].includes(part))seatDrapes.push({mesh:node,position:node.position.clone(),scale:node.scale.clone(),rotation:node.rotation.clone()});
    if(part==='robe-front-trim'||part==='cape'||part==='cape-fold')seatTrims.push({mesh:node,position:node.position.clone(),scale:node.scale.clone(),rotation:node.rotation.clone()});
    if(part==='space-backpack'||part==='cape'||part==='cape-fold'||headwearParts.test(part))lieRemovables.push({mesh:node,visible:node.visible});
    if(part==='hood'||part==='hair-ponytail'||part==='hair-tie'||part==='sailor-back-collar')lieFolds.push({mesh:node,position:node.position.clone(),scale:node.scale.clone(),rotation:node.rotation.clone()});
  });
  const lieDepth=Math.max(.115,.1075*torso.scale.z);
  for(const item of seatDrapes){
    item.mesh.geometry.computeBoundingBox();
    const back=item.mesh.geometry.boundingBox.min.z*item.scale.z;
    item.lieScaleZ=back<0?Math.min(1,(lieDepth+item.position.z)/-back):1;
  }
  const rig={motion,hip,head,arms,legs,book,utensil,seatDrapes,seatTrims,lieRemovables,lieFolds,lieDepth,headRestPosition:head.position.clone(),lieHeadShift:0,lieHeight:0};
  root.userData={avatar:true,appearance:{...appearance},equipped:Object.fromEntries(Object.entries(selected).map(([slot,product])=>[slot,product?.skuId??null])),rig,
    origin:'feet',height:1.15,radius:.29,forward:'+z'};
  // Cache the lying envelope once per outfit, never traverse the character on the animation hot path.
  poseHomeAvatar(root,{action:'lie'});
  // The oversized toy head settles beside the torso rather than lifting the whole torso off the bed.
  rig.lieHeadShift=-lieDepth-visibleMeshBounds(head).min.y;
  poseHomeAvatar(root,{action:'lie'});
  rig.lieHeight=-visibleMeshBounds(root).min.y;
  poseHomeAvatar(root);root.updateMatrixWorld(true);
  for(const leg of legs) {
    const bounds=visibleMeshBounds(leg.foot),position=leg.foot.getWorldPosition(new THREE.Vector3());
    leg.footBounds={minY:bounds.min.y-position.y,maxY:bounds.max.y-position.y,minZ:bounds.min.z-position.z,maxZ:bounds.max.z-position.z};
  }
  root.userData.height=visibleMeshBounds(root).max.y;
  return root;
}

/** Pose time is elapsed seconds. The scene owns scheduling; no internal RAF or timers. */
export function poseHomeAvatar(model,{action='idle',time=0}={}) {
  const rig=model?.userData?.rig;if(!rig)return model;
  time=Number.isFinite(time)?time:0;
  const {motion,hip,head,arms,legs,book,utensil}=rig;
  motion.position.set(0,0,0);motion.rotation.set(0,0,0);hip.position.set(0,.43,0);hip.rotation.set(0,0,0);head.rotation.set(0,0,0);head.position.copy(rig.headRestPosition);
  for(const a of arms){a.shoulder.rotation.set(0,0,-a.sign*.07);a.elbow.rotation.set(0,0,0);}
  for(const l of legs){l.thigh.rotation.set(0,0,0);l.knee.rotation.set(0,0,0);}
  for(const item of[...rig.seatDrapes,...rig.seatTrims,...rig.lieFolds]){item.mesh.position.copy(item.position);item.mesh.scale.copy(item.scale);item.mesh.rotation.copy(item.rotation);}
  for(const item of rig.lieRemovables)item.mesh.visible=item.visible;
  book.visible=action==='read';utensil.visible=action==='cook';
  if(action==='walk') {
    const beat=Math.sin(time*7.5);hip.position.y+=Math.abs(beat)*.012;
    for(const l of legs){l.thigh.rotation.x=l.sign*beat*.53;l.knee.rotation.x=Math.max(0,-l.sign*beat)*.32;}
    // Account for the toe's depth when a leg swings: no shoe is driven below the floor.
    let lowest=0;
    for(const l of legs)if(l.footBounds){
      const a=l.thigh.rotation.x,b=a+l.knee.rotation.x,f=l.footBounds;
      for(const y of[f.minY,f.maxY])for(const z of[f.minZ,f.maxZ])lowest=Math.min(lowest,hip.position.y-.18*Math.cos(a)+y*Math.cos(b)-z*Math.sin(b));
    }
    hip.position.y-=lowest;
    for(const a of arms)a.shoulder.rotation.x=-a.sign*beat*.39;
    head.rotation.z=Math.sin(time*7.5)*.016;
  } else if(action==='sit') {
    hip.position.y=.05;
    for(const l of legs){l.thigh.rotation.x=-Math.PI/2;l.knee.rotation.x=Math.PI/2;}
    for(const a of arms){a.shoulder.rotation.x=-.52;a.elbow.rotation.x=-.25;}
    for(const item of rig.seatDrapes){
      item.mesh.rotation.x=-Math.PI/2;
      item.mesh.scale.z=item.scale.z*.24;
      item.mesh.position.set(item.position.x,.015,Math.max(.025,-item.position.y));
    }
    for(const item of rig.seatTrims){item.mesh.scale.y=item.scale.y*.72;item.mesh.position.y=item.position.y+.04;}
  } else if(action==='lie') {
    hip.position.y=0;motion.rotation.x=-Math.PI/2;motion.position.y=rig.lieHeight;
    head.position.z+=rig.lieHeadShift;
    for(const a of arms)a.shoulder.rotation.z=-a.sign*.16;
    for(const l of legs){l.thigh.rotation.x=.085;l.knee.rotation.x=.015;}
    for(const item of rig.lieRemovables)item.mesh.visible=false;
    for(const item of rig.seatDrapes)item.mesh.scale.z=item.scale.z*item.lieScaleZ;
    for(const item of rig.lieFolds){
      const part=item.mesh.userData.avatarPart;
      if(part==='hood'){item.mesh.position.z=-.055;item.mesh.scale.z=item.scale.z*.5;}
      if(part==='hair-ponytail'){item.mesh.position.z=-.09;item.mesh.scale.z=item.scale.z*.75;}
      if(part==='hair-tie')item.mesh.position.z=-.10;
      if(part==='sailor-back-collar')item.mesh.position.z=-.10;
    }
  } else if(action==='wave') {
    arms[1].shoulder.rotation.z=-2.28;arms[1].shoulder.rotation.x=-.15;
    arms[1].elbow.rotation.z=-.20+Math.sin(time*8)*.28;head.rotation.z=-.08;
  } else if(action==='read') {
    head.rotation.x=.16;for(const a of arms){a.shoulder.rotation.x=-.92;a.shoulder.rotation.z=-a.sign*.12;a.elbow.rotation.x=-.38;}
  } else if(action==='wash') {
    head.rotation.x=.18;for(const a of arms){a.shoulder.rotation.x=-1.78;a.shoulder.rotation.z=-a.sign*.08;a.elbow.rotation.x=-.62+Math.sin(time*8+a.sign)*.14;}
  } else if(action==='cook') {
    head.rotation.x=.12;arms[0].shoulder.rotation.x=-1.65;arms[0].elbow.rotation.x=-.60;
    arms[1].shoulder.rotation.x=-1.72+Math.sin(time*5)*.12;arms[1].shoulder.rotation.z=-.13+Math.cos(time*5)*.13;arms[1].elbow.rotation.x=-.62;
  } else {
    head.rotation.y=Math.sin(time*.65)*.035;for(const a of arms)a.shoulder.rotation.x=Math.sin(time*1.7)*.025;
  }
  model.userData.action=action;return model;
}

export function createClothingPreview(skuId,{appearance=DEFAULT_AVATAR_APPEARANCE}={}) {
  const product=getClothingProduct(skuId);if(!product)throw new RangeError(`Unknown clothing SKU: ${skuId}`);
  return createHomeAvatar({appearance,equipped:{[product.slot]:skuId}});
}

export function disposeHomeAvatar(model) {
  if(!model||model.userData?.disposed)return;
  const geometries=new Set(),materials=new Set();
  model.traverse(node=>{if(!node.isMesh)return;geometries.add(node.geometry);for(const material of(Array.isArray(node.material)?node.material:[node.material]))materials.add(material);});
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
  model.removeFromParent();model.userData.disposed=true;
}
