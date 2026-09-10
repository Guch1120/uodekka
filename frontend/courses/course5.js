// コース5: 「メトロ・ナイト」 (ビル街から高架広場へ駆け抜ける夜の都会)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createThemeEnvironment } from './theme_environment.js';

export const Course5 = {
  id: 'course5',
  previewImage: null,
  name: 'メトロ・ナイト',
  theme: 'metro',
  themeLabel: '都会',
  description: 'ビル街 → 商店街 → 高架区間 → 広場',
  skyColor: 0x071426,
  ambientColor: 0x8bb4d8,
  trackWidth: 28,
  totalLaps: 3,
  points: [
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(110, 0, 0),
    new THREE.Vector3(175, 1, 70), new THREE.Vector3(175, 3, 190),
    new THREE.Vector3(100, 5, 275), new THREE.Vector3(-70, 5, 275),
    new THREE.Vector3(-175, 3, 190), new THREE.Vector3(-175, 1, 70),
    new THREE.Vector3(-110, 0, 0), new THREE.Vector3(-20, 0, 0)
  ],
  itemBoxLocations: [0.16, 0.46, 0.76],
  dashPanels: [0.3, 0.66],
  jumpRamps: [{ t: 0.64, type: 'standard', boost: true, widthScale: 0.7, height: 2.1 }],
  tireWallSegments: [{ start: 0.04, end: 0.28, side: 'both' }, { start: 0.36, end: 0.64, side: 'both' }, { start: 0.73, end: 0.96, side: 'both' }],
  sections: [
    { label: 'ビル街', start: 0, end: 0.24 }, { label: '商店街', start: 0.24, end: 0.5 },
    { label: '高架区間', start: 0.5, end: 0.76 }, { label: 'ナイト広場', start: 0.76, end: 1 }
  ],
  createEnvironment() { return createThemeEnvironment(this); }
};
