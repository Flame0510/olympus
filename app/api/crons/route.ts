import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import { requireAuth } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const cronStore = process.env.OPENCLAW_CRON_STORE ?? '/data/.openclaw/cron/jobs.json';
    if (!fs.existsSync(cronStore)) return NextResponse.json([]);
    const parsed = JSON.parse(fs.readFileSync(cronStore, 'utf8')) as { jobs?: unknown[] } | unknown[];
    return NextResponse.json(Array.isArray(parsed) ? parsed : parsed.jobs ?? []);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
