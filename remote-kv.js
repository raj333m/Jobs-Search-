// Minimal Upstash Redis REST client used when the app runs on Vercel.
// Locally (no KV env vars) the app keeps using the encrypted files in data/.
export function kvConfig(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export function createKv(config = kvConfig(), fetchImpl = globalThis.fetch) {
  if (!config) return null;
  const call = async (command) => {
    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error('Storage service error: ' + (data.error || response.status));
    return data.result;
  };
  return {
    get: (key) => call(['GET', key]),
    set: (key, value, ttlSeconds) => call(ttlSeconds ? ['SET', key, value, 'EX', String(ttlSeconds)] : ['SET', key, value]),
    del: (key) => call(['DEL', key]),
    async keys(prefix) {
      const found = []; let cursor = '0';
      do { const [next, batch] = await call(['SCAN', cursor, 'MATCH', prefix + '*', 'COUNT', '200']); cursor = String(next); found.push(...batch); } while (cursor !== '0');
      return found;
    }
  };
}

// In-memory stand-in with the same interface, used by tests.
export function memoryKv() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async set(key, value) { map.set(key, value); return 'OK'; },
    async del(key) { map.delete(key); return 1; },
    async keys(prefix) { return [...map.keys()].filter(k => k.startsWith(prefix)); }
  };
}
