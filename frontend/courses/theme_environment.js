import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const UP = new THREE.Vector3(0, 1, 0);

function courseCurve(course) {
  return new THREE.CatmullRomCurve3(course.points, true, 'centripetal');
}

function frame(course, t, lateral = 0, y = 0) {
  const curve = courseCurve(course);
  const point = curve.getPointAt((t + 1) % 1);
  const tangent = curve.getTangentAt((t + 1) % 1).normalize();
  const normal = new THREE.Vector3().crossVectors(tangent, UP).normalize();
  return {
    position: point.clone().addScaledVector(normal, lateral).setY(point.y + y),
    tangent,
    normal,
    yaw: Math.atan2(-tangent.x, -tangent.z)
  };
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...options });
}

function addBox(group, geometry, mat, position, yaw = 0, scale = null, cast = true) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.copy(position);
  mesh.rotation.y = yaw;
  if (scale) mesh.scale.copy(scale);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addGround(group, color, y = -1) {
  const geo = new THREE.PlaneGeometry(1500, 1500);
  geo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(geo, material(color, { roughness: 0.95 }));
  ground.position.y = y;
  ground.receiveShadow = true;
  group.add(ground);
}

function addTree(group, position, scale = 1, palette = {}) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 4.5, 8), material(palette.trunk || 0x795548));
  trunk.position.set(position.x, position.y + 2.25 * scale, position.z);
  trunk.scale.setScalar(scale);
  trunk.castShadow = true;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(4.2, 8, 8), material(palette.leaves || 0x2e7d32));
  crown.position.set(position.x, position.y + 6.5 * scale, position.z);
  crown.scale.setScalar(scale);
  crown.castShadow = true;
  group.add(trunk, crown);
}

function addCactus(group, position, scale = 1) {
  const mat = material(0x3f8f55);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 8, 8), mat);
  stem.position.set(position.x, position.y + 4 * scale, position.z);
  stem.scale.setScalar(scale);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.8, 3.2, 8), mat);
  arm.position.set(position.x + 2.2 * scale, position.y + 4.4 * scale, position.z);
  arm.rotation.z = Math.PI / 2;
  arm.scale.setScalar(scale);
  group.add(stem, arm);
}

function addBuilding(group, position, size, colors, yaw = 0) {
  const body = addBox(group, new THREE.BoxGeometry(1, 1, 1), material(colors.body, { roughness: 0.7 }), position.clone().setY(position.y + size.y / 2), yaw, size);
  const roof = addBox(group, new THREE.BoxGeometry(1.04, 0.35, 1.04), material(colors.roof || colors.accent || 0xffffff), position.clone().setY(position.y + size.y + 0.18), yaw, new THREE.Vector3(size.x, 1, size.z));
  return { body, roof };
}

function addSign(group, course, t, lateral, labelColor, height = 7) {
  const f = frame(course, t, lateral, 0);
  const postMat = material(0x374151, { metalness: 0.25 });
  addBox(group, new THREE.BoxGeometry(0.35, height, 0.35), postMat, f.position.clone().setY(f.position.y + height / 2), f.yaw);
  addBox(group, new THREE.BoxGeometry(7, 2.1, 0.3), material(labelColor, { emissive: labelColor, emissiveIntensity: 0.15 }), f.position.clone().setY(f.position.y + height), f.yaw);
}

function addGrandstand(group, course, t, lateral) {
  const f = frame(course, t, lateral, 0);
  const base = f.position.clone().setY(f.position.y + 2);
  addBox(group, new THREE.BoxGeometry(42, 4, 12), material(0x415a77), f.position.clone().setY(f.position.y + 2), f.yaw);
  for (let i = 0; i < 4; i++) addBox(group, new THREE.BoxGeometry(37, 0.55, 2.2), material(i % 2 ? 0xf8fafc : 0xf59e0b), base.clone().setY(base.y + 3 + i * 1.5).addScaledVector(f.tangent, (i - 1.5) * 1.2), f.yaw);
}

function addRock(group, position, scale = 1, color = 0x8b5a3c) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(7, 1), material(color, { roughness: 0.95 }));
  rock.position.copy(position).setY(position.y + 5 * scale);
  rock.scale.set(scale, scale * 1.5, scale);
  rock.rotation.set(0.2 * scale, 0.7 * scale, 0.1);
  rock.castShadow = true;
  group.add(rock);
}

function addNeonGate(group, course, t, color = 0x00e5ff) {
  const f = frame(course, t, 0, 0);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const geo = new THREE.TorusGeometry(18, 0.7, 8, 32);
  const ring = new THREE.Mesh(geo, mat);
  ring.position.copy(f.position).setY(f.position.y + 15);
  ring.rotation.y = f.yaw;
  group.add(ring);
}

