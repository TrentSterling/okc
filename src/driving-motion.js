// Shared, renderer-free motion math. Springs are solved analytically so their
// damping does not depend on the render frame rate.
export const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function springValue(state, key, target, frequency, dt, snap = false, angular = false) {
  const velocityKey = key + 'Velocity';
  if (snap || !Number.isFinite(state[key])) {
    state[key] = angular ? wrapAngle(target) : target;
    state[velocityKey] = 0;
    return state[key];
  }
  if (angular) target = state[key] + wrapAngle(target - state[key]);
  const velocity = state[velocityKey] || 0, error = state[key] - target;
  const combined = velocity + frequency * error, decay = Math.exp(-frequency * Math.max(0, dt));
  state[key] = target + (error + combined * dt) * decay;
  state[velocityKey] = (velocity - frequency * combined * dt) * decay;
  if (angular) state[key] = wrapAngle(state[key]);
  return state[key];
}
