import * as THREE from 'three';

const LEG_LIFT=.055,TORSO_LIFT=.025;
const fitted=new WeakMap();

function mappedY(profile,joint,y){
  const map=profile?.localY?.[joint];if(!map)return y;
  if(map.clamp)return y+map.added*Math.max(0,Math.min(1,(y-map.min)/(map.max-map.min)));
  return y*map.scale+map.offset;
}

/** Garment anchors use the same fitted shell coordinates as the live rig.
 * Headwear, hands and shoes retain their authored local dimensions. */
export function mapRobotProportionY(robot,joint,y){
  return mappedY(robot?.userData?.proportions,joint,y);
}

/** Fit an instance clone before rest poses or contact calibration are captured.
 * Bone lengths and shell vertices change together; every node keeps rigid unit
 * scale so rotating knees, the head and attached garments cannot acquire shear.
 * Only the five replacement geometries belong to the caller. */
export function applyRobotBodyProportions(asset){
  if(!asset?.isObject3D)throw new TypeError('Body proportions require an instance clone.');
  if(fitted.has(asset))return fitted.get(asset);
  const node=name=>asset.getObjectByName(name),torso=node('Torso'),hip=node('HipRoot');
  const shell=node('TorsoShell'),legs=['L','R'].map(side=>({side,hip:node(`Hip${side}`),knee:node(`Knee${side}`),ankle:node(`Ankle${side}`),thigh:node(`ThighShell${side}`),shin:node(`ShinShell${side}`)}));
  if(!hip||!torso||torso.parent!==hip||!shell?.isMesh||shell.parent!==torso||node('Head')?.parent!==torso||node('ShoulderL')?.parent!==hip||node('ShoulderR')?.parent!==hip
    ||legs.some(leg=>!leg.hip||leg.hip.parent!==hip||leg.knee?.parent!==leg.hip||leg.ankle?.parent!==leg.knee||!leg.thigh?.isMesh||leg.thigh.parent!==leg.hip||!leg.shin?.isMesh||leg.shin.parent!==leg.knee||leg.knee.position.y>=0||leg.ankle.position.y>=0))throw new TypeError('Body proportions require the authored rigid robot v4 hierarchy.');
  if([shell,...legs.flatMap(leg=>[leg.thigh,leg.shin])].some(mesh=>!mesh.geometry?.getAttribute('position')?.count))throw new TypeError('Body proportions require the five original body shells.');
  const bounds=new THREE.Box3().setFromBufferAttribute(shell.geometry.getAttribute('position'));
  const height=bounds.max.y-bounds.min.y;if(!(height>0))throw new TypeError('Robot torso requires a nonempty shell.');
  const torsoMap=Object.freeze({scale:1+TORSO_LIFT/height,offset:-bounds.min.y*TORSO_LIFT/height,min:bounds.min.y,max:bounds.max.y,added:TORSO_LIFT,clamp:true});
  const localY={Torso:torsoMap};
  for(const leg of legs){
    localY[`Hip${leg.side}`]=Object.freeze({scale:1+(LEG_LIFT/2)/-leg.knee.position.y,offset:0});
    localY[`Knee${leg.side}`]=Object.freeze({scale:1+(LEG_LIFT/2)/-leg.ankle.position.y,offset:0});
  }
  const profile=Object.freeze({id:'body-tall-v1',addedHeight:LEG_LIFT+TORSO_LIFT,legLift:LEG_LIFT,torsoLift:TORSO_LIFT,upperLegLift:LEG_LIFT/2,lowerLegLift:LEG_LIFT/2,localY:Object.freeze(localY)});
  // Prepare every anchor before allocating or changing anything. An incomplete
  // source rig fails without orphaning a partially fitted body.
  const anchors=[];
  for(const child of torso.children){
    if(child===shell)continue;
    if(child.isMesh){
      const attribute=child.geometry?.getAttribute('position');if(!attribute?.count)throw new TypeError('Robot torso details require rigid geometry.');
      child.updateMatrix();const box=new THREE.Box3().setFromBufferAttribute(attribute).applyMatrix4(child.matrix),y=box.getCenter(new THREE.Vector3()).y;
      anchors.push({node:child,y:child.position.y+mappedY(profile,'Torso',y)-y});
    }else anchors.push({node:child,y:mappedY(profile,'Torso',child.position.y)});
  }
  const geometries=new Set(),replacements=[];
  try{
    for(const [mesh,map]of[[shell,torsoMap],...legs.flatMap(leg=>[[leg.thigh,localY[`Hip${leg.side}`]],[leg.shin,localY[`Knee${leg.side}`]]])]){
      const geometry=mesh.geometry.clone();geometries.add(geometry);
      const matrix=new THREE.Matrix4().makeScale(1,map.scale,1);matrix.elements[13]=map.offset;
      geometry.applyMatrix4(matrix);geometry.computeBoundingBox();geometry.computeBoundingSphere();replacements.push({mesh,geometry});
    }
  }catch(error){for(const geometry of geometries)geometry.dispose();throw error;}
  // Details and sockets remain rigid. Move their attachment centre to the
  // matching point on the taller torso, rather than stretching round fittings.
  for(const anchor of anchors)anchor.node.position.y=anchor.y;
  hip.position.y+=LEG_LIFT;
  for(const side of['L','R'])node(`Shoulder${side}`).position.y+=TORSO_LIFT;
  for(const leg of legs){leg.knee.position.y-=LEG_LIFT/2;leg.ankle.position.y-=LEG_LIFT/2;}
  for(const {mesh,geometry}of replacements)mesh.geometry=geometry;
  asset.updateMatrixWorld(true);const result={profile,geometries};fitted.set(asset,result);return result;
}
