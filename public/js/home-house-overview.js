import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getFloorRects } from './home-layout.js';
import {retainHomeFloorTexture,releaseHomeFloorTexture} from './home-floor-textures.js';
import {retainHomeWallTexture,releaseHomeWallTexture} from './home-wall-textures.js';

const OMIT_MATERIAL_KEYS = new Set(['id', 'uuid', 'name', 'userData', 'version', '_listeners']);
const materialFunctions = new WeakMap();
let nextFunctionId = 1;

// Do not call Material.toJSON here: that also serializes canvas textures. A
// rendering signature can compare their identities without touching pixels.
function renderingValue(value) {
  if (typeof value === 'function') {
    if (!materialFunctions.has(value)) materialFunctions.set(value, nextFunctionId++);
    return ['function', materialFunctions.get(value)];
  }
  if (value?.isTexture) return ['texture', value.uuid];
  if (value?.isColor) return [value.r, value.g, value.b];
  if (value?.isVector2 || value?.isVector3 || value?.isVector4 || value?.isMatrix3 || value?.isMatrix4) return value.toArray();
  if (value?.isPlane) return [value.normal.toArray(), value.constant];
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value, renderingValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, renderingValue(value[key])]));
  return value;
}

function materialSignature(material) {
  const values = Object.fromEntries(Object.keys(material).filter(key => !OMIT_MATERIAL_KEYS.has(key)).sort().map(key => [key, renderingValue(material[key])]));
  values.onBeforeCompile = renderingValue(material.onBeforeCompile);
  values.customProgramCacheKey = renderingValue(material.customProgramCacheKey);
  return JSON.stringify(values);
}

function ancestorVisible(node) {
  for (let parent = node; parent; parent = parent.parent) {
    if (!parent.visible || parent.userData.overviewExclude) return false;
  }
  return true;
}

function triangleGeometry(source, start, count, matrix) {
  const geometry = new THREE.BufferGeometry();
  const index = source.index;
  const reverse = matrix.determinant() < 0;
  for (const [name, attribute] of Object.entries(source.attributes)) {
    // These snapshots are static world-space meshes. Skin bindings refer to
    // bones in the live scene and must never be retained by the overview.
    if (name === 'skinIndex' || name === 'skinWeight') continue;
    const values = new Float32Array(count * attribute.itemSize);
    for (let vertex = 0; vertex < count; vertex++) {
      const triangleVertex = reverse ? vertex - vertex % 3 + [0, 2, 1][vertex % 3] : vertex;
      const sourceVertex = index ? index.getX(start + triangleVertex) : start + triangleVertex;
      for (let component = 0; component < attribute.itemSize; component++) values[vertex * attribute.itemSize + component] = attribute.getComponent(sourceVertex, component);
    }
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
  }
  if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  geometry.applyMatrix4(matrix);
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  return geometry;
}

/**
 * Freeze the visible interior exactly as it is rendered, before its live floor
 * is rebuilt. Geometry and materials belong solely to the returned snapshot;
 * maps stay shared with the persistent scene texture cache and are not disposed.
 */
