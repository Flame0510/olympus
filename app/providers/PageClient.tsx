'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useResponsive } from '../design-system';
import { Pill, Surface, toneVars } from '../components/ui';
import OlympusLoader from '../components/OlympusLoader';
import type { Tone } from '../components/ui';
import { useOlympusTimezone } from '@/lib/hooks/useOlympusTimezone';
import { formatDateTimeInTimezone } from '@/lib/timezone';

interface OAuthProvider {
  provider: string;
  status: string;
  expiresAt?: number;
  remainingMs?: number;
  profiles: OAuthProfile[];
}

interface OAuthProfile {
  profileId: string;
  type: string;
  status: string;
  label: string;
  expiresAt?: number;
  remainingMs?: number;
}

interface ProviderEntry {
  provider: string;
  effective: { kind: string; detail: string };
  profiles: { count: number; oauth: number; token: number; apiKey: number; labels: string[] };
  modelsJson?: { value: string; source: string };
}

interface QuotaMetric {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  unit: string;
  period: string;
  pct: number;
  source?: string;
  resetAt?: string;
}

interface ProviderUsageData {
  providers: { key: string; label: string; totalCost: number; totalTokens: number; sessionCount: number }[];
  openrouterLive: { usage: number; limit: number; limitRemaining: number } | null;
  quotas: Record<string, QuotaMetric[] | null>;
}

interface ModelsData {
  defaultModel: string;
  fallbacks: string[];
  aliases: Record<string, string>;
  allowed: string[];
  auth: {
    providers: ProviderEntry[];
    oauth: { providers: OAuthProvider[] };
    missingProvidersInUse: string[];
  };
}

function statusTone(status: string): Tone {
  if (status === 'ok') return 'success';
  if (status === 'expiring') return 'warning';
  if (status === 'expired') return 'danger';
  if (status === 'static') return 'info';
  return 'neutral';
}

function statusLabel(status: string): string {
  if (status === 'ok') return 'OK';
  if (status === 'expiring') return 'EXPIRING';
  if (status === 'expired') return 'EXPIRED';
  if (status === 'static') return 'STATIC';
  return status.toUpperCase();
}

function formatRemaining(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(value < 10 ? 2 : 1);
}

function formatMetricValue(value: number, unit: string): string {
  return `${formatNumber(value)} ${unit}`;
}

function periodLabel(period: string): string {
  if (period === 'daily') return 'daily';
  if (period === 'weekly') return 'weekly';
  if (period === 'monthly') return 'monthly';
  return period;
}

function providerIcon(provider: string): string {
  if (provider.startsWith('anthropic') || provider === 'claude-cli') return '◆';
  if (provider.startsWith('openai') || provider.startsWith('openai-codex')) return '◉';
  if (provider.startsWith('github')) return '◈';
  if (provider.startsWith('openrouter')) return '◎';
  if (provider.startsWith('groq')) return '▶';
  return '○';
}

function normalizeProviderKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function hasQuotaMetrics(metrics: QuotaMetric[] | null | undefined): metrics is QuotaMetric[] {
  return Array.isArray(metrics) && metrics.length > 0;
}

