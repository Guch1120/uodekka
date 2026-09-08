// A host owns room membership, course selection and the race start signal.
const VEHICLES = new Set(['standard_red', 'speed_blue', 'handling_green']);
const COURSES = new Set(['course1', 'course2', 'course3']);
const profile = (data = {}) => ({
  name: String(data.name || 'プレイヤー').trim().slice(0, 20) || 'プレイヤー',
  vehicleKey: VEHICLES.has(data.vehicleKey) ? data.vehicleKey : 'standard_red'
});

export class P2PManager {
  constructor() {
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
  }

  static normalizeRoomId(value) {
    const id = String(value || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(id)) {
      throw new Error('ルームIDは3〜32文字の半角英数字・ハイフンで入力してください。');
    }
    return id;
  }

  async initPeer(id) {
    if (typeof window.Peer !== 'function') throw new Error('通信ライブラリを読み込めません。再読み込みしてください。');
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      const peer = id ? new window.Peer(id) : new window.Peer();
      this.peer = peer;
      let opened = false;
      const timer = setTimeout(() => {
        if (!opened) { peer.destroy(); reject(new Error('接続がタイムアウトしました。通信環境を確認してください。')); }
      }, 12000);
      peer.on('open', peerId => {
        clearTimeout(timer);
        if (generation !== this.generation) { peer.destroy(); reject(new Error('接続をキャンセルしました。')); return; }
        opened = true;
        this.myPeerId = peerId;
        resolve(peerId);
      });
      peer.on('error', error => {
        clearTimeout(timer);
        const message = error.type === 'unavailable-id'
          ? 'このルームIDは使用中です。別のIDを設定してください。'
          : error.type === 'peer-unavailable'
            ? 'ルームが見つかりません。IDとホストの接続を確認してください。'
            : '通信に失敗しました。接続を確認して再度お試しください。';
        if (!opened) { peer.destroy(); reject(new Error(message)); }
        else if (generation === this.generation) {
          if (this.pendingJoinReject) this.pendingJoinReject(new Error(message));
          else this.onConnectionError?.(message);
        }
      });
      peer.on('disconnected', () => {
        if (generation === this.generation) this.onConnectionError?.('通信サーバーとの接続が切れました。ルームに入り直してください。');
      });
    });
  }

  async createRoom(initialData = {}) {
    const roomId = P2PManager.normalizeRoomId(initialData.roomId);
    this.leaveRoom();
    await this.initPeer(`uodekka-${roomId}`);
    this.isHost = true;
    this.roomId = roomId;
    this.phase = 'lobby';
    this.members = [{ id: this.myPeerId, ...profile(initialData), isHost: true }];
    const generation = this.generation;
    this.peer.on('connection', conn => {
      if (generation === this.generation) this.setupHostConnection(conn);
      else conn.close();
    });
    this.publishRoom();
    return roomId;
  }

  setupHostConnection(conn) {
    const generation = this.generation;
    conn.on('data', data => {
      if (generation === this.generation && this.connections.includes(conn)) this.handleDataFromGuest(conn.peer, data);
    });
    conn.on('open', () => {
      if (generation !== this.generation) { conn.close(); return; }
      if (this.phase !== 'lobby' || this.members.length >= 8) {
        conn.send({ type: 'ROOM_ERROR', message: this.phase !== 'lobby' ? 'レースはすでに開始しています。' : 'ルームは満員です（最大8人）。' });
        setTimeout(() => conn.close(), 250);
        return;
      }
      this.connections.push(conn);
      this.members.push({ id: conn.peer, ...profile(conn.metadata), isHost: false });
      this.publishRoom();
      this.onPlayerJoined?.(conn.peer);
    });
    const remove = () => {
      if (generation !== this.generation || !this.connections.includes(conn)) return;
      this.connections = this.connections.filter(c => c !== conn);
      this.members = this.members.filter(m => m.id !== conn.peer);
      this.publishRoom();
      this.onPlayerLeft?.(conn.peer);
    };
    conn.on('close', remove);
    conn.on('error', () => { remove(); conn.close(); });
  }

  async joinRoom(value, initialData = {}) {
    const roomId = P2PManager.normalizeRoomId(value);
    this.leaveRoom();
    await this.initPeer();
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(`uodekka-${roomId}`, { reliable: true, metadata: profile(initialData) });
      let joined = false;
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pendingJoinReject = null;
        this.leaveRoom();
        reject(error);
      };
      const timer = setTimeout(() => fail(new Error('接続がタイムアウトしました。ルームIDと通信環境を確認してください。')), 12000);
      this.pendingJoinReject = fail;
      conn.on('open', () => {
        if (generation !== this.generation) { conn.close(); return; }
        this.hostConnection = conn;
        this.roomId = roomId;
      });
      conn.on('data', data => {
        if (generation !== this.generation || !data || typeof data !== 'object') return;
        if (data.type === 'ROOM_ERROR') { fail(new Error(String(data.message).slice(0, 140))); return; }
        if (data.type === 'ROOM_STATE' && data.roomId === roomId && Array.isArray(data.members)
          && data.members.some(m => m.id === this.myPeerId)) {
          this.handleDataFromHost(data);
          if (!joined) {
            joined = true; settled = true;
            clearTimeout(timer); this.pendingJoinReject = null;
            resolve(conn);
          }
        } else if (joined) this.handleDataFromHost(data);
      });
      conn.on('error', () => {
        if (generation !== this.generation) return;
        if (!joined) fail(new Error('ルームに接続できませんでした。'));
        else { this.leaveRoom(); this.onDisconnected?.('ホストとの通信が切れました。'); }
      });
      conn.on('close', () => {
        if (generation !== this.generation) return;
        if (!joined) fail(new Error('ホストとの接続が閉じられました。'));
        else { this.leaveRoom(); this.onDisconnected?.('ホストがルームを退出しました。'); }
      });
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

  leaveRoom() {
    this.generation++;
    const cancel = this.pendingJoinReject;
    this.pendingJoinReject = null;
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
    cancel?.(new Error('接続をキャンセルしました。'));
  }

  get peers() { return this.connections; }
}
