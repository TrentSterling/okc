export function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Independent named streams keep a new texture or prop from reshuffling the
// rest of the city. Keys should use stable map IDs or authored feature names.
export function rngFor(seed, key) {
  let hash = (2166136261 ^ (Number(seed) | 0)) >>> 0;
  for (const character of String(key)) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return rng(hash);
}
