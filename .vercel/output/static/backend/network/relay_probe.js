// Verify TURN allocation from this device without joining or disturbing a room.
export function probeRelay(iceServers, { signal, timeoutMs = 12000, PeerConnection = globalThis.RTCPeerConnection } = {}) {
  return new Promise(resolve => {
    let pc, timer, settled = false;
    const finish = status => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (pc) { pc.onicecandidate = null; pc.onicegatheringstatechange = null; pc.close(); }
      resolve({ status });
    };
    const abort = () => finish('cancelled');
    if (signal?.aborted) { finish('cancelled'); return; }
    if (typeof PeerConnection !== 'function') { finish('unsupported'); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish('unreachable'), timeoutMs);
    try {
      pc = new PeerConnection({ iceServers, iceTransportPolicy: 'relay' });
      pc.onicecandidate = ({ candidate }) => {
        // Older WebKit versions may omit RTCIceCandidate.type.
        if (candidate && (candidate.type === 'relay' || /\btyp relay\b/.test(candidate.candidate || ''))) finish('reachable');
      };
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') finish('unreachable'); };
      pc.createDataChannel('relay-check');
      Promise.resolve(pc.createOffer()).then(offer => {
        if (!settled) return pc.setLocalDescription(offer);
      }).catch(() => finish('unreachable'));
    } catch { finish('unreachable'); }
  });
}
