import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { courseCurve } from '../courses/course_curve.js';
import { Vehicles } from '../vehicles/vehicles.js';

export class GaragePreview {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 30);
    this.camera.position.set(4.4, 3.1, -5.5);
    this.camera.lookAt(0, 0.55, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    this.image = document.createElement('img');
    this.image.className = 'garage-preview-image';
    this.image.hidden = true;
    this.image.onerror = () => {
      this.image.hidden = true;
      this.renderer.domElement.hidden = false;
      this.render();
    };
    container.appendChild(this.image);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7c8c9f, 2.7));
    const light = new THREE.DirectionalLight(0xffffff, 3.2);
    light.position.set(-3, 6, -4);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    this.scene.add(light);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.7, 64), new THREE.ShadowMaterial({ opacity: 0.17 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(container);
  }

  setVehicle(key) {
    if (this.kart) {
      this.scene.remove(this.kart);
      const geometries = new Set(), materials = new Set();
      this.kart.traverse(obj => { if (obj.geometry) geometries.add(obj.geometry); if (obj.material) materials.add(obj.material); });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
    }
    const vehicle = Vehicles.types[key];
    this.image.hidden = !vehicle.image;
    this.renderer.domElement.hidden = !!vehicle.image;
    this.image.alt = `${vehicle.name}の車体プレビュー`;
    if (vehicle.image) this.image.src = vehicle.image;
    else this.image.removeAttribute('src');
    this.kart = Vehicles.createKartMesh(key);
    this.scene.add(this.kart);
    this.renderer.domElement.setAttribute('aria-label', `${Vehicles.types[key].name}の車体プレビュー`);
    this.render();
  }

  render() {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.render(this.scene, this.camera);
  }
}

// 実際の路面曲線を使い、カスタムコースも同じ基準で比較する。
export function courseMetrics(course) {
  const curve = courseCurve(course);
  const heights = curve.getPoints(720).map(point => point.y);
  return {
    length: Math.round(curve.getLength()),
    elevation: Math.round(Math.max(...heights) - Math.min(...heights)),
    ramps: (course.jumpRamps || []).length
  };
}

let courseArtSequence = 0;

