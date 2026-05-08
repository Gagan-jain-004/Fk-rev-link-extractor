import { NextRequest, NextResponse } from 'next/server';
import { getRedis, redisKeys, redisGet } from '@/lib/redis';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const token = request.headers.get('x-debug-token') ?? null;
  const required = process.env.DEBUG_TOKEN ?? null;

  if (process.env.NODE_ENV === 'production' && required && token !== required) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const redis = getRedis();
  const result: Record<string, number> = {};

  if (redis) {
    try {
      const keys = await redisKeys('cooldown:*');
      for (const key of keys) {
        const raw = await redisGet(key);
        const hostname = key.replace(/^cooldown:/, '');
        result[hostname] = Number(raw) || 0;
      }
    } catch (e) {
      console.error('[debug/cooldowns] error reading redis', e && e.message);
    }
  }

  return NextResponse.json({ cooldowns: result });
}
