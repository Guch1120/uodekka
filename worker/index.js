const MAX_PLAYERS = 12;
const ROOM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VEHICLES = new Set(['standard_red', 'speed_blue', 'handling_green']);
const COURSES = new Set(['course1', 'course2', 'course3', 'course4', 'course5', 'course6', 'course7']);

const json = (socket, value) => { try { socket.send(JSON.stringify(value)); } catch { /* Closed sockets are removed by webSocketClose. */ } };
const profile = value => ({ name: String(value?.name || 'プレイヤー').trim().slice(0, 20) || 'プレイヤー', vehicleKey: VEHICLES.has(value?.vehicleKey) ? value.vehicleKey : 'standard_red' });

export class Room {
  constructor(ctx) { this.ctx = ctx; }

  async state() { return await this.ctx.storage.get('room') || { roomId: null, hostId: null, courseId: null, phase: 'lobby', members: [] }; }
  sockets() { return this.ctx.getWebSockets(); }
  async broadcast(message, except = null) { this.sockets().forEach(socket => { if (socket !== except) json(socket, message); }); }
  async publish() {
    const room = await this.state();
    await this.broadcast({ type: 'ROOM_STATE', roomId: room.roomId, members: room.members.map(member => ({ ...member, isHost: member.id === room.hostId })), courseId: room.courseId, phase: room.phase });
  }
  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('UO:De Car multiplayer worker\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ memberId: null });
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(socket, raw) {
    let message; try { message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return json(socket, { type: 'ROOM_ERROR', code: 'invalid-message', message: '通信内容を読み取れません。' }); }
    const attachment = socket.deserializeAttachment() || { memberId: null };
    const room = await this.state();
    if (!attachment.memberId) {
      const roomId = String(message.roomId || '').trim().toLowerCase();
      if (!ROOM_ID.test(roomId) || room.roomId && room.roomId !== roomId) return json(socket, { type: 'ROOM_ERROR', code: 'invalid-id', message: 'ルームIDを確認してください。' });
      if (message.type === 'CREATE_ROOM') {
        if (room.roomId) return json(socket, { type: 'ROOM_ERROR', code: 'unavailable-id', message: 'このルームIDは使用中です。別のIDを設定してください。' });
        room.roomId = roomId; room.hostId = crypto.randomUUID();
      } else if (message.type !== 'JOIN_ROOM') return json(socket, { type: 'ROOM_ERROR', code: 'invalid-message', message: 'ルーム作成または参加を指定してください。' });
      if (!room.roomId) return json(socket, { type: 'ROOM_ERROR', code: 'room-not-found', message: 'ルームが見つかりません。ホストが作成したIDを確認してください。' });
      if (room.phase !== 'lobby') return json(socket, { type: 'ROOM_ERROR', code: 'race-started', message: 'レースはすでに開始しています。' });
      if (room.members.length >= MAX_PLAYERS) return json(socket, { type: 'ROOM_ERROR', code: 'room-full', message: 'ルームは満員です（最大12人）。' });
      const memberId = message.type === 'CREATE_ROOM' ? room.hostId : crypto.randomUUID();
      room.members.push({ id: memberId, ...profile(message) });
      socket.serializeAttachment({ memberId });
      await this.ctx.storage.put('room', room);
      json(socket, { type: 'WELCOME', id: memberId, isHost: memberId === room.hostId });
      return this.publish();
    }
    const member = room.members.find(item => item.id === attachment.memberId);
    if (!member) return json(socket, { type: 'ROOM_ERROR', code: 'not-in-room', message: 'ルームに参加していません。' });
    if (message.type === 'REQUEST_ROOM_STATE') return this.publish();
    if (message.type === 'UPDATE_PROFILE') {
      const p = profile(message);
      member.name = p.name;
      member.vehicleKey = p.vehicleKey;
      await this.ctx.storage.put('room', room);
      return this.publish();
    }
    if (message.type === 'SELECT_COURSE') {
      if (member.id !== room.hostId || room.phase !== 'lobby' || !COURSES.has(message.courseId)) return;
      room.courseId = message.courseId; await this.ctx.storage.put('room', room); return this.publish();
    }
    if (message.type === 'START_RACE') {
      if (member.id !== room.hostId || room.phase !== 'lobby' || !room.courseId) return;
      room.phase = 'starting'; await this.ctx.storage.put('room', room); await this.publish();
      const aiRacers = Array.isArray(message.aiRacers) ? message.aiRacers : [];
      return this.broadcast({ type: 'START_RACE', courseId: room.courseId, delayMs: 2200, aiRacers });
    }
    if (message.type === 'KART_STATE' || message.type === 'ITEM_USE') return this.broadcast({ ...message, senderId: member.id }, socket);
    if (message.type === 'CPU_STATES') {
      if (member.id !== room.hostId) return;
      return this.broadcast({ ...message, senderId: member.id }, socket);
    }
  }
  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment() || {}; if (!attachment.memberId) return;
    const room = await this.state(); room.members = room.members.filter(member => member.id !== attachment.memberId);
    if (!room.members.length) return this.ctx.storage.delete('room');
    if (room.hostId === attachment.memberId) {
      room.hostId = room.members[0].id;
      await this.ctx.storage.put('room', room);
      await this.broadcast({ type: 'ROOM_ERROR', code: 'host-left', message: 'ホストが退出しました。新しいルームを作成してください。' }, socket);
    } else await this.ctx.storage.put('room', room);
    await this.publish();
  }
  webSocketError(socket) { return this.webSocketClose(socket); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/' && request.headers.get('Upgrade') !== 'websocket') return new Response('UO:De Car multiplayer worker\n');
    if (url.pathname !== '/ws') return new Response('Not found', { status: 404 });
    const roomId = String(url.searchParams.get('room') || '').trim().toLowerCase();
    if (!ROOM_ID.test(roomId)) return new Response('Invalid room', { status: 400 });
    const id = env.ROOM.idFromName(roomId);
    return env.ROOM.get(id).fetch(request);
  }
};
