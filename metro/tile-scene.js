import * as THREE from 'three';
import {createDrivingWorld} from '../driving.js';

const colors = [0xffc36a, 0xf36766, 0x58d5b0, 0x88adff, 0xe1b9ff, 0xffd99a];
const groundMaterials = new Set(['asphalt', 'concrete', 'water', 'grass', 'forest', 'parking', 'paint', 'yellow']);
function materialLayer(kind) {
  if (kind === 'water') return 'water';
  if (kind === 'grass' || kind === 'forest') return 'parks';
  return groundMaterials.has(kind) || kind === 'pole' ? 'roads' : 'buildings';
}
function lampPoints(lamps, seasonal) {
  const selected = lamps.filter(lamp => (lamp[3] !== 5) === seasonal);
  if (!selected.length) return null;
  const positions = [], rgb = [];
  for (const [x, y, z, index] of selected) {
    positions.push(x, y, z);
    const color = new THREE.Color(colors[index] || colors[0]);
    rgb.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
  const material = new THREE.PointsMaterial({size: .42, vertexColors: true, transparent: true, opacity: .9, sizeAttenuation: true, depthWrite: false, toneMapped: false});
  const points = new THREE.Points(geometry, material);
  points.name = seasonal ? 'Simulated roofline lights' : 'Mapped road corridor lamps';
  points.userData.metroLayer = seasonal ? 'buildings' : 'roads';
  points.userData.seasonal = seasonal;
  return points;
}

export function mountTile({parent, materials, drivingWorld, id, result, raw, detail}) {
  const group = new THREE.Group();
  group.name = `Geographic tile ${id}`;
  let geometryBytes = 0;
  for (const meshData of result.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(meshData.uvs, 2));
    if (meshData.bounds) {
      const {min, max, center, radius} = meshData.bounds;
      geometry.boundingBox = new THREE.Box3(new THREE.Vector3().fromArray(min), new THREE.Vector3().fromArray(max));
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3().fromArray(center), radius);
    } else geometry.computeBoundingSphere();
    geometryBytes += meshData.positions.byteLength + meshData.normals.byteLength + meshData.uvs.byteLength;
    const mesh = new THREE.Mesh(geometry, materials[meshData.kind] || materials.stone);
    mesh.name = `Metro ${meshData.kind}`;
    mesh.castShadow = !groundMaterials.has(meshData.kind);
    mesh.receiveShadow = true;
    Object.assign(mesh.userData, {metroTile: id, materialKind: meshData.kind, metroLayer: meshData.layer || materialLayer(meshData.kind)});
    group.add(mesh);
  }
  const lights = [lampPoints(result.lamps || [], false), lampPoints(result.lamps || [], true)].filter(Boolean);
  lights.forEach(light => group.add(light));
  addTrees(group, result.trees || [], materials);
  const solids = result.buildings.map(b => ({id: b.id, polygon: b.p, holes: b.holes || [], height: b.h}));
  const prepared = createDrivingWorld(solids, drivingWorld.bounds), collisionCells = [];
  for (const [key, values] of prepared.grid) {
    values.forEach(solid => { solid.metroTile = id; });
    drivingWorld.grid.set(key, (drivingWorld.grid.get(key) || []).concat(values));
    collisionCells.push(key);
  }
  parent.add(group);
  return {group, raw, buildings: result.buildings, lights, detail, geometryBytes, collisionCells, loaded: performance.now()};
}

export function unmountTile({parent, drivingWorld, id, tile}) {
  parent.remove(tile.group);
  tile.group.traverse(object => {
    object.geometry?.dispose();
    if(object.isInstancedMesh)object.dispose();
    // Surface materials are shared across every tile; only lights own theirs.
    if (object.isPoints) object.material?.dispose();
  });
  for (const key of tile.collisionCells) {
    const remaining = (drivingWorld.grid.get(key) || []).filter(solid => solid.metroTile !== id);
    remaining.length ? drivingWorld.grid.set(key, remaining) : drivingWorld.grid.delete(key);
  }
}

export function setTileAppearance(tile, {layers, season, night = 0}) {
  for (const object of tile.group.children) {
    const layer = object.userData.metroLayer;
    object.visible = !layer || layers?.[layer] !== false;
    if (object.isPoints) {
      if (object.userData.seasonal) object.visible &&= season === 'christmas';
      else object.visible &&= night > .025;
      object.material.opacity = object.userData.seasonal ? .38 + .62 * night : night * .95;
      object.material.size = .27 + night * .28;
    }
  }
}

function addTrees(group, trees, materials) {
  if(!trees.length)return;
  const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,.23,1,5),materials.treeTrunk,trees.length);
  const round=trees.filter(tree=>!tree.conifer),conifers=trees.filter(tree=>tree.conifer),dummy=new THREE.Object3D();
  const foliage=round.length?new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),materials.treeLeaves,round.length):null;
  const needles=conifers.length?new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,7),materials.treeLeaves,conifers.length):null;
  for(let i=0;i<trees.length;i++){const tree=trees[i];dummy.position.set(tree.x,tree.h*.3,tree.z);dummy.scale.set(1,tree.h*.6,1);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);}
  for(const [mesh,values] of [[foliage,round],[needles,conifers]])if(mesh)values.forEach((tree,i)=>{dummy.position.set(tree.x,tree.h*.65,tree.z);dummy.scale.set(tree.h*.30,tree.conifer?tree.h*.75:tree.h*.35,tree.h*.30);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
  for(const mesh of [trunk,foliage,needles].filter(Boolean)){mesh.name='Mapped trees / estimated canopy';mesh.userData.metroLayer='parks';mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);}
}
