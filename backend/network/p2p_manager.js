import { loadIceConfig } from './ice_config.js';

const VEHICLES = new Set(['standard_red', 'speed_blue', 'handling_green']);
const COURSES = new Set(['course1', 'course2', 'course3']);
const profile = (data = {}) => ({
  name: String(data.name || 'プレイヤー').trim().slice(0, 20) || 'プレイヤー',
  vehicleKey: VEHICLES.has(data.vehicleKey) ? data.vehicleKey : 'standard_red'
});
const failure = (code, message, retryable = false) => Object.assign(new Error(message), { code, retryable });
const cancelled = () => failure('cancelled', '接続をキャンセルしました。');

export class P2PManager {
  constructor(options = {}) {
    this.configProvider = options.configProvider || loadIceConfig;
    this.timeouts = { signaling: 15000, connecting: 20000, progress: 10000, maximum: 40000, handshake: 10000, request: 1000, retry: 1000, ...options.timeouts };
    this.generation = 0;
    this.connections = [];
    this.members = [];
    this.peer = null;
    this.hostConnection = null;
    this.roomId = null;
    this.myPeerId = null;
    this.isHost = false;
    this.courseId = null;
    this.phase = 'lobby';
    this.diagnostics = [];
    this.connectionStage = 'idle';
    this.networkConfig = null;
    this.attempt = 0;
  }

  static normalizeRoomId(value) {
    const id = String(value || '').trim().toLowerCase();
    // PeerJS rejects trailing or consecutive hyphens; match its ID rules.
    if (id.length < 3 || id.length > 32 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw failure('invalid-id', 'ルームIDは3〜32文字の半角英数字で入力してください。ハイフンは文字の間に1つずつ使えます。');
    }
    return id;
  }

  record(event, detail = {}) {
    this.diagnostics.push({ elapsedMs: Date.now() - (this.startedAt || Date.now()), attempt: this.attempt, event, ...detail });
    if (this.diagnostics.length > 80) this.diagnostics.shift();
  }

  report(stage, message) {
    this.connectionStage = stage;
    this.record(stage);
    this.onConnectionStatus?.({ stage, message, attempt: this.attempt, relayConfigured: !!this.networkConfig?.relayConfigured });
  }

  getDiagnostics() {
    // No IP addresses, peer IDs, room names, SDP, URLs or credentials.
    return JSON.stringify({ stage: this.connectionStage, relayConfigured: !!this.networkConfig?.relayConfigured, events: this.diagnostics }, null, 2);
  }

  async beginOperation() {
    this.leaveRoom();
    const operation = new AbortController();
    this.operation = operation;
    this.startedAt = Date.now(); this.diagnostics = []; this.attempt = 1; this.networkConfig = null;
    this.report('configuration', '通信設定を確認しています…');
    const config = await this.configProvider({ signal: operation.signal });
    if (operation.signal.aborted || this.operation !== operation) throw cancelled();
    this.networkConfig = config;
    this.record('relay-configuration', { available: !!config.relayConfigured, reason: config.reason || null });
    return operation;
  }

  peerError(error) {
    const type = error?.type;
    if (type === 'unavailable-id') return failure(type, 'このルームIDは使用中です。別のIDを設定してください。');
    if (type === 'peer-unavailable') return failure(type, 'ルームが見つかりません。IDとホストの接続を確認してください。');
    if (type === 'webrtc') return failure('ice-failed', 'ホストとの通信経路を確立できませんでした。', true);
    if (type === 'invalid-id') return failure(type, 'ルームIDの形式を確認してください。');
    if (type === 'browser-incompatible') return failure(type, 'このブラウザでは通信できません。SafariまたはChromeの最新版で開いてください。');
    return failure('signaling-error', '接続案内サーバーと通信できません。通信環境を確認してください。', true);
  }

