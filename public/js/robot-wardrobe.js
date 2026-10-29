import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {ROBOT_CLOTHING_PRODUCTS} from './robot-wardrobe-catalog.js';

const bySku=new Map(ROBOT_CLOTHING_PRODUCTS.map(product=>[product.skuId,product]));
const SLOTS=['outfit','headwear','footwear'];
const CREAM='#fff0d8',INK='#334857',GOLD='#deb45c';

/** Garments fit robot v4 in metres, not the old toy avatar. Each rigid section is
 * attached below its authored joint, so walking/seating never leaves it behind.
 * Only resources created here are owned here; the source GLB stays untouched. */
export function createRobotWardrobe(robot) {
  if(!robot?.isObject3D||!robot.userData.robotAvatar)throw new TypeError('Expected a robot avatar.');
  const joints=Object.fromEntries(['Torso','Head','ShoulderL','ShoulderR','ElbowL','ElbowR','HipL','HipR','KneeL','KneeR','AnkleL','AnkleR']
    .map(name=>[name,robot.getObjectByName(name)]));
  if(Object.values(joints).some(node=>!node))throw new TypeError('Robot wardrobe requires the authored v4 joints.');
  const active=new Map();let disposed=false;

  function build(product) {
    const attachments=[],geometries=new Set(),materials=new Map();
    const id=product.skuId.slice(5),color=product.color;
    const pale=new THREE.Color(color).lerp(new THREE.Color(CREAM),.45);
    const dark=new THREE.Color(color).multiplyScalar(.68);
    const material=(value,metalness=0)=>{
      const key=`${new THREE.Color(value).getHexString()}:${metalness}`;
      if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color:value,roughness:metalness?.44:.78,metalness}));
      return materials.get(key);
    };
    function attach(joint) {
      const group=new THREE.Group();group.name=`robot-wear-${id}-${joint}`;
      group.userData={robotWardrobe:true,skuId:product.skuId,slot:product.slot};
      attachments.push({joint:joints[joint],group});return group;
    }
    function add(parent,geometry,position,value,part,metalness=0) {
      geometries.add(geometry);const mesh=new THREE.Mesh(geometry,material(value,metalness));
      mesh.position.set(...position);mesh.name=`robot-wear-${id}-${part}`;
      mesh.userData={surfaceId:'avatar',avatar:true,robotWardrobe:true,skuId:product.skuId,slot:product.slot};
      mesh.castShadow=false;mesh.receiveShadow=true;parent.add(mesh);return mesh;
    }
    const box=(p,size,pos,c,part,r=.025,metal=0)=>add(p,new RoundedBoxGeometry(...size,2,Math.min(r,Math.min(...size)*.4)),pos,c,part,metal);
    function ball(p,size,pos,c,part) {const mesh=add(p,new THREE.SphereGeometry(1,16,10),pos,c,part);mesh.scale.set(...size);return mesh;}
    const cylinder=(p,rt,rb,h,pos,c,part)=>add(p,new THREE.CylinderGeometry(rt,rb,h,20),pos,c,part);
    function line(p,points,r,c,part) {
      return add(p,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point))),12,r,6,false),[0,0,0],c,part);
    }
    function shape(p,points,depth,pos,c,part,metal=0) {
      const outline=new THREE.Shape();points.forEach(([x,y],i)=>i?outline.lineTo(x,y):outline.moveTo(x,y));outline.closePath();
      return add(p,new THREE.ExtrudeGeometry(outline,{depth,bevelEnabled:true,bevelSize:.004,bevelThickness:.003,bevelSegments:1}),pos,c,part,metal);
    }
    // Authored shell geometry is already expressed in the corresponding joint's
    // local coordinates. A 4 mm cloth layer follows that actual contour.
    function coverShell(joint,shellName,c,part) {
      const shell=robot.getObjectByName(shellName);if(!shell?.isMesh)throw new Error(`Missing robot shell ${shellName}`);
      const geometry=shell.geometry.clone();geometry.computeBoundingBox();
      const centre=geometry.boundingBox.getCenter(new THREE.Vector3()),size=geometry.boundingBox.getSize(new THREE.Vector3());
      geometry.translate(-centre.x,-centre.y,-centre.z);geometry.scale(1+.008/size.x,1+.004/size.y,1+.008/size.z);geometry.translate(centre.x,centre.y,centre.z);
      return add(attach(joint),geometry,[0,0,0],c,part);
    }
    const torso=()=>attach('Torso');
    function shirt(c= color) {
      coverShell('Torso','TorsoShell',c,'body');
      for(const side of['L','R'])coverShell(`Shoulder${side}`,`UpperArmShell${side}`,c,`sleeve-${side}`);
    }
    function sleeves(c=color) {for(const side of['L','R'])coverShell(`Elbow${side}`,`ForearmShell${side}`,c,`forearm-${side}`);}
    function trousers(c=color,long=true) {
      for(const side of['L','R']){
        coverShell(`Hip${side}`,`ThighShell${side}`,c,`trouser-${side}`);
        if(long)coverShell(`Knee${side}`,`ShinShell${side}`,c,`trouser-lower-${side}`);
      }
    }
    function collar(parent,c=CREAM) {
      for(const s of[-1,1]){const flap=box(parent,[.10,.10,.024],[s*.052,.125,.146],c,`collar-${s}`, .009);flap.rotation.z=s*.48;}
    }
    const button=(p,x,y,c=GOLD)=>ball(p,[.013,.013,.008],[x,y,.155],c,`button-${x}-${y}`);
    function pocket(p,x,y,w=.105,h=.085,c=pale) {box(p,[w,h,.022],[x,y,.151],c,`pocket-${x}-${y}`, .013);}

    try {
    if(product.slot==='outfit') {
      const p=torso();
      switch(id) {
        case 'ocean-overalls': {
          shirt(CREAM);trousers(color);
          box(p,[.27,.22,.025],[0,-.055,.151],color,'denim-bib',.025);
          for(const s of[-1,1]){box(p,[.048,.19,.025],[s*.10,.115,.143],color,`strap-${s}`,.01);button(p,s*.10,.035);}
          pocket(p,0,-.07,.16,.085,pale);
          for(const side of['L','R'])box(attach(`Knee${side}`),[.164,.033,.166],[side==='L'?.011:-.011,-.19,.003],pale,`rolled-hem-${side}`,.012);
          break;
        }
        case 'cloud-hoodie': {
          shirt();sleeves();trousers(dark);
          box(p,[.23,.11,.035],[0,-.11,.157],pale,'kangaroo-pocket',.035);
          line(p,[[-.15,.13,-.12],[-.16,.235,-.09],[0,.28,-.115],[.16,.235,-.09],[.15,.13,-.12]],.035,color,'folded-hood');
          for(const s of[-1,1])line(p,[[s*.05,.17,.15],[s*.055,.10,.17],[s*.06,.05,.17]],.007,CREAM,`drawstring-${s}`);
          break;
        }
        case 'little-chef': {
          shirt(CREAM);sleeves(CREAM);trousers(INK);collar(p);
          box(p,[.29,.145,.025],[0,-.12,.151],'#e7dbc7','waist-apron',.014);
          box(p,[.34,.027,.028],[0,-.05,.15],color,'apron-belt',.01);
          for(const x of[-.065,.065])for(const y of[.09,.035,-.02])button(p,x,y,INK);
          const scarf=box(p,[.06,.075,.026],[0,.13,.167],'#ce7661','chef-neckerchief',.012);scarf.rotation.z=.65;
          break;
        }
        case 'forest-explorer': {
          shirt();trousers(dark,false);
          box(p,[.035,.34,.022],[0,-.005,.148],INK,'open-vest-seam',.005);
          for(const s of[-1,1]){pocket(p,s*.10,.075,.105,.09);pocket(p,s*.10,-.105,.12,.11);}
          line(p,[[-.15,.18,.16],[-.04,0,.17],[.14,-.18,.15]],.017,'#765641','utility-strap');
          box(p,[.115,.12,.05],[.125,-.12,.17],'#765641','satchel',.025);
          break;
        }
        case 'cozy-pajamas': {
          shirt();sleeves();trousers();collar(p,CREAM);
          box(p,[.02,.32,.018],[0,-.025,.153],CREAM,'button-piping',.005);
          for(const y of[.07,-.015,-.10])button(p,0,y,CREAM);
          pocket(p,-.105,.045,.075,.07,pale);
          for(const side of['L','R'])box(attach(`Knee${side}`),[.16,.024,.165],[side==='L'?.011:-.011,-.19,.003],CREAM,`cuff-${side}`,.008);
          break;
        }
        case 'sea-sailor': {
          shirt();trousers(INK,false);collar(p,CREAM);
          box(p,[.28,.10,.025],[0,.115,-.142],CREAM,'square-sailor-back-collar',.012);
          for(const s of[-1,1])line(p,[[s*.12,.17,.157],[s*.07,.09,.17],[s*.02,.12,.17]],.008,INK,`sailor-stripe-${s}`);
          shape(p,[[0,.055],[.025,0],[0,-.095],[-.025,0]],.014,[0,.075,.175],'#ce7661','sailor-tie');
          box(p,[.32,.025,.018],[0,-.14,.15],CREAM,'sailor-waist-stripe',.005);
          break;
        }
        case 'garden-apron': {
          shirt(CREAM);trousers('#6f8979');
          box(p,[.28,.31,.025],[0,-.025,.155],color,'garden-bib',.026);
          for(const s of[-1,1])box(p,[.042,.12,.025],[s*.105,.16,.145],color,`apron-strap-${s}`,.009);
          pocket(p,0,-.085,.22,.09,pale);
          for(const side of['L','R'])box(attach(`Hip${side}`),[.14,.13,.018],[0,-.075,.082],color,`split-apron-skirt-${side}`,.018);
          break;
        }
        case 'storybook-knight': {
          shirt('#71878c');trousers(INK);
          shape(p,[[-.15,.16],[.15,.16],[.145,-.08],[0,-.195],[-.145,-.08]],.025,[0,0,.143],color,'shield-breastplate',.3);
          shape(p,[[0,.075],[.026,.025],[.08,.02],[.04,-.02],[.048,-.08],[0,-.05],[-.048,-.08],[-.04,-.02],[-.08,.02],[-.026,.025]],.012,[0,.01,.178],GOLD,'knight-star',.4);
          for(const side of['L','R'])box(attach(`Shoulder${side}`),[.125,.075,.16],[0,.035,0],pale,`shoulder-plate-${side}`,.03,.35);
          for(const s of[-1,0,1]){const panel=box(p,[.135,.335,.022],[s*.115,-.02,-.287],'#ae6f72',`cape-panel-${s}`,.02);panel.rotation.z=s*.09;}
          break;
        }
        default:throw new RangeError(`Missing robot outfit ${id}`);
      }
    } else if(product.slot==='headwear') {
      const p=attach('Head');
      // The head shell top is y=.16; the visor remains below y=.11.
      const cap=(c,top=.19,height=.09)=>{
        const mesh=add(p,new THREE.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI/2),[0,top-height,-.02],c,'cap-crown');mesh.scale.set(.235,height,.162);
      };
      switch(id) {
        case 'baseball-cap':
          cap(color,.245,.095);box(p,[.32,.022,.20],[0,.153,.12],color,'broad-visor',.05);
          ball(p,[.016,.013,.016],[0,.247,-.02],CREAM,'cap-button');break;
        case 'artist-beret': {
          const hat=ball(p,[.248,.075,.18],[-.025,.20,-.025],color,'slouched-beret');hat.rotation.z=.12;
          cylinder(p,.014,.017,.038,[-.04,.28,-.03],dark,'beret-stem');break;
        }
        case 'chef-toque':
          box(p,[.36,.125,.26],[0,.205,-.025],CREAM,'toque-band',.04);
          for(const [x,y,z]of[[-.115,.30,-.025],[0,.34,.025],[.115,.30,-.025],[0,.31,-.09]])ball(p,[.10,.09,.095],[x,y,z],CREAM,'toque-puff');break;
        case 'little-crown': {
          const band=cylinder(p,.195,.20,.045,[0,.17,-.025],GOLD,'crown-band');band.scale.z=.75;
          shape(p,[[-.185,0],[-.18,.11],[-.095,.055],[0,.15],[.095,.055],[.18,.11],[.185,0]],.023,[0,.18,.10],GOLD,'three-crown-peaks',.45);
          ball(p,[.028,.032,.016],[0,.242,.13],'#72b8b6','crown-jewel');break;
        }
        case 'bunny-headband':
          line(p,[[-.23,.09,0],[-.20,.18,0],[0,.20,-.02],[.20,.18,0],[.23,.09,0]],.02,CREAM,'headband');
          for(const s of[-1,1]){const ear=ball(p,[.052,.13,.032],[s*.12,.31,-.015],CREAM,`rabbit-ear-${s}`);ear.rotation.z=-s*.16;
            const inner=ball(p,[.029,.095,.009],[s*.12,.315,.015],'#d99c9d',`rabbit-ear-inner-${s}`);inner.rotation.z=-s*.16;}break;
        case 'pom-beanie':
          cap(color,.285,.14);box(p,[.47,.043,.32],[0,.155,-.025],pale,'knitted-cuff',.02);
          ball(p,[.055,.06,.052],[0,.325,-.025],CREAM,'wool-pom');break;
      }
    } else {
      for(const side of['L','R']) {
        const p=attach(`Ankle${side}`);
        // Original sole is y=-.125 in ankle space. Preserve ground contact rather
        // than putting a larger shoe underneath and sinking it into the floor.
        box(p,[.211,.034,.303],[0,-.108,.067],CREAM,`sole-${side}`,.013);
        box(p,[.205,.10,.288],[0,-.058,.063],color,`shoe-${side}`, .04);
        if(id==='canvas-sneakers') {
          box(p,[.197,.064,.095],[0,-.060,.164],CREAM,`rubber-toe-${side}`,.022);
          for(const z of[.035,.065,.095])box(p,[.105,.012,.012],[0,-.003,z],CREAM,`lace-${side}-${z}`,.004);
        } else if(id==='puddle-boots'||id==='ankle-boots') {
          const height=id==='puddle-boots'?.18:.105;
          box(p,[.16,height,.17],[0,height/2-.02,0],color,`boot-shaft-${side}`,.03);
          box(p,[.177,.033,.187],[0,height-.035,0],pale,`boot-cuff-${side}`,.012);
          if(id==='ankle-boots')box(p,[.025,.04,.032],[side==='L'?.09:-.09,.025,.03],GOLD,`boot-buckle-${side}`,.008,.35);
        } else if(id==='bear-slippers') {
          ball(p,[.098,.064,.10],[0,-.025,.106],pale,`bear-face-${side}`);
          for(const s of[-1,1]){ball(p,[.028,.031,.02],[s*.068,.025,.10],color,`bear-ear-${side}-${s}`);ball(p,[.007,.007,.006],[s*.033,-.001,.194],INK,`bear-eye-${side}-${s}`);}
          ball(p,[.014,.011,.009],[0,-.025,.204],INK,`bear-nose-${side}`);
        }
      }
    }
    } catch(error) {
      for(const geometry of geometries)geometry.dispose();
      for(const m of materials.values())m.dispose();
      throw error;
    }
    let released=false;
    return {skuId:product.skuId,
      mount(){for(const {joint,group}of attachments)joint.add(group);},
      dispose(){if(released)return;released=true;for(const {group}of attachments)group.removeFromParent();for(const geometry of geometries)geometry.dispose();for(const m of materials.values())m.dispose();},
    };
  }

  function setEquipment(equipped={}) {
    if(disposed)throw new Error('Robot wardrobe has been disposed.');
    const next=new Map();
    for(const slot of SLOTS){const skuId=equipped?.[slot];if(!skuId)continue;const product=bySku.get(skuId);
      if(!product||product.slot!==slot)throw new RangeError(`Unsupported robot ${slot}: ${skuId}`);next.set(slot,product);}
    // Validate and build before touching the visible wardrobe. A failed swap
    // must leave the previously equipped clothing and its resources intact.
    const replacements=new Map();
    try {for(const [slot,product]of next)if(active.get(slot)?.skuId!==product.skuId)replacements.set(slot,build(product));}
    catch(error){for(const entry of replacements.values())entry.dispose();throw error;}
    for(const [slot,entry]of active)if(!next.has(slot)||replacements.has(slot)){entry.dispose();active.delete(slot);}
    for(const [slot,entry]of replacements){entry.mount();active.set(slot,entry);}
    return Object.freeze(Object.fromEntries(SLOTS.map(slot=>[slot,active.get(slot)?.skuId??null])));
  }
  return {setEquipment,dispose(){if(disposed)return;disposed=true;for(const entry of active.values())entry.dispose();active.clear();}};
}
