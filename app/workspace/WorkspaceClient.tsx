'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import OlympusLoader from '../components/OlympusLoader';
import { useResponsive } from '../design-system';
import { apiFetch } from '@/lib/apiFetch';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type LiveMode = 'connecting' | 'sse' | 'polling';

interface WorkspaceEntry {
  path: string;
  relPath: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  mtimeMs: number;
}

interface TreeNode {
  name: string;
  path: string;
  relPath: string;
  type: 'file' | 'directory';
  children: TreeNode[];
}

function buildTree(entries: WorkspaceEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const entry of entries) {
    const parts = entry.relPath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i += 1) {
      const name = parts[i];
      const relPath = parts.slice(0, i + 1).join('/');
      const isLeaf = i === parts.length - 1;
      const expectedType: 'file' | 'directory' = isLeaf ? entry.type : 'directory';
      let node = current.find((item) => item.name === name && item.type === expectedType);
      if (!node) {
        node = { name, path: isLeaf ? entry.path : '', relPath, type: expectedType, children: [] };
        current.push(node);
      }
      current = node.children;
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(root);
  return root;
}

export default function WorkspaceClient() {
  const isMobile = useResponsive('lg');
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [content, setContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [liveMode, setLiveMode] = useState<LiveMode>('connecting');
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [remoteUpdateAvailable, setRemoteUpdateAvailable] = useState(false);
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({});
  const [mobileStep, setMobileStep] = useState(1);

  const selectedPathRef = useRef('');
  const isDirtyRef = useRef(false);
  const saveStateRef = useRef<SaveState>('idle');
  const loadingFileRef = useRef(false);
  const tree = useMemo(() => buildTree(entries), [entries]);

  useEffect(() => { selectedPathRef.current = selectedPath; }, [selectedPath]);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { saveStateRef.current = saveState; }, [saveState]);
  useEffect(() => { loadingFileRef.current = loadingFile; }, [loadingFile]);

  async function fetchTree() {
    try {
      const res = await apiFetch('/api/workspace?tree=1');
      if (!res.ok) throw new Error('tree fetch failed');
      const data = await res.json() as { entries?: WorkspaceEntry[] };
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setLastRefreshAt(Date.now());
    } finally {
      setLoadingTree(false);
    }
  }

  async function loadFile(path: string, preserveSelection = false, silent = false) {
    if (!path) return;
    if (!silent) setLoadingFile(true);
    if (!preserveSelection) {
      setSelectedPath(path);
      setSaveState('idle');
      setRemoteUpdateAvailable(false);
    }
    try {
      const res = await apiFetch(`/api/workspace?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error('load failed');
      const data = await res.json() as { content?: string };
      setContent(data.content ?? '');
      setLastRefreshAt(Date.now());
      if (!preserveSelection) setIsDirty(false);
      setMobileStep(2);
    } catch {
      setSaveState('error');
    } finally {
      if (!silent) setLoadingFile(false);
    }
  }

  async function saveFile() {
    if (!selectedPath) return;
    setSaveState('saving');
    try {
      const res = await apiFetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath, content }),
      });
      if (!res.ok) throw new Error('save failed');
      setSaveState('saved');
      setIsDirty(false);
      setRemoteUpdateAvailable(false);
      setLastRefreshAt(Date.now());
      setTimeout(() => setSaveState('idle'), 1500);
      void fetchTree();
    } catch {
      setSaveState('error');
    }
  }

  useEffect(() => {
    void fetchTree();
    const id = setInterval(() => void fetchTree(), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/workspace/stream');
    let connected = false;

    source.addEventListener('workspace_ready', () => {
      connected = true;
      setLiveMode('sse');
      setLastRefreshAt(Date.now());
    });

    source.addEventListener('heartbeat', () => {
      connected = true;
      setLiveMode('sse');
    });

    source.addEventListener('workspace_changed', (event) => {
      connected = true;
      setLiveMode('sse');
      setLastRefreshAt(Date.now());
      void fetchTree();
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { changed?: Array<{ path?: string }> };
        const selected = selectedPathRef.current;
        if (!selected) return;
        const touchesSelected = payload.changed?.some((item) => item.path === selected) ?? false;
        if (!touchesSelected) return;
        if (!isDirtyRef.current && saveStateRef.current !== 'saving' && !loadingFileRef.current) {
          void loadFile(selected, true, true);
          setRemoteUpdateAvailable(false);
        } else {
          setRemoteUpdateAvailable(true);
        }
      } catch {
        // noop
      }
    });

    source.onerror = () => {
      if (!connected) setLiveMode('polling');
      else setLiveMode('polling');
    };

    return () => source.close();
  }, []);

  useEffect(() => {
    if (liveMode === 'sse' || !selectedPath || isDirty || saveState === 'saving' || loadingFile) return;
    const id = setInterval(() => {
      void loadFile(selectedPathRef.current, true, true);
    }, 8000);
    return () => clearInterval(id);
  }, [liveMode, selectedPath, isDirty, saveState, loadingFile]);

  useEffect(() => {
    if (!isMobile) {
      setMobileStep(1);
      return;
    }
    if (!selectedPath) setMobileStep(1);
  }, [isMobile, selectedPath]);

  const toggleDir = (relPath: string) => setOpenDirs((prev) => ({ ...prev, [relPath]: !prev[relPath] }));
  const saveLabel = saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved ✓' : saveState === 'error' ? 'Error ✗' : 'SAVE';

  function renderNode(node: TreeNode, depth = 0): React.ReactNode {
    if (node.type === 'directory') {
      const isOpen = openDirs[node.relPath] ?? depth < 1;
      return (
        <div key={node.relPath}>
          <button
            onClick={() => toggleDir(node.relPath)}
            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: '#888', padding: `8px 10px 8px ${8 + depth * 18}px`, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ fontSize: 10 }}>{isOpen ? '▾' : '▸'}</span>
            <span>{isOpen ? '📂' : '📁'}</span>
            <span style={{ color: '#d1a15c' }}>{node.name}</span>
          </button>
          {isOpen ? node.children.map((child) => renderNode(child, depth + 1)) : null}
        </div>
      );
    }

    const active = selectedPath === node.path;
    return (
      <button
        key={node.path}
        onClick={() => void loadFile(node.path)}
        style={{ width: '100%', textAlign: 'left', background: active ? '#1a1208' : 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: '#E8E8E8', padding: `8px 10px 8px ${24 + depth * 18}px`, cursor: 'pointer', fontSize: 11 }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>📝</span>
          <span>{node.name}</span>
        </div>
      </button>
    );
  }

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono-stack)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: 48, padding: '0 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: 20, letterSpacing: 4, color: 'var(--copper)' }}>WORKSPACE</span>
        <span style={{ fontSize: 10, color: '#888' }}>/data/.openclaw</span>
      </div>

      {isMobile && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          {['FILES', 'EDITOR'].map((label, idx) => (
            <button key={label} onClick={() => setMobileStep(idx + 1)} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: mobileStep === idx + 1 ? 'var(--bg3)' : 'transparent', color: mobileStep === idx + 1 ? 'var(--copper)' : '#888' }}>{label}</button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
        <section style={{ width: isMobile ? '100%' : '32%', minWidth: isMobile ? 0 : 320, borderRight: isMobile ? 'none' : '1px solid var(--border)', display: isMobile && mobileStep !== 1 ? 'none' : 'block', overflow: 'auto', background: 'var(--bg2)' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: '#888' }}>
            {liveMode === 'sse' ? 'sse live' : liveMode === 'connecting' ? 'connecting live' : 'polling fallback'}
            {lastRefreshAt ? ` • ${new Date(lastRefreshAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
          </div>
          {loadingTree ? <OlympusLoader label="LOADING WORKSPACE" compact /> : tree.map((node) => renderNode(node))}
        </section>

        <section style={{ flex: 1, minWidth: 0, display: isMobile && mobileStep !== 2 ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPath || 'Select a markdown file'}</div>
              <div style={{ fontSize: 9, color: remoteUpdateAvailable ? '#f59e0b' : isDirty ? '#f59e0b' : '#666' }}>
                {remoteUpdateAvailable ? 'remote update available • save or reload' : isDirty ? 'editing locally • auto-refresh paused' : 'live sync ready'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {selectedPath && remoteUpdateAvailable ? <button onClick={() => { setIsDirty(false); void loadFile(selectedPath, true, false); }} style={{ border: '1px solid #5c3b12', background: '#1a1208', color: '#f59e0b', padding: '5px 10px', fontSize: 11 }}>Reload</button> : null}
              {selectedPath ? <button onClick={() => setShowPreview((prev) => !prev)} style={{ border: '1px solid var(--border)', background: showPreview ? '#1a1208' : 'var(--bg3)', color: showPreview ? 'var(--copper)' : '#888', padding: '5px 10px', fontSize: 11 }}>{showPreview ? '✏️ Edit' : '📖 Preview'}</button> : null}
              <button onClick={() => void saveFile()} disabled={!selectedPath || saveState === 'saving'} style={{ border: '1px solid var(--border)', background: saveState === 'saved' ? '#143018' : 'var(--bg3)', color: saveState === 'error' ? '#ef4444' : saveState === 'saved' ? '#22c55e' : 'var(--copper)', padding: '5px 10px', fontSize: 11 }}>{saveLabel}</button>
            </div>
          </div>

          {!selectedPath ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 12 }}>Select a markdown file to edit</div>
          ) : loadingFile ? (
            <OlympusLoader label="LOADING FILE" compact />
          ) : showPreview ? (
            <div className="workspace-markdown-preview" dangerouslySetInnerHTML={{ __html: (() => { try { return marked.parse(content, { breaks: true, gfm: true }); } catch { return content; } })() }} style={{ flex: 1, overflow: 'auto', padding: 12, color: '#E8E8E8', fontSize: 14, lineHeight: 1.6 }} />
          ) : (
            <textarea value={content} onChange={(event) => { setContent(event.target.value); setIsDirty(true); }} style={{ flex: 1, width: '100%', border: 'none', outline: 'none', resize: 'none', background: '#0A0A0B', color: '#E8E8E8', padding: 12, fontSize: isMobile ? 14 : 12, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.45 }} />
          )}
        </section>
      </div>

      <style>{`
        .workspace-markdown-preview h1, .workspace-markdown-preview h2, .workspace-markdown-preview h3 { margin: 0.5em 0 0.3em; font-weight: 600; }
        .workspace-markdown-preview h1 { font-size: 1.5em; color: var(--copper, #cd7f32); }
        .workspace-markdown-preview h2 { font-size: 1.2em; color: #e0b87a; }
        .workspace-markdown-preview p { margin: 0.4em 0; }
        .workspace-markdown-preview ul, .workspace-markdown-preview ol { padding-left: 1.5em; margin: 0.3em 0; }
        .workspace-markdown-preview code { background: #1e1e1e; padding: 2px 5px; border-radius: 3px; }
        .workspace-markdown-preview pre { background: #0d0d0d !important; padding: 10px; border-radius: 4px; overflow-x: auto; }
        .workspace-markdown-preview a { color: #58a6ff; text-decoration: underline; }
      `}</style>
    </div>
  );
}