export function courseArt(course) {
  const clipId = `course-map-clip-${++courseArtSequence}`;
  const curve = courseCurve(course);
  const points = curve.getPoints(180);
  const xs = points.map(p => p.x), zs = points.map(p => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const scale = Math.min(410 / (maxX - minX || 1), 230 / (maxZ - minZ || 1));
  const coords = points.map(p => [300 + (p.x - (minX + maxX) / 2) * scale, 175 + (p.z - (minZ + maxZ) / 2) * scale]);
  const path = coords.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';
  const palettes = {
    space: ['#202644', '#7379dc', '#9399ff'], desert: ['#f4d0ac', '#d7a777', '#a86737'],
    sky: ['#b9e7fb', '#8ac7e8', '#477ca5'], metro: ['#1b263b', '#415a77', '#7dd3fc'],
    polar: ['#dceaf2', '#a5d8ed', '#5b9fbd'], candy: ['#ffd6e5', '#f6a6c1', '#c95d91'],
    grassland: ['#deecda', '#b7d0a9', '#759d68']
  };
  const colors = palettes[course.theme] || palettes.grassland;
  const [x, y] = coords[0];
  const svgPoint = t => {
    const point = curve.getPointAt(((t % 1) + 1) % 1);
    return [300 + (point.x - (minX + maxX) / 2) * scale, 175 + (point.z - (minZ + maxZ) / 2) * scale];
  };
  // 頂点順と同じ向きに矢印を置き、コースの進行方向を示す。
  const arrows = [0.16, 0.49, 0.82].map(t => {
    const p = curve.getPoint(t), tangent = curve.getTangent(t);
    const ax = 300 + (p.x - (minX + maxX) / 2) * scale;
    const ay = 175 + (p.z - (minZ + maxZ) / 2) * scale;
    const angle = Math.atan2(tangent.z, tangent.x) * 180 / Math.PI;
    return '<path data-course-direction transform="translate(' + ax + ' ' + ay + ') rotate(' + angle + ')" d="M-5 -5 L1 0 L-5 5" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
  }).join('');
  const jumpMarkers = (course.jumpRamps || []).map(ramp => {
    const [mx, my] = svgPoint(ramp.t);
    return `<g data-course-jump transform="translate(${mx.toFixed(1)} ${my.toFixed(1)})"><circle r="9" fill="#1f9eea" stroke="white" stroke-width="2"/><path d="M-4 2 L0 -3 L4 2" fill="none" stroke="white" stroke-width="2"/></g>`;
  }).join('');
  const wallSegments = [...(course.tireWallSegments || [])].sort((a, b) => a.start - b.start);
  const hazardMarkers = wallSegments.map((segment, index) => {
    const next = wallSegments[(index + 1) % wallSegments.length];
    const gap = ((next.start - segment.end) + 1) % 1;
    if (gap < 0.025) return '';
    const [mx, my] = svgPoint(segment.end + gap / 2);
    return `<g data-course-hazard transform="translate(${mx.toFixed(1)} ${my.toFixed(1)})"><path d="M0 -10 L10 8 L-10 8 Z" fill="#ff773e" stroke="white" stroke-width="2"/><text y="5" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="900" fill="white">!</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 600 350" role="img" aria-label="コースの俯瞰図。白矢印は進行方向、青はジャンプ台、オレンジはタイヤ壁の切れ目" style="overflow:hidden;border-radius:12px" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="${clipId}"><rect width="600" height="350" rx="12"/></clipPath></defs>
    <g clip-path="url(#${clipId})">
    <rect width="600" height="350" rx="12" fill="${colors[0]}"/>
    <path d="M-20 75 Q100 5 220 62 T620 35 M-10 110 Q100 40 220 97 T620 70 M-10 145 Q100 75 220 132 T620 105 M-10 280 Q150 200 300 270 T630 255 M-10 315 Q150 235 300 305 T630 290" fill="none" stroke="${colors[1]}" stroke-width="2" opacity=".65"/>
    <path d="${path}" transform="translate(0 5)" fill="none" stroke="#14263b" stroke-opacity=".12" stroke-width="30" stroke-linejoin="round"/>
    <path d="${path}" fill="none" stroke="white" stroke-width="29" stroke-linejoin="round"/>
    <path d="${path}" fill="none" stroke="${colors[2]}" stroke-width="26" stroke-dasharray="7 9"/>
    <path d="${path}" fill="none" stroke="#304050" stroke-width="19" stroke-linejoin="round"/>
    <path d="${path}" fill="none" stroke="#f4e4a4" stroke-width="1.4" stroke-dasharray="5 7"/>
    ${arrows}
    ${jumpMarkers}
    ${hazardMarkers}
    <circle cx="${x}" cy="${y}" r="7" fill="#fa733c" stroke="white" stroke-width="3"/>
    <rect x="${x - 18}" y="${y + 17}" width="82" height="22" rx="5" fill="#14263b"/>
    <text x="${x + 23}" y="${y + 32}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="700" fill="white">START / FINISH</text>
    <text x="30" y="32" font-family="sans-serif" font-size="10" letter-spacing="2" fill="${colors[2]}">CIRCUIT MAP</text>
    <path d="M556 45v-20m-5 6 5-6 5 6" stroke="${colors[2]}" fill="none" stroke-width="2"/>
    <text x="556" y="60" text-anchor="middle" font-family="sans-serif" font-size="10" fill="${colors[2]}">N</text>
    <g transform="translate(30 315)" font-family="sans-serif" font-size="10" font-weight="700" fill="${colors[2]}">
      <circle cx="7" cy="0" r="6" fill="#1f9eea"/><text x="18" y="4">JUMP</text>
      <path transform="translate(76 0)" d="M0 -7 L7 6 L-7 6 Z" fill="#ff773e"/><text x="94" y="4">WALL GAP</text>
    </g>
    </g>
  </svg>`;
}