export function captureHomeFloor(sourceRoots, { floorIndex = 0, label = `${floorIndex + 1}DisplayText0931`, home = {} } = {}) {
  const group = new THREE.Group();
  group.name = `house-overview-floor-${floorIndex}`;
  const roots = (Array.isArray(sourceRoots) ? sourceRoots : [sourceRoots]).filter(Boolean);
  const buckets = new Map(), materialKeys = new WeakMap(), visited = new Set(), floorMaps = new Set(),wallMaps=new Set();
  let meshCount = 0, partCount = 0;
  const instance = new THREE.Matrix4(), transform = new THREE.Matrix4(), tint = new THREE.Color();

  function collect(node) {
    if (visited.has(node) || !node.visible || node.userData.overviewExclude) return;
    visited.add(node);
    if (node.isMesh && node.geometry?.attributes.position) {
      meshCount++;
      const geometry = node.geometry;
      const length = geometry.index?.count ?? geometry.attributes.position.count;
      const drawStart = Math.max(0, geometry.drawRange.start);
      const drawEnd = Math.min(length, drawStart + geometry.drawRange.count);
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const ranges = Array.isArray(node.material) ? geometry.groups : [{ start: 0, count: length, materialIndex: 0 }];
      for (let instanceIndex = 0; instanceIndex < (node.isInstancedMesh ? node.count : 1); instanceIndex++) {
        transform.copy(node.matrixWorld);
        if (node.isInstancedMesh) { node.getMatrixAt(instanceIndex, instance); transform.multiply(instance); }
        let tintKey = '';
        if (node.isInstancedMesh && node.instanceColor) { node.getColorAt(instanceIndex, tint); tintKey = tint.toArray().join(','); }
        for (const range of ranges) {
          const material = materials[range.materialIndex];
          if (!material || material.visible === false) continue;
          const start = Math.max(drawStart, range.start), end = Math.min(drawEnd, range.start + range.count);
          const count = Math.floor((end - start) / 3) * 3;
          if (count <= 0) continue;
          const part = triangleGeometry(geometry, start, count, transform);
          if (!materialKeys.has(material)) materialKeys.set(material, materialSignature(material));
          const attributes = Object.entries(part.attributes).map(([name, attribute]) => `${name}:${attribute.itemSize}`).sort().join(',');
          // Transparent surfaces retain object-level sorting instead of becoming
          // one giant, incorrectly blended glass mesh across the whole floor.
          const transparentKey = material.transparent || material.transmission > 0 ? `:${node.uuid}:${instanceIndex}` : '';
          const key = `${materialKeys.get(material)}|${attributes}|${node.renderOrder}|${node.castShadow}|${node.receiveShadow}|${tintKey}${transparentKey}`;
          let bucket = buckets.get(key);
          if (!bucket) {
            const clonedMaterial = material.clone();
            if(clonedMaterial.map&&!floorMaps.has(clonedMaterial.map)&&retainHomeFloorTexture(clonedMaterial.map))floorMaps.add(clonedMaterial.map);
            if(clonedMaterial.map&&!wallMaps.has(clonedMaterial.map)&&retainHomeWallTexture(clonedMaterial.map))wallMaps.add(clonedMaterial.map);
            if (tintKey && clonedMaterial.color) clonedMaterial.color.multiply(tint);
            // Material.clone intentionally omits custom shader callbacks.
            clonedMaterial.onBeforeCompile = material.onBeforeCompile;
            clonedMaterial.customProgramCacheKey = material.customProgramCacheKey;
            bucket = { material: clonedMaterial, parts: [], renderOrder: node.renderOrder, castShadow: node.castShadow, receiveShadow: node.receiveShadow };
            buckets.set(key, bucket);
          }
          bucket.parts.push(part);
          partCount++;
        }
      }
    }
    for (const child of node.children) collect(child);
  }

  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    if (ancestorVisible(root)) collect(root);
  }
  for (const bucket of buckets.values()) {
    const geometry = bucket.parts.length === 1 ? bucket.parts[0] : mergeGeometries(bucket.parts, false);
    if (!geometry) throw new Error('Cannot merge an interior overview geometry bucket');
    if (bucket.parts.length > 1) for (const part of bucket.parts) part.dispose();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, bucket.material);
    mesh.name = `overview-floor-${floorIndex}-batch-${group.children.length}`;
    mesh.userData.overviewFloor = floorIndex;
    mesh.renderOrder = bucket.renderOrder; mesh.castShadow = bucket.castShadow; mesh.receiveShadow = bucket.receiveShadow;
    group.add(mesh);
  }
  const area = getFloorRects(home).reduce((sum, rect) => sum + rect.width * rect.depth, 0);
  Object.assign(group.userData, { floorIndex, label, roomCount: home.rooms?.length ?? 0, area: Number(area.toFixed(2)), overviewFloor: floorIndex,
    captureStats: { sourceMeshes: meshCount, sourceParts: partCount, drawCalls: group.children.length } });
  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const mesh of group.children) { mesh.geometry.dispose(); mesh.material.dispose(); }
    floorMaps.forEach(releaseHomeFloorTexture);floorMaps.clear();wallMaps.forEach(releaseHomeWallTexture);wallMaps.clear();
    group.clear(); group.removeFromParent();
  };
  return group;
}

function projectedInterval(bounds, axis) {
  if (bounds.isEmpty()) return { min: 0, max: 0 };
  let min = Infinity, max = -Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const value = x * axis.x + y * axis.y + z * axis.z;
    min = Math.min(min, value); max = Math.max(max, value);
  }
  return { min, max };
}

