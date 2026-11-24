import * as THREE from 'three';
import { canvasTexture } from './textures.js';
import { rngFor } from './random.js';
import { texturePair, resizeTexture, tileNoise, fillPixels, rgb, dataColor } from './material-textures.js';

const families = {
  limestone: { wall: [182, 172, 148], columns: 8, width: .56, height: .63, sill: true },
  brick: { wall: [143, 101, 77], columns: 6, width: .54, height: .58, sill: true },
  sandstone: { wall: [172, 158, 134], columns: 8, width: .64, height: .66, sill: true },
  brownstone: { wall: [137, 110, 88], columns: 6, width: .47, height: .62, sill: true },
  glass: { wall: [85, 108, 118], columns: 8, width: .93, height: .83 },
  banded: { wall: [184, 185, 174], columns: 8, width: .91, height: .60 },
  parking: { wall: [165, 163, 145], columns: 8, width: .94, height: .55 },
  deco: { wall: [189, 178, 151], columns: 8, width: .44, height: .74, sill: true },
};

export function createFacadeTextures(seed, id, style) {
  const family = families[style], random = rngFor(seed, `facade/${id}`);
  const broad = tileNoise(random, 7), windows = [];
  const rows = 14, width = 256, height = 512, cellWidth = width / family.columns, cellHeight = height / rows;
  for (let row = 0; row < rows; row++) {
    const occupied = random() > .55, first = Math.floor(random() * family.columns), count = 1 + Math.floor(random() * 3);
    for (let column = 0; column < family.columns; column++) {
      const w = cellWidth * family.width, h = cellHeight * family.height;
      windows.push({
        x: column * cellWidth + (cellWidth - w) / 2, y: row * cellHeight + cellHeight * .12, w, h,
        lit: style !== 'parking' && occupied && (column - first + family.columns) % family.columns < count,
        cool: random() > .84, shade: (random() - .5) * 10, blind: random() > .79,
      });
    }
  }
  const pair = texturePair(width, height, (color, data, w, h) => {
    fillPixels(color, data, w, h, (u, v) => {
      const shade = (broad(u, v) - .5) * 8 + (random() - .5) * 3;
      return [...family.wall.map(value => value + shade), .64, style === 'glass' ? .43 : .85, style === 'glass' ? .18 : 0];
    });
    for (let row = 0; row < rows; row++) {
      const y = row * cellHeight;
      // Floor joints, trim and spandrels line up across every facade tile.
      color.fillStyle = style === 'banded' ? rgb(family.wall, 12) : 'rgba(52,46,34,.12)';
      color.fillRect(0, y + cellHeight * .91, w, style === 'banded' ? 2.6 : .65);
      if (style === 'deco') {
        color.fillStyle = 'rgba(88,75,50,.20)';
        for (let column = 0; column < family.columns; column++) color.fillRect(column * cellWidth, y, 1.3, cellHeight);
      }
    }
    for (const pane of windows) {
      const { x, y, w: pw, h: ph, shade } = pane;
      color.fillStyle = style === 'parking' ? '#37423f' : '#4a514f';
      color.fillRect(x - .7, y - .6, pw + 1.4, ph + 1.2);
      if (style === 'parking') {
        color.fillStyle = '#35413f'; color.fillRect(x, y, pw, ph);
        color.fillStyle = 'rgba(0,0,0,.22)'; color.fillRect(x, y, pw, ph * .24);
        data.fillStyle = dataColor(.27, .96); data.fillRect(x, y, pw, ph);
        continue;
      }
      const reflection = color.createLinearGradient(0, y, 0, y + ph);
      reflection.addColorStop(0, rgb([84, 109, 121], shade));
      reflection.addColorStop(.57, rgb([60, 80, 87], shade));
      reflection.addColorStop(1, rgb([43, 55, 57], shade));
      color.fillStyle = reflection; color.fillRect(x, y, pw, ph);
      data.fillStyle = dataColor(.29, style === 'glass' ? .24 : .29, style === 'glass' ? .24 : .13);
      data.fillRect(x, y, pw, ph);
      if (pane.blind) {
        color.fillStyle = 'rgba(167,165,140,.20)'; color.fillRect(x + 1, y + 1, pw - 2, ph * .25);
      }
      // Thin reflected sky at the head and a recessed shadow under the sill.
      color.fillStyle = 'rgba(184,205,207,.28)'; color.fillRect(x, y, pw, .7);
      color.fillStyle = 'rgba(15,24,25,.32)'; color.fillRect(x, y + ph - .9, pw, .9);
      if (style === 'glass' || style === 'banded') {
        color.fillStyle = '#7c9298'; color.fillRect(x + pw * .5 - .4, y, .8, ph);
        data.fillStyle = dataColor(.60, .48, .45); data.fillRect(x + pw * .5 - .4, y, .8, ph);
      }
      if (family.sill) {
        color.fillStyle = rgb(family.wall, 14); color.fillRect(x - 1.3, y + ph + .6, pw + 2.6, 1.05);
        color.fillStyle = 'rgba(56,46,30,.18)'; color.fillRect(x - 1.1, y + ph + 1.65, pw + 2.2, .8);
      }
    }
  });
  const emission = canvasTexture(width, height, (context, w, h) => {
    context.fillStyle = '#000'; context.fillRect(0, 0, w, h);
    for (const pane of windows) {
      if (!pane.lit) continue;
      context.fillStyle = pane.cool ? '#8daab7' : '#c9a66d';
      context.fillRect(pane.x + .6, pane.y + .7, pane.w - 1.2, pane.h - 1.4);
      context.fillStyle = '#000';
      if (style === 'glass' || style === 'banded') context.fillRect(pane.x + pane.w * .5 - .45, pane.y, .9, pane.h);
      if (pane.blind) {
        context.fillStyle = pane.cool ? '#4d6064' : '#806b45';
        context.fillRect(pane.x + .6, pane.y + .7, pane.w - 1.2, pane.h * .25);
      }
    }
  });
  resizeTexture(emission, .5);
  return { ...pair, emission };
}

