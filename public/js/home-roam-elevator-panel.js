import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Viewer-owned controls, mounted on the inside of the moving car. The live
// editor elevator and the saved house do not own any of these resources.
export const HOME_ROAM_ELEVATOR_PANEL_MOUNT=Object.freeze({x:.775,y:1.15,z:.10});
export const HOME_ROAM_ELEVATOR_PANEL_COLORS=Object.freeze({
  frame:'#bfa06b',plate:'#f5eddb',display:'#183a35',available:'#f5ecd7',
  current:'#26785d',target:'#ffd174',unserved:'#777e78',ink:'#30483d',light:'#fff8db',
});
const glyphs={
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],
  '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'],
  '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],
  '9':['01110','10001','10001','01111','00001','00001','01110'],
  F:['11111','10000','10000','11110','10000','10000','10000'],
};
function fallbackTextTexture(text){
  const width=Math.max(1,text.length*6-1),height=7,data=new Uint8Array(width*height*4);
  for(let c=0;c<text.length;c++)for(let y=0;y<height;y++)for(let x=0;x<5;x++)if(glyphs[text[c]]?.[y][x]==='1'){
    const at=(y*width+c*6+x)*4;data[at]=data[at+1]=data[at+2]=data[at+3]=255;
  }
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);texture.flipY=true;return texture;
}
function textTexture(text,document){
  let texture;
  try{
    const canvas=document?.createElement?.('canvas');
    if(canvas){
      canvas.width=256;canvas.height=160;const context=canvas.getContext?.('2d');
      if(context){context.clearRect(0,0,256,160);context.fillStyle='#ffffff';context.font=`800 ${text.length>2?96:122}px system-ui, sans-serif`;context.textAlign='center';context.textBaseline='middle';context.fillText(text,128,86);texture=new THREE.CanvasTexture(canvas);}
    }
  }catch{/* A headless viewer can still construct valid number glyphs. */}
  texture??=fallbackTextTexture(text);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}

/** Numbers are real scene meshes, not a floating menu. The caller controls
 * journey state and ray/accessible hit routing; this module owns no input or
 * animation loop. getTargets() exposes only the physical button caps. */
