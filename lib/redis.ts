import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;
let client: Redis | null = null;

if (redisUrl) {
  client = new Redis(redisUrl);
  client.on('error', (err) => console.error('[redis] error', err && err.message));
}

export function getRedis() {
  return client;
}

export async function redisGet(key: string): Promise<string | null> {
  if (!client) return null;
  return client.get(key);
}

export async function redisSet(key: string, value: string, ttlMs?: number): Promise<void> {
  if (!client) return;
  if (typeof ttlMs === 'number' && ttlMs > 0) {
    // setex expects seconds
    await client.psetex(key, ttlMs, value);
  } else {
    await client.set(key, value);
  }
}

export async function redisDel(key: string): Promise<void> {
  if (!client) return;
  await client.del(key);
}

export async function redisKeys(pattern: string): Promise<string[]> {
  if (!client) return [];
  return client.keys(pattern);
}
