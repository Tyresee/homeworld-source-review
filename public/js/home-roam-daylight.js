import * as THREE from 'three';

// A view-only daylight backdrop. Unlit, output-referred materials keep the
// outdoor view independent of the indoor exposure and ceiling-light rig.
// These meshes add no light, shadow map, save fields or placement surfaces.
export function createHomeRoamDaylight({manor,bounds,entrance}={}) {
  const group=new THREE.Group();group.name='roam-daylight';group.visible=false;
  const geometries=new Set(),materials=new Set(),borrowedSteps=[];
  const own=(geometry,material)=>{geometries.add(geometry);materials.add(material);const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);return mesh;};
  const basic=color=>new THREE.MeshBasicMaterial({color,toneMapped:false});
  const skyMaterial=new THREE.ShaderMaterial({
    uniforms:{horizon:{value:new THREE.Color('#d1dedf')},zenith:{value:new THREE.Color('#b5cad8')},low:{value:new THREE.Color('#bbcbb8')}},
    vertexShader:'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec3 direction; uniform vec3 horizon; uniform vec3 zenith; uniform vec3 low; void main(){float y=normalize(direction).y;vec3 color=mix(horizon,zenith,smoothstep(0.0,0.42,y));color=mix(color,low,smoothstep(0.0,0.35,-y));gl_FragColor=vec4(color,1.0);\n#include <colorspace_fragment>\n}',
    side:THREE.BackSide,depthWrite:false,toneMapped:false,
  });
  const sky=own(new THREE.SphereGeometry(120,32,16),skyMaterial);sky.position.set(bounds.x,0,bounds.z);sky.renderOrder=-1000;sky.userData.roamBackdrop=true;
  const ground=own(new THREE.PlaneGeometry(180,180),basic('#afbaa8'));ground.rotation.x=-Math.PI/2;ground.position.set(bounds.x,-.345,bounds.z);ground.userData.roomPart='floor';ground.userData.roamOutdoor=true;
  const normal=entrance?.outward?.clone?.()??new THREE.Vector3(0,0,1),center=entrance?.wallCenter??new THREE.Vector3(bounds.x,0,bounds.maxZ),along=new THREE.Vector3(normal.z,0,-normal.x);
  // Gentle paving joints and a distinct horizon provide depth rather than a
  // flat pale fill. The walk is a temporary visual, never a navigation edit.
  for(let row=0;row<10;row++)for(let column=0;column<2;column++) {
    const tile=own(new THREE.BoxGeometry(1.09,.025,1.58),basic((row+column)%3===0?'#d0cabd':(row+column)%3===1?'#bebfb1':'#c6c4b9'));
    tile.position.copy(center).addScaledVector(normal,1.12+row*1.6).addScaledVector(along,(column-.5)*1.12);tile.position.y=-.32;tile.rotation.y=Math.atan2(normal.x,normal.z);tile.userData.roomPart='floor';tile.userData.roamOutdoor=true;
  }
  // Borrow only the actual modeled entrance steps. Their geometry/pose stays
  // with the manor; a separately owned unlit material supplies daylight tone.
  manor.updateWorldMatrix(true,true);
  const key=new THREE.Vector3(.4,1,.6).normalize();
  manor.traverse(source=>{
    if(!source.isMesh||source.userData.buildingPart!=='entrance-step')return;
    const geometry=source.geometry.clone(),normalAttribute=geometry.getAttribute('normal'),colors=[];
    const base=new THREE.Color('#ddd3bf'),direction=new THREE.Vector3(),normalMatrix=new THREE.Matrix3().getNormalMatrix(source.matrixWorld);
    for(let i=0;i<normalAttribute.count;i++) {direction.fromBufferAttribute(normalAttribute,i).applyMatrix3(normalMatrix).normalize();const shade=.56+.44*Math.max(0,direction.dot(key));colors.push(base.r*shade,base.g*shade,base.b*shade);}
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const material=basic('#ffffff');material.vertexColors=true;const mesh=own(geometry,material);source.matrixWorld.decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.userData.roamOutdoor=true;borrowedSteps.push(mesh);
  });
  let disposed=false;
  return {group,sky,ground,steps:borrowedSteps,setVisible(value){group.visible=!!value;},dispose(){if(disposed)return;disposed=true;for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();group.clear();}};
}
