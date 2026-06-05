'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MemoryContextPayload, StrategyHealth } from '@/lib/memory-context';
import { SkeletonLines, SkeletonMetric } from '../components/Skeleton';

function cardTone(health: StrategyHealth): { border: string; text: string; bg: string } {
  if (health === 'ok') return { border: '#255b3f', text: '#5ee9a0', bg: 'rgba(34, 197, 94, 0.08)' };
  if (health === 'warning') return { border: '#7c5a1a', text: '#f6c66b', bg: 'rgba(245, 158, 11, 0.08)' };
  return { border: '#7f1d1d', text: '#fca5a5', bg: 'rgba(239, 68, 68, 0.08)' };
}

function formatBytes(value: number | null): string {
  if (value === null) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('it-IT');
}

function pill(value: string, tone: StrategyHealth | 'neutral' = 'neutral') {
  const theme = tone === 'neutral' ? { border: '#2b2b31', text: '#b8b8c2', bg: 'rgba(255,255,255,0.02)' } : cardTone(tone);
  return (
    <span style={{ border: `1px solid ${theme.border}`, color: theme.text, background: theme.bg, borderRadius: 999, padding: '2px 8px', fontSize: 10, letterSpacing: '0.04em' }}>
      {value}
    </span>
  );
}

export default function MemoryContextPageClient() {
  const [data, setData] = useState<MemoryContextPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/memory-context', { cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData((await res.json()) as MemoryContextPayload);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const metrics = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Agenti', value: data.summary.totalAgents },
      { label: 'USER linked', value: data.summary.userLinked },
      { label: 'Warnings', value: data.summary.warnings },
      { label: 'Global files', value: data.summary.globalFiles },
    ];
  }, [data]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '24px 20px 40px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: 'var(--copper)', fontSize: 12, letterSpacing: '0.08em', marginBottom: 6 }}>OBSERVATORY</div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 34, fontWeight: 400 }}>Memory / Context</h1>
            <p style={{ margin: '10px 0 0', color: 'var(--text-dim)', maxWidth: 760, lineHeight: 1.5, fontSize: 13 }}>
              USER condiviso quando serve identità comune, MEMORY locale per ogni agente, SOUL e AGENTS locali come bootstrap operativo.
            </p>
          </div>
          {data?.strategy && pill(`health: ${data.strategy.health}`, data.strategy.health)}
        </header>

        {loading && (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {Array.from({ length: 4 }).map((_, index) => (
                <article key={index} style={{ border: '1px solid var(--border)', background: 'var(--bg2)', padding: 16 }}>
                  <SkeletonLines count={1} />
                  <div style={{ marginTop: 10 }}><SkeletonMetric /></div>
                </article>
              ))}
            </section>
            <section style={{ border: '1px solid var(--border)', background: 'var(--bg2)', padding: 16 }}>
              <SkeletonLines count={8} />
            </section>
          </>
        )}
        {error && <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>}

        {data && (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {metrics.map((metric) => (
                <article key={metric.label} style={{ border: '1px solid var(--border)', background: 'var(--bg2)', padding: 16 }}>
                  <div style={{ color: '#8a8a92', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{metric.label}</div>
                  <div style={{ marginTop: 10, fontSize: 30, color: 'var(--copper)', fontFamily: 'var(--font-serif)' }}>{metric.value}</div>
                </article>
              ))}
            </section>

            <section style={{ border: '1px solid var(--border)', background: 'var(--bg2)' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--copper)' }}>Agent Memory Health</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {pill(`user: ${data.strategy.userProfile}`)}
                  {pill(`memory: ${data.strategy.memory}`)}
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#8a8a92', fontSize: 11 }}>
                      {['Agent', 'Workspace', 'USER', 'MEMORY', 'AGENTS', 'SOUL', 'HEARTBEAT', 'Strategy', 'Warnings'].map((label) => (
                        <th key={label} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.agents.map((agent) => (
                      <tr key={`${agent.agentId}:${agent.workspace}`} style={{ verticalAlign: 'top' }}>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 13 }}>{agent.name}</div>
                          <div style={{ color: '#8a8a92', fontSize: 11, marginTop: 4 }}>{agent.agentId} · {agent.source.join(', ')}</div>
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, color: '#c7c7d0', maxWidth: 220, wordBreak: 'break-word' }}>{agent.workspace}</td>
                        {Object.values(agent.files).map((file) => (
                          <td key={`${agent.agentId}-${file.key}`} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, minWidth: 150 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {pill(file.exists ? (file.isSymlink ? 'linked' : 'local') : 'missing', file.exists ? 'ok' : 'warning')}
                              <div style={{ color: '#8a8a92' }}>{formatBytes(file.size)} · {formatDate(file.mtime)}</div>
                              <div style={{ color: '#73737c', wordBreak: 'break-word' }}>{file.path}</div>
                              {file.symlinkTarget && <div style={{ color: '#b8b8c2', wordBreak: 'break-word' }}>→ {file.symlinkTarget}</div>}
                            </div>
                          </td>
                        ))}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {pill(agent.strategy.health, agent.strategy.health)}
                            <div>USER: {agent.strategy.userProfile}</div>
                            <div>MEMORY: {agent.strategy.memory}</div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                          {agent.warnings.length ? (
                            <ul style={{ margin: 0, paddingLeft: 16, color: '#f6c66b' }}>
                              {agent.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                            </ul>
                          ) : (
                            <span style={{ color: '#5ee9a0' }}>No warnings</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={{ border: '1px solid var(--border)', background: 'var(--bg2)' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--copper)' }}>Global Context files</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, padding: 14 }}>
                {data.globalContext.map((file) => {
                  const tone = file.exists ? 'ok' : 'warning';
                  return (
                    <article key={file.key} style={{ border: '1px solid var(--border)', background: 'var(--bg)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <strong style={{ fontSize: 13 }}>{file.key}</strong>
                        {pill(file.exists ? 'present' : 'missing', tone)}
                      </div>
                      <div style={{ color: '#8a8a92', fontSize: 11, wordBreak: 'break-word' }}>{file.path}</div>
                      <div style={{ color: '#b8b8c2', fontSize: 11 }}>{formatBytes(file.size)} · {formatDate(file.mtime)}</div>
                      {file.symlinkTarget && <div style={{ color: '#b8b8c2', fontSize: 11, wordBreak: 'break-word' }}>→ {file.symlinkTarget}</div>}
                      {file.warnings.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 16, color: '#f6c66b', fontSize: 11 }}>
                          {file.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                        </ul>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            {data.strategy.warnings.length > 0 && (
              <section style={{ border: '1px solid var(--border)', background: 'var(--bg2)', padding: 14 }}>
                <strong style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--copper)' }}>Warnings</strong>
                <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: '#f6c66b', fontSize: 12, lineHeight: 1.5 }}>
                  {data.strategy.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
