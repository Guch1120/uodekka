const ROOM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeRoomId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (id.length < 3 || id.length > 32 || !ROOM_ID.test(id)) {
    throw Object.assign(new Error('ルームIDは3〜32文字の半角英数字で入力してください。ハイフンは文字の間に1つずつ使えます。'), { code: 'invalid-id' });
  }
  return id;
}
