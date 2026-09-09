// Never fall back to PeerJS 1.5.2's retired public TURN hosts.
export const DIRECT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export function validateIceServers(value) {
  if (!Array.isArray(value) || value.length > 16) throw new Error('Invalid ICE configuration');
  return value.map(server => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    if (!urls.length || urls.length > 8 || urls.some(url => typeof url !== 'string' ||
      !/^(stun|turn|turns):[^\s@]+$/.test(url))) throw new Error('Invalid ICE URL');
    const result = { urls };
    if (urls.some(url => /^turns?:/.test(url))) {
      if (typeof server.username !== 'string' || !server.username ||
          typeof server.credential !== 'string' || !server.credential) throw new Error('Missing TURN credentials');
      result.username = server.username; result.credential = server.credential;
    }
    return result;
  });
}

export async function loadIceConfig({ signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 8000);
  try {
    const response = await fetch('/api/ice-servers', { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('ICE endpoint unavailable');
    const data = await response.json();
    const iceServers = validateIceServers(data.iceServers);
    if (!iceServers.length) throw new Error('No ICE servers');
    return {
      iceServers,
      relayConfigured: iceServers.some(s => s.urls.some(url => /^turns?:/.test(url))),
      reason: data.reason === 'not-configured' ? 'not-configured' : null
    };
  } catch {
    if (signal?.aborted) throw Object.assign(new Error('接続をキャンセルしました。'), { code: 'cancelled' });
    return { iceServers: DIRECT_ICE_SERVERS, relayConfigured: false, reason: 'unavailable' };
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
