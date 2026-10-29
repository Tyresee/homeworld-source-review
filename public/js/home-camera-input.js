/** Camera input math uses CSS pixels; it never knows about DOM or save data. */
export const HOME_ZOOM_LIMITS = Object.freeze({
  estate: Object.freeze({ min: .55, max: 6 }),
  interior: Object.freeze({ min: .6, max: 3.5 }),
});
export const DRAG_THRESHOLD = 4;
export const CAMERA_TRANSITION_MS = 220;

export function boundedZoom(value, view = 'estate') {
  const { min, max } = HOME_ZOOM_LIMITS[view] ?? HOME_ZOOM_LIMITS.estate;
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 1));
}

export function wheelZoom(value, deltaY, deltaMode = 0, view = 'estate') {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 500 : 1);
  return boundedZoom(value * Math.exp(-Math.max(-1200, Math.min(1200, pixels)) * .01), view);
}

export function pinchZoom(value, previousDistance, distance, view = 'estate') {
  if (!(distance > 0) || !(previousDistance > 0)) return boundedZoom(value, view);
  return boundedZoom(value * distance / previousDistance, view);
}

export function cameraProgress(elapsed, duration = CAMERA_TRANSITION_MS) {
  const t = Math.max(0, Math.min(1, elapsed / duration));
  return 1 - (1 - t) ** 3;
}
