// frontend/courses/index.js
// コース管理 & コース3Dメッシュ（道路・ガードレール・スタートライン）の生成
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { courseCurve } from './course_curve.js';
import { Course1 } from './course1.js';
import { Course2 } from './course2.js';
import { Course3 } from './course3.js';
import { Course4 } from './course4.js';

export const Courses = {
  list: {
    course1: Course1,
    course2: Course2,
    course3: Course3,
    course4: Course4
  },

  getCourse(id) {
    if (this.list[id]) return this.list[id];
    // カスタムコース（コースエディタ作成コース）
    if (id.startsWith('custom_')) {
      try {
        const saved = localStorage.getItem('kart_custom_courses');
        if (saved) {
          const dict = JSON.parse(saved);
          if (dict[id]) {
            const raw = dict[id];
            return {
              id: raw.id,
              name: raw.name || 'カスタムコース',
              theme: raw.theme || 'grassland',
              skyColor: raw.skyColor || 0x87ceeb,
              ambientColor: raw.ambientColor || 0xffffff,
              trackWidth: raw.trackWidth || 32,
              totalLaps: raw.totalLaps || 3,
              points: raw.points.map(p => new THREE.Vector3(p.x, Number.isFinite(p.y) ? p.y : 0, p.z)),
              itemBoxLocations: raw.itemBoxLocations || [0.2, 0.5, 0.8],
              dashPanels: raw.dashPanels || [0.35, 0.65],
              jumpRamps: raw.jumpRamps || [],
              coinLocations: raw.coinLocations || [0.08, 0.22, 0.42, 0.62, 0.82],
              tireWallSegments: raw.tireWallSegments || [
                { start: 0.05, end: 0.35, side: 'both' },
                { start: 0.45, end: 0.72, side: 'both' },
                { start: 0.80, end: 0.95, side: 'both' }
              ],
              createEnvironment: (scene) => {
                const grp = new THREE.Group();
                const groundGeo = new THREE.PlaneGeometry(1200, 1200);
                groundGeo.rotateX(-Math.PI / 2);
                const groundMat = new THREE.MeshStandardMaterial({ color: 0x55aa44, roughness: 0.9 });
                const ground = new THREE.Mesh(groundGeo, groundMat);
                ground.receiveShadow = true;
                grp.add(ground);
                return grp;
              }
            };
          }
        }
      } catch (e) {
        console.warn('Failed to load custom course', e);
      }
    }
    return this.list.course1;
  },

  /**
   * スプライン曲線から押し出し/リボン状の3D道路ジオメトリを生成
   */
  buildTrack(courseConfig) {
    const curve = courseCurve(courseConfig);
    const divisions = 240;
    const points = curve.getPoints(divisions);
    const trackWidth = courseConfig.trackWidth || 16;

    const roadGeo = new THREE.BufferGeometry();
    const positions = [];
    const uvs = [];
    const normals = [];

    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i <= divisions; i++) {
      const p = points[i % divisions];
      const pNext = points[(i + 1) % divisions];

      // 接線と法線
      const tangent = new THREE.Vector3().subVectors(pNext, p).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      // 左右の頂点
      const pLeft = new THREE.Vector3().copy(p).addScaledVector(normal, -trackWidth / 2);
      const pRight = new THREE.Vector3().copy(p).addScaledVector(normal, trackWidth / 2);

      positions.push(pLeft.x, pLeft.y + 0.05, pLeft.z);
      positions.push(pRight.x, pRight.y + 0.05, pRight.z);

      const u = i / divisions;
      uvs.push(0, u * 30);
      uvs.push(1, u * 30);

      normals.push(0, 1, 0);
      normals.push(0, 1, 0);
    }

    const indices = [];
    for (let i = 0; i < divisions; i++) {
      const idx = i * 2;
      indices.push(idx, idx + 1, idx + 2);
      indices.push(idx + 1, idx + 3, idx + 2);
    }

    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();

    // コース別の路面テクスチャ表現
    let roadMat;
    if (courseConfig.theme === 'space') {
      roadMat = new THREE.MeshStandardMaterial({
        color: 0x1a0933,
        roughness: 0.2,
        metalness: 0.8,
        emissive: 0x220044
      });
    } else if (courseConfig.theme === 'desert') {
      roadMat = new THREE.MeshStandardMaterial({
        color: 0x8a5a36,
        roughness: 0.9,
        metalness: 0.1
      });
    } else {
      roadMat = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.6,
        metalness: 0.2
      });
    }

    const trackMesh = new THREE.Mesh(roadGeo, roadMat);
    trackMesh.receiveShadow = true;

    // ガードレール / フチ取り（赤白ゼブラゾーン）
    const curbGroup = this.buildCurbs(points, divisions, trackWidth);

    // スタート＆フィニッシュゲート
    const startLine = this.buildStartGate(points[0], points[1], trackWidth);

    // ダッシュボード（加速板・矢印床）
    const dashPanelGroup = new THREE.Group();
    const dashPanels = [];
    const dashLocations = courseConfig.dashPanels || [0.3, 0.7];

    dashLocations.forEach(t => {
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      // 幅いっぱいに2〜3枚のダッシュパネルを配置
      [-trackWidth * 0.25, trackWidth * 0.25].forEach(offset => {
        const panelGroup = new THREE.Group();
        const panelGeo = new THREE.BoxGeometry(trackWidth * 0.35, 0.12, 5.0);
        const panelMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xd97706,
          emissiveIntensity: 0.8,
          roughness: 0.2,
          metalness: 0.5
        });
        const panelMesh = new THREE.Mesh(panelGeo, panelMat);
        panelGroup.add(panelMesh);

        // 矢印マーク
        const arrowGeo = new THREE.ConeGeometry(trackWidth * 0.12, 2.5, 3);
        arrowGeo.rotateX(Math.PI / 2);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
        arrowMesh.position.y = 0.08;
        panelGroup.add(arrowMesh);

        panelGroup.position.copy(p).addScaledVector(normal, offset);
        panelGroup.position.y += 0.08;

        const forward = tangent.clone();
        panelGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), forward);

        dashPanelGroup.add(panelGroup);
        dashPanels.push({
          position: panelGroup.position,
          t: t,
          radius: trackWidth * 0.25
        });
      });
    });

    // ジャンプ台（通常ジャンプ ＆ 滑空グライダージャンプ）
    const jumpRampGroup = new THREE.Group();
    const jumpRamps = [];
    const rampConfigs = courseConfig.jumpRamps || [];

    rampConfigs.forEach(rampDef => {
      const t = rampDef.t;
      const type = rampDef.type || 'standard';
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const forward = tangent.clone();

      const isGlider = type === 'glider';
      const rampW = trackWidth * (rampDef.widthScale || 0.75);
      const rampL = isGlider ? 8.0 : 7.0;
      const rampH = rampDef.height || (isGlider ? 3.4 : 2.1);
      const rampAngle = Math.atan2(rampH, rampL);

      const rampObj = new THREE.Group();

      // スロープ（ウェッジ）形状
      const wedgeShape = new THREE.Shape();
      wedgeShape.moveTo(-rampL / 2, 0);
      wedgeShape.lineTo(rampL / 2, rampH);
      wedgeShape.lineTo(rampL / 2, 0);
      wedgeShape.closePath();

      const extrudeSettings = { steps: 1, depth: rampW, bevelEnabled: false };
      const wedgeGeo = new THREE.ExtrudeGeometry(wedgeShape, extrudeSettings);
      wedgeGeo.translate(0, 0, -rampW / 2);
      wedgeGeo.rotateY(-Math.PI / 2);

      const rampMat = new THREE.MeshStandardMaterial({
        color: isGlider ? 0x00b4d8 : 0xf39c12,
        emissive: isGlider ? 0x0077b6 : 0xd35400,
        emissiveIntensity: 0.6,
        roughness: 0.25,
        metalness: 0.4
      });
      const rampMesh = new THREE.Mesh(wedgeGeo, rampMat);
      rampObj.add(rampMesh);

      // 装飾（矢印・リング）
      if (isGlider) {
        // グライダーシンボル（2枚の翼型シェブロン）
        for (let s = -1; s <= 1; s += 2) {
          const chevronGeo = new THREE.ConeGeometry(rampW * 0.14, 3.5, 3);
          chevronGeo.rotateX(Math.PI / 2);
          const chevronMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const chevronMesh = new THREE.Mesh(chevronGeo, chevronMat);
          chevronMesh.position.set(s * rampW * 0.25, rampH * 0.55, 0);
          rampObj.add(chevronMesh);
        }
        // 青い上昇気流リング
        const ringGeo = new THREE.TorusGeometry(rampW * 0.35, 0.15, 8, 16);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x90e0ef });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, rampH + 0.8, -rampL * 0.25);
        rampObj.add(ring);
      } else {
        // 通常ジャンプ台：大きな白矢印
        const arrowGeo = new THREE.ConeGeometry(rampW * 0.2, 4.0, 3);
        arrowGeo.rotateX(Math.PI / 2);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
        arrowMesh.position.set(0, rampH * 0.55, 0);
        rampObj.add(arrowMesh);
      }

      rampObj.position.copy(p);
      rampObj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), forward);

      // スロープの傾斜方向に沿った3D射出ベクトル (Launch Vector)
      const cosA = Math.cos(rampAngle);
      const sinA = Math.sin(rampAngle);
      const launchDir = forward.clone().multiplyScalar(cosA).add(new THREE.Vector3(0, sinA, 0)).normalize();

      jumpRampGroup.add(rampObj);
      jumpRamps.push({
        position: rampObj.position.clone(),
        forward: forward.clone(),
        launchDir: launchDir,
        rampAngle: rampAngle,
        t: t,
        type: type,
        radius: trackWidth * 0.4,
        height: rampH,
        rampLength: rampL
      });

      // 加速板とジャンプ台は基本セット：ジャンプ台の手前直前に加速板を追加
      const dashT = (t - 0.016 + 1) % 1;
      const dashP = curve.getPointAt(dashT);
      const dashForward = curve.getTangentAt(dashT).normalize();
      [-trackWidth * 0.25, trackWidth * 0.25].forEach(offset => {
        const panelGroup = new THREE.Group();
        const panelGeo = new THREE.BoxGeometry(trackWidth * 0.35, 0.12, 5.0);
        const panelMat = new THREE.MeshStandardMaterial({
          color: isGlider ? 0x00f5d4 : 0xf59e0b,
          emissive: isGlider ? 0x00bbf9 : 0xd97706,
          emissiveIntensity: 0.9,
          roughness: 0.2,
          metalness: 0.5
        });
        const panelMesh = new THREE.Mesh(panelGeo, panelMat);
        panelGroup.add(panelMesh);

        const arrowGeo = new THREE.ConeGeometry(trackWidth * 0.12, 2.5, 3);
        arrowGeo.rotateX(Math.PI / 2);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
        arrowMesh.position.y = 0.08;
        panelGroup.add(arrowMesh);

        panelGroup.position.copy(dashP).addScaledVector(normal, offset);
        panelGroup.position.y += 0.08;
        panelGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dashForward);

        dashPanelGroup.add(panelGroup);
        dashPanels.push({
          position: panelGroup.position,
          t: dashT,
          radius: trackWidth * 0.25
        });
      });
    });

    // タイヤウォール（内側・外側の防護壁＆意図的な切れ目によるコースアウトエリア）
    const tireWallData = this.buildTireWalls(curve, divisions, trackWidth, courseConfig.tireWallSegments);
    const tireWallGroup = tireWallData.group;
    const tireWallObstacles = tireWallData.obstacles;

    const fullTrackGroup = new THREE.Group();
    fullTrackGroup.add(trackMesh);
    fullTrackGroup.add(curbGroup);
    fullTrackGroup.add(tireWallGroup);
    fullTrackGroup.add(startLine);
    fullTrackGroup.add(dashPanelGroup);
    fullTrackGroup.add(jumpRampGroup);

    return {
      group: fullTrackGroup,
      curve: curve,
      points: points,
      dashPanels: dashPanels,
      jumpRamps: jumpRamps,
      tireWallObstacles: tireWallObstacles
    };
  },

  /**
   * タイヤウォールの生成
   * 指定されたセグメント区間にのみタイヤの山（赤白交互）を配置し、未指定区間は意図的なコースアウト切れ目とする
   */
  buildTireWalls(curve, divisions, trackWidth, segments) {
    const tireGroup = new THREE.Group();
    const obstacles = [];
    const up = new THREE.Vector3(0, 1, 0);

    // デフォルトセグメント (未指定時は3箇所の切れ目を設けた配置)
    const wallSegments = segments && segments.length > 0 ? segments : [
      { start: 0.05, end: 0.38, side: 'both' },
      { start: 0.45, end: 0.72, side: 'both' },
      { start: 0.80, end: 0.96, side: 'both' }
    ];

    // タイヤ用共通ジオメトリ
    // 直径約 1.8m、高さ約 1.4m の2段重ねタイヤ
    const tireGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.65, 10);
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.85,
      metalness: 0.1
    });
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.6,
      metalness: 0.2
    });
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.6,
      metalness: 0.2
    });

    const isInsideSegment = (t, side) => {
      for (const seg of wallSegments) {
        if (seg.side !== 'both' && seg.side !== side) continue;
        if (seg.start <= seg.end) {
          if (t >= seg.start && t <= seg.end) return true;
        } else {
          // 0境界をまたぐ場合
          if (t >= seg.start || t <= seg.end) return true;
        }
      }
      return false;
    };

    // サンプル密度: コース全体で約120〜160個のタイヤスタック間隔
    const totalSamples = Math.max(120, divisions);
    const step = 1 / totalSamples;

    // 内側と外側のオフセット距離
    const sides = [
      { key: 'inner', offset: -trackWidth / 2 - 1.2 },
      { key: 'outer', offset: trackWidth / 2 + 1.2 }
    ];

    let stackCounter = 0;

    const sidePoints = { inner: [], outer: [] };

    for (let i = 0; i < totalSamples; i++) {
      const t = i * step;
      const pt = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      sides.forEach(side => {
        if (!isInsideSegment(t, side.key)) {
          // この区間は切れ目（コースアウト可能エリア）
          return;
        }

        const wallPos = pt.clone().addScaledVector(normal, side.offset);
        wallPos.y += 0.35; // 地面から少し浮かせて設置

        const stack = new THREE.Group();
        stack.position.copy(wallPos);

        // 赤白交互のアクセントバンド
        stackCounter++;
        const bandMat = (stackCounter % 2 === 0) ? redMat : whiteMat;

        // 下段タイヤ（ブラックゴム）
        const tire1 = new THREE.Mesh(tireGeo, blackMat);
        tire1.position.y = 0.32;
        tire1.castShadow = true;
        tire1.receiveShadow = true;
        stack.add(tire1);

        // 上段タイヤ（赤または白の防護マーキング）
        const tire2 = new THREE.Mesh(tireGeo, bandMat);
        tire2.position.y = 0.95;
        tire2.castShadow = true;
        tire2.receiveShadow = true;
        stack.add(tire2);

        tireGroup.add(stack);

        // 壁セグメント生成用にポイントを記録
        const inwardNormal = normal.clone().multiplyScalar(side.key === 'inner' ? 1 : -1);
        sidePoints[side.key].push({
          index: i,
          pos: new THREE.Vector3(wallPos.x, wallPos.y, wallPos.z),
          tangent: tangent.clone(),
          inwardNormal: inwardNormal
        });
      });
    }

    // 連続するタイヤ位置を線分（連続体の壁セグメント）として構築
    sides.forEach(side => {
      const pts = sidePoints[side.key];
      for (let j = 0; j < pts.length; j++) {
        const curr = pts[j];
        let next = null;

        // 次のインデックスが連続しているかチェック
        if (j + 1 < pts.length && pts[j + 1].index === curr.index + 1) {
          next = pts[j + 1];
        } else if (j === pts.length - 1 && pts[0].index === 0 && curr.index === totalSamples - 1) {
          // 0境界をまたいで1周繋がっている場合
          next = pts[0];
        }

        if (next) {
          const segDir = new THREE.Vector3().subVectors(next.pos, curr.pos);
          const segLen = segDir.length();
          if (segLen > 0.01) {
            segDir.normalize();
            const avgInward = curr.inwardNormal.clone().add(next.inwardNormal).normalize();
            obstacles.push({
              p1: curr.pos,
              p2: next.pos,
              tangent: segDir,
              inwardNormal: avgInward,
              radius: 1.4, // タイヤ半径0.9m + 余裕
              type: 'tire_wall_segment'
            });
          }
        } else {
          // 孤立した端点用のフォールバック（球コライダー）
          obstacles.push({
            position: curr.pos,
            radius: 1.4,
            inwardNormal: curr.inwardNormal,
            tangent: curr.tangent,
            type: 'tire_wall'
          });
        }
      }
    });

    return { group: tireGroup, obstacles: obstacles };
  },

  buildCurbs(points, divisions, trackWidth) {
    const curbGroup = new THREE.Group();
    const up = new THREE.Vector3(0, 1, 0);

    const leftPositions = [];
    const rightPositions = [];

    for (let i = 0; i <= divisions; i++) {
      const p = points[i % divisions];
      const pNext = points[(i + 1) % divisions];
      const tangent = new THREE.Vector3().subVectors(pNext, p).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      const pL = new THREE.Vector3().copy(p).addScaledVector(normal, -trackWidth / 2);
      const pR = new THREE.Vector3().copy(p).addScaledVector(normal, trackWidth / 2);

      leftPositions.push(pL);
      rightPositions.push(pR);
    }

    // 左右のフチ（チューブで簡易ガードレール）
    const leftCurve = new THREE.CatmullRomCurve3(leftPositions, true);
    const rightCurve = new THREE.CatmullRomCurve3(rightPositions, true);

    const curbGeoL = new THREE.TubeGeometry(leftCurve, divisions, 0.4, 6, true);
    const curbGeoR = new THREE.TubeGeometry(rightCurve, divisions, 0.4, 6, true);

    const curbMat = new THREE.MeshStandardMaterial({ color: 0xdd2c00, roughness: 0.5 });

    curbGroup.add(new THREE.Mesh(curbGeoL, curbMat));
    curbGroup.add(new THREE.Mesh(curbGeoR, curbMat));

    return curbGroup;
  },

  buildStartGate(p0, p1, trackWidth) {
    const group = new THREE.Group();
    const forward = new THREE.Vector3().subVectors(p1, p0).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();

    // 支柱
    const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 9);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f });

    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.copy(p0).addScaledVector(right, -trackWidth / 2 - 1);
    postL.position.y += 4.5;

    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.copy(p0).addScaledVector(right, trackWidth / 2 + 1);
    postR.position.y += 4.5;

    // バナー
    const bannerGeo = new THREE.BoxGeometry(trackWidth + 2, 2.5, 0.5);
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.copy(p0);
    banner.position.y += 8;
    banner.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);

    // スタートラインのチェッカー模様（床）
    const lineGeo = new THREE.PlaneGeometry(trackWidth, 3);
    lineGeo.rotateX(-Math.PI / 2);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.copy(p0);
    line.position.y += 0.1;
    line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
    // Geometry already lies in the XZ plane; do not rotate it twice.

    group.add(postL);
    group.add(postR);
    group.add(banner);
    group.add(line);

    return group;
  }
};
