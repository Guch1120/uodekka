import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// Keep the plan shape independent of elevation. Smoothstep is periodic, C1,
// and never overshoots a vertex's height (including the start/finish seam).
export class ElevationCurve extends THREE.Curve {
  constructor(points) {
    super();
    this.vertices = points;
    this.plan = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, 0, p.z)), true, 'centripetal');
    this.arcLengthDivisions = Math.max(400, points.length * 40);
  }
  getPoint(t, target = new THREE.Vector3()) {
    const count = this.vertices.length;
    const scaled = ((t % 1) + 1) % 1 * count;
    const i = Math.floor(scaled), u = scaled - i;
    this.plan.getPoint(t, target);
    const a = this.vertices[i].y || 0, b = this.vertices[(i + 1) % count].y || 0;
    target.y = a + (b - a) * u * u * (3 - 2 * u);
    return target;
  }
}

export function courseCurve(config) {
  return config.id?.startsWith('custom_')
    ? new ElevationCurve(config.points)
    : new THREE.CatmullRomCurve3(config.points, true, 'centripetal');
}

export function elevationProfile(points) {
  const curve = new ElevationCurve(points), samples = [], distances = [0];
  let distance = 0, previous = curve.getPoint(0), maxGrade = 0;
  const steps = points.length * 40;
  for (let i = 0; i <= steps; i++) {
    const p = curve.getPoint(i / steps);
    const run = Math.hypot(p.x - previous.x, p.z - previous.z);
    distance += run;
    if (run > 0.001) maxGrade = Math.max(maxGrade, Math.abs(p.y - previous.y) / run);
    samples.push({ distance, height: p.y });
    if (i > 0 && i % 40 === 0) distances.push(distance);
    previous = p;
  }
  return { samples, distances, length: distance, maxGrade };
}