/** Arrange real floor snapshots for viewing without changing any house data. */
export function createHouseOverview(floorGroups) {
  const group = new THREE.Group(); group.name = 'whole-house-expanded-floors';
  const floors = [...floorGroups].sort((a, b) => a.userData.floorIndex - b.userData.floorIndex);
  const bounds = floors.map(floor => new THREE.Box3().setFromObject(floor));
  const planBounds = bounds.reduce((all, box) => all.union(box), new THREE.Box3());
  const size = planBounds.isEmpty() ? new THREE.Vector3() : planBounds.getSize(new THREE.Vector3());
  // The 10:7.1 camera projects a floor's plan depth into vertical screen space.
  // Clear even the widest rotated diagonal, so one slab cannot hide another.
  const planClearance = Math.hypot(size.x, size.z) * .71 + .8;
  const originalPositions = floors.map(floor => floor.position.clone());
  const rows = [];
  for (let index = 0; index < floors.length; index++) {
    const floor = floors[index], box = bounds[index];
    group.add(floor);
    const data = floor.userData;
    rows.push({ index: data.floorIndex, label: data.label, roomCount: data.roomCount, area: data.area, group: floor,
      labelPosition: box.isEmpty() ? new THREE.Vector3(0, .15, 0) : new THREE.Vector3(box.min.x, box.min.y + .15, box.max.z) });
  }
  const originalLabelPositions = rows.map(row => row.labelPosition.clone());
  group.userData.floors = rows;
  group.userData.planClearance = planClearance;
  let arrangementKey = '';
  group.arrange = ({ angle = Math.PI / 4, aspect = 2 } = {}) => {
    if (!Number.isFinite(angle)) angle = Math.PI / 4;
    const wide = Number.isFinite(aspect) && aspect >= 1.3;
    const key = `${wide}:${angle}`;
    if (key === arrangementKey) return group;
    arrangementKey = key;
    const offsets = floors.map(() => new THREE.Vector3());
    if (wide) {
      const right = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
      const cameraLength = Math.hypot(10, 7.1), up = new THREE.Vector3(-Math.sin(angle) * 7.1 / cameraLength, 10 / cameraLength, -Math.cos(angle) * 7.1 / cameraLength);
      const horizontal = bounds.map(box => projectedInterval(box, right));
      const vertical = bounds.map(box => projectedInterval(box, up));
      const columns = Math.min(3, floors.length), gap = 1.2;
      let previousRow = null;
      for (let first = 0; first < floors.length; first += columns) {
        const last = Math.min(first + columns, floors.length);
        const width = horizontal.slice(first, last).reduce((sum, interval) => sum + interval.max - interval.min, 0) + (last - first - 1) * gap;
        let cursor = -width / 2, minY = Infinity, maxY = -Infinity;
        for (let index = first; index < last; index++) {
          const x = horizontal[index], rise = (index - first) * 3.15;
          offsets[index].copy(right).multiplyScalar(cursor - x.min);
          offsets[index].y = rise;
          cursor += x.max - x.min + gap;
          minY = Math.min(minY, vertical[index].min + rise * up.y);
          maxY = Math.max(maxY, vertical[index].max + rise * up.y);
        }
        const rowRise = previousRow ? (previousRow.maxY + gap - minY) / up.y : 0;
        for (let index = first; index < last; index++) offsets[index].y += rowRise;
        previousRow = { maxY: maxY + rowRise * up.y };
      }
      group.userData.layout = 'columns'; group.userData.layoutColumns = columns;
    } else {
      let offset = 0;
      for (let index = 0; index < floors.length; index++) {
        if (index > 0) {
          const below = bounds[index - 1], box = bounds[index];
          offset += Math.max(3.15, (below.isEmpty() ? 0 : below.max.y) - (box.isEmpty() ? 0 : box.min.y) + planClearance);
        }
        offsets[index].y = offset;
      }
      group.userData.layout = 'stack'; group.userData.layoutColumns = 1;
    }
    for (let index = 0; index < floors.length; index++) {
      floors[index].position.copy(originalPositions[index]).add(offsets[index]);
      rows[index].labelPosition.copy(originalLabelPositions[index]).add(offsets[index]);
    }
    group.updateMatrixWorld(true);
    return group;
  };
  group.arrange();
  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const floor of floors) floor.userData.dispose?.();
    group.clear(); group.removeFromParent();
  };
  return group;
}
