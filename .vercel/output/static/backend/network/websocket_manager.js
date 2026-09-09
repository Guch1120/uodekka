import { normalizeRoomId } from './room_id.js';

const VEHICLES = new Set(['standard_red', 'speed_blue', 'handling_green']);
const COURSES = new Set(['course1', 'course2', 'course3']);
const profile = data => ({ name: String(data?.name || 'プレイヤー').trim().slice(0, 20) || 'プレイヤー', vehicleKey: VEHICLES.has(data?.vehicleKey) ? data.vehicleKey : 'standard_red' });

export class WebSocketManager {
  constructor(options = {}) {
    this.url = options.url || globalThis.MULTIPLAYER_SERVER_URL || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    this.timeouts = { connecting: 12000, reconnect: 1000, ...options.timeouts };
    this.socket = null; this.roomId = null; this.myPeerId = null; this.isHost = false;
    this.members = []; this.courseId = null; this.phase = 'lobby'; this.connectionStage = 'idle'; this.diagnostics = [];
    this.connectionAttempt = 0; this.reconnectTimer = null; this.reconnectCount = 0;
  }
  record(event, detail = {}) { this.diagnostics.push({ elapsedMs: Date.now() - (this.startedAt || Date.now()), event, ...detail }); if (this.diagnostics.length > 80) this.diagnostics.shift(); }
  report(stage, message) { this.connectionStage = stage; this.record(stage); this.onConnectionStatus?.({ stage, message, attempt: this.connectionAttempt, relayConfigured: false }); }
  getDiagnostics() { return JSON.stringify({ transport: 'websocket', stage: this.connectionStage, events: this.diagnostics }, null, 2); }
  connect(endpoint = this.url) {
    return new Promise((resolve, reject) => {
      let settled = false; const timer = setTimeout(() => { if (!settled) { settled = true; this.socket?.close(); reject(Object.assign(new Error('ゲームサーバーへの接続がタイムアウトしました。'), { retryable: true })); } }, this.timeouts.connecting);
      let socket;
      try { socket = new WebSocket(endpoint); } catch { clearTimeout(timer); reject(new Error('ゲームサーバーへ接続できません。')); return; }
      this.socket = socket;
      socket.addEventListener('open', () => { if (settled) return; clearTimeout(timer); settled = true; this.reconnectCount = 0; resolve(socket); });
      socket.addEventListener('message', event => this.handleMessage(event.data));
      socket.addEventListener('close', () => { if (!settled) { clearTimeout(timer); settled = true; reject(Object.assign(new Error('ゲームサーバーへの接続が切れました。'), { retryable: true })); } else if (this.roomId) this.reconnect(); });
      socket.addEventListener('error', () => { if (!settled) { clearTimeout(timer); settled = true; reject(Object.assign(new Error('ゲームサーバーと通信できません。'), { retryable: true })); } });
    });
  }
  async createRoom(data = {}) { return this.openRoom('CREATE_ROOM', data.roomId, data); }
  async joinRoom(roomId, data = {}) { return this.openRoom('JOIN_ROOM', roomId, data); }
  async openRoom(type, roomId, data) {
    const id = normalizeRoomId(roomId);
    this.leaveRoom(); this.startedAt = Date.now(); this.connectionAttempt++; this.report('connecting', 'ゲームサーバーへ接続しています…');
    const endpoint = new URL(this.url, location.href); endpoint.searchParams.set('room', id);
    await this.connect(endpoint.toString()); this.pendingRoom = { type, roomId: id, ...profile(data) }; this.report('signaling', 'ルームを確認しています…');
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve; this.pendingReject = reject;
      this.roomTimer = setTimeout(() => { this.pendingReject = null; reject(Object.assign(new Error('ルームへの参加がタイムアウトしました。'), { retryable: true })); this.leaveRoom(); }, this.timeouts.connecting);
      this.send(this.pendingRoom);
    });
  }
  handleMessage(raw) {
    let data; try { data = JSON.parse(raw); } catch { return; }
    if (data.type === 'WELCOME') { this.myPeerId = data.id; this.isHost = !!data.isHost; return; }
    if (data.type === 'ROOM_ERROR') { clearTimeout(this.roomTimer); const error = Object.assign(new Error(String(data.message || 'ルームに参加できません。')), { code: data.code, retryable: false }); this.pendingReject?.(error); this.pendingReject = null; this.onConnectionError?.(error.message); return; }
    if (data.type === 'ROOM_STATE') {
      clearTimeout(this.roomTimer); this.roomId = data.roomId; this.members = Array.isArray(data.members) ? data.members.slice(0, 8) : []; this.courseId = COURSES.has(data.courseId) ? data.courseId : null; this.phase = data.phase || 'lobby';
      this.isHost = this.members.some(member => member.id === this.myPeerId && member.isHost); this.onRoomState?.(data);
      if (this.pendingResolve) { const done = this.pendingResolve; this.pendingResolve = null; this.report('connected', 'ルームに接続しました。'); done(this.roomId); }
      return;
    }
    if (data.type === 'START_RACE') { this.phase = 'starting'; this.onGameStart?.(data); return; }
    if (data.type === 'KART_STATE' && data.state && data.senderId !== this.myPeerId) this.onPeerStateReceived?.(data.senderId, data.state);
    if (data.type === 'CPU_STATES' && Array.isArray(data.states) && !this.isHost) this.onCpuStatesReceived?.(data.states);
    if (data.type === 'ITEM_USE' && data.senderId !== this.myPeerId) this.onItemEvent?.(data);
  }
  send(data) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(data));
      } catch (err) {
        this.record('send-error', { error: err?.message });
        throw err;
      }
    }
  }
  selectCourse(courseId) { if (!this.isHost || !COURSES.has(courseId)) return false; this.courseId = courseId; this.send({ type: 'SELECT_COURSE', courseId }); return true; }
  broadcastStartRace(aiRacers = []) { if (!this.isHost || !this.courseId || this.phase !== 'lobby') return false; this.phase = 'starting'; this.send({ type: 'START_RACE', aiRacers }); return true; }
  sendKartState(state) {
    if (!this.roomId || this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > 32768) {
      this.record('backpressure-drop', { type: 'KART_STATE', bufferedAmount: this.socket.bufferedAmount });
      return;
    }
    this.send({ type: 'KART_STATE', state });
  }
  sendCpuStates(states) {
    if (!this.isHost || !this.roomId || this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > 32768) {
      this.record('backpressure-drop', { type: 'CPU_STATES', bufferedAmount: this.socket.bufferedAmount });
      return;
    }
    this.send({ type: 'CPU_STATES', states });
  }
  sendItemEvent(data) { this.send({ type: 'ITEM_USE', ...data }); }
  reconnect() { if (this.reconnectTimer || !this.roomId) return; this.report('reconnecting', 'ゲームサーバーに再接続しています…'); this.reconnectTimer = setTimeout(async () => { this.reconnectTimer = null; if (++this.reconnectCount > 3) return this.onDisconnected?.('ゲームサーバーに再接続できません。'); try { const endpoint = new URL(this.url, location.href); endpoint.searchParams.set('room', this.roomId); await this.connect(endpoint.toString()); this.send({ type: 'JOIN_ROOM', roomId: this.roomId, name: this.members.find(m => m.id === this.myPeerId)?.name, vehicleKey: this.members.find(m => m.id === this.myPeerId)?.vehicleKey }); } catch { this.reconnect(); } }, this.timeouts.reconnect); }
  leaveRoom() { clearTimeout(this.roomTimer); clearTimeout(this.reconnectTimer); this.reconnectTimer = null; this.pendingReject?.(new Error('接続をキャンセルしました。')); this.pendingReject = null; this.pendingResolve = null; const socket = this.socket; this.socket = null; socket?.close(); this.roomId = null; this.myPeerId = null; this.isHost = false; this.members = []; this.courseId = null; this.phase = 'lobby'; }
}