function resolveQuotaProviderKey(
  quotas: Record<string, QuotaMetric[] | null> | undefined,
  provider: string,
  aliases: Record<string, string> | undefined,
): string | null {
  if (!quotas || !provider) return null;

  if (provider === 'openai-codex' && quotas['openai-codex']) return 'openai-codex';
  if (provider === 'github-copilot' && quotas['github-copilot']) return 'github-copilot';
  if (provider === 'openai' && hasQuotaMetrics(quotas['openai-codex'])) return 'openai-codex';
  if (provider === 'github' && hasQuotaMetrics(quotas['github-copilot'])) return 'github-copilot';

  const keys = Object.keys(quotas);
  const directCandidates = [provider, aliases?.[provider]].filter(Boolean) as string[];
  for (const candidate of directCandidates) {
    if (candidate in quotas) return candidate;
  }

  const normalizedProvider = normalizeProviderKey(provider);
  const aliasValues = Object.entries(aliases ?? {})
    .filter(([, target]) => target.startsWith(`${provider}/`) || target.startsWith(`${provider}-`))
    .map(([alias]) => alias);

  const synonymMap: Record<string, string[]> = {
    openaicodex: ['openai-codex', 'openai', 'codex'],
    openai: ['openai', 'openai-codex', 'codex'],
    githubcopilot: ['github-copilot', 'copilot', 'github'],
    github: ['github', 'github-copilot', 'copilot'],
    openrouter: ['openrouter'],
    groq: ['groq'],
    anthropic: ['anthropic', 'claude'],
    claudecli: ['claude-cli'],
  };

  const candidatePool = new Set<string>([
    provider,
    normalizedProvider,
    ...directCandidates,
    ...aliasValues,
    ...(synonymMap[normalizedProvider] ?? []),
  ]);

  for (const key of keys) {
    const normalizedKey = normalizeProviderKey(key);
    for (const candidate of candidatePool) {
      const normalizedCandidate = normalizeProviderKey(candidate);
      if (
        normalizedCandidate === normalizedKey
        || normalizedCandidate.startsWith(normalizedKey)
        || normalizedKey.startsWith(normalizedCandidate)
      ) {
        return key;
      }
    }
  }

  return null;
}

function providerQuotaMessage(provider: string): string {
  if (provider === 'anthropic') return 'Quota not exposed for Anthropic runtime';
  if (provider === 'claude-cli') return 'Quota not exposed for ClaudeCLI runtime';
  return 'Quota not exposed for this provider';
}

function quotaSummary(metrics: QuotaMetric[] | null | undefined): string {
  if (!metrics?.length) return 'quota n/a';
  const primary = metrics[0];
  return `${primary.pct.toFixed(0)}% quota`;
}

function getPreferredProvider(
  modelsData: ModelsData,
  usage: ProviderUsageData | null,
): string {
  const providers = modelsData.auth?.providers ?? [];
  if (!providers.length) return '';

  const providerKeys = new Set(providers.map((entry) => entry.provider));
  const defaultProvider = modelsData.defaultModel?.split('/')[0];
  if (defaultProvider && providerKeys.has(defaultProvider)) return defaultProvider;

  if (usage?.quotas) {
    for (const provider of providers) {
      const quotaKey = resolveQuotaProviderKey(usage.quotas, provider.provider, modelsData.aliases);
      if (quotaKey && usage.quotas[quotaKey]?.length) return provider.provider;
    }
  }

  return providers[0]?.provider ?? '';
}

function quotaEmptyState(provider: string, state: 'loading' | 'error' | 'empty', usageError: string): { title: string; detail: string } {
  if (state === 'loading') {
    return {
      title: 'Loading quota...',
      detail: 'Fetching live quota from Olympus runtime.',
    };
  }

  if (state === 'error') {
    return {
      title: usageError || 'Quota API failed to load',
      detail: 'Usage data could not be refreshed from /api/provider-usage.',
    };
  }

  return {
    title: providerQuotaMessage(provider),
    detail: provider ? 'Usage is shown when Olympus has DB session data, but live quota is not exposed by the current runtime status.' : 'Select a provider to inspect quota metrics.',
  };
}

