// Deterministic, flat-ground arcade driving. No renderer or browser dependencies.
// Coordinates match the city: +X east, +Z south; heading zero points east.
export const DRIVING = Object.freeze({
  step: 1 / 120, maxForward: 28, maxReverse: 8, wheelbase: 2.86,
  hullRadius: 1.2, hullOffsets: [-1.75, -.875, 0, .875, 1.75],
});
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const approach = (n, target, amount) => n < target ? Math.min(target, n + amount) : Math.max(target, n - amount);
const finite = value => Number.isFinite(value);
const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function circleContact(x, z, radius, solid) {
  if (x + radius < solid.minX || x - radius > solid.maxX || z + radius < solid.minZ || z - radius > solid.maxZ) return null;
  const inside = inRing(x, z, solid.polygon) && !solid.holes.some(ring => inRing(x, z, ring));
  let distance2 = Infinity, closestX = 0, closestZ = 0, edgeX = 0, edgeZ = 0;
  for (const ring of solid.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const length2 = dx * dx + dz * dz;
      if (length2 < 1e-14) continue;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / length2, 0, 1);
      const qx = a[0] + t * dx, qz = a[1] + t * dz, d2 = (x - qx) ** 2 + (z - qz) ** 2;
      if (d2 < distance2) { distance2 = d2; closestX = qx; closestZ = qz; edgeX = dx; edgeZ = dz; }
    }
  }
  if (!inside && distance2 >= radius * radius - 1e-9) return null;
  const distance = Math.sqrt(distance2);
  let nx, nz;
  if (distance > 1e-8) {
    nx = (inside ? closestX - x : x - closestX) / distance;
    nz = (inside ? closestZ - z : z - closestZ) / distance;
  } else {
    const edgeLength = Math.hypot(edgeX, edgeZ) || 1;
    nx = -edgeZ / edgeLength; nz = edgeX / edgeLength;
    if (inRing(x + nx * .001, z + nz * .001, solid.polygon) && !solid.holes.some(r => inRing(x + nx * .001, z + nz * .001, r))) { nx *= -1; nz *= -1; }
  }
  return {nx, nz, depth: inside ? radius + distance : radius - distance};
}

export function createDrivingWorld(solids = [], bounds = {minX: -3000, maxX: 3000, minZ: -3000, maxZ: 3000}) {
  if (!['minX', 'maxX', 'minZ', 'maxZ'].every(key => finite(bounds[key])) || bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) throw Error('Invalid driving bounds');
  const cellSize = 64, grid = new Map();
  const prepared = solids.map((solid, index) => {
    const polygon = solid.polygon;
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.some(p => !Array.isArray(p) || !finite(p[0]) || !finite(p[1]))) throw Error('Invalid driving footprint');
    const holes = (solid.holes || []).filter(ring => ring.length >= 3);
    const p = {id: solid.id ?? index, polygon, holes, rings: [polygon, ...holes], minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity};
    for (const [x, z] of polygon) { p.minX = Math.min(p.minX, x); p.maxX = Math.max(p.maxX, x); p.minZ = Math.min(p.minZ, z); p.maxZ = Math.max(p.maxZ, z); }
    for (let x = Math.floor(p.minX / cellSize); x <= Math.floor(p.maxX / cellSize); x++) for (let z = Math.floor(p.minZ / cellSize); z <= Math.floor(p.maxZ / cellSize); z++) {
      const key = x + ',' + z;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(p);
    }
    return p;
  });
  return {bounds: {...bounds}, solids: prepared, grid, cellSize};
}

function candidates(world, x, z, radius) {
  const result = new Set(), cell = world.cellSize;
  for (let gx = Math.floor((x - radius) / cell); gx <= Math.floor((x + radius) / cell); gx++) for (let gz = Math.floor((z - radius) / cell); gz <= Math.floor((z + radius) / cell); gz++) {
    for (const solid of world.grid.get(gx + ',' + gz) || []) result.add(solid);
  }
  return result;
}

