import { MissionDefinitions, NumericBuffTable, AlternateRewardWhenLocked } from '../backend/missions/mission_definitions.js';
import { drawMission, MissionTracker, isCpuMissionEligible } from '../backend/missions/mission_engine.js';
import { CPU_MISSION_MIN_LEVEL } from '../backend/missions/mission_definitions.js';

const print = console.log;
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

// 1. 全4車体に3種類ずつ存在し、条件（metric）が車体間で重複しない
print('Test 1: mission table shape & uniqueness...');
{
  const vehicleKeys = ['standard_red', 'speed_blue', 'handling_green', 'heavy_yellow'];
  const allMetrics = new Set();
  const allIds = new Set();
  for (const vKey of vehicleKeys) {
    const missions = MissionDefinitions[vKey];
    assert(Array.isArray(missions) && missions.length === 3, `${vKey} should have exactly 3 missions`);
    for (const m of missions) {
      assert(m.thresholds.length === 3, `${m.id} should have 3 thresholds`);
      assert(!allMetrics.has(m.metric), `metric ${m.metric} should not repeat across vehicles`);
      allMetrics.add(m.metric);
      assert(!allIds.has(m.id), `mission id ${m.id} should be unique`);
      allIds.add(m.id);
    }
  }
  print('PASS: mission table shape & uniqueness');
}

// 2. 累積進捗は段階跨ぎでリセットされない
print('Test 2: cumulative progress does not reset across stage boundaries...');
{
  const tracker = new MissionTracker('r1', 'standard_red', { hasOpponents: true }, 'red_boost_run');
  assert(tracker.missionId === 'red_boost_run', 'preset mission id should be honored');
  tracker.addProgress(2); // 初級(2)達成
  assert(tracker.stage === 1, 'stage should be 1 after reaching first threshold');
  assert(tracker.cumulativeProgress === 2, 'cumulativeProgress should be 2');
  tracker.addProgress(4); // 累計6 => 中級(6)達成
  assert(tracker.stage === 2, 'stage should be 2 after reaching second threshold');
  assert(tracker.cumulativeProgress === 6, 'cumulativeProgress should keep accumulating, not reset to 0');
  tracker.addProgress(6); // 累計12 => 最終(12)達成
  assert(tracker.stage === 3, 'stage should be 3 (max) after reaching final threshold');
  assert(tracker.cumulativeProgress === 12, 'cumulativeProgress should reach 12');
  print('PASS: cumulative progress does not reset across stage boundaries');
}

// 3. 数値強化: 1/3・2/3・3/3の境界値と段階内補間
print('Test 3: numeric buff ratio boundaries & partial interpolation...');
{
  const tracker = new MissionTracker('r2', 'standard_red', {}, 'red_boost_run');
  const maxRatio = NumericBuffTable.standard_red.find(e => e.stat === 'acceleration').maxRatio;

  assert(tracker._numericBuffRatio('acceleration') === 0, 'no progress => 0 buff');

  tracker.addProgress(1); // thresholds [2,6,12], stage 0, 1/2 of the way to first threshold
  const partialRatio = tracker._numericBuffRatio('acceleration');
  const expectedPartial = maxRatio * ((0 + 0.5) / 3);
  assert(Math.abs(partialRatio - expectedPartial) < 1e-9, `partial ratio should interpolate within stage 0 (got ${partialRatio}, expected ${expectedPartial})`);

  tracker.addProgress(1); // cumulative 2 => stage 1 (1/3 of max)
  assert(tracker.stage === 1, 'stage should be 1');
  const stage1Ratio = tracker._numericBuffRatio('acceleration');
  assert(Math.abs(stage1Ratio - maxRatio / 3) < 1e-9, `stage1 ratio should be exactly 1/3 of max (got ${stage1Ratio})`);

  tracker.addProgress(4); // cumulative 6 => stage 2 (2/3 of max)
  assert(tracker.stage === 2, 'stage should be 2');
  const stage2Ratio = tracker._numericBuffRatio('acceleration');
  assert(Math.abs(stage2Ratio - (2 * maxRatio) / 3) < 1e-9, `stage2 ratio should be exactly 2/3 of max (got ${stage2Ratio})`);

  tracker.addProgress(6); // cumulative 12 => stage 3 (full max)
  assert(tracker.stage === 3, 'stage should be 3');
  const stage3Ratio = tracker._numericBuffRatio('acceleration');
  assert(Math.abs(stage3Ratio - maxRatio) < 1e-9, `stage3 ratio should equal max ratio exactly (got ${stage3Ratio})`);
  print('PASS: numeric buff ratio boundaries & partial interpolation');
}

