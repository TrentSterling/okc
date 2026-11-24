// Deterministic, flat-ground arcade driving. No renderer or browser dependencies.
// Coordinates match the city: +X east, +Z south; heading zero points east.
import {springValue,wrapAngle} from './driving-motion.js';

export const DRIVING = Object.freeze({
  step: 1 / 120, maxForward: 28, maxReverse: 8, wheelbase: 2.86,
  hullRadius: 1.2, hullOffsets: [-1.75, -.875, 0, .875, 1.75],
  tireGrip: 10.8, yawInertia: 2.5, maxYawRate: 1.8,
});
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const approach = (n, target, amount) => n < target ? Math.min(target, n + amount) : Math.max(target, n - amount);
const finite = value => Number.isFinite(value);

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
    const height = finite(solid.height) && solid.height >= 0 ? solid.height : Infinity;
    const p = {id: solid.id ?? index, polygon, holes, rings: [polygon, ...holes], height, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity};
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

// Keep a chase camera's entire boom on the car's side of a wall. Buildings
// without a verified height stay conservative; low props may pass below it.
export function cameraBoomFraction(world, from, to, radius = .4) {
  const dx = to.x - from.x, dz = to.z - from.z, length = Math.hypot(dx, dz);
  const hasHeight = finite(from.y) && finite(to.y);
  if (length < 1e-6) return 1;
  const blocked = t => {
    const x = from.x + dx * t, z = from.z + dz * t, b = world.bounds;
    if (x - radius < b.minX || x + radius > b.maxX || z - radius < b.minZ || z + radius > b.maxZ) return true;
    for (const solid of candidates(world, x, z, radius)) {
      if (hasHeight && from.y + (to.y - from.y) * t - radius >= solid.height) continue;
      if (circleContact(x, z, radius, solid)) return true;
    }
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

export function createDrivingState({x = 0, z = 0, heading = 0, speed = 0, ...motion} = {}) {
  if (![x, z, heading, speed].every(finite)) throw Error('Invalid car pose');
  const velocity = clamp(speed, -DRIVING.maxReverse, DRIVING.maxForward);
  const car = {x, z, heading: wrapAngle(heading), vx: Math.cos(heading) * velocity, vz: Math.sin(heading) * velocity, speed: velocity, travelSpeed: Math.abs(velocity), steering: 0, yawRate: 0, bodyRoll: 0, bodyPitch: 0, bodyRollVelocity: 0, bodyPitchVelocity: 0, shiftTime: 0, shiftDirection: 0, accumulator: 0, collided: false};
  // Optional fields preserve momentum in new views/captures. Old v2 views need
  // only x/z/heading/speed and get the same safe defaults as before.
  for (const key of ['vx','vz','steering','yawRate','bodyRoll','bodyPitch','bodyRollVelocity','bodyPitchVelocity']) {
    if (motion[key] === undefined) continue;
    if (!finite(motion[key])) throw Error('Invalid car motion');
    car[key] = key === 'vx' || key === 'vz' ? clamp(motion[key], -DRIVING.maxForward, DRIVING.maxForward) : motion[key];
  }
  if ((motion.vx === undefined) !== (motion.vz === undefined)) throw Error('Incomplete car velocity');
  limitVelocity(car);
  car.steering = clamp(car.steering, -1, 1); car.yawRate = clamp(car.yawRate, -DRIVING.maxYawRate, DRIVING.maxYawRate);
  car.bodyRoll = clamp(car.bodyRoll, -.065, .065); car.bodyPitch = clamp(car.bodyPitch, -.045, .045);
  car.bodyRollVelocity = clamp(car.bodyRollVelocity, -1, 1); car.bodyPitchVelocity = clamp(car.bodyPitchVelocity, -1, 1);
  return resetDrivingInterpolation(car);
}

const poseFields = ['x','z','heading','vx','vz','speed','travelSpeed','steering','yawRate','bodyRoll','bodyPitch'];
function copyPose(car, pose = {}) { for (const key of poseFields) pose[key] = car[key]; return pose; }

export function resetDrivingInterpolation(car) {
  // Keep the fixed-step clock phase when only changing camera/presentation.
  // Recovery and setup restore create a new car with an empty accumulator.
  if (car) car.previousPose = copyPose(car, car.previousPose);
  return car;
}

// The car and camera read this one pose, one physics step behind the simulation.
// Interpolation never advances physics and never extrapolates through a wall.
export function sampleDrivingPose(car, pose = {}, world = null) {
  const previous = car.previousPose || car, alpha = clamp(car.accumulator / DRIVING.step, 0, 1);
  for (const key of poseFields) pose[key] = previous[key] + (car[key] - previous[key]) * alpha;
  pose.heading = wrapAngle(previous.heading + wrapAngle(car.heading - previous.heading) * alpha);
  // A chord between two clear poses can still touch a concave building corner.
  // In that rare case, show the current resolved pose rather than an overlap.
  if (world && !isDrivingPoseClear(world, pose)) copyPose(car, pose);
  return pose;
}

export function snapshotDriving(car) {
  const {x,z,heading,speed,vx,vz,steering,yawRate,bodyRoll,bodyPitch,bodyRollVelocity,bodyPitchVelocity} = car;
  return {x,z,heading,speed,vx,vz,steering,yawRate,bodyRoll,bodyPitch,bodyRollVelocity,bodyPitchVelocity};
}

function limitVelocity(car) {
  const c = Math.cos(car.heading), s = Math.sin(car.heading), forward = car.vx * c + car.vz * s;
  const bounded = clamp(forward, -DRIVING.maxReverse, DRIVING.maxForward);
  car.vx += c * (bounded - forward); car.vz += s * (bounded - forward);
  const speed = Math.hypot(car.vx, car.vz);
  if (speed > DRIVING.maxForward) { car.vx *= DRIVING.maxForward / speed; car.vz *= DRIVING.maxForward / speed; }
  car.speed = clamp(car.vx * c + car.vz * s, -DRIVING.maxReverse, DRIVING.maxForward); car.travelSpeed = Math.hypot(car.vx, car.vz);
}

function simulateStep(car, input, dt, world) {
  const throttle = clamp(Number(input.throttle) || 0, -1, 1), steer = clamp(Number(input.steer) || 0, -1, 1);
  const handbrake = Boolean(input.handbrake), oldX = car.x, oldZ = car.z, oldHeading = car.heading, oldVx = car.vx, oldVz = car.vz;
  const c = Math.cos(car.heading), s = Math.sin(car.heading);
  const longitudinal = car.vx * c + car.vz * s, lateral = -car.vx * s + car.vz * c;
  let forward = longitudinal;
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
  if (Math.abs(forward) < .015) forward = 0;
  const wheelAngle = car.steering * .57 / (1 + Math.abs(longitudinal) * .035);
  const sinWheel = Math.sin(wheelAngle), cosWheel = Math.cos(wheelAngle), arm = DRIVING.wheelbase * .5;
  // Front and rear contact patches oppose their sideways slip, with finite
  // grip. Forces change world velocity; rotating the body never rotates it.
  const frontGrip = DRIVING.tireGrip * .5, rearGrip = frontGrip * (handbrake ? .38 : 1);
  const front = clamp((longitudinal * sinWheel - (lateral + car.yawRate * arm) * cosWheel) * 5.5, -frontGrip, frontGrip);
  const rear = clamp(-(lateral - car.yawRate * arm) * 6.2, -rearGrip, rearGrip);
  const sideForce = front * cosWheel + rear;
  const forwardForce = (forward - longitudinal) / dt - front * sinWheel;
  car.vx += (c * forwardForce - s * sideForce) * dt;
  car.vz += (s * forwardForce + c * sideForce) * dt;
  const slip = Math.atan2(lateral, Math.abs(longitudinal) + .5);
  const recovery = clamp(Math.sign(longitudinal) * slip * 4, -2.5, 2.5) * clamp((Math.abs(slip) - .1) / .4, 0, 1) * (handbrake ? .35 : 1);
  const yawAcceleration = arm * (front * cosWheel - rear) / DRIVING.yawInertia - car.yawRate * 1.1 + recovery;
  car.yawRate = clamp(car.yawRate + yawAcceleration * dt, -DRIVING.maxYawRate, DRIVING.maxYawRate);
  if (Math.hypot(car.vx, car.vz) < .015 && Math.abs(car.yawRate) < .015) { car.vx = car.vz = car.yawRate = 0; }
  car.heading = wrapAngle(car.heading + car.yawRate * dt);
  limitVelocity(car);
  car.x += car.vx * dt; car.z += car.vz * dt;
  // Substeps move at most 24 cm. Resolve only local penetration and remove
  // inward velocity, so walls and map edges slide/stop the car without bounce.
  let contacted = false;
  for (let iteration = 0; iteration < 8; iteration++) {
    const hits = contacts(world, car.x, car.z, car.heading);
    if (!hits.length) break;
    const hit = hits.reduce((deepest, contact) => contact.depth > deepest.depth ? contact : deepest);
    car.collided = contacted = true;
    car.x += hit.nx * (hit.depth + .0001); car.z += hit.nz * (hit.depth + .0001);
    const inward = car.vx * hit.nx + car.vz * hit.nz;
    if (inward < 0) { car.vx -= hit.nx * inward; car.vz -= hit.nz * inward; }
  }
  // Concave corners and simultaneous contacts must never push through a wall.
  // If local resolution fails, stay at the previous valid pose and stop.
  if (!isDrivingPoseClear(world, car) || Math.hypot(car.x - oldX, car.z - oldZ) > Math.hypot(car.vx, car.vz) * dt + .18) {
    car.x = oldX; car.z = oldZ; car.heading = oldHeading; car.vx = 0; car.vz = 0; car.yawRate = 0; car.collided = true;
  }
  if (contacted) car.yawRate *= .45;
  car.speed = clamp(car.vx * Math.cos(car.heading) + car.vz * Math.sin(car.heading), -DRIVING.maxReverse, DRIVING.maxForward);
  car.travelSpeed = Math.hypot(car.vx, car.vz);
  const ax = (car.vx - oldVx) / dt, az = (car.vz - oldVz) / dt;
  const roll = clamp(-(-s * ax + c * az) * .007, -.065, .065);
  const pitch = clamp((c * ax + s * az) * .0045, -.045, .045);
  springValue(car, 'bodyRoll', roll, 10, dt);
  springValue(car, 'bodyPitch', pitch, 10, dt);
  // Also bound restored spring momentum, not just its target angle.
  for (const [key, limit] of [['bodyRoll', .065], ['bodyPitch', .045]]) {
    if (Math.abs(car[key]) > limit) { car[key] = clamp(car[key], -limit, limit); car[key + 'Velocity'] = 0; }
  }
}

export function advanceDriving(car, input, elapsed, world) {
  if (!finite(elapsed) || elapsed < 0) return car;
  car.collided = false;
  // Bounded catch-up avoids teleporting after a suspended/background tab.
  car.accumulator += Math.min(elapsed, .1);
  while (car.accumulator + 1e-10 >= DRIVING.step) {
    car.previousPose = copyPose(car, car.previousPose);
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
