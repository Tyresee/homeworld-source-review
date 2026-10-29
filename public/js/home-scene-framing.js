import * as THREE from 'three';

// Keep the same isometric silhouette used by the home scene.  The vector is
// scaled as a whole when a large estate needs more camera distance so its
// horizontal/vertical proportions stay unchanged.
export const HOME_CAMERA_OFFSET = Object.freeze({ horizontal: 10, vertical: 7.1 });

const FALLBACK_VIEWPORT = Object.freeze({ width: 800, height: 600 });
const DEFAULT_PADDING = 1.15;
const DEFAULT_ZOOM = 1;
const CORNER_EPSILON = 1e-6;

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getViewport(width, height) {
  return {
    width: finitePositive(width, FALLBACK_VIEWPORT.width),
    height: finitePositive(height, FALLBACK_VIEWPORT.height),
  };
}

function getCorners(bounds) {
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  return corners;
}

/**
 * Keep the same world depth interval during a ground-plane camera drag.
 * The tilted camera also moves along its view axis, so shift near/far by the
 * matching depth change. If near would cross the eye, back the camera along
 * that axis (invisible in orthographic screen x/y). Unlike projecting the drag
 * onto the screen plane, this never lowers the camera below the picking floor.
 * Constant work: no scene traversal or bounds fitting in the pointer hot path.
 */
export function panHomeCamera(camera, groundDelta) {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const depthShift = -groundDelta.dot(direction);
  const back = Math.max(0, .01 - (camera.near + depthShift));
  camera.position.add(groundDelta).addScaledVector(direction, -back);
  camera.near += depthShift + back;
  camera.far += depthShift + back;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/**
 * Frame a complete home/estate Box3 in an orthographic isometric camera.
 *
 * The eight world-space corners are transformed by the final camera basis and
 * used to choose the frustum. This keeps wide, portrait, rotated and
 * off-origin estates in frame without guessing from only width/depth.
 *
 * @param {THREE.OrthographicCamera} camera camera to update
 * @param {THREE.Box3} bounds world-space bounds of the complete estate
 * @param {{width?: number, height?: number, angle?: number, zoom?: number, padding?: number, centerOffset?: THREE.Vector3, fitBounds?: THREE.Box3[]}} options
 * @returns {{viewport: {width:number,height:number,aspect:number}, center: THREE.Vector3, span: {x:number,y:number}, angle:number, zoom:number, padding:number, distance:number, depth:{near:number,far:number}}}
 */
export function frameHomeCamera(camera, bounds, options = {}) {
  if (!camera?.isOrthographicCamera) throw new TypeError('frameHomeCamera requires an OrthographicCamera');
  if (!(bounds instanceof THREE.Box3) || bounds.isEmpty()) throw new RangeError('frameHomeCamera requires non-empty Box3 bounds');

  const viewport = getViewport(options.width, options.height);
  const aspect = viewport.width / viewport.height;
  const angle = Number.isFinite(options.angle) ? options.angle : Math.PI / 4;
  const zoom = finitePositive(options.zoom, DEFAULT_ZOOM);
  const padding = finitePositive(options.padding, DEFAULT_PADDING);
  const pan = options.centerOffset?.isVector3 ? options.centerOffset.clone() : new THREE.Vector3();
  const center = bounds.getCenter(new THREE.Vector3());
  center.add(pan);
  // Expanded floors can be far apart along camera-right. Fitting their world
  // AABB would also fit large empty diagonal corners between the floors.
  const parts = options.fitBounds?.filter(part => part?.isBox3 && !part.isEmpty());
  const corners = parts?.length ? parts.flatMap(getCorners) : getCorners(bounds);

  const offset = HOME_CAMERA_OFFSET;
  const baseOffset = new THREE.Vector3(
    Math.sin(angle) * offset.horizontal,
    offset.vertical,
    Math.cos(angle) * offset.horizontal,
  );
  const baseDistance = baseOffset.length();
  const viewDirection = baseOffset.clone().normalize();

  // Move far enough away that even a 30x24 estate remains in front of the
  // near plane. The scalar preserves the 10:7.1 isometric camera ratio.
  let towardExtent = 0;
  for (const corner of corners) towardExtent = Math.max(towardExtent, corner.clone().sub(center).dot(viewDirection));
  const distance = Math.max(baseDistance, towardExtent + 2);
  camera.position.copy(center).add(viewDirection.multiplyScalar(distance));
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  const cameraCorners = corners.map(corner => corner.clone().applyMatrix4(camera.matrixWorldInverse));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let minDepth = Infinity, maxDepth = -Infinity;
  for (const point of cameraCorners) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    const depth = -point.z;
    minDepth = Math.min(minDepth, depth); maxDepth = Math.max(maxDepth, depth);
  }
  const spanX = Math.max(CORNER_EPSILON, maxX - minX);
  const spanY = Math.max(CORNER_EPSILON, maxY - minY);
  // Fit around the unpanned scene. The camera-space corners already include
  // the inverse of the camera's translation; using their midpoint unchanged
  // would cancel the user's pan whenever zooming, resizing or refitting.
  // Put that translation back into the fit only, so centerOffset remains a
  // visible camera movement. Depth below still uses the actual camera pose.
  const panInCameraSpace = pan.applyQuaternion(camera.quaternion.clone().invert());
  const midX = (minX + maxX) / 2 + panInCameraSpace.x;
  const midY = (minY + maxY) / 2 + panInCameraSpace.y;
  const halfHeight = Math.max(spanY, spanX / aspect) * padding / (2 * zoom);
  const halfWidth = halfHeight * aspect;

  camera.zoom = 1;
  camera.left = midX - halfWidth;
  camera.right = midX + halfWidth;
  camera.top = midY + halfHeight;
  camera.bottom = midY - halfHeight;

  // Orthographic depth still clips if the estate grows toward the camera.
  // Keep a small margin around the nearest/farthest corner and update far for
  // large outdoor estates instead of relying on the starter room's fixed 70.
  const depthMargin = Math.max(2, padding);
  camera.near = Math.max(0.01, minDepth - depthMargin);
  camera.far = Math.max(camera.near + 1, maxDepth + depthMargin);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  return {
    viewport: { ...viewport, aspect },
    center,
    span: { x: spanX, y: spanY },
    angle,
    zoom,
    padding,
    distance,
    depth: { near: camera.near, far: camera.far },
  };
}

