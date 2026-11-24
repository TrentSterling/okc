import * as THREE from 'three';
import { addBox, addBeams } from './geometry.js';

export function createLegends({ glassMaterial } = {}) {
  const group = new THREE.Group();
  group.name = 'Legends Tower proposed skyline study';
  group.userData = { height: 581.3, proposed: true, conceptualGeometry: true };
  const glass = glassMaterial || new THREE.MeshPhysicalMaterial({ color: 0x314957, roughness: .09, metalness: 0, ior: 1.5 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x858d99, metalness: .68, roughness: .3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x202b37, metalness: .35, roughness: .5 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x96928c, roughness: .8 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xc1d7ec, toneMapped: true });

  addBox(group, [112, 22, 86], [0, 11, 0], stone, 'Boardwalk podium approximation');
  addBox(group, [114, 1.2, 88], [0, 22, 0], frame);
  const sections = [
    { w: 62, d: 52, bottom: 22, top: 392 },
    { w: 56, d: 46, bottom: 392, top: 468 },
    { w: 47, d: 39, bottom: 468, top: 519 },
    { w: 34, d: 29, bottom: 519, top: 548 },
    { w: 18, d: 16, bottom: 548, top: 565 }
  ];
  const ribs = [];
  for (const s of sections) {
    const y = (s.bottom + s.top) / 2;
    // Use real-world UV coordinates on the large box faces as on Devon.
    const mesh = addBox(group, [s.w, s.top - s.bottom, s.d], [0, y, 0], glass, 'Proposed tower glass tier');
    const geometry = mesh.geometry;
    const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i), p.getY(i) + y);
    }
    addBox(group, [s.w + .55, .65, s.d + .55], [0, s.top, 0], frame, 'Setback rim');
    for (const x of [-s.w / 2, s.w / 2]) for (const z of [-s.d / 2, s.d / 2]) {
      ribs.push([new THREE.Vector3(x, s.bottom, z), new THREE.Vector3(x, s.top, z), .7, .7]);
    }
    for (let x = -s.w / 2 + 6; x < s.w / 2; x += 6) {
      for (const z of [-s.d / 2 - .05, s.d / 2 + .05]) ribs.push([new THREE.Vector3(x, s.bottom, z), new THREE.Vector3(x, s.top, z), .2, .25]);
    }
  }
  addBeams(group, ribs, frame, 'Proposed tower vertical fins');
  addBox(group, [63, 7.8, 53], [0, 270, 0], dark, 'Sky amenity belt');
  addBox(group, [63, 1, 53], [0, 275, 0], frame);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(.12, 1.15, 16.3, 8), frame);
  spire.position.y = 573.15;
  group.add(spire);
  const crownLines = [];
  for (const x of [-15, 15]) for (const z of [-12, 12]) crownLines.push([new THREE.Vector3(x, 519, z), new THREE.Vector3(x * .25, 568, z * .25), .3, .3]);
  const lights = addBeams(group, crownLines, glow, 'Proposed crown illumination');
  lights.visible = false;
  return {
    group,
    height: 581.3,
    update(simTime = 0, nightAmount = 0) {
      lights.visible = nightAmount > .3;
      glow.color.setRGB(.42 + nightAmount * .5, .52 + nightAmount * .42, .68 + nightAmount * .3);
    }
  };
}
