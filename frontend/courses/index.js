// frontend/courses/index.js
// コース管理 & コース3Dメッシュ（道路・ガードレール・スタートライン）の生成
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { Course1 } from './course1.js';
import { Course2 } from './course2.js';
import { Course3 } from './course3.js';

export const Courses = {
  list: {
    course1: Course1,
    course2: Course2,
    course3: Course3
  },

  getCourse(id) {
    return this.list[id] || this.list.course1;
  },

  /**
   * スプライン曲線から押し出し/リボン状の3D道路ジオメトリを生成
   */
  buildTrack(courseConfig) {
    const curve = new THREE.CatmullRomCurve3(courseConfig.points, true, 'centripetal');
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

    const fullTrackGroup = new THREE.Group();
    fullTrackGroup.add(trackMesh);
    fullTrackGroup.add(curbGroup);
    fullTrackGroup.add(startLine);

    return {
      group: fullTrackGroup,
      curve: curve,
      points: points
    };
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
    line.rotateX(-Math.PI / 2);

    group.add(postL);
    group.add(postR);
    group.add(banner);
    group.add(line);

    return group;
  }
};