export function createFacadeMaterial({ seed = 42, id, style, dynamicLights }) {
  const textures = createFacadeTextures(seed, id, style);
  const material = new THREE.MeshStandardMaterial({
    name: `City ${style} facade`, map: textures.map,
    bumpMap: textures.detail, bumpScale: .025,
    roughnessMap: textures.detail, roughness: 1,
    metalnessMap: textures.detail, metalness: 1,
    emissiveMap: textures.emission, emissive: 0xfff0d5, emissiveIntensity: 0,
    envMapIntensity: style === 'glass' ? .85 : .65,
  });
  dynamicLights.push({ mat: material, min: 0, max: style === 'parking' ? 0 : .72 });
  return material;
}

export function createLowriseTextures(seed, id, style, wall) {
  const random = rngFor(seed, `lowrise/${id}`), broad = tileNoise(random, 5);
  return texturePair(256, 256, (color, data, width, height) => {
    fillPixels(color, data, width, height, (u, v) => {
      const grain = random() - .5, shade = (broad(u, v) - .5) * 10 + grain * 3;
      return [...wall.map(value => value + shade), .60 + grain * .06, .91 + grain * .04];
    });
    if (style === 'stucco') return;
    const columns = style === 'brick' ? 12 : 5, rows = style === 'brick' ? 32 : 4;
    const cw = width / columns, ch = height / rows, joint = style === 'brick' ? .7 : .65;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 ? cw * .5 : 0;
      for (let column = -1; column <= columns; column++) {
        const x = column * cw + offset, y = row * ch, shade = (random() - .5) * (style === 'brick' ? 15 : 7);
        color.globalAlpha = .72;
        color.fillStyle = rgb(wall, shade); color.fillRect(x + joint, y + joint, cw - joint, ch - joint);
        color.globalAlpha = 1;
        // Mortar is slightly lighter and recessed, not a black graphic grid.
        color.fillStyle = 'rgba(207,190,157,.35)'; color.fillRect(x, y, cw, joint);
        color.fillRect(x, y, joint, ch);
        data.fillStyle = dataColor(.46, .98); data.fillRect(x, y, cw, joint); data.fillRect(x, y, joint, ch);
      }
    }
  });
}

export function createLowriseMaterial(seed, id, style, wall) {
  const textures = createLowriseTextures(seed, id, style, wall);
  return new THREE.MeshStandardMaterial({
    name: `City ${id} lowrise`, map: textures.map,
    bumpMap: textures.detail, bumpScale: style === 'brick' ? .018 : .012,
    roughnessMap: textures.detail, roughness: 1,
  });
}
