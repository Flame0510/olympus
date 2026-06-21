import fs from 'fs';
import path from 'path';
import { NextResponse, type NextRequest } from 'next/server';

const ROOT_PATH = '/data/.openclaw';
const ALLOWED_PREFIX = `${ROOT_PATH}/`;
const IGNORED_DIRS = new Set(['node_modules', '.trash']);
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.txt', '.html', '.py', '.css', '.js', '.ts', '.tsx', '.yaml', '.yml', '.env', '.sh']);
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.ico']);
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ts': 'text/typescript; charset=utf-8',
  '.tsx': 'text/typescript-jsx; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.sh': 'text/x-shellscript; charset=utf-8',
  '.env': 'text/plain; charset=utf-8',
};

interface TreeEntry {
  path: string;
  relPath: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  mtimeMs: number;
}

function normalizePath(input: string): string {
  return path.resolve(input).replace(/\\/g, '/');
}

function isAllowedPath(filePath: unknown): filePath is string {
  if (!filePath || typeof filePath !== 'string') return false;
  const normalized = normalizePath(filePath);
  return normalized === ROOT_PATH || normalized.startsWith(ALLOWED_PREFIX);
}

function shouldIgnoreName(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRS.has(name);
}

function collectTree(rootDir: string): TreeEntry[] {
  const entries: TreeEntry[] = [];

  function walk(currentDir: string, relativeDir = ''): void {
    let dirEntries: fs.Dirent[] = [];
    try {
      dirEntries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      if (shouldIgnoreName(entry.name)) continue;
      const absPath = path.join(currentDir, entry.name);
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(absPath);
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        entries.push({ path: absPath, relPath, name: entry.name, type: 'directory', size: 0, mtimeMs: stat.mtimeMs });
        walk(absPath, relPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext) && !BINARY_EXTENSIONS.has(ext)) continue;
      entries.push({ path: absPath, relPath, name: entry.name, type: 'file', size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }

  walk(rootDir);
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.relPath.localeCompare(b.relPath);
  });
  return entries;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const tree = url.searchParams.get('tree');
  const filePath = url.searchParams.get('path');

  if (tree === '1') {
    return NextResponse.json({ root: ROOT_PATH, entries: collectTree(ROOT_PATH) });
  }

  if (!isAllowedPath(filePath)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const normalizedPath = normalizePath(filePath);

  try {
    if (!fs.existsSync(normalizedPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    if (fs.statSync(normalizedPath).isDirectory()) {
      return NextResponse.json({ error: 'Path is a directory' }, { status: 400 });
    }

    const ext = path.extname(normalizedPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      const buffer = fs.readFileSync(normalizedPath);
      const mime = MIME_MAP[ext] || 'application/octet-stream';
      return new NextResponse(buffer, {
        headers: { 'Content-Type': mime, 'Content-Length': String(buffer.length) },
      });
    }

    const content = fs.readFileSync(normalizedPath, 'utf8');
    return NextResponse.json({ content, path: normalizedPath });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { path?: unknown; content?: unknown };
    const { path: filePath, content } = body ?? {};
    if (!isAllowedPath(filePath)) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    if (typeof content !== 'string') return NextResponse.json({ error: 'Invalid content' }, { status: 400 });

    const normalizedPath = normalizePath(filePath);
    fs.writeFileSync(normalizedPath, content, 'utf8');
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
