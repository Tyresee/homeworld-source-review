import * as THREE from 'three';
import {createSofaFabricMaps} from './home-sofa-fabrics.js';

/** Shared, unchanged classroom material maps. Architecture finishes retain
 * their own world-scale managers; these maps belong to furniture only. */
export function createHomeMaterialMaps(){
  const textures=[];
  function grain(kind) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256);
    if (kind === 'oak') {
      for (let i = 0; i < 90; i++) {
        const y = i * 3.1;
        ctx.strokeStyle = i % 3 ? 'rgba(102,68,30,.09)' : 'rgba(108,65,28,.2)';
        ctx.lineWidth = i % 3 ? .8 : 1.4; ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, y + Math.sin(x / 48 + i) * 2.5);
        ctx.stroke();
      }
    } else if (kind === 'stone') {
      for (let i = 0; i < 11; i++) {
        ctx.strokeStyle = 'rgba(104,113,108,.15)'; ctx.lineWidth = i % 3 === 0 ? 2 : .7;
        ctx.beginPath(); ctx.moveTo(i * 40 - 50, 0); ctx.bezierCurveTo(i * 28 + 10, 70, i * 42 - 10, 140, i * 27 + 60, 256); ctx.stroke();
      }
    } else if (kind === 'wool' || kind === 'linen' || kind === 'velvet') {
      const base = kind === 'wool' ? 'rgba(160,132,104,.16)' : kind === 'linen' ? 'rgba(112,137,124,.13)' : 'rgba(125,78,99,.14)';
      ctx.strokeStyle = base; ctx.lineWidth = kind === 'velvet' ? 3 : 1.4;
      for (let i = 0; i < 256; i += (kind === 'wool' ? 7 : 11)) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i + Math.sin(i) * 2); ctx.stroke(); }
      if (kind === 'wool') for (let i = -256; i < 256; i += 18) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 256, 256); ctx.stroke(); }
    } else {
      ctx.strokeStyle = 'rgba(91,132,133,.14)'; ctx.lineWidth = 2;
      for (let i = 0; i <= 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); }
    }
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; textures.push(t); return t;
  }
  const sofaFabricMaps = createSofaFabricMaps();
  Object.values(sofaFabricMaps).forEach(texture => textures.push(texture));
  const maps = { oak: grain('oak'), stone: grain('stone'), ceramic: grain('ceramic'), walnut: grain('oak'), marble: grain('stone'), wool: grain('wool'), linen: grain('linen'), velvet: grain('velvet'), ...Object.fromEntries(Object.entries(sofaFabricMaps).map(([name, texture]) => [`sofa-${name}`, texture])) };
  let disposed=false;
  return {maps,textures,dispose(){if(disposed)return;disposed=true;for(const texture of new Set(textures))texture.dispose();}};
}
