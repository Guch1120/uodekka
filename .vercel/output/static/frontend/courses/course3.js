// frontend/courses/course3.js
// コース3: 「コズミック・ネオン」 (宇宙空間に浮かぶ近未来レインボーコース)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createThemeEnvironment } from './theme_environment.js';

export const Course3 = {
  id: 'course3',
  previewImage: null, // 未指定時は実際の形状から俯瞰図を生成
  name: 'コズミック・ネオン',
  theme: 'space',
  themeLabel: '宇宙',
  description: '宇宙ステーション → 発光ゲート → アンテナ高架 → 浮遊ネオン帯',
  skyColor: 0x050518,
  ambientColor: 0x88bbff,
  trackWidth: 34,
  totalLaps: 3,

  points: [
    new THREE.Vector3(0, 5, 0),
    new THREE.Vector3(140, 15, -40),
    new THREE.Vector3(260, 25, 40),
    new THREE.Vector3(220, 15, 180),
    new THREE.Vector3(120, 30, 240),
    new THREE.Vector3(0, 20, 260),
    new THREE.Vector3(-120, 10, 200),
    new THREE.Vector3(-180, 25, 80),
    new THREE.Vector3(-120, 15, -20),
    new THREE.Vector3(-30, 5, 0)
  ],

  itemBoxLocations: [0.18, 0.48, 0.78],
  dashPanels: [0.28, 0.62],
  jumpRamps: [
    { t: 0.30, type: 'standard', boost: true, widthScale: 0.65, height: 2.0 },
    { t: 0.64, type: 'glider', boost: true, widthScale: 0.75, height: 2.5 }
  ],
  tireWallSegments: [
    { start: 0.04, end: 0.28, side: 'both' }, // 宇宙発進ループ
    // 0.28〜0.42 は切れ目 (宇宙空間への落下・宇宙空間コースアウトゾーン)
    { start: 0.42, end: 0.62, side: 'both' }, // 高架セクション
    // 0.62〜0.76 は切れ目 (急勾配カーブの落下ゾーン)
    { start: 0.76, end: 0.96, side: 'both' }  // 最終ストレート
  ],

  sections: [
    { label: '宇宙ステーション', start: 0, end: 0.24 },
    { label: '発光ゲート', start: 0.24, end: 0.5 },
    { label: 'アンテナ高架', start: 0.5, end: 0.76 },
    { label: '浮遊ネオン帯', start: 0.76, end: 1 }
  ],

  createEnvironment() { return createThemeEnvironment(this); }
};
