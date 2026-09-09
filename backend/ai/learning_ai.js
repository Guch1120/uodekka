// backend/ai/learning_ai.js
// GPU不要の軽量空間ビニング学習AI
// プレイヤーの実際の運転操作（走行ライン、進入速度、減速、ドリフト、ブースト）をサンプリングし、
// コースごとの知識ベース（localStorage）に永続化・成長させる。
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export const NUM_TRACK_BINS = 120;

export class CourseKnowledgeBase {
  constructor(courseId, curve, trackWidth = 24) {
    this.courseId = courseId;
    this.curve = curve;
    this.trackWidth = trackWidth;
    this.storageKey = `kart_ai_knowledge_${courseId}`;

    this.profile = this.loadProfile();
    this.currentLapSamples = new Map();
    this.baselineBins = this.generateGeometricBaseline();
  }

  loadProfile() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.bins) && parsed.bins.length === NUM_TRACK_BINS) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load AI profile, using default:', e);
    }

    return {
      version: 1,
      courseId: this.courseId,
      totalLapsLearned: 0,
      bestLapTime: null,
      bins: Array.from({ length: NUM_TRACK_BINS }, () => ({
        lateralOffset: 0, // コース中央からの横方向オフセット (m)
        targetSpeed: 38.0, // 推奨走行速度 (m/s)
        driftScore: 0,    // ドリフト推奨度 (0.0〜1.0)
        brakeScore: 0,    // 事前減速推奨度 (0.0〜1.0)
        samples: 0
      }))
    };
  }

  saveProfile() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.profile));
    } catch (e) {
      console.warn('Failed to save AI profile:', e);
    }
  }

  resetProfile() {
    localStorage.removeItem(this.storageKey);
    this.profile = this.loadProfile();
    this.currentLapSamples.clear();
  }

  get learningLevel() {
    // 蓄積ラップ数に応じたAI習熟レベル (Lv.1 〜 Lv.10)
    const laps = this.profile.totalLapsLearned || 0;
    return Math.min(10, Math.floor(laps / 2) + 1);
  }

  // 初回や学習データ未成熟時用の幾何学的アウト・イン・アウト基準線
  generateGeometricBaseline() {
    const baselines = [];
    if (!this.curve) {
      for (let i = 0; i < NUM_TRACK_BINS; i++) {
        baselines.push({ lateralOffset: 0, targetSpeed: 36.0, driftScore: 0, curvature: 0 });
      }
      return baselines;
    }

    const up = new THREE.Vector3(0, 1, 0);
    const halfWidth = (this.trackWidth || 24) * 0.45;

    for (let i = 0; i < NUM_TRACK_BINS; i++) {
      const t = i / NUM_TRACK_BINS;
      const tPrev = (t - 0.015 + 1.0) % 1.0;
      const tNext = (t + 0.015) % 1.0;

      const pPrev = this.curve.getPointAt(tPrev);
      const p = this.curve.getPointAt(t);
      const pNext = this.curve.getPointAt(tNext);

      const tan1 = new THREE.Vector3().subVectors(p, pPrev).normalize();
      const tan2 = new THREE.Vector3().subVectors(pNext, p).normalize();

      // 接線変化によるXZ曲率
      const crossY = tan1.x * tan2.z - tan1.z * tan2.x;
      const curvature = crossY * 40.0; // 正: 右カーブ、負: 左カーブ

      // アウト・イン・アウトのオフセット計算
      // 右カーブなら内側（右=+）へ寄せる。カーブ直前は外側（左=-）
      const tLookAhead = (t + 0.03) % 1.0;
      const pNext2 = this.curve.getPointAt(tLookAhead);
      const tan3 = new THREE.Vector3().subVectors(pNext2, pNext).normalize();
      const nextCrossY = tan2.x * tan3.z - tan2.z * tan3.x;

      let baselineOffset = 0;
      if (Math.abs(curvature) > 0.05) {
        // コーナー頂点（クリッピングポイント）: イン側へ
        baselineOffset = Math.sign(curvature) * Math.min(halfWidth, Math.abs(curvature) * halfWidth * 1.5);
      } else if (Math.abs(nextCrossY) > 0.08) {
        // コーナー進入前: アウト側へ振る
        baselineOffset = -Math.sign(nextCrossY) * halfWidth * 0.7;
      }

      // カーブに応じた減速プロファイル
      const safeSpeed = Math.max(24.0, 42.0 - Math.abs(curvature) * 110.0);
      const driftScore = Math.abs(curvature) > 0.14 ? 0.8 : 0;

      baselines.push({
        lateralOffset: baselineOffset,
        targetSpeed: safeSpeed,
        driftScore,
        curvature
      });
    }

    return baselines;
  }

  // プレイヤー走行中の1フレームごとのサンプリング
  recordPlayerSample(kartPhysics, curve) {
    if (!kartPhysics || !curve) return;
    // クラッシュ中、スピン中、復帰中、逆走中、極端な低速時は学習ノイズとして破棄
    if (kartPhysics.isSpinning || kartPhysics.isRespawning || kartPhysics.isWrongWay) return;
    if (kartPhysics.speed < 8.0) return;

    const t = (kartPhysics.progress % 1.0 + 1.0) % 1.0;
    const binIndex = Math.floor(t * NUM_TRACK_BINS) % NUM_TRACK_BINS;

    // プレイヤーのコース中央からの横方向オフセット (m) を計算
    const centerPoint = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

    const toKart = new THREE.Vector3().subVectors(kartPhysics.mesh.position, centerPoint);
    toKart.y = 0;
    const lateralOffset = toKart.dot(normal);

    // コース内（ガードレール内）のサンプルのみ採用
    const maxAllowedOffset = (this.trackWidth || 24) * 0.55;
    if (Math.abs(lateralOffset) > maxAllowedOffset) return;

    const sample = {
      lateralOffset,
      speed: kartPhysics.speed,
      isDrifting: kartPhysics.isDrifting,
      driftSparkLevel: kartPhysics.driftSparkLevel || 0,
      timestamp: performance.now()
    };

    // 同一セクション内でより速い（または新しい）走行を優先
    const existing = this.currentLapSamples.get(binIndex);
    if (!existing || sample.speed >= existing.speed) {
      this.currentLapSamples.set(binIndex, sample);
    }
  }

  // ラップ完了時に学習データをコースプロファイルに反映
  commitLap(lapTime = null, isClean = true) {
    if (this.currentLapSamples.size === 0) {
      return;
    }

    // 学習率: ラップ完了数が多いほど徐々に安定収束（0.12 〜 0.35）
    const learnedCount = this.profile.totalLapsLearned || 0;
    const alpha = Math.max(0.12, 0.38 / (1.0 + learnedCount * 0.08));

    for (const [binIndex, sample] of this.currentLapSamples.entries()) {
      const bin = this.profile.bins[binIndex];
      if (!bin) continue;

      // 1. 横方向レーシングラインの学習（アウト・イン・アウトのトレース）
      bin.lateralOffset = bin.lateralOffset * (1 - alpha) + sample.lateralOffset * alpha;

      // 2. コーナー最高速・目標速度の学習（速い走りを貪欲に吸収）
      if (sample.speed > bin.targetSpeed) {
        bin.targetSpeed = bin.targetSpeed * (1 - alpha * 1.5) + sample.speed * (alpha * 1.5);
      } else {
        bin.targetSpeed = bin.targetSpeed * (1 - alpha * 0.5) + sample.speed * (alpha * 0.5);
      }

      // 3. ドリフト有効区間の学習
      const driftVal = (sample.isDrifting || sample.driftSparkLevel > 0) ? 1.0 : 0.0;
      bin.driftScore = bin.driftScore * (1 - alpha) + driftVal * alpha;

      bin.samples = (bin.samples || 0) + 1;
    }

    this.profile.totalLapsLearned = learnedCount + 1;
    if (lapTime && (!this.profile.bestLapTime || lapTime < this.profile.bestLapTime)) {
      this.profile.bestLapTime = lapTime;
    }

    this.saveProfile();
    this.currentLapSamples.clear();
  }

  // CPUが指定進行度 t で参照する目標走行情報
  getTarget(t) {
    const normT = (t % 1.0 + 1.0) % 1.0;
    const exactIndex = normT * NUM_TRACK_BINS;
    const i0 = Math.floor(exactIndex) % NUM_TRACK_BINS;
    const i1 = (i0 + 1) % NUM_TRACK_BINS;
    const fraction = exactIndex - Math.floor(exactIndex);

    const b0 = this.baselineBins[i0] || { lateralOffset: 0, targetSpeed: 36, driftScore: 0 };
    const b1 = this.baselineBins[i1] || { lateralOffset: 0, targetSpeed: 36, driftScore: 0 };
    const baseOffset = THREE.MathUtils.lerp(b0.lateralOffset, b1.lateralOffset, fraction);
    const baseSpeed = THREE.MathUtils.lerp(b0.targetSpeed, b1.targetSpeed, fraction);
    const baseDrift = THREE.MathUtils.lerp(b0.driftScore, b1.driftScore, fraction);

    const p0 = this.profile.bins[i0];
    const p1 = this.profile.bins[i1];

    if (!p0 || !p1 || (p0.samples === 0 && p1.samples === 0)) {
      return {
        lateralOffset: baseOffset,
        targetSpeed: baseSpeed,
        shouldDrift: baseDrift > 0.45,
        confidence: 0,
        level: this.learningLevel
      };
    }

    const learnedOffset = THREE.MathUtils.lerp(p0.lateralOffset, p1.lateralOffset, fraction);
    const learnedSpeed = THREE.MathUtils.lerp(p0.targetSpeed, p1.targetSpeed, fraction);
    const learnedDrift = THREE.MathUtils.lerp(p0.driftScore, p1.driftScore, fraction);

    // 学習進度に応じたブレンド率（0ラップ: 0% → 6ラップ以上で85%〜95%プレイヤー流）
    const blendRate = Math.min(0.95, (this.profile.totalLapsLearned || 0) * 0.16);

    return {
      lateralOffset: THREE.MathUtils.lerp(baseOffset, learnedOffset, blendRate),
      targetSpeed: THREE.MathUtils.lerp(baseSpeed, learnedSpeed, blendRate),
      shouldDrift: (THREE.MathUtils.lerp(baseDrift, learnedDrift, blendRate) > 0.4),
      confidence: blendRate,
      level: this.learningLevel
    };
  }
}