export function createHomeRoamElevatorPanel({floorCount,served=[],currentStorey=0,document=globalThis.document}={}){
  if(!Number.isInteger(floorCount)||floorCount<1)throw new RangeError('The cabin panel requires a finite floor count.');
  const group=new THREE.Group();group.name='roam-elevator-cabin-panel';
  group.position.set(HOME_ROAM_ELEVATOR_PANEL_MOUNT.x,HOME_ROAM_ELEVATOR_PANEL_MOUNT.y,HOME_ROAM_ELEVATOR_PANEL_MOUNT.z);group.rotation.y=-Math.PI/2;
  group.userData={roamElevatorPanel:true,paintable:false,roomPart:'stairs'};
  const columns=floorCount<=8?2:floorCount<=15?3:4,rows=Math.ceil(floorCount/columns);
  const diameter=rows>5?Math.min(.112,.70/rows*.78):columns===2?.126:.112,pitchX=columns===2?.184:.146,pitchY=rows>5?Math.min(.147,.70/rows):.147;
  const gridHeight=(rows-1)*pitchY+diameter,width=columns===2?.49:columns===3?.61:.73,height=Math.max(.89,gridHeight+.37);
  const geometries=new Set(),materials=new Set(),textures=new Map(),targets=[],labels=[];let disposed=false,state=null,displayNumber=null;
  const colors=HOME_ROAM_ELEVATOR_PANEL_COLORS;
  const mat=(color,options={})=>{const value=new THREE.MeshStandardMaterial({color,roughness:.46,...options});materials.add(value);return value;};
  const labelMat=(color)=>{const value=new THREE.MeshBasicMaterial({color,alphaTest:.05,alphaToCoverage:true,depthWrite:false,side:THREE.FrontSide,toneMapped:false});materials.add(value);return value;};
  const geometry=value=>(geometries.add(value),value);
  const add=(shape,material,x,y,z,name,parent=group)=>{const mesh=new THREE.Mesh(shape,material);mesh.position.set(x,y,z);mesh.name=name;mesh.castShadow=false;mesh.receiveShadow=false;mesh.userData={roamElevatorPanel:true,paintable:false,roomPart:'stairs'};parent.add(mesh);return mesh;};
  const round=(w,h,d,r)=>geometry(new RoundedBoxGeometry(w,h,d,3,Math.min(r,d*.45)));
  add(round(width+.035,height+.035,.052,.024),mat(colors.frame,{metalness:.65,roughness:.30}),0,0,0,'roam-elevator-panel-brass-rim');
  add(round(width,height,.050,.022),mat(colors.plate),0,0,.012,'roam-elevator-panel-plate');
  const displayY=height/2-.141;
  add(round(width-.11,.205,.025,.011),mat(colors.display,{roughness:.7}),0,displayY,.047,'roam-elevator-panel-display');
  const numberGeometry=geometry(new THREE.PlaneGeometry(.24,.15)),displayMaterial=labelMat(colors.light);
  const display=add(numberGeometry,displayMaterial,0,displayY,.061,'roam-elevator-panel-floor-display');
  const faceGeometry=geometry(new THREE.CylinderGeometry(diameter/2,diameter/2,.018,32).rotateX(Math.PI/2));
  const ringGeometry=geometry(new THREE.TorusGeometry(diameter/2+.006,.005,6,40));
  const labelGeometry=geometry(new THREE.PlaneGeometry(diameter*.95,diameter*.68));
  const faceMaterials={
    available:mat(colors.available,{metalness:.14}),
    current:mat(colors.current,{emissive:colors.current,emissiveIntensity:.22,metalness:.12}),
    target:mat(colors.target,{emissive:colors.target,emissiveIntensity:.85,metalness:.12}),
    unserved:mat(colors.unserved,{roughness:.86}),
  };
  const ringMaterials={available:mat(colors.frame,{metalness:.65,roughness:.3}),current:mat('#72c9a0',{emissive:'#55b383',emissiveIntensity:.35}),target:mat('#ffe8a7',{emissive:'#ffbf47',emissiveIntensity:1.2}),unserved:mat('#9a9d94',{roughness:.9})};
  const inkMaterials={dark:labelMat(colors.ink),light:labelMat(colors.light),dim:labelMat('#c4c6be')};
  const gridTop=height/2-.345;
  for(let floor=0;floor<floorCount;floor++){
    const row=Math.floor(floor/columns),column=floor%columns,x=(column-(columns-1)/2)*pitchX,y=gridTop-(rows-1-row)*pitchY;
    const face=add(faceGeometry,faceMaterials.available,x,y,.058,`roam-elevator-floor-${floor+1}`);
    const ring=add(ringGeometry,ringMaterials.available,x,y,.063,`roam-elevator-floor-${floor+1}-ring`);
    const label=add(labelGeometry,inkMaterials.dark,0,0,.010,`roam-elevator-floor-${floor+1}-number`,face);
    const texture=textTexture(String(floor+1),document);textures.set(String(floor+1),texture);
    // Each number owns only its map, while its ink colour is shared by state.
    const numberMaterial=inkMaterials.dark.clone();numberMaterial.map=texture;materials.add(numberMaterial);label.material=numberMaterial;
    const metadata={roamElevatorPanel:true,roamElevatorFloor:floor,roamElevatorLabel:`${floor+1}F`,roamElevatorFaceNormal:new THREE.Vector3(0,0,1),roamElevatorDisabled:true};
    Object.assign(face.userData,metadata);Object.assign(ring.userData,metadata);Object.assign(label.userData,metadata);
    face.geometry.computeBoundingBox();targets.push(face);labels.push({floor,face,ring,label});
  }
  function setState(next={}){
    if(disposed)return false;
    const current=Number.isInteger(next.currentStorey)&&next.currentStorey>=0&&next.currentStorey<floorCount?next.currentStorey:state?.currentStorey??0;
    const reachable=next.served!==undefined?new Set(next.served.filter(value=>Number.isInteger(value)&&value>=0&&value<floorCount)):new Set(state?.served??[]);
    const target=Object.hasOwn(next,'targetStorey')?next.targetStorey:state?.targetStorey??null,busy=Object.hasOwn(next,'busy')?next.busy===true:state?.busy??false;
    const targetStorey=Number.isInteger(target)&&target>=0&&target<floorCount?target:null;
    const signature=JSON.stringify([current,targetStorey,busy,[...reachable].sort((a,b)=>a-b)]);
    if(signature===state?.signature)return false;
    state={currentStorey:current,targetStorey,busy,served:[...reachable].sort((a,b)=>a-b),signature};
    for(const row of labels){
      const value=busy&&row.floor===targetStorey?'target':row.floor===current?'current':reachable.has(row.floor)?'available':'unserved';
      row.face.material=faceMaterials[value];row.ring.material=ringMaterials[value];
      row.label.material.color.copy(inkMaterials[value==='current'?'light':value==='unserved'?'dim':'dark'].color);
      for(const mesh of[row.face,row.ring,row.label])Object.assign(mesh.userData,{roamStorey:current,roamElevatorState:value,roamElevatorDisabled:busy||row.floor===current||!reachable.has(row.floor)});
    }
    if(displayNumber!==current){
      displayNumber=current;const label=`${current+1}F`;if(!textures.has(label))textures.set(label,textTexture(label,document));
      displayMaterial.map=textures.get(label);displayMaterial.needsUpdate=true;display.userData.roamElevatorDisplay=label;
    }
    group.userData.currentStorey=current;group.userData.targetStorey=targetStorey;group.userData.busy=busy;
    return true;
  }
  setState({currentStorey,served,busy:false,targetStorey:null});
  return {group,columns,getTargets:()=>disposed?[]:targets.slice(),setState,
    getState:()=>state?{floorCount,columns,currentStorey:state.currentStorey,targetStorey:state.targetStorey,busy:state.busy,served:state.served.slice(),disposed}:null,
    getViewPose(){
      group.updateWorldMatrix(true,false);const cabin=group.parent;
      const position=cabin?cabin.localToWorld(new THREE.Vector3(-.22,1.45,.10)):new THREE.Vector3(-.22,1.45,.10);
      return {position,lookAt:group.localToWorld(new THREE.Vector3(0,.05,.072))};
    },
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const value of geometries)value.dispose();for(const value of materials)value.dispose();for(const value of textures.values())value.dispose();group.clear();},
  };
}