function contacts(world, x, z, heading, margin = 0) {
  const result = [], r = DRIVING.hullRadius + margin, c = Math.cos(heading), s = Math.sin(heading), bounds = world.bounds;
  const nearby = candidates(world, x, z, DRIVING.hullOffsets.at(-1) + r);
  for (const offset of DRIVING.hullOffsets) {
    const px = x + c * offset, pz = z + s * offset;
    if (px - r < bounds.minX) result.push({nx: 1, nz: 0, depth: bounds.minX - px + r});
    if (px + r > bounds.maxX) result.push({nx: -1, nz: 0, depth: px + r - bounds.maxX});
    if (pz - r < bounds.minZ) result.push({nx: 0, nz: 1, depth: bounds.minZ - pz + r});
    if (pz + r > bounds.maxZ) result.push({nx: 0, nz: -1, depth: pz + r - bounds.maxZ});
    for (const solid of nearby) { const contact = circleContact(px, pz, r, solid); if (contact) result.push(contact); }
  }
  return result;
}

export function isDrivingPoseClear(world, pose, margin = 0) {
  return ['x', 'z', 'heading'].every(key => finite(pose[key])) && contacts(world, pose.x, pose.z, pose.heading, margin).length === 0;
}

// Keep a chase camera's entire boom on the car's side of a wall. The sweep is
// conservative in height, so even a low building cannot cut through the view.
export function cameraBoomFraction(world, from, to, radius = .4) {
  const dx = to.x - from.x, dz = to.z - from.z, length = Math.hypot(dx, dz);
  if (length < 1e-6) return 1;
  const blocked = t => {
    const x = from.x + dx * t, z = from.z + dz * t, b = world.bounds;
    if (x - radius < b.minX || x + radius > b.maxX || z - radius < b.minZ || z + radius > b.maxZ) return true;
    for (const solid of candidates(world, x, z, radius)) if (circleContact(x, z, radius, solid)) return true;
    return false;
  };
  const count = Math.ceil(length / (radius * .7));
  let previous = 0;
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    if (blocked(t)) {
      let low = previous, high = t;
      for (let n = 0; n < 8; n++) { const middle = (low + high) / 2; if (blocked(middle)) high = middle; else low = middle; }
      return Math.max(0, low - .02 / length);
    }
    previous = t;
  }
  return 1;
}

export function createDrivingState({x = 0, z = 0, heading = 0, speed = 0} = {}) {
  if (![x, z, heading, speed].every(finite)) throw Error('Invalid car pose');
  const velocity = clamp(speed, -DRIVING.maxReverse, DRIVING.maxForward);
  return {x, z, heading: wrapAngle(heading), vx: Math.cos(heading) * velocity, vz: Math.sin(heading) * velocity, speed: velocity, travelSpeed: Math.abs(velocity), steering: 0, shiftTime: 0, shiftDirection: 0, accumulator: 0, collided: false};
}

export function snapshotDriving(car) { return {x: car.x, z: car.z, heading: car.heading, speed: car.speed}; }