export default function ProvidersPage() {
  const [data, setData] = useState<ModelsData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('');
  const isMobile = useResponsive('md');
  const [tab, setTab] = useState<'providers' | 'details'>('providers');
  const [usageData, setUsageData] = useState<ProviderUsageData | null>(null);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [usageError, setUsageError] = useState('');
  const [loginLoading, setLoginLoading] = useState<string>('');
  const [oauthFlow, setOauthFlow] = useState<{provider:string;verificationUri:string|null;userCode:string|null} | null>(null);
  const [apiKeyModal, setApiKeyModal] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [aliasForm, setAliasForm] = useState({ name: '', model: '' });
  const [aliasSaving, setAliasSaving] = useState('');
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string>>({});
  const timezone = useOlympusTimezone();

  async function loadUsage() {
    try {
      setUsageError('');
      const res = await fetch('/api/provider-usage', { cache: 'no-store', credentials: 'include' });
      if (!res.ok) {
        setUsageData(null);
        setUsageError(`Quota API failed to load (HTTP ${res.status})`);
        return;
      }

      const usage = await res.json() as ProviderUsageData;
      setUsageData(usage);
      setSelectedProvider((current) => {
        if (current || !data) return current;
        return getPreferredProvider(data, usage);
      });
    } catch {
      setUsageData(null);
      setUsageError('Quota API failed to load');
    } finally {
      setUsageLoaded(true);
    }
  }

  async function load() {
    try {
      const res = await fetch('/api/providers', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as ModelsData;
      setData(json);
      setSelectedProvider((current) => current || getPreferredProvider(json, usageData));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    void loadUsage();
    const t = setInterval(() => void loadUsage(), 30_000);
    return () => clearInterval(t);
  }, []);

  const oauthByProvider = new Map<string, OAuthProvider>(
    (data?.auth?.oauth?.providers ?? []).map((p) => [p.provider, p]),
  );

  const selected = data?.auth?.providers?.find((p) => p.provider === selectedProvider);
  const selectedOAuth = oauthByProvider.get(selectedProvider);
  const selectedQuotaKey = resolveQuotaProviderKey(usageData?.quotas, selectedProvider, data?.aliases);
  const selectedQuotaMetrics = selectedQuotaKey ? usageData?.quotas?.[selectedQuotaKey] : null;
  const selectedUsageEntry = usageData?.providers.find((entry) => entry.key === selectedQuotaKey || entry.key === selectedProvider) ?? null;
  const selectedQuotaState: 'loading' | 'error' | 'empty' = !usageLoaded
    ? 'loading'
    : usageError
      ? 'error'
      : 'empty';
  const selectedQuotaEmpty = quotaEmptyState(selectedProvider, selectedQuotaState, usageError);

  const providerModels = selectedProvider
    ? (data?.allowed ?? []).filter((m) => m.startsWith(selectedProvider + '/') || m.startsWith(selectedProvider + '-'))
    : [];

  const providerAliases = useMemo(() => (
    selectedProvider
      ? Object.entries(data?.aliases ?? {}).filter(([, v]) => v.startsWith(selectedProvider + '/') || v.startsWith(selectedProvider + '-'))
      : []
  ), [selectedProvider, data?.aliases]);

  useEffect(() => {
    const drafts = Object.fromEntries(providerAliases.map(([alias, model]) => [alias, model]));
    setAliasDrafts(drafts);
  }, [providerAliases]);

  async function handleAddAlias() {
    const n = aliasForm.name.trim();
    const m = aliasForm.model.trim();
    if (!n || !m) return;
    setAliasSaving('add');
    try {
      await fetch('/api/aliases/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: n, model: m }),
      });
      await load();
      setAliasForm({ name: '', model: '' });
    } catch {}
    setAliasSaving('');
  }

  async function handleRemoveAlias(alias: string) {
    setAliasSaving(alias);
    try {
      await fetch('/api/aliases/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias }),
      });
      await load();
    } catch {}
    setAliasSaving('');
  }

  async function handleUpdateAlias(alias: string) {
    const model = (aliasDrafts[alias] ?? '').trim();
    if (!model) return;
    setAliasSaving(`save:${alias}`);
    try {
      await fetch('/api/aliases/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, model }),
      });
      await load();
    } catch {}
    setAliasSaving('');
  }

  const oauthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleOAuthLogin(provider: string) {
    setLoginLoading(provider); setOauthFlow(null);
    try {
      const res = await fetch('/api/providers/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, method: 'oauth' })
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginLoading('');
        return;
      }
      if (data.verificationUri || data.userCode) {
        setOauthFlow({ provider, verificationUri: data.verificationUri, userCode: data.userCode });
        if (oauthTimerRef.current) clearInterval(oauthTimerRef.current);
        oauthTimerRef.current = setInterval(async () => {
          try {
            const sRes = await fetch(`/api/providers/oauth/status?provider=${encodeURIComponent(provider)}`);
            const sData = await sRes.json();
            if (sData.status === 'completed') { clearInterval(oauthTimerRef.current!); oauthTimerRef.current = null; setOauthFlow(null); await load(); }
            else if (sData.status === 'failed') { clearInterval(oauthTimerRef.current!); oauthTimerRef.current = null; setOauthFlow(null); }
          } catch {}
        }, 3000);
      } else if (data.status === 'already_connected') { await load(); }
    } catch {
      // If OAuth login fails (provider not supported, etc.), silently reset
    }
    setLoginLoading('');
  }

  async function handleApiKeyConnect(provider: string) {
    if (!apiKeyInput.trim()) return;
    setLoginLoading(provider);
    try {
      await fetch('/api/providers/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, method: 'api-key', apiKey: apiKeyInput.trim() }) });
      setApiKeyModal(null); setApiKeyInput(''); await load();
    } catch {}
    setLoginLoading('');
  }

  async function handleDisconnect(provider: string) {
    setLoginLoading(provider);
    try {
      await fetch('/api/providers/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, disconnect: true }) });
      await load();
    } catch {}
    setLoginLoading('');
  }

  return (
    <div style={{
      height: '100vh', background: 'var(--bg)', color: 'var(--text)',
      fontFamily: 'var(--font-mono-stack)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        height: '48px', padding: '0 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, boxSizing: 'border-box'
      }}>
        <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: '20px', letterSpacing: '4px', color: 'var(--copper)' }}>PROVIDERS</span>
        <span style={{ fontSize: 10, color: '#555' }}>
          default: <span style={{ color: '#d6e2e8' }}>{data?.defaultModel ?? '—'}</span>
        </span>
      </div>

      {loading && <OlympusLoader label="LOADING PROVIDERS" compact />}
      {error && <div style={{ padding: 20, color: '#ef4444', fontSize: 12 }}>{error}</div>}

      {isMobile && data && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <button onClick={() => setTab('providers')} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: tab === 'providers' ? 'var(--bg3)' : 'transparent', color: tab === 'providers' ? 'var(--copper)' : '#888' }}>PROVIDERS</button>
          <button onClick={() => setTab('details')} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: tab === 'details' ? 'var(--bg3)' : 'transparent', color: tab === 'details' ? 'var(--copper)' : '#888' }}>DETAILS</button>
        </div>
      )}

      {data && (
        <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 0 }}>
          <section style={{ width: isMobile ? '100%' : 220, borderRight: isMobile ? 'none' : '1px solid var(--border)', overflow: 'auto', flexShrink: 0, display: isMobile && tab !== 'providers' ? 'none' : 'block' }}>
            {data.auth.providers.map((p) => {
              const oauth = oauthByProvider.get(p.provider);
              const status = oauth?.status ?? 'static';
              const isActive = selectedProvider === p.provider;
              const quotaKey = resolveQuotaProviderKey(usageData?.quotas, p.provider, data.aliases);
              const quotaMetrics = quotaKey ? usageData?.quotas?.[quotaKey] : null;
              return (
                <button
                  key={p.provider}
                  onClick={() => {
                    setSelectedProvider(p.provider);
                    if (isMobile) setTab('details');
                  }}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: isActive ? '#1a1208' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)',
                    color: 'var(--text)', padding: '10px 12px', cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: toneVars[statusTone(status)].text, fontSize: 14 }}>{providerIcon(p.provider)}</span>
                    <span style={{ color: isActive ? 'var(--copper)' : 'var(--text)', fontSize: 12 }}>{p.provider}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Pill tone={statusTone(status)}>{statusLabel(status)}</Pill>
                    <span style={{ fontSize: 9, color: '#555' }}>{p.effective.kind}</span>
                    <span style={{ fontSize: 9, color: hasQuotaMetrics(quotaMetrics) ? '#4a7a94' : '#666' }}>{quotaSummary(quotaMetrics)}</span>
                  </div>
                </button>
              );
            })}
          </section>

          <section style={{ flex: 1, overflow: 'auto', padding: isMobile ? 10 : 16, display: isMobile && tab !== 'details' ? 'none' : 'flex', flexDirection: 'column', gap: 16, alignItems: 'stretch' }}>
            {selected && (
              <>
                <Surface variant="panel" className="providers-panel">
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--copper)', letterSpacing: '0.08em' }}>
                    AUTH
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Row label="kind" value={selected.effective.kind} />
                    <Row label="source" value={selected.effective.detail} dim />
                    {selected.profiles.labels.map((l, i) => (
                      <Row key={i} label={i === 0 ? 'profile' : ''} value={l} />
                    ))}
                    {selectedOAuth && selectedOAuth.remainingMs !== undefined && (
                      <Row
                        label="expires"
                        value={formatRemaining(selectedOAuth.remainingMs)}
                        tone={statusTone(selectedOAuth.status)}
                      />
                    )}
                  </div>

                  {/* Login/OAuth buttons */}
                  <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {selectedOAuth && selectedOAuth.status !== 'ok' && (selected?.profiles.count ?? 0) === 0 && (
                      <button onClick={() => handleOAuthLogin(selectedProvider)} disabled={loginLoading === selectedProvider}
                        style={{ background: '#1a2a33', border: '1px solid #2a4a5a', borderRadius: 4, color: '#d6e2e8', fontSize: 10, padding: '6px 12px', cursor: 'pointer' }}>
                        {loginLoading === selectedProvider ? '⏳' : '🔑'} LOGIN WITH {selectedProvider.toUpperCase()}
                      </button>
                    )}
                    {(selected?.effective.kind === 'token' || selected?.effective.kind === 'api-key') && (
                      <button onClick={() => setApiKeyModal(selectedProvider)}
                        style={{ background: '#1a2a33', border: '1px solid #2a4a5a', borderRadius: 4, color: '#d6e2e8', fontSize: 10, padding: '6px 12px', cursor: 'pointer' }}>
                        + ADD API KEY
                      </button>
                    )}
                    {(selectedOAuth?.status === 'ok' || (selected?.profiles.count ?? 0) > 0) && (
                      <>
                        <span style={{ fontSize: 10, color: '#4a8' }}>✅ Connected{selectedOAuth?.profiles?.[0]?.label ? ` via ${selectedOAuth.profiles[0].label}` : ''}</span>
                        <button onClick={() => handleDisconnect(selectedProvider)} disabled={loginLoading === selectedProvider}
                          style={{ background: 'transparent', border: '1px solid #5a3a3a', borderRadius: 4, color: '#d66', fontSize: 10, padding: '6px 12px', cursor: 'pointer' }}>
                          {loginLoading === selectedProvider ? '⏳' : '🚪'} DISCONNECT
                        </button>
                      </>
                    )}
                  </div>

                  {/* OAuth device code flow */}
                  {oauthFlow && oauthFlow.provider === selectedProvider && (
                    <div style={{ margin: '4px 12px 8px', padding: 8, background: '#0d1a22', border: '1px solid #1a3a4a', borderRadius: 4 }}>
                      {oauthFlow.verificationUri && <div style={{ fontSize: 10, color: '#8ab', marginBottom: 4 }}>1. Open <a href={oauthFlow.verificationUri} target="_blank" style={{ color: '#6af' }}>{oauthFlow.verificationUri}</a></div>}
                      {oauthFlow.userCode && <div style={{ fontSize: 10, color: '#8ab', marginBottom: 4 }}>2. Enter code: <strong style={{ fontSize: 14, color: '#fff', letterSpacing: 4 }}>{oauthFlow.userCode}</strong></div>}
                      <div style={{ fontSize: 9, color: '#666' }}>⏳ Waiting for authorization...</div>
                    </div>
                  )}

                  {/* API Key modal */}
                  {apiKeyModal === selectedProvider && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                      <div style={{ background: '#0f1a22', border: '1px solid #1a3a4a', borderRadius: 8, padding: 20, minWidth: 320 }}>
                        <div style={{ fontSize: 12, color: '#d6e2e8', marginBottom: 12 }}>Add API Key for <strong>{selectedProvider}</strong></div>
                        <input value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="sk-..."
                          style={{ width: '100%', background: '#0a141a', border: '1px solid #1a2a33', borderRadius: 4, padding: '8px 10px', color: '#d6e2e8', fontSize: 11, marginBottom: 12, boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => { setApiKeyModal(null); setApiKeyInput(''); }} style={{ background: 'transparent', border: '1px solid #2a4a5a', borderRadius: 4, color: '#888', fontSize: 10, padding: '6px 12px', cursor: 'pointer' }}>CANCEL</button>
                          <button onClick={() => handleApiKeyConnect(selectedProvider)} disabled={!apiKeyInput.trim()} style={{ background: '#1a3a4a', border: '1px solid #2a5a7a', borderRadius: 4, color: '#d6e2e8', fontSize: 10, padding: '6px 12px', cursor: 'pointer' }}>CONNECT</button>
                        </div>
                      </div>
                    </div>
                  )}
                </Surface>

                <Surface variant="panel" className="providers-panel">
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--copper)', letterSpacing: '0.08em' }}>
                    QUOTA &amp; USAGE
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedUsageEntry && (
                      <>
                        <Row label="cost" value={`$${selectedUsageEntry.totalCost.toFixed(3)}`} />
                        <Row label="tokens" value={formatNumber(selectedUsageEntry.totalTokens)} />
                        <Row label="sessions" value={String(selectedUsageEntry.sessionCount)} />
                      </>
                    )}
                    {hasQuotaMetrics(selectedQuotaMetrics) ? selectedQuotaMetrics.map((metric) => (
                      <div key={`${selectedProvider}-${metric.label}-${metric.period}`} style={{ border: '1px solid rgba(42,122,148,0.25)', background: 'rgba(15,30,38,0.75)', borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 10 }}>
                          <span style={{ color: '#d6e2e8' }}>{metric.label}</span>
                          <span style={{ color: metric.pct >= 90 ? 'var(--danger)' : '#4a7a94' }}>{metric.pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 10, color: '#9fb4be', flexWrap: 'wrap' }}>
                          <span>{formatMetricValue(metric.used, metric.unit)} / {formatMetricValue(metric.limit, metric.unit)}</span>
                          <span>{formatMetricValue(metric.remaining, metric.unit)} remaining · {periodLabel(metric.period)}</span>
                        </div>
                        <div style={{ height: 5, background: '#12232c', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${metric.pct}%`, background: metric.pct >= 90 ? 'var(--danger)' : '#2a7a94', borderRadius: 999 }} />
                        </div>
                        {metric.resetAt && <span style={{ fontSize: 9, color: '#666' }}>resets {formatDateTimeInTimezone(metric.resetAt, {}, timezone)}</span>}
                        {(metric.source && metric.source !== 'api') && <span style={{ fontSize: 9, color: '#D49B35' }}>source: {metric.source}</span>}
                      </div>
                    )) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 11, color: '#8fa3ad' }}>{selectedQuotaEmpty.title}</div>
                        <div style={{ fontSize: 10, color: '#666' }}>{selectedQuotaEmpty.detail}</div>
                      </div>
                    )}
                  </div>
                </Surface>

                <Surface variant="panel" className="providers-panel">
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--copper)', letterSpacing: '0.08em' }}>
                    ALIASES
                  </div>
                  <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {providerAliases.length === 0 ? (
                      <div style={{ fontSize: 10, color: '#555' }}>no aliases for this provider</div>
                    ) : providerAliases.map(([alias, model]) => {
                      const draft = aliasDrafts[alias] ?? model;
                      const changed = draft.trim() !== model;
                      return (
                        <div key={alias} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                          <button
                            onClick={() => handleRemoveAlias(alias)}
                            disabled={aliasSaving === alias}
                            style={{
                              background: 'none', border: 'none', color: aliasSaving === alias ? '#555' : '#8b5e3c',
                              cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1,
                            }}
                            title={`Remove alias ${alias}`}
                          >{aliasSaving === alias ? '…' : '✕'}</button>
                          <span style={{ color: '#D49B35', minWidth: 90 }}>{alias}</span>
                          <input
                            value={draft}
                            onChange={(e) => setAliasDrafts((prev) => ({ ...prev, [alias]: e.target.value }))}
                            placeholder="provider/model"
                            style={{
                              flex: 1, background: '#0a141a', border: changed ? '1px solid #D49B35' : '1px solid #1a2a33', borderRadius: 4,
                              padding: '4px 6px', fontSize: 10, color: '#d6e2e8', outline: 'none',
                            }}
                          />
                          <button
                            onClick={() => handleUpdateAlias(alias)}
                            disabled={aliasSaving === `save:${alias}` || !draft.trim() || !changed}
                            style={{
                              background: aliasSaving === `save:${alias}` || !draft.trim() || !changed ? 'transparent' : '#1a2a33',
                              border: '1px solid #2a4a5a', borderRadius: 4, color: '#d6e2e8',
                              fontSize: 10, padding: '4px 8px', cursor: 'pointer',
                            }}
                          >{aliasSaving === `save:${alias}` ? '…' : 'SAVE'}</button>
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
                      <input
                        value={aliasForm.name}
                        onChange={(e) => setAliasForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="new alias"
                        style={{
                          flex: '0 0 90px', background: '#0a141a', border: '1px solid #1a2a33', borderRadius: 4,
                          padding: '4px 6px', fontSize: 10, color: '#d6e2e8', outline: 'none',
                        }}
                      />
                      <input
                        value={aliasForm.model}
                        onChange={(e) => setAliasForm(f => ({ ...f, model: e.target.value }))}
                        placeholder="target model"
                        style={{
                          flex: 1, background: '#0a141a', border: '1px solid #1a2a33', borderRadius: 4,
                          padding: '4px 6px', fontSize: 10, color: '#d6e2e8', outline: 'none',
                        }}
                      />
                      <button
                        onClick={handleAddAlias}
                        disabled={aliasSaving === 'add' || !aliasForm.name.trim() || !aliasForm.model.trim()}
                        style={{
                          background: aliasSaving === 'add' || !aliasForm.name.trim() || !aliasForm.model.trim() ? 'transparent' : '#1a2a33',
                          border: '1px solid #2a4a5a', borderRadius: 4, color: '#d6e2e8',
                          fontSize: 10, padding: '4px 8px', cursor: 'pointer',
                        }}
                      >{aliasSaving === 'add' ? '…' : '+NEW'}</button>
                    </div>
                  </div>
                </Surface>

                {providerModels.length > 0 && (
                  <Surface variant="panel" className="providers-panel">
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--copper)', letterSpacing: '0.08em' }}>
                      ALLOWED MODELS ({providerModels.length})
                    </div>
                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {providerModels.map((m) => {
                        const isDefault = m === data.defaultModel;
                        const isFallback = data.fallbacks.includes(m);
                        return (
                          <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            <span style={{ color: isDefault ? 'var(--copper)' : '#888' }}>{m}</span>
                            {isDefault && <Pill tone="accent">DEFAULT</Pill>}
                            {isFallback && <Pill tone="info">FALLBACK</Pill>}
                          </div>
                        );
                      })}
                    </div>
                  </Surface>
                )}
              </>
            )}
          </section>
        </div>
      )}

    </div>
  );
}

function Row({ label, value, dim, tone }: { label: string; value: string; dim?: boolean; tone?: Tone }) {
  const color = tone ? toneVars[tone].text : dim ? '#555' : '#d6e2e8';
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
      <span style={{ color: '#555', minWidth: 60, flexShrink: 0 }}>{label}</span>
      <span style={{ color, wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
