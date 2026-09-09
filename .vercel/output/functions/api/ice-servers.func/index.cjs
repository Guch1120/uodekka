const { createHmac, randomUUID } = require('node:crypto');
const STUN = { urls: 'stun:stun.l.google.com:19302' };

function validate(servers) {
  if (!Array.isArray(servers) || servers.length > 16) throw new Error('Invalid configuration');
  return servers.map(s => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    if (!urls.length || urls.length > 8 || urls.some(u => typeof u !== 'string' || !/^(stun|turn|turns):[^\s@]+$/.test(u))) throw new Error('Invalid URL');
    const entry = { urls };
    if (urls.some(u => /^turns?:/.test(u))) {
      if (typeof s.username !== 'string' || !s.username || typeof s.credential !== 'string' || !s.credential) throw new Error('Missing credentials');
      entry.username = s.username; entry.credential = s.credential;
    }
    return entry;
  });
}

async function getConfig(env = process.env, fetcher = fetch) {
  if (env.METERED_DOMAIN || env.METERED_TURN_API_KEY) {
    if (!/^[a-z0-9-]+\.metered\.live$/.test(env.METERED_DOMAIN || '') || !env.METERED_TURN_API_KEY) throw new Error('Incomplete Metered configuration');
    const url = new URL(`https://${env.METERED_DOMAIN}/api/v1/turn/credentials`);
    url.searchParams.set('apiKey', env.METERED_TURN_API_KEY);
    const response = await fetcher(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok) throw new Error('Provider unavailable');
    const iceServers = validate(await response.json());
    if (!iceServers.some(s => s.urls.some(u => /^turns?:/.test(u)))) throw new Error('No TURN servers');
    return { iceServers, relayConfigured: true };
  }
  if (env.TURN_URLS || env.TURN_SHARED_SECRET) {
    if (!env.TURN_URLS || !env.TURN_SHARED_SECRET) throw new Error('Incomplete coturn configuration');
    const urls = env.TURN_URLS.split(',').map(u => u.trim());
    if (urls.some(u => !/^turns?:/.test(u))) throw new Error('Invalid TURN URLs');
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    const username = `${expiresAt}:${randomUUID()}`;
    const credential = createHmac('sha1', env.TURN_SHARED_SECRET).update(username).digest('base64');
    return { iceServers: validate([STUN, { urls, username, credential }]), relayConfigured: true, expiresAt };
  }
  return { iceServers: [STUN], relayConfigured: false, reason: 'not-configured' };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET'); res.statusCode = 405; res.end(JSON.stringify({ error: 'method-not-allowed' })); return;
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    res.statusCode = 403; res.end(JSON.stringify({ error: 'forbidden' })); return;
  }
  try { res.end(JSON.stringify(await getConfig())); }
  catch {
    // Never log a provider URL, credential, or upstream error body.
    res.statusCode = 503; res.end(JSON.stringify({ error: 'relay-unavailable' }));
  }
}
module.exports = handler;
module.exports.getConfig = getConfig;