// 4. 報酬は一度だけ適用される（同一段階での再計算で多重発火しない）
print('Test 4: stage reward applied only once per transition...');
{
  const tracker = new MissionTracker('r3', 'standard_red', {}, 'red_boost_run');
  tracker.isSkillUnlocked = true;
  tracker.addProgress(6); // stage 2 reached, skill-unlocked branch
  assert(tracker.appliedReward.skillStageUnlocked === 2, 'skillStageUnlocked should be set to 2');
  tracker.appliedReward.skillStageUnlocked = -1; // sentinel to detect re-firing
  tracker._recomputeStage(); // re-invoke with no new progress; should NOT re-fire stage 2
  assert(tracker.appliedReward.skillStageUnlocked === -1, '_onStageAdvanced must not re-fire when stage does not change');
  print('PASS: stage reward applied only once per transition');
}

// 5. 固有スキル解禁済み/未解禁の代替報酬分岐
print('Test 5: alt reward vs skill-unlock branching...');
{
  const locked = new MissionTracker('r4', 'standard_red', {}, 'red_boost_run');
  locked.isSkillUnlocked = false;
  locked.addProgress(6); // stage 2
  assert(locked.appliedReward.altRewardAccelBonus === AlternateRewardWhenLocked.stage2AccelBonus, 'locked stage2 should grant alt accel bonus');
  assert(locked.appliedReward.skillStageUnlocked === 0, 'locked branch must not set skillStageUnlocked');
  locked.addProgress(6); // stage 3
  assert(locked.appliedReward.altRewardAccelBonus === AlternateRewardWhenLocked.stage3AccelBonus, 'locked stage3 should replace with cumulative +6% (not additive with stage2)');

  const unlocked = new MissionTracker('r5', 'standard_red', {}, 'red_boost_run');
  unlocked.isSkillUnlocked = true;
  unlocked.addProgress(12); // straight to stage 3
  assert(unlocked.appliedReward.skillStageUnlocked === 3, 'unlocked branch should set skillStageUnlocked to the highest stage reached');
  assert(unlocked.appliedReward.altRewardAccelBonus === 0, 'unlocked branch must not grant alt accel bonus');
  print('PASS: alt reward vs skill-unlock branching');
}

// 6. 救済: 段階0で3周目突入時に一度だけ発動する
print('Test 6: rescue fires once when stage is 0 at lap-3 entry...');
{
  const tracker = new MissionTracker('r6', 'standard_red', {}, 'red_boost_run');
  tracker.isSkillUnlocked = true;
  assert(tracker.stage === 0, 'no progress yet');
  tracker.onLapEntered(3);
  assert(tracker.rescueActive === true, 'rescue should activate when stage is 0 at lap 3');
  assert(tracker.rescueKind === 'unlocked', 'rescue kind should match skill-unlock state');
  assert(tracker._rescueCooldownCutPending === true, 'unlocked rescue should request a one-time cooldown cut');

  // 二重発動しないことを確認
  tracker._rescueCooldownCutPending = false;
  tracker.onLapEntered(3);
  assert(tracker._rescueCooldownCutPending === false, 'rescue must not re-fire on a second lap-3 entry call');

  // 救済はミッション達成扱いにしない
  assert(tracker.stage === 0, 'rescue must not advance mission stage');
  print('PASS: rescue fires once when stage is 0 at lap-3 entry');
}

