import * as THREE from 'three';

const clamp=value=>Math.max(0,Math.min(1,value));
const ease=value=>{const t=clamp(value);return t*t*(3-2*t);};
const FADE_MS=850;
const DARK=new THREE.Color('#151b29'),DEFAULT_BACKDROP=new THREE.Color('#eff2d5');
// Keep the room readable in its night-time state. Ambient light supplies the
// broad indirect component; directional light preserves shape and shadows.
const retainedLight=node=>node.isHemisphereLight ? .14 : node.isAmbientLight ? .12 : node.isDirectionalLight ? (node.castShadow ? .045 : .16) : .05;
const vertexShader=`varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.0);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`;

/** A transient lighting pass. Existing material/light values are restored
 * after every render, so lamp animation and account saves retain ownership.
 * The spot and a low, broad reflected-light approximation have no shadow maps.
 * This is a bounded art-directed bounce approximation, not realtime GI. */
export function createStageLighting({scene,requestRender=()=>{}}){
  const group=new THREE.Group();group.name='robot-dance-stage';group.userData.stageLighting=true;scene.add(group);
  const light=new THREE.SpotLight('#fff2d8',0,12,.46,1,2);light.name='robot-stage-spotlight';light.castShadow=false;light.userData.stageLighting=true;
  const bounce=new THREE.PointLight('#f5dfbe',0,5,2);bounce.name='robot-stage-reflected-light';bounce.castShadow=false;bounce.userData.stageLighting=true;group.add(bounce);
  const target=new THREE.Object3D();target.name='robot-stage-target';light.target=target;group.add(light,target);
  const beamMaterial=new THREE.ShaderMaterial({
    uniforms:{strength:{value:0},tint:{value:new THREE.Color('#fff3d8')}},vertexShader,
    fragmentShader:`uniform float strength;uniform vec3 tint;varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
    void main(){float edge=pow(abs(dot(normalize(vNormal),normalize(vView))),1.6);float ends=smoothstep(0.0,.16,vUv.y)*(1.0-smoothstep(.85,1.0,vUv.y));gl_FragColor=vec4(tint,strength*edge*ends*.04);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
    transparent:true,depthWrite:false,side:THREE.FrontSide,toneMapped:false,
  });
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.025,1,1,48,1,true).translate(0,-.5,0),beamMaterial);
  beam.name='robot-stage-light-beam';beam.renderOrder=3;beam.raycast=()=>{};group.add(beam);
  const poolMaterial=new THREE.ShaderMaterial({
    uniforms:{strength:{value:0},tint:{value:new THREE.Color('#fff2d4')}},vertexShader,
    fragmentShader:`uniform float strength;uniform vec3 tint;varying vec2 vUv;
    void main(){float r=length(vUv*2.0-1.0);float edge=exp(-3.0*r*r)*(1.0-smoothstep(.75,1.0,r));gl_FragColor=vec4(tint,strength*edge*.035);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
    transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,
  });
  const pool=new THREE.Mesh(new THREE.PlaneGeometry(2,2),poolMaterial);pool.name='robot-stage-light-pool';pool.rotation.x=-Math.PI/2;pool.renderOrder=2;pool.raycast=()=>{};group.add(pool);
  group.visible=false;
  let active=false,disposed=false,amount=0,from=0,to=0,transitionAt=0,lastTime=0,hasPoint=false;
  const point=new THREE.Vector3(),direction=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0),backdrop=new THREE.Color();
  const lights=[],materials=[],seen=new Set();let rendering=false,background=null,environment=1,lastScan=-Infinity,needsScan=true,scanCount=0;
  const previousBefore=scene.onBeforeRender,previousAfter=scene.onAfterRender;
  function restoreRender(){
    if(!rendering)return;rendering=false;
    for(const row of lights)row.node.intensity=row.value;
    for(const row of materials){if(row.emission!==undefined)row.material.emissiveIntensity=row.emission;if(row.color)row.material.color.copy(row.color);}
    scene.background=background;scene.environmentIntensity=environment;
  }
  function scan(now){
    restoreRender();lights.length=0;materials.length=0;seen.clear();lastScan=now;needsScan=false;scanCount++;
    // Discover new/rebuilt models at most four times a second while active.
    // Hidden estate and other-floor trees are skipped; every ordinary frame
    // touches only cached lights and unlit/emissive materials.
    scene.traverseVisible(node=>{
      if(node===group||node.parent===group||node.userData.stageLighting)return;
      if(node.isLight)lights.push({node,value:node.intensity});
      if(node.userData.avatar||node.userData.robotAvatar)return;
      for(const material of[].concat(node.material??[])){
        if(seen.has(material))continue;seen.add(material);
        const row={material};
        if(material.emissiveIntensity!==undefined)row.emission=material.emissiveIntensity;
        if(material.isMeshBasicMaterial&&material.color)row.color=material.color.clone();
        if(row.emission!==undefined||row.color)materials.push(row);
      }
    });
    seen.clear();
  }
  function darken(){
    restoreRender();if(disposed||amount<=0)return;
    rendering=true;background=scene.background;environment=scene.environmentIntensity;
    backdrop.copy(background?.isColor?background:DEFAULT_BACKDROP).lerp(DARK,amount);scene.background=backdrop;scene.environmentIntensity=environment*(1-.88*amount);
    const emissionFactor=1-.9*amount;
    for(const row of lights){row.value=row.node.intensity;row.node.intensity*=1-(1-retainedLight(row.node))*amount;}
    for(const row of materials){
      if(row.emission!==undefined){row.emission=row.material.emissiveIntensity;row.material.emissiveIntensity*=emissionFactor;}
      // Television panels and artificial lamp pools are unlit materials. Tint
      // this render only; an external lamp tick still owns the next baseline.
      if(row.color){row.color.copy(row.material.color);row.material.color.multiplyScalar(emissionFactor);}
    }
  }
  const before=function(...args){previousBefore?.apply(this,args);darken();};
  const after=function(...args){restoreRender();previousAfter?.apply(this,args);};
  scene.onBeforeRender=before;scene.onAfterRender=after;
  function frame(now){const progress=ease((now-transitionAt)/FADE_MS);amount=from+(to-from)*progress;if(progress===1)amount=to;}
  function update(value={},nowMs=globalThis.performance?.now?.()??0){
    if(disposed)return false;
    const now=Number.isFinite(nowMs)?nowMs:lastTime;lastTime=now;frame(now);
    const valid=value.point&&[value.point.x,value.point.z].every(Number.isFinite),next=value.active===true&&valid;
    if(next!==active){active=next;from=amount;to=next?1:0;transitionAt=now;}
    if(next){point.set(value.point.x,Number.isFinite(value.point.y)?value.point.y:.08,value.point.z);hasPoint=true;}
    if((active||amount>0)&&(needsScan||now-lastScan>=250))scan(now);
    if(!active&&amount===0){restoreRender();lights.length=0;materials.length=0;needsScan=true;}
    group.visible=hasPoint&&amount>0;
    if(group.visible){
      light.position.set(point.x+.65,point.y+4.4,point.z+1.65);target.position.copy(point);
      direction.subVectors(point,light.position);const length=direction.length();direction.normalize();
      beam.position.copy(light.position);beam.quaternion.setFromUnitVectors(down,direction);beam.scale.set(2,length,2);
      pool.position.set(point.x,point.y+.014,point.z);pool.scale.set(2,2,1);
      bounce.position.set(point.x+.4,point.y+.6,point.z+.7);bounce.intensity=1.2*amount;
      light.intensity=60*amount;beamMaterial.uniforms.strength.value=amount;poolMaterial.uniforms.strength.value=amount;
    }else light.intensity=bounce.intensity=0;
    const animating=amount!==to;if(animating)requestRender();return animating;
  }
  function reset(){
    restoreRender();active=false;amount=from=to=0;hasPoint=false;group.visible=false;light.intensity=bounce.intensity=0;
    beamMaterial.uniforms.strength.value=poolMaterial.uniforms.strength.value=0;lights.length=0;materials.length=0;needsScan=true;requestRender();
  }
  return {update,reset,refresh(){needsScan=true;},getState:()=>({active,amount,visible:group.visible,lights:group.visible?2:0,shadowLights:0,scans:scanCount,point:hasPoint?{x:point.x,y:point.y,z:point.z}:null}),
    dispose(){if(disposed)return;reset();disposed=true;if(scene.onBeforeRender===before)scene.onBeforeRender=previousBefore;if(scene.onAfterRender===after)scene.onAfterRender=previousAfter;group.removeFromParent();beam.geometry.dispose();beamMaterial.dispose();pool.geometry.dispose();poolMaterial.dispose();light.dispose?.();bounce.dispose?.();},
  };
}
