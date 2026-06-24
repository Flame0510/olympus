import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // List all Docker containers with AGENT_ID label
    const output = execSync(
      'docker ps --filter "label=AGENT_ID" --format "{{.ID}}|{{.Label \"AGENT_ID\"}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"',
      { timeout: 5000, encoding: 'utf-8' },
    ).trim();

    if (!output) return NextResponse.json([]);

    const agents = output.split('\n').map((line) => {
      const [id, agentId, name, image, status, ports] = line.split('|');
      return { id, agentId, name, image, status, ports };
    });

    return NextResponse.json(agents);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
