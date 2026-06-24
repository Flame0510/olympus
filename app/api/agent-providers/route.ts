import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

interface AgentInfo {
  agent_id: string;
  containerName: string;
  state: string;
}

function getAgents(): AgentInfo[] {
  const raw = execSync(
    `docker ps --filter "label=AGENT_ID" --format '{{.Label "AGENT_ID"}}|{{.Names}}|{{.State}}'`,
    { timeout: 5000, maxBuffer: 1024 * 64 }
  ).toString().trim();

  if (!raw) return [];
  return raw.split('\n').map((line) => {
    const [agent_id, containerName, state] = line.split('|');
    return { agent_id, containerName, state };
  });
}

function dockerExec(container: string, cmd: string, timeout = 15000): string {
  return execSync(
    `docker exec ${container} sh -c ${JSON.stringify(cmd)}`,
    { timeout, maxBuffer: 1024 * 1024 }
  ).toString();
}

/** Write a JSON file inside a running container by reading, mutating, and writing back */
function writeAgentJsonFile(
  container: string,
  fileName: string,
  mutator: (data: Record<string, unknown>) => void,
  filePath?: string,
): void {
  const modelsJsonPath = filePath ?? `~/.openclaw/agents/main/agent/${fileName}`;
  // Read current content
  let data: Record<string, unknown>;
  try {
    const raw = dockerExec(container, `cat ${modelsJsonPath} 2>/dev/null || echo '{}'`, 5000);
    data = JSON.parse(raw.trim());
  } catch {
    data = {};
  }
  // Apply mutation
  mutator(data);
  // Write back using base64 to avoid all shell escaping issues
  const b64 = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  dockerExec(container, `echo ${b64} | base64 -d > ${modelsJsonPath}`, 5000);
}

interface ProviderStatus {
  provider: string;
  kind: string;
  detail: string;
  profiles: number;
  labels: string[];
}

interface AgentProvidersStatus {
  agentId: string;
  defaultModel: string;
  fallbacks: string[];
  allowed: string[];
  aliases: Record<string, string>;
  providers: ProviderStatus[];
  rawJson?: Record<string, unknown>;
}

function getAgentStatus(containerName: string): AgentProvidersStatus | { error: string } {
  try {
    const raw = dockerExec(containerName, 'openclaw models status --json');
    const data = JSON.parse(raw.trim());

    const authProviders: Record<string, unknown>[] = (data as any).auth?.providers ?? [];
    const providers: ProviderStatus[] = authProviders.map((p: any) => ({
      provider: p.provider,
      kind: p.effective?.kind ?? 'unknown',
      detail: p.effective?.detail ?? '',
      profiles: p.profiles?.count ?? 0,
      labels: p.profiles?.labels ?? [],
    }));

    return {
      agentId: containerName,
      defaultModel: (data as any).defaultModel ?? '',
      fallbacks: (data as any).fallbacks ?? [],
      allowed: (data as any).allowed ?? [],
      aliases: (data as any).aliases ?? {},
      providers,
      rawJson: data as any,
    };
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

// GET /api/agent-providers
//   ?agent=<containerName>  -> status di un singolo agente
//   (no params)             -> lista di tutti gli agenti con status
export async function GET(request: NextRequest): Promise<NextResponse> {
  const agent = request.nextUrl.searchParams.get('agent');

  if (agent) {
    const status = getAgentStatus(agent);
    return NextResponse.json(status);
  }

  const agents = getAgents();
  const results: Record<string, unknown>[] = [];

  for (const a of agents) {
    const status = getAgentStatus(a.containerName);
    results.push({
      agentId: a.agent_id,
      containerName: a.containerName,
      state: a.state,
      ...status,
    });
  }

  return NextResponse.json(results);
}

// POST /api/agent-providers
//   { action: "set-default", agent: "<container>", model: "..." }
//   { action: "add-alias", agent: "<container>", alias: "...", model: "..." }
//   { action: "remove-alias", agent: "<container>", alias: "..." }
//   { action: "add-fallback", agent: "<container>", model: "..." }
//   { action: "remove-fallback", agent: "<container>", model: "..." }
//   { action: "add-api-key", agent: "<container>", provider: "...", apiKey: "..." }
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action, agent, model, alias, provider, apiKey } = body;

    if (!agent) {
      return NextResponse.json({ error: 'Missing agent parameter' }, { status: 400 });
    }

    let cmd = '';

    switch (action) {
      case 'set-default':
        if (!model) return NextResponse.json({ error: 'Missing model' }, { status: 400 });
        cmd = `openclaw models set ${JSON.stringify(model)}`;
        break;

      case 'add-alias':
        if (!alias || !model) return NextResponse.json({ error: 'Missing alias or model' }, { status: 400 });
        cmd = `openclaw models aliases add ${JSON.stringify(alias)} ${JSON.stringify(model)}`;
        break;

      case 'remove-alias':
        if (!alias) return NextResponse.json({ error: 'Missing alias' }, { status: 400 });
        cmd = `openclaw models aliases remove ${JSON.stringify(alias)}`;
        break;

      case 'add-fallback':
        if (!model) return NextResponse.json({ error: 'Missing model' }, { status: 400 });
        cmd = `openclaw models fallbacks add ${JSON.stringify(model)}`;
        break;

      case 'remove-fallback':
        if (!model) return NextResponse.json({ error: 'Missing model' }, { status: 400 });
        cmd = `openclaw models fallbacks remove ${JSON.stringify(model)}`;
        break;

      case 'add-api-key': {
        if (!provider || !apiKey) return NextResponse.json({ error: 'Missing provider or apiKey' }, { status: 400 });
        // Write directly to models.json to avoid agent file lock
        writeAgentJsonFile(agent, 'models.json', (data) => {
          if (!data.providers) data.providers = {};
          (data.providers as Record<string, unknown>)[provider] = { apiKey };
        });
        cmd = '';
        break;
      }

      case 'remove-api-key': {
        if (!provider) return NextResponse.json({ error: 'Missing provider' }, { status: 400 });
        writeAgentJsonFile(agent, 'models.json', (data) => {
          if (data.providers && typeof data.providers === 'object') {
            delete (data.providers as Record<string, unknown>)[provider];
          }
        });
        cmd = '';
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    let output = '';
    if (cmd) {
      output = dockerExec(agent, cmd);
    }

    const status = getAgentStatus(agent);

    return NextResponse.json({
      success: true,
      action,
      agent,
      output: output.trim(),
      status,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
