import { NextResponse, type NextRequest } from 'next/server';
import { maybeSendAlert } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

function smokeAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.OLYMPUS_ALERT_SMOKE === 'true';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!smokeAllowed()) return NextResponse.json({ error: 'disabled' }, { status: 403 });

  const stale = new URL(request.url).searchParams.get('stale') !== '0';
  const result = await maybeSendAlert({
    key: 'smoke.telegram-alert',
    kind: 'db-freshness',
    title: 'Olympus alert smoke',
    message: 'Smoke test alert message.',
    resolvedMessage: 'Smoke test resolved.',
    stale,
  });

  return NextResponse.json({ ok: true, stale, result, dryRun: !process.env.OLYMPUS_TELEGRAM_BOT_TOKEN || !process.env.OLYMPUS_TELEGRAM_CHAT_ID });
}
