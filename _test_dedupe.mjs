// Mirrors requestGeocode's policy in GoogleMapsPicker to prove the API-call
// counts, without needing a live Google key.
let failed = 0;
const check = (n, p, d) => { if (!p) { failed++; console.log(`FAIL  ${n}\n      -> ${d}`); } else console.log(`PASS  ${n}`); };

const COORD_PRECISION = 5;
const TERMINAL = new Set(['REQUEST_DENIED','OVER_QUERY_LIMIT','ZERO_RESULTS','INVALID_REQUEST','NO_RUNTIME']);
const key = (a, b) => `${Number(a).toFixed(COORD_PRECISION)},${Number(b).toFixed(COORD_PRECISION)}`;

function makePicker({ geocode, quotaMs = 0 } = {}) {
  const st = {
    calls: 0, coords: [],
    inFlight: false, pending: null,
    lastResolved: null, lastAttempted: null,
    quotaUntil: 0, onError: null,
  };
  const geocodeOnce = async (next) => {
    st.calls++; st.coords.push(key(next.lat, next.lng));
    try {
      const r = await geocode(next);
      st.lastResolved = { key: key(next.lat, next.lng) };
      return r;
    } catch (e) {
      if (e.status === 'OVER_QUERY_LIMIT') st.quotaUntil = Date.now() + quotaMs;
      st.lastAttempted = { key: key(next.lat, next.lng), status: e.status || 'NO_RUNTIME' };
      throw e;
    }
  };
  function requestGeocode(next) {
    const k = key(next.lat, next.lng);
    if (st.lastResolved?.key === k) return;
    if (st.quotaUntil > Date.now()) return;
    if (st.lastAttempted?.key === k && TERMINAL.has(st.lastAttempted.status)) return;
    if (st.inFlight) { st.pending = next; return; }
    st.inFlight = true;
    geocodeOnce(next).catch(() => {}).finally(() => {
      st.inFlight = false;
      const q = st.pending; st.pending = null;
      if (q) requestGeocode(q);
    });
  }
  return { st, requestGeocode, tick: () => new Promise((r) => setTimeout(r, 5)) };
}

// 1. Repeated identical requests collapse to one.
{
  const ok = async () => ({ formattedAddress: 'x' });
  const p = makePicker({ geocode: ok });
  p.requestGeocode({ lat: 28.6139, lng: 77.209 });
  p.requestGeocode({ lat: 28.6139, lng: 77.209 });
  p.requestGeocode({ lat: 28.6139, lng: 77.209 });
  await p.tick(); await p.tick();
  check('3 identical requests -> 1 API call', p.st.calls === 1, `calls=${p.st.calls}`);
}

// 2. GPS jitter well below 1 m is treated as the same point.
{
  const p = makePicker({ geocode: async () => ({}) });
  p.requestGeocode({ lat: 28.613900, lng: 77.209000 });
  await p.tick();
  p.requestGeocode({ lat: 28.6139004, lng: 77.2090003 });
  await p.tick(); await p.tick();
  check('sub-metre GPS jitter -> no 2nd call', p.st.calls === 1, `calls=${p.st.calls}`);
}

// 3. A burst of clicks while one is in flight collapses to 1 trailing request.
{
  let release;
  const p = makePicker({ geocode: () => new Promise((r) => { release = r; }) });
  p.requestGeocode({ lat: 1, lng: 1 });
  p.requestGeocode({ lat: 2, lng: 2 });
  p.requestGeocode({ lat: 3, lng: 3 });
  p.requestGeocode({ lat: 4, lng: 4 });
  check('burst: only 1 in flight', p.st.calls === 1, `calls=${p.st.calls}`);
  release({});
  await p.tick(); await p.tick(); await p.tick();
  check('burst: 3 queued -> 1 trailing call (total 2)', p.st.calls === 2, `calls=${p.st.calls}`);
  check('burst: trailing call used the LAST coords', p.st.coords[1] === '4.00000,4.00000', p.st.coords.join(' | '));
}

// 4. REQUEST_DENIED is not retried for the same point.
{
  const p = makePicker({ geocode: async () => { const e = new Error('x'); e.status = 'REQUEST_DENIED'; throw e; } });
  p.requestGeocode({ lat: 5, lng: 5 });
  await p.tick(); await p.tick();
  p.requestGeocode({ lat: 5, lng: 5 });
  await p.tick(); await p.tick();
  check('REQUEST_DENIED same point -> no retry', p.st.calls === 1, `calls=${p.st.calls}`);
  p.requestGeocode({ lat: 6, lng: 6 });
  await p.tick(); await p.tick();
  check('REQUEST_DENIED different point still works', p.st.calls === 2, `calls=${p.st.calls}`);
}

// 5. OVER_QUERY_LIMIT cooldown blocks everything, then recovers.
{
  const p = makePicker({ geocode: async () => { const e = new Error('x'); e.status = 'OVER_QUERY_LIMIT'; throw e; }, quotaMs: 60000 });
  p.requestGeocode({ lat: 7, lng: 7 });
  await p.tick(); await p.tick();
  p.requestGeocode({ lat: 8, lng: 8 });
  p.requestGeocode({ lat: 9, lng: 9 });
  await p.tick(); await p.tick();
  check('OVER_QUERY_LIMIT -> no immediate retry of ANY point', p.st.calls === 1, `calls=${p.st.calls}`);
  p.st.quotaUntil = 0; // simulate the cooldown elapsing
  p.requestGeocode({ lat: 8, lng: 8 });
  await p.tick(); await p.tick();
  check('after cooldown, requests resume', p.st.calls === 2, `calls=${p.st.calls}`);
}

// 6. ZERO_RESULTS is terminal; UNKNOWN_ERROR is retryable.
{
  const z = makePicker({ geocode: async () => { const e = new Error('x'); e.status = 'ZERO_RESULTS'; throw e; } });
  z.requestGeocode({ lat: 10, lng: 10 }); await z.tick(); await z.tick();
  z.requestGeocode({ lat: 10, lng: 10 }); await z.tick(); await z.tick();
  check('ZERO_RESULTS same point -> no retry', z.st.calls === 1, `calls=${z.st.calls}`);

  const u = makePicker({ geocode: async () => { const e = new Error('x'); e.status = 'UNKNOWN_ERROR'; throw e; } });
  u.requestGeocode({ lat: 11, lng: 11 }); await u.tick(); await u.tick();
  u.requestGeocode({ lat: 11, lng: 11 }); await u.tick(); await u.tick();
  check('UNKNOWN_ERROR -> retry allowed', u.st.calls === 2, `calls=${u.st.calls}`);
}

// 7. No runtime at all -> no repeated work, and no network call attempted.
{
  const p = makePicker({ geocode: async () => { const e = new Error('x'); throw e; } });
  p.requestGeocode({ lat: 12, lng: 12 }); await p.tick(); await p.tick();
  p.requestGeocode({ lat: 12, lng: 12 }); await p.tick(); await p.tick();
  check('no runtime -> second click stays local', p.st.calls === 1, `calls=${p.st.calls}`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
