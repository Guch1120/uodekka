// backend/missions/mission_definitions.js
// ミッション形式スキルアップシステムのデータ定義（描画非依存・THREE.js非依存）
// 車体ごとに固有のミッション3種類、合計12種類を定義する。

export const MISSION_SPEC_VERSION = 1;

// コース別CPU学習レベルがこの値以上の場合のみ、ミッション・途中強化・追加スキル・救済を有効にする
export const CPU_MISSION_MIN_LEVEL = 5;

export const MissionDefinitions = {
  standard_red: [
    {
      id: 'red_accel_master',
      name: '加速マスター',
      vehicleKey: 'standard_red',
      metric: 'accelRecoveryCount',
      thresholds: [2, 5, 9],
      unit: 'count',
      requiresOpponents: false,
      requiresCoins: false,
      requiresItemBoxes: false,
      description: '速度50%未満から90%以上へ回復するごとに1回'
    },
    {
      id: 'red_boost_run',
      name: 'ブーストラン',
      vehicleKey: 'standard_red',
      metric: 'boostRunSeconds',
      thresholds: [2, 6, 12],
      unit: 'seconds',
      requiresOpponents: false,
      requiresCoins: false,
      requiresItemBoxes: false,
      description: '最高速度を超えて走行した累計時間'
    },
    {
      id: 'red_pursuit_charge',
      name: '追撃チャージ',
      vehicleKey: 'standard_red',
      metric: 'pursuitChargePoints',
      thresholds: [5, 15, 30],
      unit: 'points',
      requiresOpponents: true,
      requiresCoins: false,
      requiresItemBoxes: false,
      description: '追い抜きで3点、前方20m以内の相手を速度70%以上で追走すると毎秒1点'
    }
  ],
  speed_blue: [
    {
      id: 'blue_high_cruise',
      name: '高速巡航',
      vehicleKey: 'speed_blue',
      metric: 'highSpeedCruiseSeconds',
      thresholds: [5, 15, 30],
      unit: 'seconds',
      requiresOpponents: false,
      requiresCoins: false,
      requiresItemBoxes: false,
      description: '速度90%以上で走行した累計時間'
    },
    {
      id: 'blue_top_half_keep',
      name: '上位キープ',
      vehicleKey: 'speed_blue',
      metric: 'topHalfKeepPoints',
      thresholds: [8, 24, 48],
      unit: 'points',
      requiresOpponents: true,
      requiresCoins: false,
      requiresItemBoxes: false,
      description: '順位が上位半数なら毎秒2点、それ以外でも速度85%以上なら毎秒1点'
    },
    {
      id: 'blue_straight_mastery',
      name: 'ストレート攻略',
      vehicleKey: 'speed_blue',
      metric: 'straightMasterySeconds',
      thresholds: [3, 9, 18],
      unit: 'seconds',
      requiresOpponents: false,
      requiresCoins: false,
      requiresItemBoxes: false,
      description: '地上で速度85%以上・ステアリング入力の絶対値0.2以下を保った累計時間'
    }
  ],
  handling_green: [
    {
      id: 'green_turbo_craftsman',
      name: 'ターボ職人',
      vehicleKey: 'handling_green',
      metric: 'turboCraftsmanPoints',
      thresholds: [2, 6, 12],
      unit: 'points',
      requiresOpponents: false,
      requiresCoins: false,
      requiresItemBoxes: false,
      description: 'ミニターボ成功で1点、スーパーミニターボ成功で2点'
    },
    {
      id: 'green_coin_line',
      name: 'コインライン',
      vehicleKey: 'handling_green',
      metric: 'coinLineCount',
      thresholds: [3, 8, 15],
      unit: 'count',
      requiresOpponents: false,
      requiresCoins: true,
      requiresItemBoxes: false,
      description: 'コース上のコインを実際に回収した枚数（周回ボーナスを除く）'
    },
    {
      id: 'green_corner_rhythm',
      name: 'コーナーリズム',
      vehicleKey: 'handling_green',
      metric: 'cornerRhythmSeconds',
      thresholds: [3, 9, 18],
      unit: 'seconds',
      requiresOpponents: false,
      requiresCoins: false,
      requiresItemBoxes: false,
      description: '速度60%以上の地上ドリフトの累計時間'
    }
  ],
  heavy_yellow: [
    {
      id: 'yellow_item_ops',
      name: 'アイテム運用',
      vehicleKey: 'heavy_yellow',
      metric: 'itemOpsCount',
      thresholds: [1, 3, 6],
      unit: 'count',
      requiresOpponents: false,
      requiresCoins: false,
      requiresItemBoxes: true,
      description: 'アイテムを実際に消費した回数（三連系は使用1回につき1回）'
    },
    {
      id: 'yellow_pressure_driving',
      name: 'プレッシャー走行',
      vehicleKey: 'heavy_yellow',
      metric: 'pressureDrivingPoints',
      thresholds: [4, 12, 24],
      unit: 'points',
      requiresOpponents: true,
      requiresCoins: false,
      requiresItemBoxes: false,
      description: '相手から10m以内を速度60%以上で走行すると毎秒1点、自分の攻撃アイテムによる有効命中で3点'
    },
    {
      id: 'yellow_heavy_cruise',
      name: '重戦車クルーズ',
      vehicleKey: 'heavy_yellow',
      metric: 'heavyCruisePoints',
      thresholds: [6, 18, 36],
      unit: 'points',
      requiresOpponents: false,
      requiresCoins: false,
      requiresItemBoxes: false,
      description: '地上で速度75%以上を保った累計時間（アイテム所持中は1.5倍）'
    }
  ]
};

