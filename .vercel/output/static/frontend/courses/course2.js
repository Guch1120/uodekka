// frontend/courses/course2.js
// コース2: 「サンセット・キャニオン」 (起伏・急カーブ・岩山のある夕焼けの谷コース)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createThemeEnvironment } from './theme_environment.js';

export const Course2 = {
  id: 'course2',
  previewImage: null, // 未指定時は実際の形状から俯瞰図を生成
  name: 'サンセット・キャニオン',
  theme: 'desert',
  themeLabel: '峡谷',
  description: '採掘場 → 岩壁 → 岩のアーチ → サボテン街道',
  skyColor: 0xeb7d34,
  ambientColor: 0xffe0b2,
  trackWidth: 30,
  totalLaps: 3,

  points: [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(90, 8, 40),
    new THREE.Vector3(160, 15, 120),
    new THREE.Vector3(130, 8, 220),
    new THREE.Vector3(40, 2, 260),
    new THREE.Vector3(-60, 10, 290),
    new THREE.Vector3(-140, 16, 210),
    new THREE.Vector3(-120, 10, 100),
    new THREE.Vector3(-70, 4, 30),
    new THREE.Vector3(-15, 0, 0)
  ],

  itemBoxLocations: [0.2, 0.5, 0.8],
  dashPanels: [0.35, 0.72],
  jumpRamps: [
    { t: 0.37, type: 'standard', boost: true, widthScale: 0.65, height: 2.0 },
    { t: 0.74, type: 'glider', boost: true, widthScale: 0.75, height: 2.5 }
  ],
  tireWallSegments: [
    { start: 0.05, end: 0.30, side: 'both' }, // 登り勾配区間
    // 0.30〜0.40 は切れ目 (崖っぷち・キャニオン落下の危険ゾーン)
    { start: 0.40, end: 0.65, side: 'both' }, // 中盤
    // 0.65〜0.75 は切れ目 (急カーブ下りの難所コースアウトゾーン)
    { start: 0.75, end: 0.95, side: 'both' }  // 終盤ストレート
  ],

  sections: [
    { label: '採掘場入口', start: 0, end: 0.25 },
    { label: '岩壁の谷', start: 0.25, end: 0.5 },
    { label: '岩のアーチ', start: 0.5, end: 0.76 },
    { label: 'サボテン街道', start: 0.76, end: 1 }
  ],

  createEnvironment() { return createThemeEnvironment(this); }
};
