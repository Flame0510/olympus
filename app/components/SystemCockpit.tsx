'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Costs, Session, SessionEvent } from '@/lib/types';
import { isSessionActive } from '@/lib/patterns/sessionPresentation';

interface SystemCheck {
  id: string;
  label: string;
  health: 'ok' | 'warning' | 'error';
  value: string | number;
  details?: string;
  source: 'runtime' | 'memory' | 'cron' | 'cost' | 'trello';
}

interface Recommendation {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  source: SystemCheck['source'];
  title: string;
  details: string;
  actionHref?: string;
  dismissible: boolean;
  createdAt: string;
  trelloCardId?: string;
}

interface SystemHealthPayload {
  health: 'ok' | 'warning' | 'error';
  checks: SystemCheck[];
  recommendations: Recommendation[];
  generatedAt: string;
}

interface SystemCockpitProps {
  sessions: Session[];
  events: SessionEvent[];
  costs: Costs;
}

function fmtMoney(value?: number | null): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function fmtAge(ts?: number | null): string {
  if (!ts) return 'n/d';
  const ms = Date.now() - (ts > 10_000_000_000 ? ts : ts * 1000);
  if (ms < 60_000) return 'ora';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m fa`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h fa`;
  return `${Math.floor(ms / 86_400_000)}g fa`;
}

function healthColor(health: 'ok' | 'warning' | 'error' | 'info') {
  if (health === 'ok' || health === 'info') return 'var(--green)';
  if (health === 'warning') return '#f59e0b';
  return 'var(--red)';
}

function cardStyle(accent?: string): React.CSSProperties {
  return {
    border: `1px solid ${accent ?? 'var(--border)'}`,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))',
    borderRadius: 8,
    padding: 16,
    minHeight: 110,
  };
}

function findCheck(checks: SystemCheck[], id: string): SystemCheck | undefined {
  return checks.find((check) => check.id === id);
}

