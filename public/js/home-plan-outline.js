/** Exact, grid-independent outlines for floor plans. No DOM, THREE or saved state. */
const EPS = 1e-7;
const clean = value => Math.round(value * 1e6) / 1e6;

function normalizeRects(rects) {
  if (!Array.isArray(rects)) throw new TypeError('Plan rectangles must be an array');
  return rects.map(rect => {
    if (!rect || !['minX', 'minZ', 'width', 'depth'].every(key => Number.isFinite(rect[key]))
      || rect.width <= 0 || rect.depth <= 0) throw new TypeError('Invalid plan rectangle');
    const minX = clean(rect.minX), minZ = clean(rect.minZ);
    const maxX = clean(rect.minX + rect.width), maxZ = clean(rect.minZ + rect.depth);
    if (![minX, minZ, maxX, maxZ].every(Number.isFinite) || maxX <= minX || maxZ <= minZ) {
      throw new TypeError('Invalid plan rectangle');
    }
    return { minX, minZ, maxX, maxZ };
  });
}

function mergeIntervals(intervals) {
  const merged = [];
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1] + EPS) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Intervals of A not covered by B; both inputs are sorted, nonoverlapping intervals. */
function subtractIntervals(a, b) {
  const output = [];
  let firstOverlap = 0;
  for (const [start, end] of a) {
    let cursor = start;
    while (firstOverlap < b.length && b[firstOverlap][1] <= cursor + EPS) firstOverlap++;
    for (let i = firstOverlap; i < b.length && b[i][0] < end - EPS; i++) {
      if (b[i][0] > cursor + EPS) output.push([cursor, Math.min(end, b[i][0])]);
      cursor = Math.max(cursor, b[i][1]);
      if (cursor >= end - EPS) break;
    }
    if (cursor < end - EPS) output.push([cursor, end]);
  }
  return output;
}

/**
 * Returns the visible boundary of a rectangle union as axis-aligned line segments.
 * Shared and overlapped edges disappear, while concave edges and hole boundaries remain.
 * Coordinates are world x/z, rounded to 1e-6; no particular construction-grid size is required.
 * Each segment is canonically increasing in x or z. Disconnected components are supported.
 */
export function getPlanOutlineSegments(rects) {
  const normalized = normalizeRects(rects);
  if (!normalized.length) return [];
  const xs = [...new Set(normalized.flatMap(rect => [rect.minX, rect.maxX]))].sort((a, b) => a - b);
  const horizontal = new Map(), vertical = new Map();
  const add = (map, coordinate, start, end) => {
    if (end - start <= EPS) return;
    if (!map.has(coordinate)) map.set(coordinate, []);
    map.get(coordinate).push([start, end]);
  };
  let previous = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], nextX = xs[i + 1];
    const current = nextX === undefined ? [] : mergeIntervals(normalized
      .filter(rect => rect.minX < nextX - EPS && rect.maxX > x + EPS)
      .map(rect => [rect.minZ, rect.maxZ]));
    // At a sweep boundary, only the symmetric difference is exposed to the outside.
    for (const [start, end] of [...subtractIntervals(previous, current), ...subtractIntervals(current, previous)]) {
      add(vertical, x, start, end);
    }
    if (nextX !== undefined) {
      for (const [start, end] of current) {
        add(horizontal, start, x, nextX);
        add(horizontal, end, x, nextX);
      }
    }
    previous = current;
  }
  const segments = [];
  for (const [z, intervals] of horizontal) {
    for (const [x1, x2] of mergeIntervals(intervals)) segments.push({ x1, z1: z, x2, z2: z });
  }
  for (const [x, intervals] of vertical) {
    for (const [z1, z2] of mergeIntervals(intervals)) segments.push({ x1: x, z1, x2: x, z2 });
  }
  return segments.sort((a, b) => a.x1 - b.x1 || a.z1 - b.z1 || a.x2 - b.x2 || a.z2 - b.z2);
}

/** Bounds for fitting the same floor-plan rectangles to an SVG or interactive grid. */
export function getPlanOutlineBounds(rects) {
  const normalized = normalizeRects(rects);
  if (!normalized.length) return null;
  const bounds = normalized.reduce((out, rect) => ({
    minX: Math.min(out.minX, rect.minX), minZ: Math.min(out.minZ, rect.minZ),
    maxX: Math.max(out.maxX, rect.maxX), maxZ: Math.max(out.maxZ, rect.maxZ),
  }), { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
  return { ...bounds, width: clean(bounds.maxX - bounds.minX), depth: clean(bounds.maxZ - bounds.minZ) };
}
