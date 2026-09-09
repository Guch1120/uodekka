import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { Courses } from '../courses/index.js';

export class EditorPreview {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#102438');
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x557788, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(150, 400, 100);
    this.scene.add(light);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '作成コースの3Dプレビュー');
    this.renderer.domElement.setAttribute('role', 'img');
    this.target = new THREE.Vector3();
    this.yaw = 0.55; this.pitch = 0.65; this.distance = 600;
    const pointers = new Map();
    const canvas = this.renderer.domElement;
    canvas.onpointerdown = e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
    canvas.onpointermove = e => {
      const old = pointers.get(e.pointerId);
      if (!old) return;
      if (pointers.size === 1) {
        this.yaw -= (e.clientX - old.x) * 0.008;
        this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - old.y) * 0.008, 0.12, 1.5);
      } else {
        const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
        const before = Math.hypot(old.x - other.x, old.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (after > 5) this.distance = THREE.MathUtils.clamp(this.distance * before / after, 40, 5000);
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.render();
    };
    const end = e => pointers.delete(e.pointerId);
    canvas.onpointerup = end; canvas.onpointercancel = end; canvas.onlostpointercapture = end;
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(e.deltaY * 0.001), 40, 5000); this.render(); }, { passive: false });
    this.observer = new ResizeObserver(() => this.render()); this.observer.observe(container);
  }
  update(data, selected, fit = false) {
    if (this.track) {
      this.scene.remove(this.track);
      const geometries = new Set(), materials = new Set();
      this.track.traverse(o => { if(o.geometry) geometries.add(o.geometry); if(o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    }
    this.track = Courses.buildTrack(data).group;
    data.points.forEach((p, i) => {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(i === selected ? 5 : 3, 12, 8),
        new THREE.MeshBasicMaterial({ color: i === selected ? 0xff773e : 0x70d6ff }));
      marker.position.set(p.x, (p.y || 0) + 5, p.z); this.track.add(marker);
    });
    const extent = new THREE.Box3().setFromObject(this.track);
    const center = extent.getCenter(new THREE.Vector3());
    const size = extent.getSize(new THREE.Vector3());
    const grid = new THREE.GridHelper(Math.max(size.x, size.z) * 1.25, 16, 0x426880, 0x233e52);
    grid.position.set(center.x, -0.2, center.z);
    this.track.add(grid);
    // Height guides make elevated vertices legible above the ground plane.
    data.points.forEach(p => {
      if (!p.y) return;
      const guide = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, p.y, p.z)]);
      this.track.add(new THREE.Line(guide, new THREE.LineBasicMaterial({color:0x54819a})));
    });
    this.scene.add(this.track);
    const bounds = new THREE.Box3().setFromObject(this.track);
    bounds.getCenter(this.target);
    if (fit) this.distance = Math.max(200, bounds.getSize(new THREE.Vector3()).length() * 1.0);
    this.render();
  }
  render() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance);
    this.camera.lookAt(this.target); this.renderer.render(this.scene, this.camera);
  }
}