  async initPeer(id, relayOnly = false) {
    if (typeof window.Peer !== 'function') throw failure('library-unavailable', '通信ライブラリを読み込めません。再読み込みしてください。');
    const generation = this.generation;
    this.report('signaling', '接続案内サーバーに接続しています…');
    return new Promise((resolve, reject) => {
      let opened = false, settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (this.pendingReject === finish) this.pendingReject = null;
        if (error) reject(error); else resolve(this.myPeerId);
      };
      const timer = setTimeout(() => finish(failure('signaling-timeout', '接続案内サーバーへの接続がタイムアウトしました。', true)), this.timeouts.signaling);
      this.pendingReject = finish;
      let peer;
      try {
        peer = new window.Peer(id, { config: { iceServers: this.networkConfig.iceServers, iceTransportPolicy: relayOnly ? 'relay' : 'all' } });
      } catch { finish(failure('peer-initialization', '通信を開始できません。ブラウザと通信設定を確認してください。')); return; }
      this.peer = peer;
      peer.on('open', peerId => {
        if (generation !== this.generation) return;
        opened = true; this.myPeerId = peerId;
        clearTimeout(this.reconnectTimer); this.reconnectAttempts = 0;
        if (this.reconnecting) { this.reconnecting = false; this.report('signaling-restored', '接続案内サーバーとの通信が復旧しました。'); }
        finish();
      });
      peer.on('error', error => {
        if (generation !== this.generation) return;
        this.record('peer-error', { code: ['unavailable-id', 'peer-unavailable', 'invalid-id', 'browser-incompatible', 'network', 'socket-error', 'server-error', 'webrtc'].includes(error?.type) ? error.type : 'other' });
        if (!opened) finish(this.peerError(error));
        else if (this.pendingReject) this.pendingReject(this.peerError(error));
        else if (['network', 'socket-error', 'server-error'].includes(error?.type)) this.recoverSignaling(peer, generation);
        // A single failed guest's ICE negotiation must not close the host's room.
        else if (this.isHost && error?.type === 'webrtc') this.report('guest-connection-failed', '参加者との経路を確立できませんでした。ルームは待機を続けます。');
        else { this.onConnectionError?.(this.peerError(error).message); }
      });
      peer.on('disconnected', () => {
        if (generation !== this.generation) return;
        if (!opened) finish(failure('signaling-disconnected', '接続案内サーバーとの通信が切れました。', true));
        else if (this.pendingReject) this.pendingReject(failure('signaling-disconnected', '接続案内サーバーとの通信が切れました。', true));
        else this.recoverSignaling(peer, generation);
      });
    });
  }

  recoverSignaling(peer, generation) {
    if (this.reconnecting || generation !== this.generation) return;
    this.reconnecting = true; this.reconnectAttempts = 0;
    const reconnect = () => {
      if (generation !== this.generation) return;
      if (++this.reconnectAttempts > 2 || peer.destroyed) {
        this.reconnecting = false;
        this.report('signaling-lost', '接続案内サーバーに復帰できません。新しい参加者を受け入れるにはルームを作り直してください。');
        return;
      }
      this.report('signaling-reconnecting', '接続案内サーバーに再接続しています…');
      try { peer.reconnect(); } catch { /* Bounded second attempt below. */ }
      this.reconnectTimer = setTimeout(reconnect, 4000);
    };
    reconnect();
  }

  observeConnection(conn, generation, progress = () => {}, failed = () => {}) {
    const pc = conn.peerConnection;
    if (!pc?.addEventListener) return;
    pc.addEventListener('icecandidate', e => {
      if (generation !== this.generation || !e.candidate) return;
      this.record('ice-candidate', { kind: ['host', 'srflx', 'relay', 'prflx'].includes(e.candidate.type) ? e.candidate.type : 'other' });
      progress();
    });
    pc.addEventListener('icecandidateerror', e => {
      if (generation === this.generation) this.record('ice-server-error', { code: e.errorCode });
    });
    pc.addEventListener('iceconnectionstatechange', () => {
      if (generation !== this.generation) return;
      this.record('ice-state', { state: pc.iceConnectionState });
      if (['checking', 'connected', 'completed'].includes(pc.iceConnectionState)) progress();
      if (pc.iceConnectionState === 'failed') failed();
    });
  }

  async reportRoute(conn, generation) {
    try {
      const stats = await conn.peerConnection?.getStats();
      if (generation !== this.generation || !stats) return;
      let pair;
      stats.forEach(s => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId); });
      if (!pair) stats.forEach(s => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
      if (pair) this.record('selected-route', { relay: [pair.localCandidateId, pair.remoteCandidateId].some(id => stats.get(id)?.candidateType === 'relay') });
    } catch { /* Stats are optional on older browsers. */ }
  }

  async createRoom(initialData = {}) {
    const roomId = P2PManager.normalizeRoomId(initialData.roomId);
    const operation = await this.beginOperation();
    try {
      await this.initPeer(`uodekka-${roomId}`);
      if (operation.signal.aborted) throw cancelled();
      this.isHost = true; this.roomId = roomId; this.phase = 'lobby';
      this.members = [{ id: this.myPeerId, ...profile(initialData), isHost: true }];
      const generation = this.generation;
      this.peer.on('connection', conn => {
        if (generation === this.generation) this.setupHostConnection(conn); else conn.close();
      });
      this.publishRoom();
      this.report('waiting', 'ルームを作成しました。ホストはこの画面を開いたままお待ちください。');
      return roomId;
    } catch (error) {
      if (this.operation === operation) this.resetTransport();
      throw error;
    }
  }

  setupHostConnection(conn) {
    const generation = this.generation;
    this.observeConnection(conn, generation);
    conn.on('data', data => {
      if (generation === this.generation && this.connections.includes(conn)) {
        if (data?.type === 'REQUEST_ROOM_STATE') this.publishRoom();
        else this.handleDataFromGuest(conn.peer, data);
      }
    });
    conn.on('open', () => {
      if (generation !== this.generation) { conn.close(); return; }
      if (this.phase !== 'lobby' || this.members.length >= 8) {
        conn.send({ type: 'ROOM_ERROR', message: this.phase !== 'lobby' ? 'レースはすでに開始しています。' : 'ルームは満員です（最大8人）。' });
        setTimeout(() => conn.close(), 250); return;
      }
      this.connections.push(conn);
      this.members.push({ id: conn.peer, ...profile(conn.metadata), isHost: false });
      this.publishRoom(); this.reportRoute(conn, generation);
      this.onPlayerJoined?.(conn.peer);
    });
    const remove = () => {
      if (generation !== this.generation || !this.connections.includes(conn)) return;
      this.connections = this.connections.filter(c => c !== conn);
      this.members = this.members.filter(m => m.id !== conn.peer);
      this.publishRoom(); this.onPlayerLeft?.(conn.peer);
    };
    conn.on('close', remove);
    conn.on('error', () => { remove(); conn.close(); });
  }

  async joinRoom(value, initialData = {}) {
    const roomId = P2PManager.normalizeRoomId(value);
    const operation = await this.beginOperation();
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (operation.signal.aborted || this.operation !== operation) throw cancelled();
      this.attempt = attempt;
      try {
        // A fresh Peer + ICE credentials per retry avoids reusing failed transports.
        await this.initPeer(undefined, attempt > 1 && this.networkConfig.relayConfigured);
        return await this.connectGuest(roomId, initialData);
      } catch (error) {
        if (operation.signal.aborted || this.operation !== operation) throw cancelled();
        this.record('attempt-failed', { code: error.code || 'connection-error' });
        this.resetTransport();
        if (!error.retryable || attempt === 2) {
          this.report('failed', error.message);
          throw error;
        }
        this.report('retrying', this.networkConfig.relayConfigured ? '中継経路を優先して再接続します（2/2）…' : '通信経路を再確認します（2/2）…');
        if (operation.signal.aborted || this.operation !== operation) throw cancelled();
        await new Promise((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(cancelled()); };
          const timer = setTimeout(() => { operation.signal.removeEventListener('abort', abort); resolve(); }, this.timeouts.retry);
          operation.signal.addEventListener('abort', abort, { once: true });
        });
        const config = await this.configProvider({ signal: operation.signal });
        if (operation.signal.aborted || this.operation !== operation) throw cancelled();
        this.networkConfig = config;
      }
    }
  }

  connectGuest(roomId, initialData) {
    const generation = this.generation;
    this.report('connecting', `ホストとの通信経路を確立しています（${this.attempt}/2）…`);
    return new Promise((resolve, reject) => {
      let joined = false, settled = false, timer, requestTimer, conn;
      const began = Date.now();
      const cleanup = () => { clearTimeout(timer); clearInterval(requestTimer); if (this.pendingReject === fail) this.pendingReject = null; };
      const fail = error => { if (settled) return; settled = true; cleanup(); reject(error); };
      const timeoutError = () => this.connectionStage === 'room-sync'
        ? failure('room-sync-timeout', '通信はつながりましたが、ホストからルーム情報を受信できませんでした。', true)
        : failure('connection-timeout', this.networkConfig.relayConfigured
          ? 'ホストとの通信経路を確立できませんでした。ホストの画面・通信環境を確認してください。'
          : 'ホストとの直接通信を確立できませんでした。中継サーバーが未設定または利用できません。', true);
      const arm = delay => { clearTimeout(timer); timer = setTimeout(() => fail(timeoutError()), Math.max(1, Math.min(delay, this.timeouts.maximum - (Date.now() - began)))); };
      this.pendingReject = fail;
      try { conn = this.peer.connect(`uodekka-${roomId}`, { reliable: true, metadata: profile(initialData) }); }
      catch { fail(failure('connection-error', 'ホストへの接続を開始できませんでした。', true)); return; }
      arm(this.timeouts.connecting);
      this.observeConnection(conn, generation, () => {
        if (!settled && this.connectionStage === 'connecting') arm(Math.max(this.timeouts.progress, this.timeouts.connecting - (Date.now() - began)));
      }, () => {
        if (!settled) fail(failure('ice-failed', '通信経路の確立に失敗しました。中継経路を含めて再確認します。', true));
      });
      conn.on('open', () => {
        if (generation !== this.generation || (settled && !joined)) { conn.close(); return; }
        this.hostConnection = conn; this.roomId = roomId;
        if (joined) return;
        this.report('room-sync', '通信がつながりました。ルーム情報を受信しています…');
        arm(this.timeouts.handshake);
        const request = () => { if (conn.open) conn.send({ type: 'REQUEST_ROOM_STATE' }); };
        request(); requestTimer = setInterval(request, this.timeouts.request);
      });
      conn.on('data', data => {
        if (generation !== this.generation || (settled && !joined) || !data || typeof data !== 'object') return;
        if (data.type === 'ROOM_ERROR') { fail(failure('room-rejected', String(data.message).slice(0, 140))); return; }
        if (data.type === 'ROOM_STATE' && data.roomId === roomId && Array.isArray(data.members) && data.members.some(m => m.id === this.myPeerId)) {
          // Initialize identity even if the first message races the local open callback.
          this.hostConnection = conn; this.roomId = roomId;
          this.handleDataFromHost(data);
          if (!joined) {
            joined = true; settled = true; cleanup();
            this.report('connected', 'ルームに接続しました。');
            this.reportRoute(conn, generation); resolve(conn);
          }
        } else if (joined) this.handleDataFromHost(data);
      });
      const lost = () => {
        if (generation !== this.generation) return;
        if (!joined) fail(failure('connection-closed', 'ホストとの接続が閉じられました。', true));
        else { this.leaveRoom(); this.onDisconnected?.('ホストとの通信が切れました。'); }
      };
      conn.on('error', lost); conn.on('close', lost);
    });
  }

  publishRoom() {
    if (!this.isHost) return;
    const state = { type: 'ROOM_STATE', roomId: this.roomId, members: this.members, courseId: this.courseId, phase: this.phase };
    this.broadcast(state);
    this.onRoomState?.(state);
  }

  selectCourse(courseId) {
    if (!this.isHost || this.phase !== 'lobby' || !COURSES.has(courseId)) return false;
    this.courseId = courseId;
    this.publishRoom();
    return true;
  }

  broadcastStartRace() {
    if (!this.isHost || this.phase !== 'lobby' || !COURSES.has(this.courseId)) return false;
    this.phase = 'starting';
    const data = { type: 'START_RACE', courseId: this.courseId, delayMs: 2200 };
    this.publishRoom();
    this.broadcast(data);
    this.onGameStart?.(data);
    return true;
  }

  broadcast(data) {
    if (this.isHost) this.connections.forEach(conn => { if (conn.open) conn.send(data); });
    else if (this.hostConnection?.open) this.hostConnection.send(data);
  }

  sendKartState(state) {
    if (!this.roomId) return;
    this.broadcast({ type: 'KART_STATE', senderId: this.myPeerId, time: performance.now(), state });
  }

  handleDataFromGuest(senderPeerId, data) {
    if (!this.isHost || !this.members.some(m => m.id === senderPeerId) || !data || typeof data !== 'object') return;
    // Only the host can change room state or send START_RACE.
    if (data.type === 'KART_STATE' && data.state) {
      const payload = { ...data, senderId: senderPeerId };
      this.onPeerStateReceived?.(senderPeerId, data.state);
      this.connections.forEach(c => { if (c.peer !== senderPeerId && c.open) c.send(payload); });
    } else if (data.type === 'ITEM_USE') {
      const payload = { ...data, senderId: senderPeerId };
      this.onItemEvent?.(payload);
      this.broadcast(payload);
    }
  }

  handleDataFromHost(data) {
    if (this.isHost || !data || typeof data !== 'object') return;
    if (data.type === 'ROOM_STATE' && data.roomId === this.roomId && Array.isArray(data.members)) {
      this.members = data.members.slice(0, 8).map(m => ({ id: String(m.id), ...profile(m), isHost: m.id === this.hostConnection?.peer }));
      this.courseId = COURSES.has(data.courseId) ? data.courseId : null;
      this.phase = data.phase;
      this.onRoomState?.({ ...data, members: this.members, courseId: this.courseId });
    } else if (data.type === 'START_RACE' && COURSES.has(data.courseId) && !this.receivedStart) {
      this.receivedStart = true;
      this.phase = 'starting';
      this.onGameStart?.({ ...data, delayMs: 2200 });
    } else if (data.type === 'KART_STATE' && data.state && data.senderId !== this.myPeerId) {
      this.onPeerStateReceived?.(data.senderId, data.state);
    } else if (data.type === 'ITEM_USE') this.onItemEvent?.(data);
  }


  resetTransport() {
    this.generation++;
    clearTimeout(this.reconnectTimer);
    this.reconnecting = false;
    const cancel = this.pendingReject;
    this.pendingReject = null;
    cancel?.(cancelled());
    this.peer?.destroy();
    this.peer = null;
    this.connections = [];
    this.hostConnection = null;
    this.members = [];
    this.roomId = null;
    this.myPeerId = null;
    this.isHost = false;
    this.courseId = null;
    this.phase = 'lobby';
    this.receivedStart = false;
  }

  leaveRoom() {
    this.operation?.abort();
    this.operation = null;
    this.resetTransport();
  }

  get peers() { return this.connections; }
}
