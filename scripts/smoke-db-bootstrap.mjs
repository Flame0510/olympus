import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { initializeOlympusDb } from '../lib/db-bootstrap.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-bootstrap-'));
const dbPath = path.join(root, 'nested', 'events.db');

initializeOlympusDb(dbPath);

const db = new Database(dbPath, { readonly: true });

const sessions = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 2000').all();
const events = db
  .prepare(
    `SELECT e.*, s.label AS session_label
     FROM events e LEFT JOIN sessions s ON s.session_id = e.session_id
     ORDER BY e.ts DESC LIMIT 50`,
  )
  .all();
const stats = db
  .prepare(
    'SELECT COALESCE(SUM(cost_usd),0) AS total, COALESCE(SUM(tokens_in),0) AS total_in, COALESCE(SUM(tokens_out),0) AS total_out, COUNT(*) AS sessions FROM sessions WHERE started_at >= ?',
  )
  .get(Math.floor(Date.now() / 1000) - 86400);
const costs = db
  .prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM sessions')
  .get();
const toolCalls = db.prepare('SELECT * FROM tool_calls ORDER BY ts DESC LIMIT 50').all();
const metrics = db
  .prepare('SELECT cpu_percent as cpu, ram_used_mb, ram_total_mb, ts FROM system_metrics ORDER BY ts DESC LIMIT ?')
  .all(60);

if (sessions.length !== 0) throw new Error('Expected empty sessions result');
if (events.length !== 0) throw new Error('Expected empty events result');
if ((stats?.total ?? 0) !== 0 || (stats?.sessions ?? 0) !== 0) throw new Error('Expected zero stats');
if ((costs?.total ?? 0) !== 0) throw new Error('Expected zero all-time cost');
if (toolCalls.length !== 0) throw new Error('Expected empty tool_calls result');
if (metrics.length !== 0) throw new Error('Expected empty system_metrics result');

db.close();
console.log(JSON.stringify({ ok: true, dbPath }, null, 2));