function simulateStep(car, input, dt, world) {
  const throttle = clamp(Number(input.throttle) || 0, -1, 1), steer = clamp(Number(input.steer) || 0, -1, 1);
  const handbrake = Boolean(input.handbrake), oldX = car.x, oldZ = car.z, oldHeading = car.heading;
  let c = Math.cos(car.heading), s = Math.sin(car.heading);
  let forward = car.vx * c + car.vz * s, lateral = -car.vx * s + car.vz * c;
  car.steering += (steer - car.steering) * (1 - Math.exp(-10 * dt));
  if (handbrake) {
    forward = approach(forward, 0, 16 * dt); car.shiftTime = 0;
  } else if (throttle !== 0) {
    const direction = Math.sign(throttle);
    if (car.shiftDirection !== direction) { car.shiftDirection = direction; car.shiftTime = 0; }
    if (forward * direction < -.2) { forward = approach(forward, 0, 11 * dt); car.shiftTime = 0; }
    else {
      // A short stop before selecting reverse makes S usable as a brake.
      car.shiftTime += dt;
      if (direction > 0 || car.shiftTime >= .22 || forward < -.2) forward += throttle * (direction > 0 ? 6.2 : 4.2) * dt;
      else forward = approach(forward, 0, 11 * dt);
    }
  } else {
    car.shiftTime = 0; car.shiftDirection = 0;
    forward = approach(forward, 0, (.65 + .0035 * forward * forward) * dt);
  }
  forward = clamp(forward, -DRIVING.maxReverse, DRIVING.maxForward);
  lateral *= Math.exp(-(handbrake ? 3.5 : 12) * dt);
  if (Math.abs(forward) < .015) forward = 0;
  const wheelAngle = car.steering * .57 / (1 + Math.abs(forward) * .035);
  const yawLimit = Math.min(1.65, (handbrake ? 8 : 7) / Math.max(3, Math.abs(forward)));
  const yawRate = clamp(forward / DRIVING.wheelbase * Math.tan(wheelAngle), -yawLimit, yawLimit);
  car.heading = wrapAngle(car.heading + yawRate * dt);
  c = Math.cos(car.heading); s = Math.sin(car.heading);
  car.vx = c * forward - s * lateral; car.vz = s * forward + c * lateral;
  car.x += car.vx * dt; car.z += car.vz * dt;
  // Substeps move at most 24 cm. Resolve only local penetration and remove
  // inward velocity, so walls and map edges slide/stop the car without bounce.
  for (let iteration = 0; iteration < 8; iteration++) {
    const hits = contacts(world, car.x, car.z, car.heading);
    if (!hits.length) break;
    const hit = hits.reduce((deepest, contact) => contact.depth > deepest.depth ? contact : deepest);
    car.collided = true;
    car.x += hit.nx * (hit.depth + .0001); car.z += hit.nz * (hit.depth + .0001);
    const inward = car.vx * hit.nx + car.vz * hit.nz;
    if (inward < 0) { car.vx -= hit.nx * inward; car.vz -= hit.nz * inward; }
  }
  // Concave corners and simultaneous contacts must never push through a wall.
  // If local resolution fails, stay at the previous valid pose and stop.
  if (!isDrivingPoseClear(world, car) || Math.hypot(car.x - oldX, car.z - oldZ) > Math.hypot(car.vx, car.vz) * dt + .18) {
    car.x = oldX; car.z = oldZ; car.heading = oldHeading; car.vx = 0; car.vz = 0; car.collided = true;
  }
  car.speed = car.vx * Math.cos(car.heading) + car.vz * Math.sin(car.heading);
  car.travelSpeed = Math.hypot(car.vx, car.vz);
}

export function advanceDriving(car, input, elapsed, world) {
  if (!finite(elapsed) || elapsed < 0) return car;
  car.collided = false;
  // Bounded catch-up avoids teleporting after a suspended/background tab.
  car.accumulator += Math.min(elapsed, .1);
  while (car.accumulator + 1e-10 >= DRIVING.step) {
    simulateStep(car, input, DRIVING.step, world);
    car.accumulator = Math.max(0, car.accumulator - DRIVING.step);
  }
  return car;
}

// Find a nearby clear road pose for entering free mode and recovering. Road
// centerlines remain guidance only; the controller is never constrained to one.
export function nearestRoadPose(world, roads, position, preferredHeading = 0) {
  const options = [];
  for (const road of roads) {
    if (!Array.isArray(road.p) || road.w < 4) continue;
    for (let i = 1; i < road.p.length; i++) {
      const a = road.p[i - 1], b = road.p[i], dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
      if (length2 < 1) continue;
      const t = clamp(((position.x - a[0]) * dx + (position.z - a[1]) * dz) / length2, 0, 1), length = Math.sqrt(length2);
      let heading = Math.atan2(dz, dx);
      if (Math.cos(heading - preferredHeading) < 0) heading = wrapAngle(heading + Math.PI);
      for (const offset of [Math.min(road.w * .22, 3.5), -Math.min(road.w * .22, 3.5), 0]) {
        const x = a[0] + t * dx - Math.sin(heading) * offset, z = a[1] + t * dz + Math.cos(heading) * offset;
        options.push({x, z, heading, score: (x - position.x) ** 2 + (z - position.z) ** 2 + (offset < 0 ? 4 : 0)});
      }
    }
  }
  options.sort((a, b) => a.score - b.score);
  for (const option of options) if (isDrivingPoseClear(world, option, .08)) return {x: option.x, z: option.z, heading: option.heading, speed: 0};
  return null;
}
