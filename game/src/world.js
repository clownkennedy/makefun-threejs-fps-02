// EMBERLINE — the map: "Ember Yard", an original industrial container yard.
// Two bomb sites (A FURNACE west, B DEPOT east), a mid lane, side lanes and
// a gantry platform. Every box is a collider for movement and a surface a
// bullet stops on. Plain geometry only, no models, no textures from the net;
// site letters are drawn on a canvas at runtime.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [width, height, depth, x, y, z, material]
const BOXES = [
  // ground + outer walls (44 x 36 m, 5 m walls)
  [44.4, 0.4, 36.4, 0, -0.2, 0, 'ground'],
  [0.4, 5.0, 36.4, -22.2, 2.5, 0, 'surface'],
  [0.4, 5.0, 36.4, 22.2, 2.5, 0, 'surface'],
  [44.4, 5.0, 0.4, 0, 2.5, -18.2, 'surface'],
  [44.4, 5.0, 0.4, 0, 2.5, 18.2, 'surface'],
  // mid containers — the two lanes split here
  [6.0, 2.6, 2.4, -8, 1.3, 2, 'rust'],
  [6.0, 2.6, 2.4, 8, 1.3, 2, 'rust'],
  // central pillar + gantry platform (jump up, 0.5 m)
  [1.2, 3.4, 1.2, 3.5, 1.7, -2, 'hairline'],
  [6.0, 0.5, 4.0, 0, 0.25, -10, 'surface'],
  // low walls near attacker spawn
  [3.6, 1.1, 1.2, -4.5, 0.55, 8.5, 'hairline'],
  [3.6, 1.1, 1.2, 4.5, 0.55, 8.5, 'hairline'],
  // crates
  [1.2, 1.2, 1.2, -4, 0.6, -4, 'hairline'],
  [1.2, 1.2, 1.2, 4, 0.6, -4, 'hairline'],
  [1.2, 1.2, 1.2, -10, 0.6, 9.5, 'hairline'],
  [1.2, 1.2, 1.2, 10, 0.6, 9.5, 'hairline'],
  [1.2, 1.2, 1.2, -19, 0.6, -0.5, 'rust'],
  [1.2, 1.2, 1.2, 19, 0.6, -0.5, 'rust'],
  [1.6, 0.7, 1.6, -20, 0.35, -4, 'hairline'],
  [1.6, 0.7, 1.6, 20, 0.35, -4, 'hairline'],
  [2.4, 0.9, 1.2, -2.5, 0.45, 12.5, 'hairline'],
  [2.4, 0.9, 1.2, 2.5, 0.45, 12.5, 'hairline'],
  // site A cover (FURNACE, west)
  [4.8, 2.4, 1.2, -18.5, 1.2, -9, 'rust'],
  [1.2, 2.4, 4.8, -12.5, 1.2, -14.5, 'rust'],
  [1.2, 1.2, 1.2, -17.5, 0.6, -14.5, 'hairline'],
  // site B cover (DEPOT, east)
  [4.8, 2.4, 1.2, 18.5, 1.2, -9, 'surface'],
  [1.2, 2.4, 4.8, 12.5, 1.2, -14.5, 'surface'],
  [1.2, 1.2, 1.2, 17.5, 0.6, -14.5, 'hairline'],
  // defender back cover
  [3.0, 1.1, 1.2, -6, 0.55, -15.5, 'hairline'],
  [3.0, 1.1, 1.2, 6, 0.55, -15.5, 'hairline'],
];

