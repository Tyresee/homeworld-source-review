import * as THREE from 'three';

// L1 is entirely presentation-only. One small shader multiply supplies contact
// shading without a full-screen AO pass or another light/shadow map.
export function applyL1Surface(mesh,{role='wall',strength=.15,range=.16}={}) {
  if(!mesh?.geometry?.attributes.position||!mesh.material?.isMeshStandardMaterial)return false;
  const material=mesh.material;if(material.userData.l1Surface)return false;
  mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;
  const floor=role==='floor',ceiling=role==='ceiling',alongZ=role==='wall'&&(b.max.z-b.min.z)>(b.max.x-b.min.x);
  const min=floor?[b.min.x,b.min.z]:[alongZ?b.min.z:b.min.x,b.min.y],max=floor?[b.max.x,b.max.z]:[alongZ?b.max.z:b.max.x,b.max.y];
  const original=material.onBeforeCompile;
  material.onBeforeCompile=function(shader,...args){
    original.call(this,shader,...args);
    shader.uniforms.l1EdgeMin={value:new THREE.Vector2(...min)};shader.uniforms.l1EdgeMax={value:new THREE.Vector2(...max)};
    shader.uniforms.l1Strength={value:strength};shader.uniforms.l1Range={value:range};
    shader.vertexShader='varying vec2 vL1Surface;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvL1Surface = position.'+(floor?'xz':alongZ?'zy':'xy')+';');
    shader.fragmentShader='varying vec2 vL1Surface; uniform vec2 l1EdgeMin; uniform vec2 l1EdgeMax; uniform float l1Strength; uniform float l1Range;\n'+shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n'+(floor?'diffuseColor.rgb = mix(diffuse.rgb, diffuseColor.rgb, 0.30);\n':'')+
      'vec2 l1Edge = min(vL1Surface-l1EdgeMin, l1EdgeMax-vL1Surface);\nfloat l1Distance = min(l1Edge.x,l1Edge.y);\ndiffuseColor.rgb *= 1.0-l1Strength*(1.0-smoothstep(0.0,l1Range,l1Distance));');
  };
  material.customProgramCacheKey=()=>`l1-contact-${role}-${alongZ?'z':'x'}`;
  material.userData.l1Surface=role;material.needsUpdate=true;
  if(ceiling){material.color.set('#cecdc6');material.emissive?.set('#000000');material.emissiveIntensity=0;material.side=THREE.DoubleSide;material.shadowSide=THREE.DoubleSide;mesh.castShadow=true;mesh.receiveShadow=false;}
  return true;
}

/** One batched, soft contact surface per floor; texture is 64² (16 KiB). */
export function createL1FurnitureContacts(objects,{createCanvas=()=>document.createElement('canvas')}={}) {
  const canvas=createCanvas();canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,4,32,32,32);
  if(!gradient)return null;gradient.addColorStop(0,'rgba(41,37,31,.20)');gradient.addColorStop(.45,'rgba(41,37,31,.11)');gradient.addColorStop(1,'rgba(41,37,31,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const texture=new THREE.CanvasTexture(canvas),positions=[],uvs=[];
  for(const object of objects){object.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(object);if(box.isEmpty())continue;const c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3());
    const x=Math.max(.18,s.x*.57),z=Math.max(.18,s.z*.57),y=.079;
    positions.push(c.x-x,y,c.z-z,c.x-x,y,c.z+z,c.x+x,y,c.z+z,c.x-x,y,c.z-z,c.x+x,y,c.z+z,c.x+x,y,c.z-z);uvs.push(0,0,0,1,1,1,0,0,1,1,1,0);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='l1-furniture-contact';mesh.userData.l1Contact=true;
  return {mesh,dispose(){geometry.dispose();material.dispose();texture.dispose();}};
}
