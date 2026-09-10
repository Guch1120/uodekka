// frontend/courses/course1.js
// コース1: 「ピーチ・サーキット」 (爽快な舗装オーバルサーキット)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createThemeEnvironment } from './theme_environment.js';

export const Course1 = {
  id: 'course1',
  previewImage: null, // 未指定時は実際の形状から俯瞰図を生成
  name: 'ピーチ・サーキット',
  theme: 'grassland',
  themeLabel: '草原',
  description: '観客席 → ピット → 花壇 → 風車の丘',
  skyColor: 0x87ceeb,
  ambientColor: 0xffffff,
  trackWidth: 32,
  totalLaps: 3,

  points: [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(120, 0, 20),
    new THREE.Vector3(220, 0, 100),
    new THREE.Vector3(240, 0, 220),
    new THREE.Vector3(160, 0, 320),
    new THREE.Vector3(30, 0, 300),
    new THREE.Vector3(-80, 0, 260),
    new THREE.Vector3(-140, 0, 160),
    new THREE.Vector3(-100, 0, 50),
    new THREE.Vector3(-20, 0, 0)
  ],

  itemBoxLocations: [0.15, 0.45, 0.75],
  dashPanels: [0.32, 0.68],
  jumpRamps: [
    { t: 0.34, type: 'standard', boost: true, widthScale: 0.65, height: 2.0 },
    { t: 0.69, type: 'glider', boost: true, widthScale: 0.75, height: 2.5 }
  ],
  tireWallSegments: [
    { start: 0.04, end: 0.36, side: 'both' }, // 第1コーナー付近は壁で守る
    // 0.36〜0.44 は切れ目 (アウト側へ飛び出すとコースアウト)
    { start: 0.44, end: 0.70, side: 'both' }, // バックストレッチ付近
    // 0.70〜0.78 は切れ目 (急カーブ手前の危険な飛び出しゾーン)
    { start: 0.78, end: 0.96, side: 'both' }  // 最終コーナーとホームストレート
  ],

  sections: [
    { label: '発着場', start: 0, end: 0.24 },
    { label: 'フラワーガーデン', start: 0.24, end: 0.48 },
    { label: '風車の丘', start: 0.48, end: 0.74 },
    { label: 'ホームストレート', start: 0.74, end: 1 }
  ],

  createEnvironment() { return createThemeEnvironment(this); }
};
