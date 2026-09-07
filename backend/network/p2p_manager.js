// backend/network/p2p_manager.js
// PeerJS（WebRTC）によるサーバーレスP2P通信管理
// ホストがルームを作成、ゲストが接続し、専有バックエンドなしでリアルタイム通信

export class P2PManager {
  constructor() {
    this.peer = null;
    this.connections = []; // ホストの場合、接続しているゲストPeer接続配列
    this.hostConnection = null; // ゲストの場合、ホストへの接続
    this.isHost = false;
    this.roomId = null;
    this.myPeerId = null;

    this.onPlayerJoined = null;
    this.onGameStart = null;
    this.onPeerStateReceived = null;
    this.onItemEvent = null;
  }

  async initPeer() {
    return new Promise((resolve, reject) => {
      // PeerJS CDNが読み込まれている前提
      if (typeof window.Peer === 'undefined') {
        reject(new Error('PeerJSライブラリが読み込まれていません'));
        return;
      }

      // ランダムまたは固有IDで初期化（PeerJSパブリック無料シグナリングサーバー使用）
      this.peer = new window.Peer();

      this.peer.on('open', (id) => {
        this.myPeerId = id;
        resolve(id);
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        reject(err);
      });
    });
  }

  /**
   * ルーム作成 (ホスト側)
   */
  async createRoom(initialData = {}) {
    await this.initPeer();
    this.isHost = true;
    this.roomId = this.myPeerId;

    this.peer.on('connection', (conn) => {
      this.setupHostConnection(conn);
    });

    return this.roomId;
  }

  setupHostConnection(conn) {
    conn.on('open', () => {
      this.connections.push(conn);
      if (this.onPlayerJoined) {
        this.onPlayerJoined(conn.peer);
      }

      conn.on('data', (data) => {
        this.handleDataFromGuest(conn.peer, data);
      });
    });

    conn.on('close', () => {
      this.connections = this.connections.filter(c => c !== conn);
    });
  }

  /**
   * ルーム参加 (ゲスト側)
   */
  async joinRoom(roomId, initialData = {}) {
    await this.initPeer();
    this.isHost = false;
    this.roomId = roomId;

    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(roomId, {
        reliable: false // レースの高速同期のためUnreliable/UDPライク通信
      });

      conn.on('open', () => {
        this.hostConnection = conn;
        resolve(conn);

        conn.on('data', (data) => {
          this.handleDataFromHost(data);
        });
      });

      conn.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => {
        if (!this.hostConnection) {
          reject(new Error('接続タイムアウト'));
        }
      }, 10000);
    });
  }

  broadcastStartRace(data) {
    this.broadcast({
      type: 'START_RACE',
      ...data
    });
  }

  broadcast(data) {
    if (this.isHost) {
      this.connections.forEach(conn => {
        if (conn.open) conn.send(data);
      });
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(data);
    }
  }

  /**
   * 毎フレームのカート位置・向きの送信
   */
  sendKartState(state) {
    const payload = {
      type: 'KART_STATE',
      senderId: this.myPeerId,
      time: performance.now(),
      state
    };

    if (this.isHost) {
      // ホストは全クライアントへリレー
      this.broadcast(payload);
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(payload);
    }
  }

  handleDataFromGuest(senderPeerId, data) {
    if (data.type === 'KART_STATE') {
      if (this.onPeerStateReceived) {
        this.onPeerStateReceived(senderPeerId, data.state);
      }
      // 他のゲストにもリレー転送
      this.connections.forEach(c => {
        if (c.peer !== senderPeerId && c.open) {
          c.send(data);
        }
      });
    } else if (data.type === 'ITEM_USE') {
      if (this.onItemEvent) this.onItemEvent(data);
      this.broadcast(data);
    }
  }

  handleDataFromHost(data) {
    if (data.type === 'START_RACE') {
      if (this.onGameStart) this.onGameStart(data);
    } else if (data.type === 'KART_STATE') {
      if (data.senderId !== this.myPeerId && this.onPeerStateReceived) {
        this.onPeerStateReceived(data.senderId, data.state);
      }
    } else if (data.type === 'ITEM_USE') {
      if (this.onItemEvent) this.onItemEvent(data);
    }
  }

  get peers() {
    return this.connections;
  }
}