function addFloatingIsland(group, position, size, topColor = 0x5b8c58) {
  const rock = new THREE.Mesh(new THREE.ConeGeometry(size, size * 1.4, 6), material(0x596575));
  rock.position.copy(position).setY(position.y - size * 0.55);
  rock.rotation.x = Math.PI;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.9, size * 0.9, 1.5, 6), material(topColor));
  top.position.copy(position).setY(position.y + 0.5);
  group.add(rock, top);
}

function addStreetLamp(group, course, t, lateral) {
  const f = frame(course, t, lateral, 0);
  const dark = material(0x1f2937, { metalness: 0.7, roughness: 0.35 });
  addBox(group, new THREE.BoxGeometry(0.35, 7, 0.35), dark, f.position.clone().setY(f.position.y + 3.5));
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfff1a8, emissive: 0xffc107, emissiveIntensity: 1.4 }));
  light.position.copy(f.position).setY(f.position.y + 7.2);
  group.add(light);
}

function addBridge(group, course, t, width = 70, yOffset = 10, color = 0x64748b) {
  const f = frame(course, t, 0, yOffset);
  addBox(group, new THREE.BoxGeometry(width, 1.5, 8), material(color, { metalness: 0.4 }), f.position, f.yaw);
  [-width * 0.38, width * 0.38].forEach(offset => {
    const p = f.position.clone().addScaledVector(f.tangent, offset).setY(f.position.y - 5);
    addBox(group, new THREE.BoxGeometry(2, 10, 2), material(0x475569), p, f.yaw);
  });
}

function addCakeCastle(group, course, t, lateral) {
  const f = frame(course, t, lateral, 0);
  const base = f.position.clone();
  addBox(group, new THREE.BoxGeometry(32, 12, 25), material(0xffb4c8), f.position.clone().setY(f.position.y + 6), f.yaw);
  [-11, 11].forEach(offset => {
    const p = base.clone().addScaledVector(f.tangent, offset);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 20, 10), material(0xffd6e0));
    tower.position.copy(p).setY(base.y + 10);
    group.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 8, 10), material(0xff5b8d));
    roof.position.copy(p).setY(base.y + 24);
    group.add(roof);
  });
}

function createGrassland(group, course) {
  addGround(group, 0x55aa44);
  [0.06, 0.14, 0.22, 0.78, 0.86, 0.94].forEach((t, i) => addTree(group, frame(course, t, i % 2 ? -50 : 50).position, 0.9 + (i % 3) * 0.15));
  addGrandstand(group, course, 0.18, 62);
  addBuilding(group, frame(course, 0.36, -52).position, new THREE.Vector3(34, 7, 12), { body: 0xf2f4f7, roof: 0xe76f51 }, frame(course, 0.36, -52).yaw);
  addSign(group, course, 0.43, 54, 0xffc857);
  const wind = frame(course, 0.58, 68, 0);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 18, 8), material(0xf5f5f4)); mast.position.copy(wind.position).setY(wind.position.y + 9); group.add(mast);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 0.4), material(0xffffff)); blade.position.copy(wind.position).setY(wind.position.y + 16); blade.rotation.y = wind.yaw; group.add(blade);
  [0.68, 0.74, 0.8].forEach(t => addTree(group, frame(course, t, -48).position, 0.75, { leaves: 0xf59e0b }));
  addRock(group, frame(course, 0.9, 92).position, 3, 0x83a94b);
}

function createDesert(group, course) {
  addGround(group, 0xd35400);
  [0.08, 0.17, 0.26, 0.52, 0.61, 0.7, 0.9].forEach((t, i) => addRock(group, frame(course, t, i % 2 ? -68 : 68).position, 2 + (i % 3) * 0.8, i % 2 ? 0x9a5b37 : 0xb87333));
  [0.12, 0.34, 0.78, 0.92].forEach((t, i) => addCactus(group, frame(course, t, i % 2 ? -45 : 48).position, 0.8 + i * 0.12));
  addSign(group, course, 0.3, 62, 0xfbbf24);
  addBridge(group, course, 0.51, 58, 9, 0x7c4a2d);
  const arch = frame(course, 0.67, 0, 0);
  addBox(group, new THREE.BoxGeometry(8, 18, 7), material(0x8f5436), arch.position.clone().addScaledVector(arch.normal, -23).setY(arch.position.y + 9), arch.yaw);
  addBox(group, new THREE.BoxGeometry(8, 18, 7), material(0x8f5436), arch.position.clone().addScaledVector(arch.normal, 23).setY(arch.position.y + 9), arch.yaw);
  addBox(group, new THREE.BoxGeometry(52, 7, 7), material(0xa6683d), arch.position.clone().setY(arch.position.y + 18), arch.yaw);
}

