import * as THREE from 'three';

/** A repeat is a physical piece of fabric, independent of each cushion's size. */
export const SOFA_FABRIC_TILE_METERS = .55;
export const SOFA_FABRIC_TEXTURE_SIZE = 512;

const gray = (value, alpha = 1) => `rgba(${value}, ${value}, ${value}, ${alpha})`;

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SOFA_FABRIC_TEXTURE_SIZE;
  return canvas;
}

/** Fine yarn is secondary to the large motif, so it can disappear in mipmaps. */
function weave(ctx, { base, contrast = 9, pitch = 4 }) {
  const size = SOFA_FABRIC_TEXTURE_SIZE;
  ctx.fillStyle = gray(base);
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < size; row += pitch) {
    ctx.fillStyle = gray(base - contrast, .38);
    ctx.fillRect(0, row, size, 1);
    ctx.fillStyle = gray(Math.min(255, base + contrast), .54);
    ctx.fillRect(0, row + 1, size, 1);
  }
  for (let column = 0; column < size; column += pitch) {
    ctx.fillStyle = gray(base - contrast, .20);
    ctx.fillRect(column, 0, 1, size);
  }
  // Deterministic yarn flecks, with no speckled dark dots at room scale.
  for (let y = 0; y < size; y += pitch) {
    for (let x = 0; x < size; x += pitch) {
      const variation = ((x * 17 + y * 29) % 23) / 23;
      ctx.fillStyle = gray(Math.min(255, base + contrast), .10 + variation * .14);
      ctx.fillRect(x + 1, y + 1, 2, 1);
    }
  }
}

function cotton(ctx) {
  weave(ctx, { base: 242, contrast: 11, pitch: 4 });
  // A quiet larger basket-weave rhythm keeps the base tier readable at the
  // room camera, while the narrow yarn grid still carries the close-up detail.
  const size = SOFA_FABRIC_TEXTURE_SIZE;
  for (let offset = 0; offset < size; offset += 48) {
    ctx.fillStyle = gray(218, .16);
    ctx.fillRect(offset, 0, 7, size);
    ctx.fillRect(0, offset, size, 7);
    ctx.fillStyle = gray(255, .14);
    ctx.fillRect(offset + 7, 0, 3, size);
    ctx.fillRect(0, offset + 7, size, 3);
  }
}

function linen(ctx) {
  weave(ctx, { base: 231, contrast: 15, pitch: 4 });
  const size = SOFA_FABRIC_TEXTURE_SIZE;
  // One quiet herringbone repeat per panel. The motif is broad enough to read
  // from the room camera, while the low-contrast yarn bundles still feel like
  // cloth instead of a printed zigzag graphic.
  const period = 192;
  for (let column = -1; column < 5; column++) {
    const x = column * period;
    const slope = column % 2 ? -1 : 1;
    for (let y = -size; y < size * 2; y += 128) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + period, y + slope * 128);
      ctx.lineWidth = 12;
      ctx.strokeStyle = gray(178, .32);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + 28);
      ctx.lineTo(x + period, y + 28 + slope * 128);
      ctx.lineWidth = 7;
      ctx.strokeStyle = gray(252, .40);
      ctx.stroke();
      // A single fine edge reads as woven yarn rather than printed zigzags.
      ctx.beginPath();
      ctx.moveTo(x, y - 14);
      ctx.lineTo(x + period, y - 14 + slope * 128);
      ctx.lineWidth = 2;
      ctx.strokeStyle = gray(205, .65);
      ctx.stroke();
    }
  }
  ctx.fillStyle = gray(255, .12);
  for (let y = 0; y < size; y += 4) ctx.fillRect(0, y, size, 1);
}

