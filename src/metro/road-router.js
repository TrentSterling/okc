// Driving graph built from shared OSM nodes. Source one-way edges are retained;
// start/end points are snapped onto segments instead of jumping to nearby nodes.
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
class Heap {
  constructor() { this.values = []; }
  push(value) {
    let index = this.values.length;
    this.values.push(value);
    while (index) {
      const parent = (index - 1) >> 1;
      if (this.values[parent][0] <= value[0]) break;
      this.values[index] = this.values[parent]; index = parent;
    }
    this.values[index] = value;
  }
  pop() {
    if (!this.values.length) return null;
    const first = this.values[0], value = this.values.pop();
    if (this.values.length) {
      let index = 0;
      while (index * 2 + 1 < this.values.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.values.length && this.values[child + 1][0] < this.values[child][0]) child++;
        if (this.values[child][0] >= value[0]) break;
        this.values[index] = this.values[child]; index = child;
      }
      this.values[index] = value;
    }
    return first;
  }
}

export function createRouter(network) {
  const nodes = network.nodes, roads = network.roads, adjacency = Array.from({length: nodes.length}, () => []);
  const grid = new Map(), segments = new Map(), size = 256, used = new Set();
  let edgeCount = 0;
  for (let roadIndex = 0; roadIndex < roads.length; roadIndex++) {
    const road = roads[roadIndex];
    if (['no', 'private'].includes(road.access)) continue;
    const ids = road.n || [];
    for (let i = 1; i < ids.length; i++) {
      const a = ids[i - 1], b = ids[i];
      if (!nodes[a] || !nodes[b]) continue;
      const length = distance(nodes[a], nodes[b]);
      if (length < .01) continue;
      adjacency[a].push([b, length, roadIndex]);
      if (!road.oneway) adjacency[b].push([a, length, roadIndex]);
      used.add(a); used.add(b);
      edgeCount += road.oneway ? 1 : 2;
      const p = nodes[a], q = nodes[b], segment = {a, b, roadIndex, length};
      for (let x = Math.floor(Math.min(p[0], q[0]) / size); x <= Math.floor(Math.max(p[0], q[0]) / size); x++) {
        for (let z = Math.floor(Math.min(p[1], q[1]) / size); z <= Math.floor(Math.max(p[1], q[1]) / size); z++) {
          const key = x + ',' + z;
          if (!segments.has(key)) segments.set(key, []);
          segments.get(key).push(segment);
        }
      }
    }
  }
  for (const id of used) {
    const point = nodes[id], key = Math.floor(point[0] / size) + ',' + Math.floor(point[1] / size);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(id);
  }
  function near(position, count = 6) {
    const p = Array.isArray(position) ? position : [position.x, position.z];
    const cx = Math.floor(p[0] / size), cz = Math.floor(p[1] / size), candidates = [];
    for (let radius = 0; radius < 12; radius++) {
      for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) {
        if (radius && Math.abs(x) !== radius && Math.abs(z) !== radius) continue;
        for (const id of grid.get((cx + x) + ',' + (cz + z)) || []) candidates.push({id, d: distance(p, nodes[id])});
      }
      if (candidates.length >= count && radius >= 1) break;
    }
    return candidates.sort((a, b) => a.d - b.d).slice(0, count);
  }
  function closestRoad(position) {
    const {x, z} = position, cx = Math.floor(x / size), cz = Math.floor(z / size), checked = new Set();
    let best = null, distance2 = Infinity;
    for (let xx = -2; xx <= 2; xx++) for (let zz = -2; zz <= 2; zz++) {
      for (const segment of segments.get((cx + xx) + ',' + (cz + zz)) || []) {
        if (checked.has(segment)) continue;
        checked.add(segment);
        const a = nodes[segment.a], b = nodes[segment.b], dx = b[0] - a[0], dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (segment.length ** 2)));
        const px = a[0] + dx * t, pz = a[1] + dz * t, candidate = (x - px) ** 2 + (z - pz) ** 2;
        if (candidate < distance2) {
          distance2 = candidate;
          const road = roads[segment.roadIndex];
          best = {...segment, x: px, z: pz, t, heading: Math.atan2(dz, dx), name: road.name || 'Unnamed road', road,
            distance: Math.sqrt(candidate), start: a, end: b};
        }
      }
    }
    return best;
  }
  function describe(points, roadIndices, start, end, visited) {
    const legs = []; let total = 0;
    for (let i = 1; i < points.length; i++) {
      const road = roads[roadIndices[i - 1]], length = distance(points[i - 1], points[i]);
      total += length;
      const last = legs.at(-1);
      if (last && last.roadId === road.id) last.meters += length;
      else legs.push({roadId: road.id, name: road.name || 'Unnamed road', kind: road.kind, meters: length, pointIndex: i - 1, oneway: !!road.oneway});
    }
    const instructions = legs.map((leg, index) => {
      let action = index === 0 ? 'Start on' : 'Continue onto';
      if (index > 0) {
        const at = leg.pointIndex, previous = points[Math.max(0, at - 1)], p = points[at], next = points[Math.min(points.length - 1, at + 1)];
        const a = Math.atan2(p[1] - previous[1], p[0] - previous[0]), b = Math.atan2(next[1] - p[1], next[0] - p[0]);
        const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
        if (Math.abs(delta) > .5) action = delta > 0 ? 'Turn right onto' : 'Turn left onto';
      }
      return {...leg, action};
    });
    return {ok: true, points, roadIds: roadIndices.map(index => roads[index].id), legs, instructions, meters: total,
      startGap: start.distance, arrivalGap: end.distance, graphNodesVisited: visited};
  }
  function route(from, to) {
    if (![from?.x, from?.z, to?.x, to?.z].every(Number.isFinite)) return {ok: false, error: 'This place has no mapped driving coordinate.'};
    const start = closestRoad(from), end = closestRoad(to);
    if (!start || !end) return {ok: false, error: 'No mapped driving road near this location.'};
    const first = [start.x, start.z], last = [end.x, end.z];
    if (start.a === end.a && start.b === end.b && start.roadIndex === end.roadIndex && (!start.road.oneway || end.t >= start.t)) {
      return describe([first, last], [start.roadIndex], start, end, 0);
    }
    const starts = [[start.b, (1 - start.t) * start.length]];
    if (!start.road.oneway || start.t < 1e-7) starts.push([start.a, start.t * start.length]);
    const goals = new Map([[end.a, end.t * end.length]]);
    if (!end.road.oneway || end.t > 1 - 1e-7) goals.set(end.b, (1 - end.t) * end.length);
    const costs = new Map(), parents = new Map(), via = new Map(), heap = new Heap();
    for (const [id, cost] of starts) { costs.set(id, cost); heap.push([cost + distance(nodes[id], last), id, cost]); }
    let reached = null, visited = 0, best = Infinity;
    while (heap.values.length && visited < 400000) {
      const [bound, id, cost] = heap.pop();
      if (bound >= best) break;
      if (cost !== costs.get(id)) continue;
      visited++;
      if (goals.has(id) && cost + goals.get(id) < best) { reached = id; best = cost + goals.get(id); }
      for (const [next, length, roadIndex] of adjacency[id]) {
        const nextCost = cost + length;
        if (nextCost >= (costs.get(next) ?? Infinity)) continue;
        costs.set(next, nextCost); parents.set(next, id); via.set(next, roadIndex);
        heap.push([nextCost + distance(nodes[next], last), next, nextCost]);
      }
    }
    if (reached === null) return {ok: false, error: 'These approaches are not connected by the available one-way road graph. Choose another nearby road.'};
    const ids = [reached], graphRoads = [];
    while (parents.has(ids.at(-1))) { graphRoads.push(via.get(ids.at(-1))); ids.push(parents.get(ids.at(-1))); }
    ids.reverse(); graphRoads.reverse();
    const points = [first], roadIndices = [];
    const append = (point, roadIndex) => { if (distance(points.at(-1), point) > .001) { points.push(point); roadIndices.push(roadIndex); } };
    append(nodes[ids[0]], start.roadIndex);
    for (let i = 1; i < ids.length; i++) append(nodes[ids[i]], graphRoads[i - 1]);
    append(last, end.roadIndex);
    if (points.length === 1) { points.push(last); roadIndices.push(end.roadIndex); }
    return describe(points, roadIndices, start, end, visited);
  }
  return {route, near, closestRoad, nodes, roads, edgeCount};
}

export function sampleRoute(route, meters) {
  if (!route?.points?.length) return null;
  if (route.points.length === 1) return {x: route.points[0][0], z: route.points[0][1], heading: 0, segment: 0, finished: true};
  let remaining = Math.max(0, meters);
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i], length = distance(a, b);
    if (remaining <= length || i === route.points.length - 1) {
      const t = Math.min(1, remaining / (length || 1));
      return {x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t,
        heading: Math.atan2(b[1] - a[1], b[0] - a[0]), segment: i - 1, finished: remaining >= length && i === route.points.length - 1};
    }
    remaining -= length;
  }
  return null;
}
