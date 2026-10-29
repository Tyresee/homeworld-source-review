import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createEstateManor, DEFAULT_MANOR_PLANS } from './home-estate-manor.js';
import { resolveRooms, createRoom, getFloorRects, getFloorBounds } from './home-layout.js';
import { WALL_HEIGHT } from './home-room-expansion.js';
import { STOREY_HEIGHT } from './home-staircase.js';
import { createWarmGableRoof } from './home-roof-gable.js';

/** Independent, selectable art studies. These never mutate a saved home. */
export const ROOF_CANDIDATES = Object.freeze([
  { id:'A', name:"DisplayText2472", subtitle:"DisplayText2473 · DisplayText2474", color:'#bc6546', description:"DisplayText2475, DisplayText2476.DisplayText2477, DisplayText2478, DisplayText2479." },
  { id:'B', name:"DisplayText2480", subtitle:"DisplayText2481 · DisplayText2482", color:'#567e8a', description:"DisplayText2483, DisplayText2484.DisplayText2485, DisplayText2486." },
  { id:'C', name:"DisplayText2487", subtitle:"DisplayText2488 · DisplayText2489", color:'#3c665e', description:"DisplayText2490, DisplayText2491.DisplayText2492, DisplayText2493." },
]);
export function roofReviewFloors(shape='starter') {
  if(!['starter','lshape','storeys'].includes(shape))throw new TypeError('Unknown house footprint');
  const living = resolveRooms('starter')[0];
  if(shape === 'starter') return [{ rooms:[living] }];
  const rooms = [living, createRoom('study',1,-1,'roof-study'), createRoom('bedroom',-1,1,'roof-bedroom')];
  return shape === 'storeys' ? [{rooms},{rooms:[{...living,id:'roof-upper'}]}] : [{rooms}];
}

function subtract(r,c) {
  const x0=Math.max(r.minX,c.minX), x1=Math.min(r.maxX,c.maxX), z0=Math.max(r.minZ,c.minZ), z1=Math.min(r.maxZ,c.maxZ);
  if(x1<=x0||z1<=z0) return [r];
  return [{minX:r.minX,maxX:x0,minZ:r.minZ,maxZ:r.maxZ},{minX:x1,maxX:r.maxX,minZ:r.minZ,maxZ:r.maxZ},
    {minX:x0,maxX:x1,minZ:r.minZ,maxZ:z0},{minX:x0,maxX:x1,minZ:z1,maxZ:r.maxZ}].filter(p=>p.maxX-p.minX>.001&&p.maxZ-p.minZ>.001);
}
export function roofReviewPatches(floors) {
  return floors.flatMap((floor,index)=>getFloorRects(floor).flatMap(rect=>{
    let patches=[rect];
    for(const covered of floors[index+1]?getFloorRects(floors[index+1]):[]) patches=patches.flatMap(r=>subtract(r,covered));
    return patches.map(rect=>({...rect,storey:index}));
  }));
}