function damaskLeaf(ctx, draw, fill) {
  ctx.beginPath();
  draw(ctx);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** One continuous, symmetric floral crest; no tufting dots or upholstery bars. */
function damask(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  const leaf = ctx.createLinearGradient(0, -220, 0, 220);
  leaf.addColorStop(0, gray(247));
  leaf.addColorStop(.42, gray(220));
  leaf.addColorStop(.73, gray(243));
  leaf.addColorStop(1, gray(210));

  // Long central bud and lower pendant provide a readable vertical rhythm.
  damaskLeaf(ctx, p => {
    p.moveTo(0, -221);
    p.bezierCurveTo(14, -182, 55, -164, 49, -122);
    p.bezierCurveTo(44, -91, 14, -78, 0, -45);
    p.bezierCurveTo(-14, -78, -44, -91, -49, -122);
    p.bezierCurveTo(-55, -164, -14, -182, 0, -221);
  }, leaf);
  damaskLeaf(ctx, p => {
    p.moveTo(0, -32);
    p.bezierCurveTo(39, 10, 47, 58, 26, 104);
    p.bezierCurveTo(10, 139, 4, 177, 0, 213);
    p.bezierCurveTo(-4, 177, -10, 139, -26, 104);
    p.bezierCurveTo(-47, 58, -39, 10, 0, -32);
  }, leaf);

  for (const direction of [-1, 1]) {
    ctx.save();
    ctx.scale(direction, 1);
    // Outer acanthus curl. The notch is a cut-in silhouette, not a dot.
    damaskLeaf(ctx, p => {
      p.moveTo(10, 67);
      p.bezierCurveTo(87, 43, 176, 17, 168, -53);
      p.bezierCurveTo(163, -96, 124, -118, 85, -99);
      p.bezierCurveTo(121, -99, 143, -74, 130, -50);
      p.bezierCurveTo(119, -30, 103, -27, 80, -31);
      p.bezierCurveTo(98, -54, 87, -89, 63, -108);
      p.bezierCurveTo(73, -60, 49, -33, 20, -15);
      p.bezierCurveTo(12, 11, 12, 42, 10, 67);
    }, leaf);
    // Lower open leaf balances the upper curl without crowding the seat.
    damaskLeaf(ctx, p => {
      p.moveTo(16, 119);
      p.bezierCurveTo(64, 92, 106, 70, 152, 72);
      p.bezierCurveTo(147, 119, 98, 162, 38, 151);
      p.bezierCurveTo(58, 143, 89, 126, 95, 111);
      p.bezierCurveTo(65, 119, 45, 136, 16, 151);
    }, leaf);
    // Very broad dark vein gives the satin weave directional character.
    ctx.beginPath();
    ctx.moveTo(29, 24);
    ctx.bezierCurveTo(68, -2, 86, -19, 105, -47);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = gray(180, .50);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function velvet(ctx) {
  weave(ctx, { base: 173, contrast: 8, pitch: 4 });
  const size = SOFA_FABRIC_TEXTURE_SIZE;
  // The motif has a generous quiet border. Offsets make the repeated edge
  // behavior explicit if its flourishes are adjusted in future.
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) damask(ctx, size * (.5 + x), size * (.5 + y));
  }
  // A translucent fine satin weave unifies the motif and the velvet ground.
  ctx.fillStyle = gray(255, .06);
  for (let y = 0; y < size; y += 3) ctx.fillRect(0, y, size, 1);
}

/**
 * Construct in a browser only. Each caller owns this set: when its scene or
 * preview renderer is destroyed, call Object.values(maps).forEach(t => t.dispose()).
 * Model rebuilds should reuse these maps instead of disposing them per mesh.
 */
export function createSofaFabricMaps() {
  if (typeof document === 'undefined') {
    throw new Error('Sofa fabric textures must be created in a browser.');
  }
  return Object.fromEntries(Object.entries({ cotton, linen, velvet }).map(([name, paint]) => {
    const canvas = makeCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('A 2D canvas is required for sofa fabric textures.');
    paint(ctx);
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `sofa-fabric-${name}`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    texture.userData.fabric = name;
    texture.userData.tileMeters = SOFA_FABRIC_TILE_METERS;
    return [name, texture];
  }));
}
