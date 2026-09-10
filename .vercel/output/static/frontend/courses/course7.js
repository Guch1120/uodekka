// コース7: 「キャンディ・パレード」 (お菓子の国を一周する明るく楽しいコース)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createThemeEnvironment } from './theme_environment.js';

export const Course7 = {
  id: 'course7',
  previewImage: null,
  name: 'キャンディ・パレード',
  theme: 'candy',
  themeLabel: 'お菓子の国',
  description: 'キャンディ並木 → クッキー街 → チョコの川沿い → ケーキ城',
  skyColor: 0xffb4d6,
  ambientColor: 0xffffff,
  trackWidth: 30,
  totalLaps: 3,
  points: [
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(105, 3, 20),
    new THREE.Vector3(190, 6, 105), new THREE.Vector3(205, 4, 205),
    new THREE.Vector3(135, 2, 295), new THREE.Vector3(-10, 0, 330),
    new THREE.Vector3(-150, 3, 285), new THREE.Vector3(-210, 5, 180),
    new THREE.Vector3(-160, 2, 70), new THREE.Vector3(-40, 0, 0)
  ],
  itemBoxLocations: [0.15, 0.5, 0.8],
  dashPanels: [0.3, 0.68],
  jumpRamps: [{ t: 0.35, type: 'standard', boost: true, widthScale: 0.68, height: 2.0 }, { t: 0.7, type: 'glider', boost: true, widthScale: 0.72, height: 2.6 }],
  tireWallSegments: [{ start: 0.04, end: 0.3, side: 'both' }, { start: 0.39, end: 0.66, side: 'both' }, { start: 0.75, end: 0.96, side: 'both' }],
  sections: [
    { label: 'キャンディ並木', start: 0, end: 0.24 }, { label: 'クッキー街', start: 0.24, end: 0.5 },
    { label: 'チョコの川沿い', start: 0.5, end: 0.75 }, { label: 'ケーキ城', start: 0.75, end: 1 }
  ],
  createEnvironment() { return createThemeEnvironment(this); }
};
