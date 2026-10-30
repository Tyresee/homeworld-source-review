// LOCAL LOOK-DEV PROTOTYPE ONLY. Procedural wall finishes multiplied by the
// wall colour. Extruded walls carry UVs in metres, so one texture covers
// WALL_TILE_METRES horizontally and the full 2.85 m wall height vertically.
export const WALL_TILE_METRES = 1.2, WALL_HEIGHT_METRES = 2.85;
const W = 1024, H = 1024, PX = W / WALL_TILE_METRES, PY = H / WALL_HEIGHT_METRES;
const yOf = metres => H - metres * PY; // canvas y for a height above the floor
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const g = t => `rgb(${Math.round(255 * t)},${Math.round(255 * t * .992)},${Math.round(255 * t * .982)})`;

function mottle(ctx, rand, from = 0, to = H, strength = .008) {
  for (let i = 0; i < 260; i++) {
    const x = rand() * W, y = from + rand() * (to - from), r = 20 + rand() * 60;
    ctx.fillStyle = `rgba(90,70,50,${strength * rand()})`; ctx.beginPath(); ctx.ellipse(x, y, r, r * .6, rand() * 3, 0, Math.PI * 2); ctx.fill();
  }
}
function subway(ctx, rand, top, bottom, { w = .30, h = .15 } = {}) {
  const tw = w * PX, th = h * PY, rows = Math.ceil((bottom - top) / th);
  for (let r = 0; r < rows; r++) {
    const y = bottom - (r + 1) * th, off = r % 2 ? tw / 2 : 0;
    for (let x = -off; x < W; x += tw) {
      ctx.fillStyle = g(.96 + rand() * .04); ctx.fillRect(x, Math.max(y, top), tw, th);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 3, Math.max(y, top) + 3, tw - 6, 2); // glaze highlight
      ctx.fillStyle = 'rgba(80,70,60,.30)'; ctx.fillRect(x, Math.max(y, top), 2.5, th); ctx.fillRect(x, Math.max(y, top), tw, 2.5); // grout
    }
  }
}
function rail(ctx, metres, tone = .78) {
  const y = yOf(metres);
  ctx.fillStyle = g(tone); ctx.fillRect(0, y - 10, W, 10);
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(0, y - 12, W, 3);
  ctx.fillStyle = 'rgba(60,45,30,.25)'; ctx.fillRect(0, y, W, 3);
}

export const WALL_PATTERNS = ['plain', 'stripe-fine', 'stripe-wide', 'dots', 'beadboard', 'panel', 'subway-half', 'subway-full', 'wood-panel'];

export function createWallCanvas(pattern = 'plain', seed = 11) {
  const rand = rng(seed), c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  if (pattern === 'plain') mottle(ctx, rand);
  else if (pattern === 'stripe-fine') {
    const p = .10 * PX; for (let x = 0; x < W; x += p) { ctx.fillStyle = g(.95); ctx.fillRect(x, 0, p / 2, H); }
  } else if (pattern === 'stripe-wide') {
    const p = .30 * PX; for (let x = 0; x < W; x += p) { ctx.fillStyle = g(.91); ctx.fillRect(x, 0, p / 2, H); ctx.fillStyle = g(.84); ctx.fillRect(x + p * .72, 0, 3, H); }
  } else if (pattern === 'dots') {
    const s = .12; for (let row = 0, y = 0; y < H + 20; row++, y += s * PY) for (let x = (row % 2) * s * PX / 2; x < W + 20; x += s * PX) {
      ctx.fillStyle = g(.86); ctx.beginPath(); ctx.arc(x, y, .014 * PX, 0, Math.PI * 2); ctx.fill();
    }
  } else if (pattern === 'beadboard') {
    mottle(ctx, rand, 0, yOf(1.0));
    const top = yOf(1.0); ctx.fillStyle = g(.93); ctx.fillRect(0, top, W, H - top);
    for (let x = 0; x < W; x += .10 * PX) { ctx.fillStyle = 'rgba(70,55,40,.28)'; ctx.fillRect(x, top, 2.5, H - top); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x + 3, top, 2, H - top); }
    rail(ctx, 1.0);
  } else if (pattern === 'panel') {
    mottle(ctx, rand, 0, yOf(1.0));
    const top = yOf(1.0); ctx.fillStyle = g(.93); ctx.fillRect(0, top, W, H - top);
    const pw = .60 * PX, m = .07 * PX;
    for (let x = 0; x < W; x += pw) {
      const l = x + m, t = top + m * 1.2, w = pw - 2 * m, h = H - top - m * 2.6;
      ctx.strokeStyle = 'rgba(70,55,40,.30)'; ctx.lineWidth = 3; ctx.strokeRect(l, t, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2; ctx.strokeRect(l + 4, t + 4, w - 8, h - 8);
    }
    rail(ctx, 1.0);
  } else if (pattern === 'subway-half') {
    mottle(ctx, rand, 0, yOf(1.25)); subway(ctx, rand, yOf(1.25), H); rail(ctx, 1.25, .86);
  } else if (pattern === 'subway-full') {
    subway(ctx, rand, 0, H);
  } else if (pattern === 'wood-panel') {
    const bw = .15 * PX;
    for (let x = 0; x < W; x += bw) {
      ctx.fillStyle = g(.88 + rand() * .12); ctx.fillRect(x, 0, bw, H);
      for (let i = 0; i < 6; i++) { ctx.strokeStyle = `rgba(70,45,25,${.05 + rand() * .06})`; ctx.lineWidth = 1; const gx = x + rand() * bw; ctx.beginPath(); ctx.moveTo(gx, 0); for (let y = 0; y <= H; y += 16) ctx.lineTo(gx + Math.sin(y / 70 + i) * 2, y); ctx.stroke(); }
      ctx.fillStyle = 'rgba(55,35,20,.30)'; ctx.fillRect(x, 0, 2.5, H);
    }
  }
  // skirting shadow line at the very bottom
  ctx.fillStyle = 'rgba(60,45,30,.10)'; ctx.fillRect(0, H - 6, W, 6);
  return c;
}
