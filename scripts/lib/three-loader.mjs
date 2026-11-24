// Node-only equivalent of the browser's "three" import-map entry.
// Keep normal file URLs so relative imports in every module work unchanged.
let threeURL;

export function initialize(options) {
  threeURL = options.threeURL;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return {url: threeURL, shortCircuit: true};
  return nextResolve(specifier, context);
}
