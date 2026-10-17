import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { TRACK_EFFECTS } from '../../backend/skills/track_effects.js';

// 一つのレースで共有し、終了時にgeometry/material/textureをまとめて解放する。
export class TrackEffectsView {
  constructor(scene, curve, model) {
    this.curve = curve; this.model = model; this.root = new THREE.Group();
    this.traceMeshes = new Map(); this.gateMeshes = []; this.textures = [];
    this.pulseColor = new THREE.Color();
    this.traceLabel = this.labelTexture('抜けて加速', '#f0abfc');
    this.gateLabel = this.labelTexture('↻ スキル回復', '#67e8f9');
    scene.add(this.root);
    for (const gate of model.gates) this.createGate(gate);
  }
  labelTexture(text, color) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#102638'; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 504, 120);
    ctx.fillStyle = color; ctx.font = 'bold 54px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 66);
    const texture = new THREE.CanvasTexture(canvas); this.textures.push(texture); return texture;
  }
  frame(t, offset) {
    const position = this.curve.getPointAt((t + 1) % 1);
    const forward = this.curve.getTangentAt((t + 1) % 1).normalize();
    const normal = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    position.addScaledVector(normal, offset);
    return { position, forward };
  }
  sprite(texture, width, height) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(width, height, 1); return sprite;
  }
  createGate(gate) {
    const group = new THREE.Group(), frame = this.frame(gate.t, gate.offset);
    group.position.copy(frame.position); group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), frame.forward);
    const material = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.85 });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.17, 6, 32, Math.PI), material);
    arch.position.y = 0.4; group.add(arch);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(TRACK_EFFECTS.gateWidth, 0.08, TRACK_EFFECTS.gateLength), material);
    floor.position.y = 0.08; group.add(floor);
    const label = this.sprite(this.gateLabel, 5.5, 1.38); label.position.y = 4.3; group.add(label);
    this.root.add(group); this.gateMeshes.push({ group, material });
  }
  createTrace(trace) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0xd946ef, transparent: true, opacity: 0.8, depthWrite: false });
    const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.08, 1.2), material, 12);
    const transform = new THREE.Object3D();
    for (let i = 0; i < 6; i++) {
      const t = trace.t + ((i / 5 - 0.5) * TRACK_EFFECTS.traceLength) / this.model.length;
      const frame = this.frame(t, trace.offset);
      // 二本の細い帯と間隔のある粒で、既存の橙色ダッシュ板から形でも区別する。
      for (const side of [-1, 1]) {
        transform.position.copy(frame.position); transform.position.y += 0.14;
        transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), frame.forward);
        transform.translateX(side * TRACK_EFFECTS.traceWidth / 2); transform.updateMatrix();
        strips.setMatrixAt(i * 2 + (side === -1 ? 0 : 1), transform.matrix);
        strips.setColorAt(i * 2 + (side === -1 ? 0 : 1), this.pulseColor.setRGB(1, 1, 1));
      }
    }
    group.add(strips);
    const frame = this.frame(trace.t, trace.offset);
    const label = this.sprite(this.traceLabel, 4.2, 1.05); label.position.copy(frame.position); label.position.y += 1.6; group.add(label);
    this.root.add(group); this.traceMeshes.set(trace.id, { group, material, label, strips });
  }
  removeGroup(group) {
    const materials = new Set();
    group.traverse(obj => { if (obj.isInstancedMesh) obj.dispose(); obj.geometry?.dispose(); if (obj.material) materials.add(obj.material); });
    for (const material of materials) material.dispose();
    group.removeFromParent();
  }
  update() {
    this.root.visible = this.model.enabled;
    const active = new Set(this.model.traces.map(t => t.id));
    for (const [id, entry] of this.traceMeshes) if (!active.has(id)) { this.removeGroup(entry.group); this.traceMeshes.delete(id); }
    for (const trace of this.model.traces) {
      if (!this.traceMeshes.has(trace.id)) this.createTrace(trace);
      const entry = this.traceMeshes.get(trace.id), opacity = this.model.opacity(trace);
      entry.material.opacity = opacity; entry.label.material.opacity = opacity;
      // 二本の帯を一度に描画し、明るさの波で流れを示す。モバイルの描画回数を抑える。
      for (let i = 0; i < 12; i++) {
        const brightness = 0.65 + 0.35 * Math.sin(this.model.elapsed * 3 - Math.floor(i / 2));
        entry.strips.setColorAt(i, this.pulseColor.setRGB(brightness, brightness, brightness));
      }
      entry.strips.instanceColor.needsUpdate = true;
    }
    for (const gate of this.gateMeshes) gate.material.opacity = 0.75 + 0.12 * Math.sin(this.model.elapsed * 2);
  }
  dispose() {
    this.removeGroup(this.root);
    for (const texture of this.textures) texture.dispose();
    this.traceMeshes.clear(); this.gateMeshes.length = 0;
  }
}
