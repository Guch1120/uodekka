// frontend/courses/course4.js
// コース4: 「スカイハイ・サーキット」 (大空と浮遊島を巡るジャンプ台＆グライダー滑空コース)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createThemeEnvironment } from './theme_environment.js';

export const Course4 = {
  id: 'course4',
  previewImage: null,
  name: 'スカイハイ・サーキット',
  theme: 'sky',
  themeLabel: '天空',
  description: '空中発着場 → 浮遊島群 → 空中遺跡 → 雲海滑空区間',
  skyColor: 0x4aa3df,
  ambientColor: 0xffffff,
  trackWidth: 32,
  totalLaps: 3,

  points: [
    new THREE.Vector3(0, 0, 0),             // スタートライン
    new THREE.Vector3(80, 2, -40),
    new THREE.Vector3(180, 8, -60),
    new THREE.Vector3(260, 16, -20),         // 谷の手前
    new THREE.Vector3(340, 20, 60),          // 通常ジャンプ台 (t=0.35付近) で谷越え
    new THREE.Vector3(380, 22, 160),
    new THREE.Vector3(340, 26, 260),
    new THREE.Vector3(220, 32, 320),         // 浮遊天空プラトー最高地点 (+32m)
    new THREE.Vector3(100, 36, 330),         // 崖っぷち・滑空ジャンプ台 (t=0.69付近)
    new THREE.Vector3(-80, 24, 320),         // 空中大滑空ゾーン（雲海の上空を悠々と飛行）
    new THREE.Vector3(-220, 12, 220),        // ロンググライダー飛行エリア
    new THREE.Vector3(-230, 4, 90),          // 滑空着地エリア
    new THREE.Vector3(-150, 0, -10),
    new THREE.Vector3(-50, 0, 0)
  ],

  itemBoxLocations: [0.18, 0.52, 0.85],
  // 加速板とジャンプ台は基本セット
  dashPanels: [0.32, 0.67],
  jumpRamps: [
    { t: 0.34, type: 'standard', boost: true, widthScale: 0.7, height: 2.2 },
    { t: 0.69, type: 'glider', boost: true, widthScale: 0.85, height: 3.5 }
  ],
  tireWallSegments: [
    { start: 0.04, end: 0.30, side: 'both' },
    // 0.30〜0.38 はジャンプ台と谷越えオープンエリア
    { start: 0.40, end: 0.65, side: 'both' },
    // 0.65〜0.82 は滑空大ジャンプ台と空中フライトエリア
    { start: 0.83, end: 0.96, side: 'both' }
  ],

  sections: [
    { label: '空中発着場', start: 0, end: 0.24 },
    { label: '浮遊島群', start: 0.24, end: 0.5 },
    { label: '空中遺跡', start: 0.5, end: 0.74 },
    { label: '雲海滑空区間', start: 0.74, end: 1 }
  ],

  createEnvironment() { return createThemeEnvironment(this); }
};
