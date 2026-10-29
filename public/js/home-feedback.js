import * as THREE from 'three';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Orthographic PointsMaterial sizes are measured in pixels, not world units.
// Keep celebratory details in a screen layer so even tiny props read clearly.
export function projectFeedbackBounds(bounds, camera, width, height) {
  const points = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new THREE.Vector3(x, y, z).project(camera);
    points.push({ x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 });
  }
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return {
    x: clamp((left + right) / 2, 48, Math.max(48, width - 48)),
    y: clamp((top + bottom) / 2, 78, Math.max(78, height - 60)),
    width: clamp(right - left + 22, 88, Math.max(88, width * .86)),
    height: clamp(bottom - top + 22, 68, Math.max(68, height * .72)),
  };
}

function cross(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }

/** A screen-space convex hull of the projected 3D box, used as the feedback contour. */
export function projectFeedbackContour(bounds, camera, width, height, objects = []) {
  const projected = [];
  for (const object of objects) object?.traverse?.(node => {
    const position = node.geometry?.attributes?.position;
    if (!position || !node.isMesh) return;
    node.updateWorldMatrix(true, false);
    const step = Math.max(1, Math.ceil(position.count / 640));
    const world = new THREE.Vector3();
    for (let i = 0; i < position.count; i += step) {
      world.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
      const p = world.clone().project(camera);
      projected.push({ x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 });
    }
  });
  if (projected.length < 3) {
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new THREE.Vector3(x, y, z).project(camera);
    projected.push({ x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 });
  }
  }
  const sorted = projected.sort((a, b) => a.x - b.x || a.y - b.y);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop(); upper.pop();
  return [...lower, ...upper];
}

export function arrivalScale(progress) {
  const p = clamp(progress, 0, 1);
  if (p < .62) return .84 + .25 * (1 - (1 - p / .62) ** 3);
  return 1.09 - .09 * (1 - (1 - (p - .62) / .38) ** 3);
}

export function createHomeFeedback({ container, camera, requestRender }) {
  const layer = document.createElement('div');
  layer.className = 'object-feedback-layer'; layer.setAttribute('aria-hidden', 'true');
  container.append(layer);
  let active = null, frame = 0;

  function clear() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (active) {
      for (const { material, emissive, intensity } of active.materials) {
        material.emissive.copy(emissive); material.emissiveIntensity = intensity;
      }
      for (const { object, scale, position } of active.poses) { object.scale.copy(scale); object.position.copy(position); }
      active = null;
    }
    layer.replaceChildren(); delete layer.dataset.kind;
    requestRender();
  }

  function play(objects, { kind = 'upgrade', color = '#efb84e', label = "DisplayText0876", entrance = false } = {}) {
    clear();
    if (!objects?.length) return false;
    const targets = [...new Set(objects)];
    const bounds = new THREE.Box3();
    for (const object of targets) { object.updateWorldMatrix(true, true); bounds.expandByObject(object); }
    if (bounds.isEmpty()) return false;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const materials = new Map();
    for (const object of targets) object.traverse(node => {
      for (const material of node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []) {
        if (material.emissive && !materials.has(material)) materials.set(material, { material, emissive: material.emissive.clone(), intensity: material.emissiveIntensity });
      }
    });
    const poses = entrance && !reduced ? targets.map(object => ({ object, scale: object.scale.clone(), position: object.position.clone() })) : [];
    active = { materials: [...materials.values()], poses };
    layer.dataset.kind = kind;
    layer.style.setProperty('--feedback-color', color);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('object-feedback-svg'); svg.setAttribute('aria-hidden', 'true');
    const contour = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    contour.classList.add('object-feedback-contour');
    const sweep = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    sweep.classList.add('object-feedback-sweep');
    const photons = [0, .33, .66].map(() => {
      const photon = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      photon.classList.add('object-feedback-photon'); photon.setAttribute('r', '4.5'); svg.append(photon); return photon;
    });
    svg.append(contour, sweep, ...photons);
    sweep.setAttribute('pathLength', '1');
    const anchor = document.createElement('div'); anchor.className = 'object-feedback-anchor';
    const tag = document.createElement('span'); tag.className = 'object-feedback-tag'; tag.textContent = label;
    anchor.append(tag); layer.append(svg, anchor);
    const tint = new THREE.Color(kind === 'paint' ? color : '#f2c967');
    const started = performance.now(), duration = reduced ? 1050 : 1550;
    const pointOnContour = (points, progress) => {
      if (!points.length) return { x: 0, y: 0 };
      const segments = points.map((point, index) => {
        const next = points[(index + 1) % points.length];
        return { from: point, to: next, length: Math.hypot(next.x - point.x, next.y - point.y) };
      });
      const total = segments.reduce((sum, segment) => sum + segment.length, 0);
      let distance = ((progress % 1) + 1) % 1 * total;
      for (const segment of segments) {
        if (distance <= segment.length) {
          const t = segment.length ? distance / segment.length : 0;
          return { x: segment.from.x + (segment.to.x - segment.from.x) * t, y: segment.from.y + (segment.to.y - segment.from.y) * t };
        }
        distance -= segment.length;
      }
      return points[0];
    };
    const pathFor = points => points.length ? `M ${points.map(point => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')} Z` : '';
    const tick = now => {
      const elapsed = now - started, p = clamp(elapsed / duration, 0, 1);
      const width = container.clientWidth, height = container.clientHeight;
      const box = projectFeedbackBounds(bounds, camera, width, height);
      const points = projectFeedbackContour(bounds, camera, width, height, targets);
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('width', `${width}`); svg.setAttribute('height', `${height}`);
      const path = pathFor(points); contour.setAttribute('d', path); sweep.setAttribute('d', path);
      contour.style.opacity = `${reduced ? .8 : .95 * (1 - clamp(elapsed / duration, 0, 1) * .35)}`;
      sweep.style.strokeDashoffset = `${-p * 1.8}`;
      photons.forEach((photon, index) => {
        const point = pointOnContour(points, p * 1.65 + index / photons.length);
        photon.setAttribute('cx', point.x.toFixed(1)); photon.setAttribute('cy', point.y.toFixed(1));
        photon.style.opacity = `${reduced ? 0 : (1 - clamp((p - .72) / .28, 0, 1))}`;
      });
      anchor.style.transform = `translate(${box.x}px, ${box.y}px)`;
      const glow = reduced ? .22 : .58 * (1 - clamp(elapsed / 720, 0, 1));
      for (const entry of active.materials) {
        entry.material.emissive.copy(entry.emissive).lerp(tint, glow);
        entry.material.emissiveIntensity = Math.max(entry.intensity, glow * .9);
      }
      const enter = clamp(elapsed / 650, 0, 1);
      for (const { object, scale, position } of active.poses) {
        object.scale.copy(scale).multiplyScalar(arrivalScale(enter));
        object.position.copy(position); object.position.y += .16 * Math.sin(Math.PI * enter);
      }
      tag.style.transform = `translate(-50%, -100%) translateY(${-box.height / 2 - 10 - (reduced ? 0 : p * 13)}px)`;
      tag.style.opacity = `${1 - clamp((p - .73) / .27, 0, 1)}`;
      requestRender();
      if (p < 1) frame = requestAnimationFrame(tick); else clear();
    };
    tick(started);
    return true;
  }
  return { play, clear, dispose() { clear(); layer.remove(); } };
}
