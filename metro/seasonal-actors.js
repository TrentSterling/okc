import * as THREE from 'three';

// A whole skating crowd takes three draw calls, sharing body/head/skate geometry.
export function createRinkSkaters(parent, center, count = 10) {
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(.55, 1, .38), new THREE.MeshStandardMaterial({roughness: .8}), count);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(.19, 8, 6), new THREE.MeshStandardMaterial({color: 0xdab993}), count);
  const skates = new THREE.InstancedMesh(new THREE.BoxGeometry(.65, .12, .55), new THREE.MeshStandardMaterial({color: 0x3f4446}), count);
  const parts = [[bodies, 1], [heads, 1.72], [skates, .43]], dummy = new THREE.Object3D();
  const palette = [0xa94c49, 0x507c83, 0xc7a65d, 0x7d638c];
  for (let i = 0; i < count; i++) bodies.setColorAt(i, new THREE.Color(palette[i % palette.length]));
  for (const [mesh] of parts) {
    mesh.name = 'Illustrative rink crowd';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Positions orbit a known 40m rink; culling must not keep a startup origin bound.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(center.x, 1, center.z), 24);
    parent.add(mesh);
  }
  return {
    update(time) {
      for (let i = 0; i < count; i++) {
        const angle = time * (.075 + i * .001) + i * Math.PI / 5;
        dummy.rotation.set(0, -angle, 0);
        for (const [mesh, y] of parts) {
          dummy.position.set(center.x + Math.cos(angle) * (14 + i % 3), y, center.z + Math.sin(angle) * (7 + i % 2));
          dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        }
      }
      parts.forEach(([mesh]) => { mesh.instanceMatrix.needsUpdate = true; });
    },
  };
}