export default function SystemCockpit({ sessions, events, costs }: SystemCockpitProps) {
  const [systemHealth, setSystemHealth] = useState<SystemHealthPayload | null>(null);

  useEffect(() => {
    const load = () => {
      fetch('/api/system-health')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(setSystemHealth)
        .catch((error) => setSystemHealth({
          health: 'warning',
          checks: [{ id: 'system-health.api', label: 'System health API', health: 'warning', value: 'warning', details: error.message, source: 'runtime' }],
          recommendations: [{ id: 'system-health.api', severity: 'warning', source: 'runtime', title: 'System health non leggibile', details: error.message, dismissible: false, createdAt: new Date().toISOString() }],
          generatedAt: new Date().toISOString(),
        }));
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const metrics = useMemo(() => {
    const active = sessions.filter(isSessionActive).length;
    const errors = events.filter((event) => String(event.type ?? event.event ?? '').toLowerCase().includes('error')).length;
    const latest = Math.max(...sessions.map((session) => Number(session.updated_at ?? session.started_at ?? 0)), 0);
    const costlyModel = costs.byModel?.[0]?.model ?? 'n/d';
    return { active, errors, latest, costlyModel };
  }, [sessions, events, costs.byModel]);

  const checks = systemHealth?.checks ?? [];
  const memoryCheck = findCheck(checks, 'memory.shared-context');
  const cronCheck = findCheck(checks, 'cron.jobs') ?? findCheck(checks, 'cron.api');
  const runtimeCheck = findCheck(checks, 'runtime.sessions');
  const health = systemHealth?.health ?? 'warning';
  const recommendations = systemHealth?.recommendations ?? [];

  return (
    <section style={{ overflow: 'auto', height: '100%', padding: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1.2fr) repeat(3, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={cardStyle(healthColor(health))}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Argus System Health</div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 34, color: healthColor(health), textTransform: 'uppercase', fontWeight: 800 }}>{health}</span>
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>ultimo evento {fmtAge(metrics.latest)}</span>
          </div>
          <div style={{ marginTop: 10, color: 'var(--text-dim)', fontSize: 11 }}>Monitor server-side da `/api/system-health`.</div>
        </div>
        <Metric title="Sessioni attive" value={metrics.active} sub={`${sessions.length} totali`} />
        <Metric title="Costo oggi" value={fmtMoney(costs.today)} sub={`top: ${metrics.costlyModel}`} accent="var(--copper)" />
        <Metric title="Memory health" value={(memoryCheck?.health ?? 'warning').toUpperCase()} sub={String(memoryCheck?.value ?? 'n/d')} accent={healthColor(memoryCheck?.health ?? 'warning')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <StatusCard title="Runtime Olympus" health={runtimeCheck?.health ?? 'warning'} rows={[[runtimeCheck?.label ?? 'Sessioni totali', runtimeCheck?.value ?? sessions.length], ['Ultimo aggiornamento', fmtAge(metrics.latest)], ['Errori feed recente', metrics.errors]]} />
          <StatusCard title="Cron / Watchdog" health={cronCheck?.health ?? 'warning'} rows={[[cronCheck?.label ?? 'Cron', cronCheck?.value ?? 'n/d'], ['Dettaglio', cronCheck?.details ?? 'n/d'], ['Sorgente', '/api/system-health']]} />
          <StatusCard title="Shared Context" health={memoryCheck?.health ?? 'warning'} rows={[[memoryCheck?.label ?? 'Shared context', memoryCheck?.value ?? 'n/d'], ['Dettaglio', memoryCheck?.details ?? 'n/d'], ['Pagina', <Link key="memory" href="/memory" style={{ color: 'var(--copper)' }}>Apri memory →</Link>]]} />
          <StatusCard title="Lineage" health={sessions.length ? 'ok' : 'warning'} rows={[[ 'Sessioni totali', sessions.length], ['Eventi live', events.length], ['Vista completa', <Link key="lineage" href="/lineage" style={{ color: 'var(--copper)' }}>Apri grafo →</Link>]]} />
        </div>

        <div style={cardStyle()}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--copper)', textTransform: 'uppercase', marginBottom: 14 }}>Azioni consigliate</div>
          {recommendations.length ? (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none' }}>
              {recommendations.map((item) => (
                <li key={item.id} style={{ borderLeft: `2px solid ${healthColor(item.severity === 'critical' ? 'error' : item.severity)}`, paddingLeft: 10, color: 'var(--text)', fontSize: 12, lineHeight: 1.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{item.title}</strong>
                    <span style={{ color: healthColor(item.severity === 'critical' ? 'error' : item.severity), fontSize: 10, textTransform: 'uppercase' }}>{item.severity}</span>
                  </div>
                  <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>{item.details}</div>
                  {item.actionHref && <Link href={item.actionHref} style={{ color: 'var(--copper)', display: 'inline-block', marginTop: 6 }}>Apri →</Link>}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ color: 'var(--green)', fontSize: 13 }}>Nessun warning immediato. Sistema in stato operativo.</div>
          )}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="agent-btn" href="/memory">Memory</Link>
            <Link className="agent-btn" href="/crons">Crons</Link>
            <Link className="agent-btn" href="/agents">Agents</Link>
            <Link className="agent-btn" href="/lineage">Lineage</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ title, value, sub, accent }: { title: string; value: string | number; sub: string; accent?: string }) {
  return (
    <div style={cardStyle()}>
      <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{title}</div>
      <div style={{ marginTop: 14, fontSize: 26, fontWeight: 800, color: accent ?? 'var(--text)' }}>{value}</div>
      <div style={{ marginTop: 8, color: 'var(--text-dim)', fontSize: 11 }}>{sub}</div>
    </div>
  );
}

function StatusCard({ title, health, rows }: { title: string; health: 'ok' | 'warning' | 'error'; rows: [string, React.ReactNode][] }) {
  return (
    <div style={cardStyle()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--copper)', textTransform: 'uppercase' }}>{title}</div>
        <div style={{ fontSize: 10, color: healthColor(health), textTransform: 'uppercase', fontWeight: 700 }}>{health}</div>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11 }}>
            <span style={{ color: 'var(--text-dim)' }}>{label}</span>
            <span style={{ color: 'var(--text)', textAlign: 'right' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
