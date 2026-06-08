import Database from 'better-sqlite3';
import { DB_PATH, ensureDbReady } from './db';

export type AlertKind = 'db-freshness';

export interface AlertContext {
  key: string;
  kind: AlertKind;
  title: string;
  message: string;
  resolvedMessage?: string;
  stale: boolean;
}

const ALERTS_TABLE = `
  CREATE TABLE IF NOT EXISTS alert_state (
    alert_key TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    last_sent_at INTEGER,
    last_resolved_at INTEGER,
    updated_at INTEGER NOT NULL,
    payload TEXT
  );
`;

function getConfig() {
  return {
    enabled: process.env.OLYMPUS_ALERTS_ENABLED === 'true',
    token: process.env.OLYMPUS_TELEGRAM_BOT_TOKEN?.trim() ?? '',
    chatId: process.env.OLYMPUS_TELEGRAM_CHAT_ID?.trim() ?? '',
    cooldownMs: Math.max(0, Number(process.env.OLYMPUS_ALERT_COOLDOWN_MS ?? 10 * 60 * 1000)),
  };
}

function openWritableDb() {
  ensureDbReady();
  const db = new Database(DB_PATH);
  db.exec(ALERTS_TABLE);
  return db;
}

async function sendTelegramMessage(text: string): Promise<void> {
  const { token, chatId } = getConfig();
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!response.ok) {
    throw new Error(`Telegram send failed (${response.status})`);
  }
}

export async function maybeSendAlert(context: AlertContext): Promise<{ action: 'noop' | 'sent' | 'dry-run'; reason: string }> {
  const config = getConfig();
  if (!config.enabled) return { action: 'noop', reason: 'alerts disabled' };

  const now = Date.now();
  const db = openWritableDb();
  try {
    const existing = db.prepare('SELECT * FROM alert_state WHERE alert_key = ?').get(context.key) as { state?: string; last_sent_at?: number | null } | undefined;
    const message = context.stale ? `⚠️ ${context.title}\n${context.message}` : `✅ ${context.title}\n${context.resolvedMessage ?? context.message}`;

    if (!config.token || !config.chatId) {
      console.info('[alerts] dry-run', { key: context.key, stale: context.stale, hasToken: Boolean(config.token), hasChatId: Boolean(config.chatId) });
      if (context.stale) {
        db.prepare(
          `INSERT INTO alert_state (alert_key, kind, state, last_sent_at, updated_at, payload)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(alert_key) DO UPDATE SET state=excluded.state, last_sent_at=excluded.last_sent_at, updated_at=excluded.updated_at, payload=excluded.payload`,
        ).run(context.key, context.kind, 'alerted', now, now, JSON.stringify(context));
      } else if (existing?.state === 'alerted') {
        db.prepare(
          `INSERT INTO alert_state (alert_key, kind, state, last_resolved_at, updated_at, payload)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(alert_key) DO UPDATE SET state=excluded.state, last_resolved_at=excluded.last_resolved_at, updated_at=excluded.updated_at, payload=excluded.payload`,
        ).run(context.key, context.kind, 'resolved', now, now, JSON.stringify(context));
      }
      return { action: 'dry-run', reason: 'missing telegram credentials' };
    }

    if (context.stale) {
      const lastSentAt = Number(existing?.last_sent_at ?? 0);
      if (lastSentAt && now - lastSentAt < config.cooldownMs) return { action: 'noop', reason: 'cooldown active' };
      await sendTelegramMessage(message);
      db.prepare(
        `INSERT INTO alert_state (alert_key, kind, state, last_sent_at, updated_at, payload)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(alert_key) DO UPDATE SET state=excluded.state, last_sent_at=excluded.last_sent_at, updated_at=excluded.updated_at, payload=excluded.payload`,
      ).run(context.key, context.kind, 'alerted', now, now, JSON.stringify(context));
      return { action: 'sent', reason: 'stale alert sent' };
    }

    if (existing?.state === 'alerted') {
      await sendTelegramMessage(message);
      db.prepare(
        `INSERT INTO alert_state (alert_key, kind, state, last_resolved_at, updated_at, payload)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(alert_key) DO UPDATE SET state=excluded.state, last_resolved_at=excluded.last_resolved_at, updated_at=excluded.updated_at, payload=excluded.payload`,
      ).run(context.key, context.kind, 'resolved', now, now, JSON.stringify(context));
      return { action: 'sent', reason: 'resolved alert sent' };
    }

    db.prepare(
      `INSERT INTO alert_state (alert_key, kind, state, updated_at, payload)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(alert_key) DO UPDATE SET state=excluded.state, updated_at=excluded.updated_at, payload=excluded.payload`,
    ).run(context.key, context.kind, 'ok', now, JSON.stringify(context));
    return { action: 'noop', reason: 'already ok' };
  } finally {
    db.close();
  }
}

