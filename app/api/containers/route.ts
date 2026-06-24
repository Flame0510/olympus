import { NextResponse } from 'next/server';
import * as http from 'http';

const DOCKER_SOCKET = '/var/run/docker.sock';

function dockerFetch(method: string, path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      socketPath: DOCKER_SOCKET,
      path,
      method,
      headers: { 'Host': 'localhost' } as any,
    };
    const req = http.request(options, (res: any) => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from Docker')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const containers: any[] = await dockerFetch('GET', '/containers/json?all=true');

    const enriched = await Promise.all(containers.map(async (c: any) => {
      try {
        const inspect: any = await dockerFetch('GET', `/containers/${c.Id}/json`);
        const networks: Record<string, any> = inspect.NetworkSettings?.Networks || {};
        const ip = Object.values(networks)[0]?.IPAddress || null;
        return {
          id: c.Id?.slice(0, 12),
          name: (c.Names?.[0] || '').replace(/^\//, ''),
          image: c.Image,
          status: c.Status,
          state: c.State,
          ports: c.Ports?.map((p: any) => `${p.PublicPort || '?'}:${p.PrivatePort || '?'}`).join(', ') || '',
          ip,
          agentId: c.Labels?.AGENT_ID || null,
          created: c.Labels?.created || null,
        };
      } catch {
        return { id: c.Id?.slice(0, 12), name: (c.Names?.[0] || '').replace(/^\//, ''), status: c.Status, error: 'inspect failed' };
      }
    }));

    return NextResponse.json(enriched);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