function createSpace(group, course) {
  const starGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) { positions[i * 3] = (i * 97 % 1500) - 750; positions[i * 3 + 1] = (i * 53 % 700) - 120; positions[i * 3 + 2] = (i * 131 % 1500) - 750; }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xb9e7ff, size: 3, transparent: true, opacity: 0.8 })));
  const station = frame(course, 0.12, 58, 0);
  addBox(group, new THREE.BoxGeometry(38, 9, 16), material(0x44506e, { metalness: 0.7 }), station.position.clone().setY(station.position.y + 6), station.yaw);
  [-18, 18].forEach(x => { const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 18, 8), material(0x94a3b8, { metalness: 0.8 })); antenna.position.copy(station.position).addScaledVector(station.tangent, x).setY(station.position.y + 15); group.add(antenna); });
  addNeonGate(group, course, 0.32, 0x00e5ff);
  addNeonGate(group, course, 0.62, 0xff39d5);
  addSign(group, course, 0.47, -58, 0xff39d5);
  [0.76, 0.84, 0.9].forEach((t, i) => { const p = frame(course, t, i % 2 ? 60 : -60, 25).position; const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(7 + i * 2, 1), material(i % 2 ? 0x7c3aed : 0x0891b2, { emissive: i % 2 ? 0x4c1d95 : 0x164e63, emissiveIntensity: 0.8 })); orb.position.copy(p); group.add(orb); });
}

function createSky(group, course) {
  const cloud = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshStandardMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.85, roughness: 0.8 }));
  cloud.rotation.x = -Math.PI / 2; cloud.position.y = -14; group.add(cloud);
  [[120, 18, -100, 38], [300, 16, 100, 48], [-140, 12, 220, 50], [-90, 22, -160, 42]].forEach(([x, y, z, r]) => addFloatingIsland(group, new THREE.Vector3(x, y, z), r, 0x68a66b));
  addBridge(group, course, 0.2, 78, 9, 0xb6c8d6);
  addFloatingIsland(group, frame(course, 0.44, 78, 17).position, 28, 0x7db36b);
  addSign(group, course, 0.48, -58, 0x8b5cf6);
  const ruin = frame(course, 0.58, 60, 0);
  [-12, 12].forEach(x => addBox(group, new THREE.BoxGeometry(4, 16, 4), material(0xd6c7a1), ruin.position.clone().addScaledVector(ruin.tangent, x).setY(ruin.position.y + 8), ruin.yaw));
  addBox(group, new THREE.BoxGeometry(32, 4, 4), material(0xd6c7a1), ruin.position.clone().setY(ruin.position.y + 15), ruin.yaw);
  const ship = frame(course, 0.78, -85, 45).position;
  const hull = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 8), material(0xdbeafe, { metalness: 0.4 })); hull.position.copy(ship); hull.scale.set(1.9, 0.55, 0.8); group.add(hull);
  addBox(group, new THREE.BoxGeometry(30, 0.6, 5), material(0x60a5fa, { emissive: 0x1d4ed8, emissiveIntensity: 0.6 }), ship.clone().setY(ship.y + 4), 0);
}

function createMetro(group, course) {
  addGround(group, 0x2b3440, -0.8);
  const buildingColors = [{ body: 0x334155, roof: 0x38bdf8 }, { body: 0x475569, roof: 0xf472b6 }, { body: 0x1e293b, roof: 0xfbbf24 }];
  [0.06, 0.12, 0.18, 0.25, 0.31, 0.38].forEach((t, i) => addBuilding(group, frame(course, t, i % 2 ? -54 : 54).position, new THREE.Vector3(18 + (i % 3) * 5, 25 + (i % 4) * 9, 18), buildingColors[i % buildingColors.length], frame(course, t, i % 2 ? -54 : 54).yaw));
  [0.43, 0.48, 0.53].forEach((t, i) => { const f = frame(course, t, i % 2 ? -45 : 45); addBuilding(group, f.position, new THREE.Vector3(20, 8, 13), { body: 0xf9a8d4, roof: 0xfef3c7 }, f.yaw); });
  [0.12, 0.22, 0.32, 0.44, 0.57, 0.69, 0.82, 0.92].forEach((t, i) => addStreetLamp(group, course, t, i % 2 ? -24 : 24));
  addBridge(group, course, 0.63, 110, 13, 0x64748b);
  addSign(group, course, 0.73, -48, 0x22d3ee);
  addBuilding(group, frame(course, 0.88, 62).position, new THREE.Vector3(48, 10, 26), { body: 0x64748b, roof: 0xf97316 }, frame(course, 0.88, 62).yaw);
}

