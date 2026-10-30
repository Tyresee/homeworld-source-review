// QA only. Geometry-derived regions and unlit visibility masks; no game writes.
import * as THREE from 'three';
import {createRoamArchShape} from '../../public/js/home-roam-geometry.js';

const vector=value=>new THREE.Vector3(value.x,value.y,value.z);
export function projectReviewPoint(point,camera,width=1440,height=900) {
  const p=point.clone().project(camera);return [(p.x+1)*width/2,(1-p.y)*height/2];
}
function circle(center,u,v,radius,count=64) {return Array.from({length:count},(_,i)=>center.clone().addScaledVector(u,Math.cos(i/count*Math.PI*2)*radius).addScaledVector(v,Math.sin(i/count*Math.PI*2)*radius));}

export function captureRoamPhotometry(experience) {
  experience.renderNow();
  const {scene,renderer,controller,model,interactions}=experience,camera=controller.camera,canvas=renderer.domElement,width=canvas.width,height=canvas.height;
  const project=p=>projectReviewPoint(p,camera,width,height),entry=model.entrance,outward=vector(entry.outward),right=new THREE.Vector3(outward.z,0,-outward.x);
  const walls=new Set(model.architecture.getRoamWalls()),lamp=interactions.getTargets().find(target=>target.type==='floor-lamp');
  const result={metadata:{size:{width,height},camera:controller.getCameraPose(),coordinateSpace:'PNG pixels, origin top-left',brightness:'Encoded sRGB luma = (0.2126 R + 0.7152 G + 0.0722 B) / 255; no linearization',regions:{}},masks:{}};
  const meshes=[];scene.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});
  const originals=meshes.map(mesh=>({mesh,material:mesh.material})),owned=[];
  const previousTone=renderer.toneMapping,previousShadows=renderer.shadowMap.enabled;
  function mask(name,predicate,extra=null) {
    const cache=new Map();
    for(const {mesh,material}of originals){const mapped=[].concat(material).map(original=>{
      const white=predicate(mesh),key=original.uuid+':'+white;if(cache.has(key))return cache.get(key);
      const m=new THREE.MeshBasicMaterial({color:white?'#ffffff':'#000000',side:original.side,toneMapped:false});
      m.visible=original.visible!==false&&(!original.transparent||original.opacity>0);m.clippingPlanes=original.clippingPlanes;m.clipShadows=false;owned.push(m);cache.set(key,m);return m;
    });mesh.material=Array.isArray(material)?mapped:mapped[0];}
    if(extra)scene.add(extra);renderer.render(scene,camera);
    const output=canvas.ownerDocument.createElement('canvas');output.width=width;output.height=height;const ctx=output.getContext('2d');ctx.fillStyle='#000000';ctx.fillRect(0,0,width,height);ctx.drawImage(canvas,0,0);result.masks[name]=output.toDataURL('image/png');if(extra)scene.remove(extra);
  }
  try {
    renderer.toneMapping=THREE.NoToneMapping;renderer.shadowMap.enabled=false;
    const archWidth=entry.width-.10,archHeight=entry.height-.08,arch=new THREE.Mesh(new THREE.ShapeGeometry(createRoamArchShape(archWidth,archHeight),48),new THREE.MeshBasicMaterial({color:'#ffffff',side:THREE.DoubleSide,toneMapped:false}));
    arch.position.copy(vector(entry.wallCenter)).addScaledVector(outward,.035);arch.position.y=entry.bottom+.04;arch.rotation.y=Math.atan2(outward.x,outward.z);arch.updateMatrixWorld(true);
    const archPoints=createRoamArchShape(archWidth,archHeight).getPoints(64).map(p=>new THREE.Vector3(p.x,p.y,0).applyMatrix4(arch.matrixWorld));
    result.metadata.regions.doorAperture={polygon:archPoints.map(project),insetMetres:.04,description:'Visible modeled arch opening, inset from frame; foreground objects excluded by depth mask'};
    mask('door-aperture',()=>false,arch);arch.geometry.dispose();arch.material.dispose();
    mask('interior-walls-and-door',mesh=>walls.has(mesh)||mesh===entry.leaf);
    mask('all-visible-walls',mesh=>walls.has(mesh));
    if(lamp) {
      const center=lamp.light.getWorldPosition(new THREE.Vector3()),candidates=[...walls].map(mesh=>mesh.userData.roamWall).filter(info=>info.exterior&&center[info.alongAxis]>=info.from&&center[info.alongAxis]<=info.to);
      let nearest;
      for(const info of candidates){const inner=info.centerPlane+(['left','back'].includes(info.side)?1:-1)*info.thickness/2,dist=Math.abs(center[info.axis]-inner);if(!nearest||dist<nearest.distance)nearest={...info,inner,distance:dist};}
      if(nearest&&nearest.distance<1) {
        const wallCenter=center.clone();wallCenter[nearest.axis]=nearest.inner;const u=new THREE.Vector3(nearest.alongAxis==='x'?1:0,0,nearest.alongAxis==='z'?1:0),v=new THREE.Vector3(0,1,0),radius=Math.sqrt(1-nearest.distance**2);
        result.metadata.regions.lampWallOneMetre={polygon:circle(wallCenter,u,v,radius).map(project),wallId:nearest.id,wallPlane:nearest.inner,lampCenter:center.toArray(),perpendicularDistanceMetres:nearest.distance,wallDiskRadiusMetres:radius,description:'All visible wall pixels within a true 1 m sphere around the lamp light; window and lamp occlusion excluded'};
        mask('lamp-wall-one-metre',mesh=>mesh.userData.roamWall?.id===nearest.id);
      }
      mask('lamp-shade',mesh=>mesh===lamp.shade);
      const floor=lamp.floorTarget.getWorldPosition(new THREE.Vector3());
      result.metadata.regions.lampFloorPool={polygon:circle(floor,new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1),lamp.floorRadius).map(project),center:floor.toArray(),diameterMetres:lamp.floorRadius*2};
      mask('lamp-floor-pool',mesh=>mesh.userData.roomPart==='floor');
    }
  } finally {
    for(const {mesh,material}of originals)mesh.material=material;
    for(const material of owned)material.dispose();renderer.toneMapping=previousTone;renderer.shadowMap.enabled=previousShadows;renderer.shadowMap.needsUpdate=true;experience.renderNow();
  }
  return result;
}
