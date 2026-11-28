import * as THREE from 'three';

// Downtown and streamed markings must share the same surface-decal contract.
// Keep opaque scenery as the depth owner, then test paint against that depth.
// Double-sided streamed strips need only one pass, not two transparent draws.
// Use units-only bias: slope scaling can pull grazing paint through occluders.
export function createRoadPaintMaterial(parameters) {
  return new THREE.MeshStandardMaterial({
    ...parameters,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: -2,
    forceSinglePass: true,
  });
}