// 7. 「2周終了と初級達成が同時」: 進捗確定後に救済判定した場合は救済が発動しない
print('Test 7: progress is finalized before the rescue check on the same tick...');
{
  const tracker = new MissionTracker('r7', 'standard_red', {}, 'red_boost_run');
  // 同一フレーム内で「まず進捗を加算・段階確定」→「その後に救済判定」の順序を模倣
  tracker.addProgress(2); // 初級(2)達成、stage=1
  tracker.onLapEntered(3);
  assert(tracker.rescueActive === false, 'rescue must not fire when stage was already achieved earlier in the same tick');
  print('PASS: progress is finalized before the rescue check on the same tick');
}

// 8. 救済はレース終了まで持続し、その後の達成で取り消されない
print('Test 8: rescue persists even after a later stage achievement...');
{
  const tracker = new MissionTracker('r8', 'standard_red', {}, 'red_boost_run');
  tracker.onLapEntered(3); // stage 0 => rescue fires
  assert(tracker.rescueActive === true, 'rescue should be active');
  tracker.addProgress(2); // 後から初級を達成
  assert(tracker.stage === 1, 'stage should now be 1');
  assert(tracker.rescueActive === true, 'rescue must remain active after a later stage achievement');
  print('PASS: rescue persists even after a later stage achievement');
}

// 9. コース属性（相手なし/コインなし/アイテム箱なし）による抽選除外
print('Test 9: drawMission excludes missions requiring unavailable course capabilities...');
{
  for (let i = 0; i < 50; i++) {
    const m = drawMission('standard_red', { hasOpponents: false });
    assert(m === null || m.requiresOpponents === false, 'should never draw an opponent-dependent red mission when hasOpponents is false');
  }
  for (let i = 0; i < 50; i++) {
    const m = drawMission('handling_green', { hasOpponents: true, hasCoins: false });
    assert(m === null || m.requiresCoins === false, 'should never draw coin_line when hasCoins is false');
  }
  for (let i = 0; i < 50; i++) {
    const m = drawMission('heavy_yellow', { hasOpponents: true, hasItemBoxes: false });
    assert(m === null || m.requiresItemBoxes === false, 'should never draw item_ops when hasItemBoxes is false');
  }
  print('PASS: drawMission excludes missions requiring unavailable course capabilities');
}

// 10. CPUのLv.4／Lv.5境界
print('Test 10: CPU mission eligibility boundary (Lv.4 vs Lv.5)...');
{
  assert(CPU_MISSION_MIN_LEVEL === 5, 'CPU mission gate should be Lv.5 per spec');
  assert(isCpuMissionEligible(4) === false, 'Lv.4 CPU must be ineligible for missions/skills');
  assert(isCpuMissionEligible(5) === true, 'Lv.5 CPU must be eligible for missions/skills');
  assert(isCpuMissionEligible(10) === true, 'Lv.10 CPU must be eligible for missions/skills');
  assert(isCpuMissionEligible(undefined) === false, 'missing/undefined level must default to ineligible (Lv.1 fallback)');
  print('PASS: CPU mission eligibility boundary (Lv.4 vs Lv.5)');
}

// 11. CPU(常にスキル使用可能として扱う)の段階2/3報酬は代替報酬ではなくスキル解放分岐に入る
print('Test 11: CPU (always-unlocked) stage rewards use the skill-unlock branch, not the alt-reward branch...');
{
  const cpuTracker = new MissionTracker('ai_0', 'standard_red', {}, 'red_boost_run');
  cpuTracker.isSkillUnlocked = true; // Lv.5以上のCPUは固有スキル使用可能として扱う
  cpuTracker.addProgress(12); // 最終段階まで到達
  assert(cpuTracker.stage === 3, 'CPU tracker should reach stage 3');
  assert(cpuTracker.appliedReward.skillStageUnlocked === 3, 'CPU stage rewards should unlock skill augment stage 3');
  assert(cpuTracker.appliedReward.altRewardAccelBonus === 0, 'CPU (always-unlocked) must not receive the locked-skill alt reward');
  print('PASS: CPU (always-unlocked) stage rewards use the skill-unlock branch, not the alt-reward branch');
}

print('');
print('ALL MISSION ENGINE TESTS PASSED!');
