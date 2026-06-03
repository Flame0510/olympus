'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

const TOKEN = 'olympus2026';
const API_HEADERS = { Authorization: `Bearer ${TOKEN}` };

interface AgentFile {
  path: string;
  rel_path?: string;
  name?: string;
  type?: string;
  displayName?: string;
}

interface AgentSession {
  model?: string;
}

interface Agent {
  agent_id: string;
  status: string;
  sessions: AgentSession[];
  files: AgentFile[];
  config_model?: string;
  workspace_path?: string;
}

interface AgentConfigRecord {
  id: string;
  name?: string;
  label?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
  defaultModel?: string;
  default_model?: string;
  identity?: {
    name?: string;
    emoji?: string;
  };
}

interface EditableAgentConfig extends AgentConfigRecord {
  currentId?: string;
}

interface TelegramAccountSummary {
  accountId: string;
  name?: string;
  enabled?: boolean;
  allowFrom?: string[];
  defaultTo?: string | string[];
  dmPolicy?: string;
  tokenStatus?: 'masked' | 'present' | 'missing';
}

interface EditableTelegramAccount extends TelegramAccountSummary {
  currentAccountId?: string;
  tokenReplacement?: string;
}

interface TelegramBindingSummary {
  type?: string;
  agentId?: string;
  enabled?: boolean;
  allowFrom?: string[];
  defaultTo?: string | string[];
  dmPolicy?: string;
  match?: {
    channel?: string;
    accountId?: string;
    from?: string;
    to?: string;
    peer?: string;
  };
}

interface AgentChannelSummary {
  agentId: string;
  config: AgentConfigRecord;
  telegram: {
    accounts: TelegramAccountSummary[];
    bindings: TelegramBindingSummary[];
  };
}

type FileTree = Record<string, AgentFile[]>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function fileKind(filePath: string): string {
  const p = (filePath ?? '').toLowerCase();
  if (p.endsWith('.md')) return 'markdown';
  if (p.endsWith('.json')) return 'json';
  return 'text';
}

function buildTree(files: AgentFile[]): FileTree {
  const tree: FileTree = {};
  for (const f of files) {
    const relPath = f.rel_path ?? f.name ?? '';
    const parts = relPath.split('/');
    const dir = parts.length > 1 ? parts[0] : '';
    tree[dir] ??= [];
    tree[dir].push({ ...f, displayName: parts[parts.length - 1] });
  }
  return tree;
}

function formatValue(value: string | string[] | undefined): string {
  if (!value) return '—';
  return Array.isArray(value) ? value.join(', ') : value;
}

function formatListInput(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value.join(', ') : value;
}

function parseCsv(value: string): string[] | undefined {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function badgeStyle(color: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 6px',
    border: `1px solid ${color}`,
    color,
    borderRadius: 999,
    fontSize: 10,
    lineHeight: 1.2,
  };
}

function metaLineStyle(): CSSProperties {
  return {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
    wordBreak: 'break-word',
  };
}

function fieldStyle(): CSSProperties {
  return {
    width: '100%',
    background: '#0A0A0B',
    color: '#E8E8E8',
    border: '1px solid var(--border)',
    padding: '6px 8px',
    fontSize: 11,
    fontFamily: 'inherit',
  };
}

function cloneAgentConfig(config?: AgentConfigRecord): EditableAgentConfig {
  return {
    currentId: config?.id ?? '',
    id: config?.id ?? '',
    name: config?.name ?? '',
    label: config?.label ?? '',
    workspace: config?.workspace ?? '',
    agentDir: config?.agentDir ?? '',
    model: config?.model ?? '',
    defaultModel: config?.defaultModel ?? '',
    default_model: config?.default_model ?? '',
    identity: {
      name: config?.identity?.name ?? '',
      emoji: config?.identity?.emoji ?? '',
    },
  };
}

