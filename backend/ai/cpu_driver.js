// backend/ai/cpu_driver.js
// 11台のCPUドライバーの個性定義および行動決定コントローラー
// 学習知識（レーシングライン、進入速度、ドリフト区間）をもとに、人間らしい白熱した走りを実現する
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export const CPU_ROSTER = [
  { id: 'ai_0', name: 'ハヤテ', vehicleKey: 'speed_blue', color: 0x1e88e5, accent: 0xfbc531, style: 'speeder', offsetBias: 0.0, speedScale: 1.02, itemAggression: 0.8 },
  { id: 'ai_1', name: 'ツバサ', vehicleKey: 'handling_green', color: 0x27ae60, accent: 0x4cd137, style: 'drifter', offsetBias: -0.6, speedScale: 0.99, itemAggression: 0.7 },
  { id: 'ai_2', name: 'アオイ', vehicleKey: 'standard_red', color: 0xe74c3c, accent: 0xffffff, style: 'line_master', offsetBias: 0.0, speedScale: 1.01, itemAggression: 0.75 },
  { id: 'ai_3', name: 'タクミ', vehicleKey: 'handling_green', color: 0x8e44ad, accent: 0x9c88ff, style: 'apex_cutter', offsetBias: 0.7, speedScale: 1.00, itemAggression: 0.7 },
  { id: 'ai_4', name: 'レン', vehicleKey: 'heavy_yellow', color: 0xf39c12, accent: 0x2c3e50, style: 'aggressive', offsetBias: -0.5, speedScale: 1.03, itemAggression: 0.95 },
  { id: 'ai_5', name: 'ソラ', vehicleKey: 'standard_red', color: 0x16a085, accent: 0x48dbfb, style: 'balanced', offsetBias: 0.4, speedScale: 0.98, itemAggression: 0.7 },
  { id: 'ai_6', name: 'ユウキ', vehicleKey: 'heavy_yellow', color: 0xf1c40f, accent: 0xd35400, style: 'tactician', offsetBias: -0.7, speedScale: 0.98, itemAggression: 0.85 },
  { id: 'ai_7', name: 'カイト', vehicleKey: 'speed_blue', color: 0x2c3e50, accent: 0x718093, style: 'wide_sweeper', offsetBias: 0.6, speedScale: 1.01, itemAggression: 0.8 },
  { id: 'ai_8', name: 'ヒカリ', vehicleKey: 'standard_red', color: 0xe84393, accent: 0xff9ff3, style: 'smooth', offsetBias: -0.3, speedScale: 0.97, itemAggression: 0.65 },
  { id: 'ai_9', name: 'リク', vehicleKey: 'speed_blue', color: 0x00cec9, accent: 0x81ecec, style: 'drafter', offsetBias: 0.5, speedScale: 1.02, itemAggression: 0.8 },
  { id: 'ai_10', name: 'メイ', vehicleKey: 'handling_green', color: 0x2ed573, accent: 0x7bed9f, style: 'defender', offsetBias: -0.4, speedScale: 0.97, itemAggression: 0.9 }
];

