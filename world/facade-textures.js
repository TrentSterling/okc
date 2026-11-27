import * as THREE from 'three';
import { canvasTexture } from './textures.js';
import { rngFor } from './random.js';
import { texturePair, resizeTexture, tileNoise, fillPixels, writePixel, rgb, dataColor } from './material-textures.js';
import { BOK_FACADE, facadeFloorBands } from './skyline-profiles.js';
import { addFacadeOccupancy } from './facade-lighting.js';

const families = {
  limestone: { wall: [182, 172, 148], columns: 8, width: .56, height: .63, sill: true },
  brick: { wall: [143, 101, 77], columns: 6, width: .54, height: .58, sill: true },
  sandstone: { wall: [172, 158, 134], columns: 8, width: .64, height: .66, sill: true },
  brownstone: { wall: [137, 110, 88], columns: 6, width: .47, height: .62, sill: true },
  glass: { wall: [137, 151, 157], columns: 10, width: .966, height: .93, curtain: true },
  bok: { wall: [144, 155, 160], columns: BOK_FACADE.columns, width: .966, height: .95, curtain: true },
  banded: { wall: [184, 185, 174], columns: 8, width: .91, height: .60 },
  parking: { wall: [165, 163, 145], columns: 8, width: .94, height: .55 },
  deco: { wall: [189, 178, 151], columns: 8, width: .44, height: .74, sill: true },
};

