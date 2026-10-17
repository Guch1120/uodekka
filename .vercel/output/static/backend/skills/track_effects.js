// 描画・通信から独立した、痕跡とスキル回復ゲートの走行判定。
export const TRACK_EFFECTS_VERSION = 1;
export const TRACK_EFFECTS = Object.freeze({
  maxTraces: 8, spacing: 40, traceLength: 10, traceWidth: 4.5,
  lifetime: 60, outerLifetimeBonus: 30, fadeSeconds: 8,
  boostMultiplier: 1.3, boostSeconds: 0.8, boostInterval: 1.5,
  recoverySeconds: 4, gateLength: 4, gateWidth: 6
});
export const wrappedDistance = (a, b, length) => ((a - b + length * 1.5) % length) - length / 2;

function intersects(a, b, halfLength, halfWidth) {
  let enter = 0, exit = 1;
  for (const [start, end, extent] of [[a.x, b.x, halfLength], [a.y, b.y, halfWidth]]) {
    const delta = end - start;
    if (Math.abs(delta) < 1e-8) { if (Math.abs(start) > extent) return false; continue; }
    const p = (-extent - start) / delta, q = (extent - start) / delta;
    enter = Math.max(enter, Math.min(p, q)); exit = Math.min(exit, Math.max(p, q));
    if (enter > exit) return false;
  }
  return true;
}