export class CPUDriver {
  static stepAI(aiKart, dt, courseTrack, courseConfig, knowledgeBase, gameState) {
    if (!aiKart || !aiKart.physics || !courseTrack || !courseTrack.curve) return;

    const curve = courseTrack.curve;
    const physics = aiKart.physics;
    const mesh = aiKart.mesh;
    const personality = aiKart.personality || CPU_ROSTER[0];

    // 1. 目標進行度（Lookahead）の算出: 安定した 0.04
    const lookAheadT = (physics.progress + 0.04) % 1.0;

    // 2. 学習知識ベースからの目標走行線（横オフセット）および推奨速度
    let targetOffset = 0;
    let targetSpeed = 38.0;
    let shouldDrift = false;

    if (knowledgeBase) {
      const target = knowledgeBase.getTarget(lookAheadT);
      targetOffset = target.lateralOffset + (personality.offsetBias || 0);
      targetSpeed = target.targetSpeed * (personality.speedScale || 1.0);
      shouldDrift = target.shouldDrift;
    } else {
      targetOffset = aiKart.aiOffset || 0;
      targetSpeed = 38.0 * (aiKart.speedMultiplier || 1.0);
    }

    // コースアスファルト内（安全マージン）への確実なクランプ
    const maxOffset = (courseConfig.trackWidth || 24) * 0.32;
    targetOffset = Math.max(-maxOffset, Math.min(maxOffset, targetOffset));

    // 目標3D座標の計算
    const targetPt = curve.getPointAt(lookAheadT);
    const tangent = curve.getTangentAt(lookAheadT).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
    targetPt.addScaledVector(normal, targetOffset);

    // 3. 操舵角（ステアリング）の計算
    const dirToTarget = new THREE.Vector3().subVectors(targetPt, mesh.position);
    dirToTarget.y = 0;
    dirToTarget.normalize();

    const kartForward = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
    kartForward.y = 0;
    kartForward.normalize();

    const cross = new THREE.Vector3().crossVectors(kartForward, dirToTarget);
    let steer = Math.max(-1, Math.min(1, -cross.y * 3.0));

    // 4. 動的障害物回避（前方のバナナやボム兵を検知して避ける）
    if (gameState && gameState.activeWorldItems && gameState.activeWorldItems.length > 0) {
      for (const item of gameState.activeWorldItems) {
        if (!item.active) continue;
        const toItem = new THREE.Vector3().subVectors(item.mesh.position, mesh.position);
        toItem.y = 0;
        const dist = toItem.length();
        if (dist > 0.5 && dist < 12.0) {
          const fwdDist = toItem.dot(kartForward);
          if (fwdDist > 1.0) {
            const sideDist = toItem.dot(new THREE.Vector3().crossVectors(up, kartForward).normalize());
            if (Math.abs(sideDist) < 2.5) {
              steer += (sideDist >= 0 ? 0.5 : -0.5);
              steer = Math.max(-1, Math.min(1, steer));
              break;
            }
          }
        }
      }
    }

    // 5. 加速／ブレーキ／ドリフト決定
    let accel = 0.95 * (personality.speedScale || 1.0);
    let brake = 0;
    let drift = false;

    // コーナー手前で突っ込みすぎの場合のみアクセルを緩める
    if (physics.speed > targetSpeed + 8.0 && targetSpeed < 32.0) {
      accel = 0.4;
    }

    // ドリフト発動（急カーブかつ学習ドリフト推奨区間）
    if (shouldDrift && Math.abs(steer) > 0.6 && physics.speed > 18.0) {
      drift = true;
    }

    // 6. アイテム使用ロジック
    let useItemTrigger = false;
    let isForwardThrow = true;

    if (physics.holdingItem && gameState) {
      aiKart._itemHoldTime = (aiKart._itemHoldTime || 0) + dt;

      // 取得後1秒間は即座に使わず状況判断
      if (aiKart._itemHoldTime > 1.2) {
        const itemType = physics.holdingItem.type;

        if (itemType === 'red_shell' || itemType === 'green_shell') {
          // 前方に敵カートがいるか探索（35m以内）
          const allKarts = [gameState.localPlayerKart, ...Array.from(gameState.otherPlayers.values()).map(p => p.physics)];
          for (const other of allKarts) {
            if (!other || other === physics) continue;
            const toOther = new THREE.Vector3().subVectors(other.mesh.position, mesh.position);
            toOther.y = 0;
            const dist = toOther.length();
            if (dist > 3.0 && dist < 36.0) {
              const fwd = toOther.dot(kartForward);
              if (fwd > dist * 0.75) {
                // 前方約40度以内のコーン内にライバルを発見 -> 発射！
                useItemTrigger = true;
                isForwardThrow = true;
                aiKart._itemHoldTime = 0;
                break;
              }
            }
          }
        } else if (itemType === 'banana' || itemType === 'bobomb') {
          // 後方に接近するライバルがいるか（15m以内）
          let hasChaser = false;
          const allKarts = [gameState.localPlayerKart, ...Array.from(gameState.otherPlayers.values()).map(p => p.physics)];
          for (const other of allKarts) {
            if (!other || other === physics) continue;
            const toOther = new THREE.Vector3().subVectors(other.mesh.position, mesh.position);
            toOther.y = 0;
            const dist = toOther.length();
            if (dist < 15.0 && toOther.dot(kartForward) < -2.0) {
              hasChaser = true;
              break;
            }
          }
          if (hasChaser || aiKart._itemHoldTime > 7.0) {
            // 後方に投下
            useItemTrigger = true;
            isForwardThrow = false;
            aiKart._itemHoldTime = 0;
          }
        } else if (itemType === 'mushroom' || itemType === 'golden_mushroom' || itemType === 'star') {
          // 直線またはコーナー脱出時（ステアが緩い時）に加速使用
          if (Math.abs(steer) < 0.35 || physics.speed < 22.0) {
            useItemTrigger = true;
            aiKart._itemHoldTime = 0;
          }
        } else if (itemType === 'lightning') {
          useItemTrigger = true;
          aiKart._itemHoldTime = 0;
        }
      }
    } else {
      aiKart._itemHoldTime = 0;
    }

    // アイテム発射実行
    if (useItemTrigger && physics.holdingItem) {
      const item = physics.holdingItem;
      item.use(physics, gameState, isForwardThrow ? 'forward' : 'backward');
      item.remainingUses = (item.remainingUses || 1) - 1;
      if (item.remainingUses <= 0) {
        physics.holdingItem = null;
        physics.removeTrailingMesh(gameState);
      }
    }

    const aiInput = {
      steering: steer,
      accelerating: accel,
      braking: brake,
      drift,
      itemHeld: false,
      useItemTrigger: false
    };

    physics.update(dt, aiInput, curve, courseConfig.trackWidth, gameState);
  }
}
