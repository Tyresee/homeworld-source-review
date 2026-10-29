import * as THREE from 'three';
import {frameHomeCamera} from './home-scene-framing.js';
import {boundedZoom} from './home-camera-input.js';

/** Focus with the same ground-plane pan and zoom used by manual controls.
 * Only cached room bounds are needed; no scene/model traversal per frame. */
export function createStageFraming(){
  const probe=new THREE.OrthographicCamera(),origin=new THREE.Vector3(),direction=new THREE.Vector3();
  return function focusPose({bounds,width,height,point,angle}){
    const size={width,height,angle,padding:1.15};
    frameHomeCamera(probe,bounds,size);
    const aspect=Math.max(.1,width/height),span=Math.max(4.2,5.4/aspect);
    const zoom=boundedZoom((probe.top-probe.bottom)/span,'interior');
    frameHomeCamera(probe,bounds,{...size,zoom});
    // Bias the performer slightly left to leave room for the action dock.
    origin.set(-.12,0,0).unproject(probe);probe.getWorldDirection(direction);
    const y=(point.y??0)+.55,t=(y-origin.y)/direction.y;
    return {pan:{x:point.x-origin.x-direction.x*t,y:0,z:point.z-origin.z-direction.z*t},zoom,angle};
  };
}