export function createFacadeTextures(seed, id, style) {
  const family = families[style], random = rngFor(seed, `facade/${id}`);
  const broad = tileNoise(random, 7), windows = [];
  const bands = facadeFloorBands(style), span = style === 'bok' ? BOK_FACADE.height : 49;
  const width = 256, height = style === 'bok' ? 1024 : 512, cellWidth = width / family.columns;
  for (let row = 0; row < bands.length; row++) {
    const band = bands[row], cellHeight = (band.top - band.bottom) / span * height;
    // Canvas y runs downward. Meter-space facade UVs run upward. Keeping the
    // correspondence explicit matters for the unique lobby and crown bands.
    const top = height * (1 - band.top / span);
    for (let column = 0; column < family.columns; column++) {
      const w = cellWidth * family.width, h = cellHeight * (band.crown || band.lobby ? .964 : family.height);
      windows.push({
        x: column * cellWidth + (cellWidth - w) / 2,
        y: top + cellHeight * (family.curtain ? .018 : .12), w, h,
        lit: style !== 'parking' && band.occupied,
        shade: (random() - .5) * (family.curtain ? 3 : 6),
        blind: !family.curtain && random() > .88,
        crown: !!band.crown,
      });
    }
  }
  const pair = texturePair(width, height, (color, data, w, h) => {
    fillPixels(color, data, w, h, (u, v, x, y, pixel) => {
      const shade = (broad(u, v) - .5) * 8 + (random() - .5) * 3;
      return writePixel(pixel, family.wall[0] + shade, family.wall[1] + shade, family.wall[2] + shade, .54, family.curtain ? .30 : .85, family.curtain ? .55 : 0);
    });
    for (const band of bands) {
      const y = height * (1 - band.top / span), cellHeight = (band.top - band.bottom) / span * height;
      // Floor joints, trim and spandrels line up across every facade tile.
      color.fillStyle = style === 'banded' ? rgb(family.wall, 6) : family.curtain ? 'rgba(85,105,115,.15)' : 'rgba(52,46,34,.12)';
      if (!band.crown) color.fillRect(0, y + cellHeight * .96, w, style === 'banded' ? 1.3 : .45);
      if (style === 'deco') {
        color.fillStyle = 'rgba(88,75,50,.20)';
        for (let column = 0; column < family.columns; column++) color.fillRect(column * cellWidth, y, 1.3, cellHeight);
      }
    }
    for (const pane of windows) {
      const { x, y, w: pw, h: ph, shade } = pane;
      color.fillStyle = style === 'parking' ? '#37423f' : family.curtain ? '#91a1a7' : '#4a514f';
      color.fillRect(x - .45, y - .35, pw + .9, ph + .7);
      if (style === 'parking') {
        color.fillStyle = '#35413f'; color.fillRect(x, y, pw, ph);
        color.fillStyle = 'rgba(0,0,0,.22)'; color.fillRect(x, y, pw, ph * .24);
        data.fillStyle = dataColor(.27, .96); data.fillRect(x, y, pw, ph);
        continue;
      }
      // Glazing does not contain a painted blue 'reflection' gradient. The
      // environment supplies its directional sky color at every view angle.
      color.fillStyle = rgb(family.curtain ? [154, 165, 171] : [76, 85, 87], shade);
      color.fillRect(x, y, pw, ph);
      data.fillStyle = dataColor(family.curtain ? .51 : .29, family.curtain ? .12 : .24, family.curtain ? .64 : .30);
      data.fillRect(x, y, pw, ph);
      if (pane.blind) {
        color.fillStyle = 'rgba(167,165,140,.20)'; color.fillRect(x + 1, y + 1, pw - 2, ph * .25);
      }
      if (!family.curtain) {
        color.fillStyle = 'rgba(184,205,207,.14)'; color.fillRect(x, y, pw, .45);
        color.fillStyle = 'rgba(15,24,25,.22)'; color.fillRect(x, y + ph - .6, pw, .6);
      }
      if (style === 'banded') {
        color.fillStyle = '#7c9298'; color.fillRect(x + pw * .5 - .3, y, .6, ph);
        data.fillStyle = dataColor(.60, .48, .45); data.fillRect(x + pw * .5 - .3, y, .6, ph);
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
      // This is only an aperture mask. Lighting/occupancy comes from metric
      // world room coordinates in facade-lighting.js, so no tenant pattern
      // repeats every fourteen floors or across neighboring buildings.
      context.fillStyle = '#d4d4d4';
      context.fillRect(pane.x + .5, pane.y + .45, pane.w - 1, pane.h - .9);
      if (style === 'banded') {
        context.fillStyle = '#000';
        context.fillRect(pane.x + pane.w * .5 - .35, pane.y, .7, pane.h);
      }
      if (pane.blind) {
        context.fillStyle = '#777';
        context.fillRect(pane.x + .6, pane.y + .7, pane.w - 1.2, pane.h * .25);
      }
    }
  });
  resizeTexture(emission, .5);
  if (style === 'bok') for (const texture of [pair.map, pair.detail, emission]) texture.wrapT = THREE.ClampToEdgeWrapping;
  return { ...pair, emission };
}

export function createFacadeMaterial({ seed = 42, id, style, dynamicLights }) {
  const textures = createFacadeTextures(seed, id, style);
  const family = families[style];
  const Material = family.curtain ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const material = new Material({
    name: `City ${style} facade`, map: textures.map,
    bumpMap: textures.detail, bumpScale: family.curtain ? .004 : .025,
    roughnessMap: textures.detail, roughness: 1,
    metalnessMap: textures.detail, metalness: 1,
    emissiveMap: textures.emission, emissive: 0xffffff, emissiveIntensity: 0,
    envMapIntensity: 1,
  });
  if (family.curtain) { material.clearcoat = .35; material.clearcoatRoughness = .08; }
  addFacadeOccupancy(material, style, family.columns);
  dynamicLights.push({ mat: material, min: 0, max: style === 'parking' ? 0 : family.curtain ? .50 : .42 });
  return material;
}

export function createLowriseTextures(seed, id, style, wall) {
  const random = rngFor(seed, `lowrise/${id}`), broad = tileNoise(random, 5);
  return texturePair(256, 256, (color, data, width, height) => {
    fillPixels(color, data, width, height, (u, v, x, y, pixel) => {
      const grain = random() - .5, shade = (broad(u, v) - .5) * 10 + grain * 3;
      return writePixel(pixel, wall[0] + shade, wall[1] + shade, wall[2] + shade, .60 + grain * .06, .91 + grain * .04);
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