const WAYPOINTS = [
  { x: 0, z: 15, links: [1, 11, 12] }, // 0 ember spawn
  { x: 0, z: 8, links: [0, 2, 3, 4] }, // 1 ember mid
  { x: -8, z: 4, links: [1, 15, 11] }, // 2 mid west
  { x: 8, z: 4, links: [1, 16, 12] }, // 3 mid east
  { x: 0, z: -1, links: [1, 5, 9] }, // 4 mid centre
  { x: -11, z: -5, links: [15, 4, 6, 13] }, // 5 A approach
  { x: -16, z: -13, links: [5, 9] }, // 6 site A
  { x: 11, z: -5, links: [16, 9, 8, 14] }, // 7 B approach
  { x: 16, z: -13, links: [7, 9] }, // 8 site B
  { x: 0, z: -5.5, links: [4, 6, 7, 8, 13, 14] }, // 9 defender mid
  { x: 0, z: -15, links: [13, 14] }, // 10 ash spawn
  { x: -15, z: 9, links: [0, 2, 13] }, // 11 west lane
  { x: 15, z: 9, links: [0, 3, 14] }, // 12 east lane
  { x: -19, z: -6, links: [5, 10, 11, 15] }, // 13 A back
  { x: 19, z: -6, links: [7, 10, 12, 16] }, // 14 B back
  { x: -14, z: 4, links: [2, 5, 13] }, // 15 west bypass (around the mid container)
  { x: 14, z: 4, links: [3, 7, 14] }, // 16 east bypass (around the mid container)
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const colliders = [];
  const shootables = [];
  const footprints = [];

  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    footprints.push({ x, z, w, d });
    return mesh;
  }
  for (const b of BOXES) box(...b);

  // Painted ground lines: mid line + site zones (thin planes, no collision).
  function decal(w, d, x, z, color, opacity) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  decal(0.25, 30, 0, 0, PALETTE.gold, 0.5); // mid line
  decal(7, 7, -16, -11.5, PALETTE.accent, 0.16); // site A zone
  decal(7, 7, 16, -11.5, PALETTE.ash, 0.16); // site B zone

  // Floating site letters, drawn on a canvas at runtime (no image files).
  function letterSprite(letter, color, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 68);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(2.2, 2.2, 1);
    sprite.position.set(x, y, z);
    group.add(sprite);
    return sprite;
  }
  const siteA = letterSprite('A', PALETTE.accent, -16, 4.6, -11.5);
  const siteB = letterSprite('B', PALETTE.ash, 16, 4.6, -11.5);

  // Floodlight poles at the corners.
  const poleMaterial = materials.hairline;
  for (const [x, z] of [[-20, 16], [20, 16], [-20, -16], [20, -16]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 8), poleMaterial);
    pole.position.set(x, 3.2, z);
    pole.castShadow = true;
    group.add(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.3),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), emissive: new THREE.Color(PALETTE.ink), emissiveIntensity: 1.4 }),
    );
    head.position.set(x, 6.5, z);
    group.add(head);
  }

  // Distant skyline silhouettes outside the walls.
  for (let i = 0; i < 10; i += 1) {
    const w = 6 + (i % 3) * 4;
    const h = 8 + ((i * 7) % 10);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), materials.canvas);
    const angle = (i / 10) * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * 42, h / 2 - 0.5, Math.sin(angle) * 38);
    group.add(mesh);
  }

  // Light: dusk hemisphere, warm key, cool fill, site glows.
  const sky = new THREE.HemisphereLight(new THREE.Color('#3a4a5c'), new THREE.Color(PALETTE.ground), 1.15);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 1.9);
  key.position.set(14, 22, 12);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7fa8c9'), 0.65);
  fill.position.set(-12, 14, 16);
  scene.add(fill);
  const glowA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 14);
  glowA.position.set(-16, 3.4, -11.5);
  scene.add(glowA);
  const glowB = new THREE.PointLight(new THREE.Color(PALETTE.ash), 14, 14);
  glowB.position.set(16, 3.4, -11.5);
  scene.add(glowB);

  return {
    colliders,
    shootables,
    footprints,
    group,
    siteA,
    siteB,
    bounds: { minX: -22, maxX: 22, minZ: -18, maxZ: 18 },
    sites: [
      { id: 'A', name: 'FURNACE', center: new THREE.Vector3(-16, 0, -11.5), radius: 3.4, color: PALETTE.accent },
      { id: 'B', name: 'DEPOT', center: new THREE.Vector3(16, 0, -11.5), radius: 3.4, color: PALETTE.ash },
    ],
    spawns: {
      ember: [new THREE.Vector3(0, 0, 15), new THREE.Vector3(-3, 0, 15.5), new THREE.Vector3(3, 0, 15.5)],
      ash: [new THREE.Vector3(0, 0, -15), new THREE.Vector3(-4, 0, -15.5), new THREE.Vector3(4, 0, -15.5), new THREE.Vector3(-8, 0, -14), new THREE.Vector3(8, 0, -14)],
    },
    waypoints: WAYPOINTS.map((w) => ({ pos: new THREE.Vector3(w.x, 0, w.z), links: w.links })),
  };
}

// Breadth-first path over the waypoint graph. Returns an array of waypoint
// indices from `from` to `to` (excluding `from`, including `to`).
export function findPath(waypoints, from, to) {
  if (from === to) return [to];
  const prev = new Array(waypoints.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of waypoints[current].links) {
      if (prev[next] !== -1) continue;
      prev[next] = current;
      if (next === to) {
        const path = [to];
        let node = to;
        while (prev[node] !== node) {
          node = prev[node];
          path.unshift(node);
        }
        return path.slice(1);
      }
      queue.push(next);
    }
  }
  return [to];
}

export function nearestWaypoint(waypoints, pos) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < waypoints.length; i += 1) {
    const d = waypoints[i].pos.distanceToSquared(pos);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
