import {Box3, Frustum, Matrix4, Raycaster, Vector2, Vector3} from 'three';

const profiles = Object.freeze({
  low: Object.freeze({radius: 1, range: 1400, desiredLimit: 16, residentLimit: 24}),
  balanced: Object.freeze({radius: 2, range: 2400, desiredLimit: 40, residentLimit: 48}),
  high: Object.freeze({radius: 3, range: 3600, desiredLimit: 64, residentLimit: 80}),
});
export const qualityProfile = quality => profiles[quality] || profiles.balanced;
const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const compare = (a, b) => a.priority - b.priority || a.tile.x - b.tile.x || a.tile.z - b.tile.z;

// Selection owns no downloads or scene objects. The car always keeps its local
// collision neighborhood while the remaining budget follows the actual view.
export function createTileCoverage({entries = [], tileSize = 512, coreBounds} = {}) {
  if (!Number.isFinite(tileSize) || tileSize <= 0) throw Error('Invalid geographic tile size.');
  const list = Array.isArray(entries) ? entries : Object.entries(entries).map(([id, entry]) => ({id, ...entry}));
  const tiles = new Map();
  for (const entry of list) {
    const id = entry.id || entry.key, coordinate = String(id).split('_').map(Number);
    if (coordinate.length !== 2 || !coordinate.every(Number.isInteger)) continue;
    const [x, z] = coordinate, minX = x * tileSize, minZ = z * tileSize, maxX = minX + tileSize, maxZ = minZ + tileSize;
    // A partial boundary tile can contain geography outside the static city.
    // Only tiles wholly covered by that original core may be omitted.
    if (coreBounds && minX >= coreBounds.minX && maxX <= coreBounds.maxX && minZ >= coreBounds.minZ && maxZ <= coreBounds.maxZ) continue;
    tiles.set(id, {id, x, z, minX, minZ, maxX, maxZ, center: {x: minX + tileSize / 2, z: minZ + tileSize / 2},
      box: new Box3(new Vector3(minX, 0, minZ), new Vector3(maxX, 500, maxZ))});
  }
  const frustum = new Frustum(), matrix = new Matrix4(), raycaster = new Raycaster(), screenCenter = new Vector2(), cameraPosition = new Vector3();

  function select(position, camera, quality = 'balanced', {collisionOnly = false} = {}) {
    const profile = qualityProfile(quality), wanted = new Map(), anchors = [];
    const result = {wanted, anchors, limit: profile.residentLimit, range: profile.range};
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return result;
    const car = {x: position.x, z: position.z}; anchors.push(car);
    const cx = Math.floor(car.x / tileSize), cz = Math.floor(car.z / tileSize);
    const hasCamera = !collisionOnly && (camera?.isPerspectiveCamera || camera?.isOrthographicCamera);
    const radius = hasCamera || collisionOnly ? 1 : profile.radius, local = [];
    for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) {
      const tile = tiles.get((cx + x) + '_' + (cz + z));
      if (!tile) continue;
      const pinned = Math.abs(x) <= 1 && Math.abs(z) <= 1;
      local.push({tile, detail: quality !== 'low' && pinned, priority: (pinned ? -1e12 : 0) + distance2(tile.center, car)});
    }
    local.sort(compare);
    for (const item of local) wanted.set(item.tile.id, {detail: item.detail, priority: item.priority});
    if (!hasCamera) return result;

    camera.updateMatrixWorld(true);
    cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    const eye = {x: cameraPosition.x, z: cameraPosition.z};
    anchors.push(eye);
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix, camera.coordinateSystem, camera.reversedDepth);
    raycaster.setFromCamera(screenCenter, camera);
    const {origin, direction} = raycaster.ray;
    const groundDistance = direction.y < -1e-6 ? -origin.y / direction.y : Infinity;
    const lookDistance = groundDistance >= 0 ? Math.min(profile.range, groundDistance) : profile.range;
    const target = {x: origin.x + direction.x * lookDistance, z: origin.z + direction.z * lookDistance};
    anchors.push(target);
    const visible = [], detailRange2 = (tileSize * 1.5) ** 2;
    for (const tile of tiles.values()) {
      if (wanted.has(tile.id)) continue;
      const dx = Math.max(tile.minX - eye.x, 0, eye.x - tile.maxX), dz = Math.max(tile.minZ - eye.z, 0, eye.z - tile.maxZ);
      if (dx * dx + dz * dz > profile.range ** 2 || !frustum.intersectsBox(tile.box)) continue;
      const targetDistance2 = distance2(tile.center, target), cameraDistance2 = distance2(tile.center, eye);
      visible.push({tile, detail: quality !== 'low' && Math.min(targetDistance2, cameraDistance2) <= detailRange2,
        priority: targetDistance2 * .65 + cameraDistance2 * .35});
    }
    visible.sort(compare);
    for (const item of visible) {
      if (wanted.size >= profile.desiredLimit) break;
      wanted.set(item.tile.id, {detail: item.detail, priority: item.priority});
    }
    return result;
  }
  return {select};
}