// 車体ごとの最大数値強化（最終段階達成で到達する上限、各段階に1/3ずつ配分）
export const NumericBuffTable = {
  standard_red: [{ stat: 'acceleration', maxRatio: 0.12 }],
  speed_blue: [{ stat: 'topSpeed', maxRatio: 0.06 }],
  handling_green: [{ stat: 'miniTurboDuration', maxRatio: 0.20 }],
  heavy_yellow: [{ stat: 'acceleration', maxRatio: 0.08 }, { stat: 'topSpeed', maxRatio: 0.03 }]
};

// 固有スキルの2段階/3段階達成時の追加効果（解禁済みの場合のみ、次回発動から反映）
export const SkillStageEffects = {
  rocket_charge: { stage2: { multiplier: 1.15, duration: 1.0 }, stage3: { multiplier: 1.15, duration: 2.0 }, trigger: 'afterRocketEnds' },
  sky_glider: { stage2: { multiplier: 1.2, duration: 1.0 }, stage3: { multiplier: 1.2, duration: 2.0 }, trigger: 'onFirstLandingAfterSkill' },
  magnet_barrier: { stage2: { multiplier: 1.2, duration: 1.0 }, stage3: { multiplier: 1.2, duration: 2.0 }, trigger: 'onBarrierBlockedHit' },
  giga_stampede: { stage2: { multiplier: 1.15, duration: 1.0 }, stage3: { multiplier: 1.15, duration: 2.0 }, trigger: 'afterGigaEnds' }
};

// 固有スキル未解禁の場合の代替報酬（加速度のみ、恒久解禁状態は変更しない）
export const AlternateRewardWhenLocked = {
  stage2AccelBonus: 0.03,
  stage3AccelBonus: 0.06
};

// 未達成救済の定数
export const RescueConfig = {
  unlockedCooldownCutRatio: 0.30,
  unlockedCurrentTimerMultiplier: 0.7,
  lockedAccelBonus: 0.08,
  lockedTopSpeedBonus: 0.03
};

export function getVehicleMissions(vehicleKey) {
  return MissionDefinitions[vehicleKey] || [];
}