function createPolar(group, course) {
  addGround(group, 0xdceaf2, -0.8);
  const ice = material(0x9bd7ef, { roughness: 0.55, metalness: 0.15 });
  [0.06, 0.15, 0.25, 0.68, 0.78, 0.9].forEach((t, i) => { const f = frame(course, t, i % 2 ? -58 : 62); const mesh = new THREE.Mesh(new THREE.ConeGeometry(13 + i * 2, 35 + i * 4, 6), ice); mesh.position.copy(f.position).setY(f.position.y + 16); mesh.rotation.y = i; group.add(mesh); });
  const base = frame(course, 0.08, 54); addBuilding(group, base.position, new THREE.Vector3(38, 10, 22), { body: 0xe5e7eb, roof: 0x2563eb }, base.yaw); addSign(group, course, 0.14, -52, 0x38bdf8);
  const cave = frame(course, 0.46, 0); addBox(group, new THREE.BoxGeometry(12, 20, 8), material(0x7bb9d6), cave.position.clone().addScaledVector(cave.normal, -22).setY(cave.position.y + 10), cave.yaw); addBox(group, new THREE.BoxGeometry(12, 20, 8), material(0x7bb9d6), cave.position.clone().addScaledVector(cave.normal, 22).setY(cave.position.y + 10), cave.yaw); addBox(group, new THREE.BoxGeometry(55, 8, 8), material(0x7bb9d6), cave.position.clone().setY(cave.position.y + 20), cave.yaw);
  [0.24, 0.34, 0.56, 0.74].forEach((t, i) => { const f = frame(course, t, i % 2 ? -44 : 44); addBox(group, new THREE.BoxGeometry(4, 0.5, 18), material(0xffffff), f.position.clone().setY(f.position.y + 0.3), f.yaw, new THREE.Vector3(1, 1, 1), false); });
  const aurora = new THREE.Mesh(new THREE.TorusGeometry(100, 3, 6, 32, Math.PI), new THREE.MeshBasicMaterial({ color: 0x7cfcdb, transparent: true, opacity: 0.35 })); aurora.position.set(0, 120, 200); aurora.rotation.x = Math.PI / 2; group.add(aurora);
}

function createCandy(group, course) {
  addGround(group, 0xffc4d6, -0.8);
  [0.07, 0.16, 0.24, 0.31, 0.79, 0.88, 0.96].forEach((t, i) => addTree(group, frame(course, t, i % 2 ? -48 : 48).position, 0.8, { trunk: 0xfff1f2, leaves: i % 2 ? 0xff4d9d : 0xffd166 }));
  const cookie = frame(course, 0.36, 0); addBox(group, new THREE.BoxGeometry(9, 18, 8), material(0xc47f4a), cookie.position.clone().addScaledVector(cookie.normal, -25).setY(cookie.position.y + 9), cookie.yaw); addBox(group, new THREE.BoxGeometry(9, 18, 8), material(0xc47f4a), cookie.position.clone().addScaledVector(cookie.normal, 25).setY(cookie.position.y + 9), cookie.yaw); addBox(group, new THREE.BoxGeometry(58, 7, 8), material(0xe7a56b), cookie.position.clone().setY(cookie.position.y + 18), cookie.yaw);
  const river = frame(course, 0.58, -48); addBox(group, new THREE.BoxGeometry(100, 0.6, 18), material(0x7b3f61, { roughness: 0.35 }), river.position.clone().setY(river.position.y + 0.05), river.yaw);
  addSign(group, course, 0.63, 50, 0x60a5fa);
  addCakeCastle(group, course, 0.84, 55);
  [0.44, 0.52, 0.7].forEach((t, i) => { const f = frame(course, t, i % 2 ? 42 : -42); const candy = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), material(i % 2 ? 0xef4444 : 0x3b82f6, { emissive: i % 2 ? 0x7f1d1d : 0x1e3a8a, emissiveIntensity: 0.4 })); candy.position.copy(f.position).setY(f.position.y + 4); group.add(candy); });
}

export function createThemeEnvironment(course) {
  const group = new THREE.Group();
  const builders = { grassland: createGrassland, desert: createDesert, space: createSpace, sky: createSky, metro: createMetro, polar: createPolar, candy: createCandy };
  (builders[course.theme] || createGrassland)(group, course);
  group.userData = { obstacles: [] };
  return group;
}
