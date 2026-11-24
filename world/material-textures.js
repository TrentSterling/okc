import * as THREE from 'three';
import { canvasTexture } from './textures.js';

// Color is sRGB. The paired linear data map stores height / roughness / metalness
// in RGB, so one allocation can serve all three standard-material channels.
export function texturePair(width, height, paint) {
  let colorContext, dataContext;
  const map = canvasTexture(width, height, context => { colorContext = context; });
  const detail = canvasTexture(width, height, context => { dataContext = context; });
  detail.colorSpace = THREE.NoColorSpace;
  paint(colorContext, dataContext, width, height);
  // Roughness and shallow relief need less resolution than visible color.
  // Half-size data maps cut their allocation to one quarter without another
  // material, shader branch, or UV set. The shared channels stay aligned.
  resizeTexture(detail, .5);
  return { map, detail };
}

export function resizeTexture(texture, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(texture.image.width * scale));
  canvas.height = Math.max(1, Math.round(texture.image.height * scale));
  canvas.getContext('2d').drawImage(texture.image, 0, 0, canvas.width, canvas.height);
  texture.image = canvas;
  texture.needsUpdate = true;
}

export const byte = value => Math.max(0, Math.min(255, Math.round(value)));
export const rgb = (color, offset = 0) => `rgb(${color.map(value => byte(value + offset)).join(',')})`;
export const dataColor = (height, roughness, metalness = 0) => rgb([height * 255, roughness * 255, metalness * 255]);

// Periodic, smoothly interpolated fields keep low-frequency age variation
// continuous across repeating UVs. The field is generated once per texture.
export function tileNoise(random, cells) {
  const grid = Array.from({ length: cells * cells }, random);
  return (u, v) => {
    const x = ((u % 1 + 1) % 1) * cells, y = ((v % 1 + 1) % 1) * cells;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = grid[iy * cells + ix], b = grid[iy * cells + (ix + 1) % cells];
    const c = grid[((iy + 1) % cells) * cells + ix], d = grid[((iy + 1) % cells) * cells + (ix + 1) % cells];
    return a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy;
  };
}

export function fillPixels(colorContext, dataContext, width, height, sample) {
  const color = colorContext.createImageData(width, height);
  const data = dataContext.createImageData(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4, pixel = sample(x / width, y / height, x, y);
    for (let channel = 0; channel < 3; channel++) color.data[at + channel] = byte(pixel[channel]);
    data.data[at] = byte(pixel[3] * 255);
    data.data[at + 1] = byte(pixel[4] * 255);
    data.data[at + 2] = byte((pixel[5] || 0) * 255);
    color.data[at + 3] = data.data[at + 3] = 255;
  }
  colorContext.putImageData(color, 0, 0);
  dataContext.putImageData(data, 0, 0);
}
