import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';
import { requireBrowserAuth } from '@/lib/auth';
import { openDb } from '@/lib/db';
import { getMemoryContextSnapshot } from '@/lib/memory-context';

export const dynamic = 'force-dynamic';

type Health = 'ok' | 'warning' | 'error';
type Severity = 'info' | 'warning' | 'critical';

interface SystemCheck {
  id: string;
  label: string;
  health: Health;
  value: string | number;
  details?: string;
  source: 'runtime' | 'memory' | 'cron' | 'cost' | 'trello';
}

interface Recommendation {
  id: string;
  severity: Severity;
  source: SystemCheck['source'];
  title: string;
  details: string;
  actionHref?: string;
  dismissible: boolean;
  createdAt: string;
  trelloCardId?: string;
}

function topHealth(values: Health[]): Health {
  if (values.includes('error')) return 'error';
  if (values.includes('warning')) return 'warning';
  return 'ok';
}

function getSeconds(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 10_000_000_000 ? Math.floor(n / 1000) : n;
}

function tableExists(db: ReturnType<typeof openDb>, tableName: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row);
}

function columnExists(db: ReturnType<typeof openDb>, tableName: string, columnName: string): boolean {
  return (db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]).some((column) => column.name === columnName);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await requireBrowserAuth(request);
  if (denied) return denied;

  const now = new Date();
  const createdAt = now.toISOString();
  const checks: SystemCheck[] = [];
  const recommendations: Recommendation[] = [];

  try {
    const db = openDb();
    const sessionCount = (db.prepare('SELECT COUNT(*) AS total FROM sessions').get() as { total: number }).total;
    const latestRow = db.prepare('SELECT MAX(COALESCE(updated_at, started_at, 0)) AS latest FROM sessions').get() as { latest: number | null };
    const latest = getSeconds(latestRow.latest);
    const latestAgeSeconds = latest ? Math.floor(Date.now() / 1000) - latest : null;
    const runtimeHealth: Health = latestAgeSeconds === null ? 'warning' : latestAgeSeconds > 3600 ? 'warning' : 'ok';

    checks.push({
      id: 'runtime.sessions',
      label: 'Runtime sessions',
      health: runtimeHealth,
      value: sessionCount,
      details: latestAgeSeconds === null ? 'Nessuna sessione rilevata' : `ultimo update ${Math.round(latestAgeSeconds / 60)}m fa`,
      source: 'runtime',
    });

    if (runtimeHealth !== 'ok') {
      recommendations.push({
        id: 'runtime.check-freshness',
        severity: 'warning',
        source: 'runtime',
        title: 'Verificare freshness runtime Olympus',
        details: 'Le sessioni non sembrano aggiornate nell’ultima ora.',
        actionHref: '/lineage',
        dismissible: false,
        createdAt,
      });
    }

    const eventExpr = tableExists(db, 'events')
      ? [columnExists(db, 'events', 'type') ? 'type' : null, columnExists(db, 'events', 'event') ? 'event' : null].filter(Boolean).join(", ''), COALESCE(")
      : '';
    const eventErrorCount = eventExpr
      ? (db.prepare(`SELECT COUNT(*) AS total FROM events WHERE LOWER(COALESCE(${eventExpr}, '')) LIKE '%error%' AND ts >= ?`).get(Math.floor(Date.now() / 1000) - 86400) as { total: number }).total
      : 0;
    checks.push({
      id: 'runtime.errors24h',
      label: 'Errori ultimi 24h',
      health: eventErrorCount > 0 ? 'warning' : 'ok',
      value: eventErrorCount,
      source: 'runtime',
    });
    if (eventErrorCount > 0) {
      recommendations.push({
        id: 'runtime.review-errors',
        severity: 'warning',
        source: 'runtime',
        title: 'Rivedere errori recenti',
        details: `${eventErrorCount} eventi errore nelle ultime 24h.`,
        actionHref: '/lineage',
        dismissible: true,
        createdAt,
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCost = (db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM sessions WHERE started_at >= ?').get(Math.floor(startOfDay.getTime() / 1000)) as { total: number }).total;
    checks.push({
      id: 'cost.today',
      label: 'Costo oggi',
      health: todayCost > 10 ? 'warning' : 'ok',
      value: `$${todayCost.toFixed(2)}`,
      source: 'cost',
    });
    if (todayCost > 10) {
      recommendations.push({
        id: 'cost.review-models',
        severity: 'warning',
        source: 'cost',
        title: 'Costo giornaliero alto',
        details: `Costo stimato oggi: $${todayCost.toFixed(2)}. Verificare provider/modelli attivi.`,
        actionHref: '/providers',
        dismissible: true,
        createdAt,
      });
    }
    db.close();
  } catch (error) {
    checks.push({ id: 'runtime.db', label: 'Olympus DB', health: 'error', value: 'error', details: (error as Error).message, source: 'runtime' });
    recommendations.push({ id: 'runtime.db-error', severity: 'critical', source: 'runtime', title: 'DB Olympus non leggibile', details: (error as Error).message, dismissible: false, createdAt });
  }

  try {
    const memory = getMemoryContextSnapshot();
    checks.push({
      id: 'memory.shared-context',
      label: 'Shared context',
      health: memory.strategy.health,
      value: `${memory.summary.userLinked}/${memory.summary.totalAgents}`,
      details: `${memory.summary.warnings} warning, ${memory.summary.globalFiles} file globali`,
      source: 'memory',
    });
    if (memory.strategy.health !== 'ok') {
      recommendations.push({
        id: 'memory.fix-context',
        severity: memory.strategy.health === 'error' ? 'critical' : 'warning',
        source: 'memory',
        title: 'Allineare shared-context',
        details: memory.strategy.warnings[0] ?? 'Memory/context presenta warning.',
        actionHref: '/memory',
        dismissible: false,
        createdAt,
      });
    }
  } catch (error) {
    checks.push({ id: 'memory.snapshot', label: 'Memory snapshot', health: 'error', value: 'error', details: (error as Error).message, source: 'memory' });
  }

  try {
    const stdout = execSync('openclaw cron list --json', { timeout: 5000 }).toString();
    const parsed = JSON.parse(stdout.trim()) as { jobs?: { enabled?: boolean }[] } | { id?: string; enabled?: boolean }[];
    const jobs = Array.isArray(parsed) ? parsed : parsed.jobs ?? [];
    const enabled = jobs.filter((job) => job.enabled !== false).length;
    checks.push({ id: 'cron.jobs', label: 'Cron jobs', health: enabled > 0 ? 'ok' : 'warning', value: enabled, details: `${jobs.length} totali`, source: 'cron' });
    if (enabled === 0) {
      recommendations.push({ id: 'cron.enable-watchdog', severity: 'warning', source: 'cron', title: 'Nessun cron abilitato rilevato', details: 'Verificare watchdog e automazioni periodiche.', actionHref: '/crons', dismissible: false, createdAt });
    }
  } catch (error) {
    checks.push({ id: 'cron.api', label: 'Cron API', health: 'warning', value: 'warning', details: (error as Error).message, source: 'cron' });
    recommendations.push({ id: 'cron.api-unavailable', severity: 'warning', source: 'cron', title: 'Cron non verificabile', details: 'La lista cron non è leggibile da Olympus in questo momento.', actionHref: '/crons', dismissible: false, createdAt });
  }

  const health = topHealth(checks.map((check) => check.health));
  return NextResponse.json({ health, checks, recommendations, generatedAt: createdAt });
}
