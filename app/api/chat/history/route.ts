import { NextResponse, type NextRequest } from 'next/server';
import Database from 'better-sqlite3';

export const dynamic = 'force-dynamic';

const DB_PATH = '/data/olympus/events.db';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionKey = request.nextUrl.searchParams.get('sessionKey') || '';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '100', 10) || 100, 500);

  if (!sessionKey) {
    return NextResponse.json({ error: 'sessionKey required' }, { status: 400 });
  }

  try {
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(
      `SELECT id, ts, user_id, role, content, openclaw_session_id, model
       FROM chat_messages
       WHERE openclaw_session_id = ?
       ORDER BY ts ASC
       LIMIT ?`
    ).all(sessionKey, limit);
    db.close();
    return NextResponse.json(rows);
  } catch (e: any) {
    console.error('chat.history error:', e.message);
    return NextResponse.json([]);
  }
}
