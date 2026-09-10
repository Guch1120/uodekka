// コース6: 「ポーラー・フロンティア」 (雪原と氷山、観測基地を巡る極寒コース)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createThemeEnvironment } from './theme_environment.js';

export const Course6 = {
  id: 'course6',
  previewImage: null,
  name: 'ポーラー・フロンティア',
  theme: 'polar',
  themeLabel: '極寒地',
  description: '観測基地 → 雪原 → 氷の洞窟 → 氷山沿い',
  skyColor: 0x6d9fbd,
  ambientColor: 0xd8f3ff,
  trackWidth: 30,
  totalLaps: 3,
  points: [
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(130, 2, 35),
    new THREE.Vector3(220, 4, 125), new THREE.Vector3(205, 3, 235),
    new THREE.Vector3(100, 2, 315), new THREE.Vector3(-70, 4, 315),
    new THREE.Vector3(-205, 7, 235), new THREE.Vector3(-225, 4, 110),
    new THREE.Vector3(-125, 1, 30), new THREE.Vector3(-25, 0, 0)
  ],
  itemBoxLocations: [0.18, 0.5, 0.82],
  dashPanels: [0.32, 0.7],
  jumpRamps: [{ t: 0.33, type: 'standard', boost: true, widthScale: 0.68, height: 2.0 }, { t: 0.7, type: 'glider', boost: true, widthScale: 0.72, height: 2.8 }],
  tireWallSegments: [{ start: 0.05, end: 0.3, side: 'both' }, { start: 0.4, end: 0.65, side: 'both' }, { start: 0.76, end: 0.95, side: 'both' }],
  sections: [
    { label: '観測基地', start: 0, end: 0.24 }, { label: '開放雪原', start: 0.24, end: 0.5 },
    { label: '氷の洞窟', start: 0.5, end: 0.75 }, { label: '氷山沿い', start: 0.75, end: 1 }
  ],
  createEnvironment() { return createThemeEnvironment(this); }
};