export class TrackEffects {
  constructor(length, trackWidth, gates = []) {
    this.length = length; this.trackWidth = trackWidth; this.gates = gates;
    this.elapsed = 0; this.traces = []; this.nextId = 1; this.racers = new Map();
    this.enabled = true; this.lastSnapshotTime = -1;
  }
  validSample(sample) {
    return sample && Number.isFinite(sample.t) && sample.t >= 0 && sample.t < 1
      && Number.isFinite(sample.offset) && Math.abs(sample.offset) <= this.trackWidth / 2
      && Number.isInteger(sample.lap) && sample.lap >= 0 && sample.lap <= 100;
  }
  addTrace(sample, outerRatio = 0) {
    if (!this.enabled || !this.validSample(sample) || !sample.grounded || Math.abs(sample.offset) + TRACK_EFFECTS.traceWidth / 2 > this.trackWidth / 2 || this.traces.length >= TRACK_EFFECTS.maxTraces) return null;
    if (this.traces.some(trace => Math.abs(wrappedDistance(sample.t * this.length, trace.t * this.length, this.length)) < TRACK_EFFECTS.spacing)) return null;
    const lifetime = TRACK_EFFECTS.lifetime + TRACK_EFFECTS.outerLifetimeBonus * Math.max(0, Math.min(1, outerRatio));
    const trace = { id: this.nextId++, t: sample.t, offset: sample.offset, born: this.elapsed, lifetime };
    this.traces.push(trace);
    return trace;
  }
  update(dt) {
    if (!Number.isFinite(dt)) return;
    this.elapsed += Math.max(0, Math.min(0.1, dt));
    this.traces = this.traces.filter(trace => this.elapsed < trace.born + trace.lifetime);
  }
  opacity(trace) {
    const remaining = Math.max(0, trace.born + trace.lifetime - this.elapsed);
    return (0.72 + 0.14 * Math.sin(this.elapsed * Math.PI)) * Math.min(1, remaining / TRACK_EFFECTS.fadeSeconds);
  }
  snapshot() {
    return { version: TRACK_EFFECTS_VERSION, enabled: this.enabled, elapsed: this.elapsed, traces: this.traces.map(t => ({ ...t })) };
  }
  applySnapshot(snapshot) {
    if (snapshot?.version !== TRACK_EFFECTS_VERSION || !Number.isFinite(snapshot.elapsed)
      || snapshot.elapsed < this.lastSnapshotTime || snapshot.elapsed < 0 || snapshot.elapsed > 86400
      || typeof snapshot.enabled !== 'boolean' || !Array.isArray(snapshot.traces) || snapshot.traces.length > TRACK_EFFECTS.maxTraces) return false;
    const traces = [];
    for (const trace of snapshot.traces) {
      if (!Number.isInteger(trace.id) || trace.id <= 0 || traces.some(t => t.id === trace.id)
        || !this.validSample({ ...trace, lap: 1 }) || !Number.isFinite(trace.born) || trace.born < 0 || trace.born > snapshot.elapsed
        || !Number.isFinite(trace.lifetime) || trace.lifetime < TRACK_EFFECTS.lifetime
        || trace.lifetime > TRACK_EFFECTS.lifetime + TRACK_EFFECTS.outerLifetimeBonus) return false;
      if (traces.some(t => Math.abs(wrappedDistance(t.t * this.length, trace.t * this.length, this.length)) < TRACK_EFFECTS.spacing)) return false;
      if (trace.born + trace.lifetime > snapshot.elapsed) traces.push({ id: trace.id, t: trace.t, offset: trace.offset, born: trace.born, lifetime: trace.lifetime });
    }
    this.lastSnapshotTime = snapshot.elapsed;
    this.elapsed = snapshot.elapsed; this.traces = traces; this.enabled = snapshot.enabled;
    this.nextId = Math.max(this.nextId, ...traces.map(trace => trace.id + 1));
    return true;
  }
  stepRacer(id, sample, skillState) {
    let state = this.racers.get(id);
    if (!state) { state = { previous: null, used: new Map(), lastBoost: -Infinity }; this.racers.set(id, state); }
    const activeIds = new Set(this.traces.map(t => `trace:${t.id}`));
    for (const key of state.used.keys()) if (key.startsWith('trace:') && !activeIds.has(key)) state.used.delete(key);
    const previous = state.previous;
    state.previous = this.validSample(sample) && sample.grounded ? { ...sample } : null;
    if (!this.enabled || !previous || !state.previous || sample.speed <= 0) return [];
    const movement = wrappedDistance(sample.t * this.length, previous.t * this.length, this.length);
    // テレポート・復帰・逆走による取得を防ぎ、通常の高速移動は線分で判定する。
    if (movement <= 0 || movement > 35 || Math.abs(sample.offset - previous.offset) > this.trackWidth / 2) return [];
    const events = [];
    for (const [kind, objects, length, width] of [
      ['trace', this.traces, TRACK_EFFECTS.traceLength, TRACK_EFFECTS.traceWidth],
      ['gate', this.gates, TRACK_EFFECTS.gateLength, TRACK_EFFECTS.gateWidth]
    ]) {
      for (const object of objects) {
        const endX = wrappedDistance(sample.t * this.length, object.t * this.length, this.length);
        const start = { x: endX - movement, y: previous.offset - object.offset };
        const end = { x: endX, y: sample.offset - object.offset };
        const key = `${kind}:${object.id}`;
        const inside = Math.abs(end.x) <= length / 2 && Math.abs(end.y) <= width / 2;
        if (state.used.get(key) === sample.lap || !intersects(start, end, length / 2, width / 2)) continue;
        if (kind === 'trace') {
          // 板の上では加速せず、縁から抜けた瞬間にだけ発動する。寿命切れは出口に数えない。
          if (inside || this.elapsed - state.lastBoost < TRACK_EFFECTS.boostInterval) continue;
          state.used.set(key, sample.lap); state.lastBoost = this.elapsed;
          events.push({ type: 'trace-boost', object });
        } else {
          state.used.set(key, sample.lap);
          if (!skillState?.isUnlocked || !(skillState.cooldown > 0)) continue;
          const recovered = Math.min(TRACK_EFFECTS.recoverySeconds, skillState.cooldown);
          skillState.cooldown -= recovered;
          events.push({ type: 'skill-recovery', object, recovered });
        }
      }
    }
    return events;
  }
}