export function createRoofCandidate({id='A',shape='starter'}={}) {
  const style=ROOF_CANDIDATES.find(s=>s.id===id);
  if(!style) throw new TypeError('Unknown roof study');
  const floors=roofReviewFloors(shape), bounds=getFloorBounds(floors[0]);
  const shell=createEstateManor({floors,plans:DEFAULT_MANOR_PLANS});
  // Copy the real house shell; only replace roof geometry in this isolated study.
  const removed=[];
  shell.traverse(node=>{if(node.userData.buildingPart==='roof'&&node.parent?.userData.buildingPart!=='roof')removed.push(node);});
  removed.forEach(node=>node.removeFromParent());
  const source=new THREE.Group();source.add(shell);
  const mats=new Map(), geometries=new Set();
  function mat(color) {if(!mats.has(color))mats.set(color,new THREE.MeshStandardMaterial({color,roughness:.79}));return mats.get(color);}
  function mesh(geo,color,parent) {geometries.add(geo);const m=new THREE.Mesh(geo,mat(color));parent.add(m);return m;}
  function box(size,color,pos,parent,r=.045) {const m=mesh(new RoundedBoxGeometry(...size,1,Math.min(r,...size.map(v=>v/2))),color,parent);m.position.set(...pos);return m;}
  function surface(points,color,parent) {
    const p=[];for(let i=1;i<points.length-1;i++)p.push(...points[0],...points[i],...points[i+1]);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();
    const m=mesh(g,color,parent);m.material.side=THREE.DoubleSide;return m;
  }
  function beam(from,to,width,color,parent) {
    const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),m=box([width,a.distanceTo(b),width],color,a.clone().add(b).multiplyScalar(.5).toArray(),parent,width*.36);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());return m;
  }
  function gable(w,d,h,parent,color=style.color,tiles=true) {
    for(const sign of [-1,1]) {
      surface([[-w/2,0,sign*d/2],[w/2,0,sign*d/2],[w/2,h,0],[-w/2,h,0]],color,parent);
      surface([[sign*w/2,0,-d/2],[sign*w/2,0,d/2],[sign*w/2,h,0]],'#eee0c4',parent);
      beam([sign*w/2,0,-d/2],[sign*w/2,h,0],.17,'#f4e5c6',parent);
      beam([sign*w/2,0,d/2],[sign*w/2,h,0],.17,'#f4e5c6',parent);
    }
    const angle=Math.atan2(h,d/2),slope=Math.hypot(h,d/2);
    if(tiles)for(const sign of [-1,1])for(let row=0;row<7;row++) {
      const t=(row+.48)/7, cols=Math.max(4,Math.round(w/.47));
      for(let col=0;col<cols;col++) {
        const x=-w/2+(col+.5)*w/cols;
        const tile=box([w/cols-.025,.075,slope/7+.055],['#bd6446','#cb7552','#d3815c'][(col+row*2)%3],[x,h*t+.045,sign*d/2*(1-t)],parent,.035);
        tile.rotation.x=sign*angle;
      }
    }
    box([w+.15,.18,.25],id==='A'?'#ad573e':'#294e49',[0,h+.06,0],parent,.08);
  }
  function hip(w,d,h,parent) {
    const ridge=Math.max(.18,w/2-d*.29);
    const p=[[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,0,d/2],[-w/2,0,d/2],[-ridge,h,0],[ridge,h,0]];
    const palette=id==='C'?['#537569','#45675b','#628270','#3d6056','#7b9987','#294e44']:['#607f89',style.color,'#6c919c','#547682','#7799a1','#355964'];
    surface([p[0],p[1],p[5],p[4]],palette[0],parent);surface([p[3],p[2],p[5],p[4]],palette[1],parent);
    surface([p[0],p[3],p[4]],palette[2],parent);surface([p[1],p[2],p[5]],palette[3],parent);
    // Large slate courses follow each face, rather than floating horizontal stripes.
    for(let row=1;row<7;row++) {
      const t=row/7, zz=d/2*(1-t),xx=w/2-(w/2-ridge)*t;
      for(const sign of [-1,1]){
        beam([-xx,h*t+.025,sign*zz],[xx,h*t+.025,sign*zz],.035,palette[4],parent);
        beam([sign*xx,h*t+.025,-zz],[sign*xx,h*t+.025,zz],.035,palette[4],parent);
        if(id==='B')for(let x=-xx+.36+(row%2)*.26;x<xx-.15;x+=.56){
          const lower=(row-1)/7;
          beam([x,h*lower+.027,sign*d/2*(1-lower)],[x,h*t+.027,sign*zz],.022,palette[4],parent);
        }
      }
    }
    for(const [a,b] of [[p[0],p[4]],[p[3],p[4]],[p[1],p[5]],[p[2],p[5]],[p[4],p[5]]])beam(a.map((v,i)=>i===1?v+.045:v),b.map((v,i)=>i===1?v+.045:v),.14,palette[5],parent);
  }
  function mansard(w,d,h,parent) {
    const inset=Math.min(.65,d*.17), mid=h*.78;
    const base=[[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,0,d/2],[-w/2,0,d/2]];
    const top=base.map(([x,,z])=>[Math.sign(x)*(Math.abs(x)-inset),mid,Math.sign(z)*(Math.abs(z)-inset)]);
    for(let i=0;i<4;i++)surface([base[i],base[(i+1)%4],top[(i+1)%4],top[i]],['#4a7166','#365a51','#496f64','#5b8070'][i],parent);
    box([w-2*inset+.07,.10,d-2*inset+.07],'#32574f',[0,mid+.04,0],parent);
    const cap=new THREE.Group();cap.position.y=mid+.10;parent.add(cap);hip(w-2*inset,d-2*inset,h-mid,cap);
    for(let i=0;i<4;i++)beam(base[i],top[i],.10,'#769388',parent);
    // A regular seam rhythm reads from the classroom view without ornament clutter.
    for(const sign of [-1,1])for(let x=-w/2+.6;x<w/2-.4;x+=.55)beam([x,.08,sign*(d/2-.04)],[x,mid,sign*(d/2-inset)],.025,'#719082',parent);
    if(w>4.4&&d>3.8)for(const x of [-w*.22,w*.22]) {
      const g=new THREE.Group();g.position.set(x,.33,d/2-inset*.35+.08);parent.add(g);
      box([.84,.84,.36],'#e9dbc1',[0,.28,0],g,.07);
      box([.57,.59,.045],'#759ca1',[0,.3,.203],g,.05);
      box([.055,.60,.07],'#f6ebd3',[0,.3,.24],g,.01);
      box([.60,.055,.07],'#f6ebd3',[0,.30,.24],g,.01);
      box([1.0,.12,.52],'#e3cfa9',[0,-.14,.10],g,.03);
      const cap=new THREE.Group();cap.position.set(0,.72,0);g.add(cap);gable(1.05,.64,.27,cap,'#355b51',false);
    }
  }
  const patches=roofReviewPatches(floors);
  for(const p of patches) {
    const w=p.maxX-p.minX,d=p.maxZ-p.minZ,roof=new THREE.Group();
    roof.position.set((p.minX+p.maxX)/2-bounds.x,p.storey*STOREY_HEIGHT+WALL_HEIGHT+.08,(p.minZ+p.maxZ)/2-bounds.z);source.add(roof);
    // Roofs retain their actual support patches, so L-shaped courtyards remain open.
    const over=.18,rw=w+over*2,rd=d+over*2;
    if(id!=='A') {
      box([rw+.06,.18,rd+.06],'#f4e6c9',[0,-.02,0],roof,.065);
      box([rw-.07,.12,rd-.07],'#b79d7b',[0,-.15,0],roof,.03);
    }
    const h=Math.min(id==='C'?1.48:1.34,Math.min(w,d)*(id==='C'?.28:.24));
    if(id==='A') {
      const selected=createWarmGableRoof({width:rw,depth:rd,height:h,color:style.color});roof.add(selected);
      selected.traverse(node=>{if(node.isMesh){geometries.add(node.geometry);mats.set(node.material.uuid,node.material);}});
    }
    if(id==='B')hip(rw,rd,h,roof);
    if(id==='C')mansard(rw,rd,h,roof);
  }
  // Bake static parts by material. Many individual tiles cost only a few draws.
  source.updateMatrixWorld(true);
  const buckets=new Map(),result=new THREE.Group();result.name=`roof-study-${id}`;
  source.traverse(node=>{
    if(!node.isMesh)return;
    const material=node.material,key=[material.color.getHexString(),material.side,material.roughness,material.metalness].join(':');
    if(!buckets.has(key))buckets.set(key,{material:material.clone(),geos:[]});
    // The existing shell uses densely tessellated tiny mouldings. Keep their
    // dimensions and radius, but a single bevel segment is sufficient here.
    let geo;
    if(node.geometry.type==='RoundedBoxGeometry'&&node.geometry.parameters.segments>1){const p=node.geometry.parameters;geo=new RoundedBoxGeometry(p.width,p.height,p.depth,1,p.radius);}
    else geo=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();
    for(const attr of Object.keys(geo.attributes))if(!['position','normal'].includes(attr))geo.deleteAttribute(attr);
    geo.applyMatrix4(node.matrixWorld);geo.clearGroups();buckets.get(key).geos.push(geo);
  });
  for(const {material,geos} of buckets.values()) {
    const geo=mergeGeometries(geos,false),m=new THREE.Mesh(geo,material);geos.forEach(g=>g.dispose());m.castShadow=true;m.receiveShadow=true;result.add(m);
  }
  shell.dispose();
  geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
  result.userData={study:id,shape,floors,patches,wallHeight:WALL_HEIGHT,storeyHeight:STOREY_HEIGHT,drawCalls:result.children.length};
  let disposed=false;result.dispose=()=>{if(disposed)return;disposed=true;result.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.dispose();}});result.clear();};
  return result;
}