function cloneTelegramAccounts(accounts: TelegramAccountSummary[]): EditableTelegramAccount[] {
  return accounts.map((account) => ({
    currentAccountId: account.accountId,
    accountId: account.accountId,
    name: account.name ?? '',
    enabled: account.enabled ?? false,
    allowFrom: account.allowFrom ? [...account.allowFrom] : [],
    defaultTo: Array.isArray(account.defaultTo) ? [...account.defaultTo] : account.defaultTo ?? '',
    dmPolicy: account.dmPolicy ?? '',
    tokenStatus: account.tokenStatus ?? 'missing',
    tokenReplacement: '',
  }));
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentChannels, setAgentChannels] = useState<Record<string, AgentChannelSummary>>({});
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [mobileStep, setMobileStep] = useState(1);
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({});
  const [savingState, setSavingState] = useState<SaveState>('idle');
  const [configSavingState, setConfigSavingState] = useState<SaveState>('idle');
  const [loadingFile, setLoadingFile] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [editableConfig, setEditableConfig] = useState<EditableAgentConfig | null>(null);
  const [editableAccounts, setEditableAccounts] = useState<EditableTelegramAccount[]>([]);

  const toggleDir = (dirName: string) =>
    setOpenDirs((prev) => ({ ...prev, [dirName]: !prev[dirName] }));

  const selectedAgent = useMemo(
    () => agents.find((a) => a.agent_id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const selectedAgentChannel = selectedAgentId ? agentChannels[selectedAgentId] : undefined;
  const files = selectedAgent?.files ?? [];
  const fileTree = useMemo(() => buildTree(files), [files]);
  const rootFiles = fileTree[''] ?? [];
  const directoryNames = useMemo(
    () => Object.keys(fileTree).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [fileTree],
  );

  async function fetchAgents() {
    try {
      const [agentsRes, channelsRes] = await Promise.all([
        fetch('/api/agents-active', { headers: API_HEADERS, cache: 'no-store' }),
        fetch('/api/agents-config', { headers: API_HEADERS, cache: 'no-store' }),
      ]);
      if (!agentsRes.ok || !channelsRes.ok) return;
      const agentData = (await agentsRes.json()) as Agent[];
      const channelData = (await channelsRes.json()) as AgentChannelSummary[];
      const nextAgents = Array.isArray(agentData) ? agentData : [];
      const nextChannels = Array.isArray(channelData)
        ? Object.fromEntries(channelData.map((item) => [item.agentId, item]))
        : {};

      setAgents(nextAgents);
      setAgentChannels(nextChannels);

      if (!selectedAgentId && nextAgents.length) {
        setSelectedAgentId(nextAgents[0].agent_id);
      }
    } catch {
      // keep UI responsive on polling failures
    }
  }

  async function loadFile(path: string) {
    if (!path) return;
    setLoadingFile(true);
    setSelectedFilePath(path);
    setSavingState('idle');
    try {
      const res = await fetch(`/api/workspace?path=${encodeURIComponent(path)}`, {
        headers: API_HEADERS,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('load failed');
      const data = (await res.json()) as { content?: string };
      setEditorContent(data.content ?? '');
      setMobileStep(3);
    } catch {
      setEditorContent('');
      setSavingState('error');
    } finally {
      setLoadingFile(false);
    }
  }

  async function saveFile() {
    if (!selectedFilePath) return;
    setSavingState('saving');
    try {
      const res = await fetch('/api/workspace', {
        method: 'PUT',
        headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedFilePath, content: editorContent }),
      });
      if (!res.ok) throw new Error('save failed');
      setSavingState('saved');
      setTimeout(() => setSavingState('idle'), 1500);
    } catch {
      setSavingState('error');
    }
  }

  async function saveConfig() {
    if (!editableConfig) return;
    setConfigSavingState('saving');
    try {
      const payload = {
        agents: [editableConfig],
        telegramAccounts: editableAccounts.map((account) => ({
          currentAccountId: account.currentAccountId,
          accountId: account.accountId,
          name: account.name,
          enabled: !!account.enabled,
          allowFrom: parseCsv(formatListInput(account.allowFrom)),
          defaultTo: parseCsv(formatListInput(account.defaultTo)) ?? (typeof account.defaultTo === 'string' && account.defaultTo.trim() ? account.defaultTo.trim() : undefined),
          dmPolicy: typeof account.dmPolicy === 'string' && account.dmPolicy.trim() ? account.dmPolicy.trim() : undefined,
          tokenReplacement: account.tokenReplacement,
        })),
      };

      const res = await fetch('/api/agents-config', {
        method: 'PUT',
        headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('config save failed');
      const data = (await res.json()) as { data?: AgentChannelSummary[] };
      const nextChannels = Array.isArray(data.data)
        ? Object.fromEntries(data.data.map((item) => [item.agentId, item]))
        : agentChannels;
      setAgentChannels(nextChannels);
      const nextSelectedAgentId = editableConfig.id;
      setSelectedAgentId(nextSelectedAgentId);
      setEditableConfig(cloneAgentConfig(nextChannels[nextSelectedAgentId]?.config));
      setEditableAccounts(cloneTelegramAccounts(nextChannels[nextSelectedAgentId]?.telegram.accounts ?? []));
      setConfigSavingState('saved');
      setTimeout(() => setConfigSavingState('idle'), 1500);
      void fetchAgents();
    } catch {
      setConfigSavingState('error');
    }
  }

  useEffect(() => {
    void fetchAgents();
    const id = setInterval(() => void fetchAgents(), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setEditableConfig(cloneAgentConfig(selectedAgentChannel?.config));
    setEditableAccounts(cloneTelegramAccounts(selectedAgentChannel?.telegram.accounts ?? []));
    setConfigSavingState('idle');
  }, [selectedAgentChannel]);

  const saveLabel =
    savingState === 'saving'
      ? 'Saving...'
      : savingState === 'saved'
        ? 'Saved ✓'
        : savingState === 'error'
          ? 'Error ✗'
          : 'SAVE';

  const configSaveLabel =
    configSavingState === 'saving'
      ? 'Saving...'
      : configSavingState === 'saved'
        ? 'Saved ✓'
        : configSavingState === 'error'
          ? 'Error ✗'
          : 'SAVE CONFIG';

  const typeColor = (type: string) =>
    type === 'markdown' ? '#B87333' : type === 'json' ? '#60a5fa' : '#888';

  const FileButton = ({ file, indent = false }: { file: AgentFile; indent?: boolean }) => {
    const isActive = selectedFilePath === file.path;
    const type = file.type ?? fileKind(file.path ?? '');
    return (
      <button
        onClick={() => void loadFile(file.path ?? '')}
        style={{
          width: '100%',
          textAlign: 'left',
          background: isActive ? '#1a1208' : 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          color: '#E8E8E8',
          padding: indent ? '8px 10px 8px 26px' : '8px 10px',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 11 }}>📄 {file.displayName ?? file.name}</div>
        <div style={{ fontSize: 10, color: typeColor(type) }}>{type}</div>
      </button>
    );
  };

  return (
    <div
      style={{
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'var(--font-mono-stack)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          color: 'var(--copper)',
          fontSize: 12,
          letterSpacing: '0.08em',
        }}
      >
        AGENTS ACTIVE
      </div>

      {isMobile && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <button onClick={() => setMobileStep(1)} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: mobileStep === 1 ? 'var(--bg3)' : 'transparent', color: mobileStep === 1 ? 'var(--copper)' : '#888' }}>AGENTS</button>
          <button onClick={() => setMobileStep(2)} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: mobileStep === 2 ? 'var(--bg3)' : 'transparent', color: mobileStep === 2 ? 'var(--copper)' : '#888' }}>FILES + CONFIG</button>
          <button onClick={() => setMobileStep(3)} disabled={!selectedFilePath} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: mobileStep === 3 ? 'var(--bg3)' : 'transparent', color: mobileStep === 3 ? 'var(--copper)' : '#888', opacity: selectedFilePath ? 1 : 0.5 }}>EDITOR</button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0, flexDirection: isMobile ? 'column' : 'row' }}>
        <section
          style={{
            width: isMobile ? '100%' : '32%',
            minWidth: isMobile ? 0 : 290,
            borderRight: isMobile ? 'none' : '1px solid var(--border)',
            display: isMobile && mobileStep !== 1 ? 'none' : 'block',
            overflow: 'auto',
          }}
        >
          {agents.map((agent) => {
            const isActive = selectedAgentId === agent.agent_id;
            const hasWorking = agent.status === 'working';
            const model = agent.config_model ?? agent.sessions[0]?.model ?? 'unknown';
            const channelSummary = agentChannels[agent.agent_id];
            const telegramAccounts = channelSummary?.telegram.accounts ?? [];
            const telegramBindings = channelSummary?.telegram.bindings ?? [];
            const primaryAccount = telegramAccounts[0];
            return (
              <button
                key={agent.agent_id}
                onClick={() => {
                  setSelectedAgentId(agent.agent_id);
                  setSelectedFilePath('');
                  setEditorContent('');
                  setMobileStep(2);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: isActive ? '#1a1208' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--text)',
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: hasWorking ? '#22c55e' : '#888',
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ color: isActive ? 'var(--copper)' : 'var(--text)', fontSize: 12 }}>
                      {agent.agent_id}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: '#555' }}>{agent.sessions.length} sess</span>
                </div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 6 }}>{model}</div>
                <div style={{ ...metaLineStyle(), marginTop: 6 }}>{agent.workspace_path}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <span style={badgeStyle('#B87333')}>
                    cfg {channelSummary?.config.name ?? channelSummary?.config.label ?? channelSummary?.config.id ?? agent.agent_id}
                  </span>
                  <span style={badgeStyle(primaryAccount ? '#60a5fa' : '#555')}>
                    tg {primaryAccount ? primaryAccount.accountId : 'none'}
                  </span>
                  <span style={badgeStyle(telegramBindings.length ? '#22c55e' : '#555')}>
                    route {telegramBindings.length ? 'active' : 'none'}
                  </span>
                </div>
                {primaryAccount && (
                  <div style={metaLineStyle()}>
                    token {primaryAccount.tokenStatus ?? 'missing'} · dm {primaryAccount.dmPolicy ?? '—'} · enabled{' '}
                    {typeof primaryAccount.enabled === 'boolean' ? String(primaryAccount.enabled) : '—'}
                  </div>
                )}
              </button>
            );
          })}
        </section>

        <section
          style={{
            width: isMobile ? '100%' : '28%',
            minWidth: isMobile ? 0 : 280,
            borderRight: isMobile ? 'none' : '1px solid var(--border)',
            display: isMobile && mobileStep !== 2 ? 'none' : 'block',
            overflow: 'auto',
            background: 'var(--bg2)',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
              fontSize: 10,
              color: '#888',
            }}
          >
            <div>{selectedAgent ? selectedAgent.workspace_path : 'No agent selected'}</div>
            {selectedAgentChannel && editableConfig && (
              <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                <div style={{ padding: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ color: 'var(--copper)', fontSize: 10, marginBottom: 6 }}>AGENT CONFIG</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <input value={editableConfig.id ?? ''} onChange={(e) => setEditableConfig((prev) => (prev ? { ...prev, id: e.target.value } : prev))} placeholder="id" style={fieldStyle()} />
                    <input value={editableConfig.name ?? ''} onChange={(e) => setEditableConfig((prev) => (prev ? { ...prev, name: e.target.value } : prev))} placeholder="name" style={fieldStyle()} />
                    <input value={editableConfig.label ?? ''} onChange={(e) => setEditableConfig((prev) => (prev ? { ...prev, label: e.target.value } : prev))} placeholder="label" style={fieldStyle()} />
                    <input value={editableConfig.workspace ?? ''} onChange={(e) => setEditableConfig((prev) => (prev ? { ...prev, workspace: e.target.value } : prev))} placeholder="workspace" style={fieldStyle()} />
                    <input value={editableConfig.agentDir ?? ''} onChange={(e) => setEditableConfig((prev) => (prev ? { ...prev, agentDir: e.target.value } : prev))} placeholder="agentDir" style={fieldStyle()} />
                    <input value={editableConfig.model ?? ''} onChange={(e) => setEditableConfig((prev) => (prev ? { ...prev, model: e.target.value } : prev))} placeholder="model" style={fieldStyle()} />
                  </div>
                </div>
                <div style={{ padding: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ color: 'var(--copper)', fontSize: 10, marginBottom: 6 }}>TELEGRAM</div>
                  {editableAccounts.length ? (
                    editableAccounts.map((account, index) => (
                      <div key={`${account.currentAccountId ?? account.accountId}-${index}`} style={{ marginTop: index ? 10 : 0, display: 'grid', gap: 6, borderTop: index ? '1px solid var(--border)' : 'none', paddingTop: index ? 10 : 0 }}>
                        <input value={account.accountId} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, accountId: e.target.value } : item))} placeholder="accountId" style={fieldStyle()} />
                        <input value={account.name ?? ''} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, name: e.target.value } : item))} placeholder="name" style={fieldStyle()} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#E8E8E8' }}>
                          <input type="checkbox" checked={!!account.enabled} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: e.target.checked } : item))} />
                          enabled
                        </label>
                        <input value={formatListInput(account.allowFrom)} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, allowFrom: parseCsv(e.target.value) ?? [] } : item))} placeholder="allowFrom (csv)" style={fieldStyle()} />
                        <input value={formatListInput(account.defaultTo)} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, defaultTo: e.target.value } : item))} placeholder="defaultTo (csv or single)" style={fieldStyle()} />
                        <input value={account.dmPolicy ?? ''} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, dmPolicy: e.target.value } : item))} placeholder="dmPolicy" style={fieldStyle()} />
                        <input value={account.tokenReplacement ?? ''} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, tokenReplacement: e.target.value } : item))} placeholder="tokenReplacement (write-only)" style={fieldStyle()} />
                        <div>token: {account.tokenStatus ?? 'missing'}</div>
                      </div>
                    ))
                  ) : (
                    <div>No Telegram account associated</div>
                  )}
                </div>
                <div style={{ padding: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ color: 'var(--copper)', fontSize: 10, marginBottom: 6 }}>BINDINGS</div>
                  <div style={{ color: '#888', marginBottom: 6 }}>Read-only / locked</div>
                  {selectedAgentChannel.telegram.bindings.length ? (
                    selectedAgentChannel.telegram.bindings.map((binding, index) => (
                      <div key={`${binding.agentId ?? selectedAgentChannel.agentId}-${index}`} style={{ marginTop: index ? 8 : 0 }}>
                        <div>type: {binding.type ?? '—'}</div>
                        <div>channel: {binding.match?.channel ?? '—'}</div>
                        <div>accountId: {binding.match?.accountId ?? '—'}</div>
                        <div>peer: {binding.match?.peer ?? '—'}</div>
                        <div>enabled: {typeof binding.enabled === 'boolean' ? String(binding.enabled) : '—'}</div>
                        <div>allowFrom: {formatValue(binding.allowFrom)}</div>
                        <div>defaultTo: {formatValue(binding.defaultTo)}</div>
                        <div>dmPolicy: {binding.dmPolicy ?? '—'}</div>
                      </div>
                    ))
                  ) : (
                    <div>No Telegram routing active</div>
                  )}
                </div>
                <button
                  onClick={() => void saveConfig()}
                  disabled={!editableConfig || configSavingState === 'saving'}
                  style={{
                    border: '1px solid var(--border)',
                    background: configSavingState === 'saved' ? '#143018' : 'var(--bg3)',
                    color: configSavingState === 'error' ? '#ef4444' : configSavingState === 'saved' ? '#22c55e' : 'var(--copper)',
                    padding: '8px 10px',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {configSaveLabel}
                </button>
              </div>
            )}
          </div>
          {rootFiles.map((file) => (
            <FileButton key={file.path} file={file} />
          ))}
          {directoryNames.map((dirName) => (
            <div key={dirName}>
              <button
                onClick={() => toggleDir(dirName)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  color: '#888',
                  padding: '8px 10px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 10, color: '#555' }}>
                  {openDirs[dirName] ? '▾' : '▸'}
                </span>
                <span style={{ color: '#555', fontSize: 10 }}>📁 {dirName}/</span>
              </button>
              {openDirs[dirName] &&
                (fileTree[dirName] ?? []).map((file) => (
                  <FileButton key={file.path} file={file} indent />
                ))}
            </div>
          ))}
        </section>

        <section
          style={{ flex: 1, minWidth: isMobile ? 0 : 320, display: isMobile && mobileStep !== 3 ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg2)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: '#888',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedFilePath ? selectedFilePath.split('/').pop() : 'Select a file to edit'}
            </div>
            <button
              onClick={() => void saveFile()}
              disabled={!selectedFilePath || savingState === 'saving'}
              style={{
                border: '1px solid var(--border)',
                background: savingState === 'saved' ? '#143018' : 'var(--bg3)',
                color:
                  savingState === 'error'
                    ? '#ef4444'
                    : savingState === 'saved'
                      ? '#22c55e'
                      : 'var(--copper)',
                padding: '5px 10px',
                fontFamily: 'inherit',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {saveLabel}
            </button>
          </div>
          <textarea
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            placeholder={loadingFile ? 'Loading...' : 'No file selected'}
            style={{
              flex: 1,
              width: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              background: '#0A0A0B',
              color: '#E8E8E8',
              padding: isMobile ? 10 : 12,
              fontSize: isMobile ? 14 : 12,
              fontFamily: 'JetBrains Mono, monospace',
              lineHeight: 1.45,
            }}
          />
        </section>
      </div>
    </div>
  );
}
