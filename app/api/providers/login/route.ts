import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function POST(req: Request) {
  try {
    const { provider, method, apiKey, disconnect } = await req.json();
    if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 });

    if (disconnect) {
      try { execSync(`openclaw models provider logout ${provider}`, { timeout: 10000 }); } catch {}
      return NextResponse.json({ status: 'disconnected' });
    }

    if (method === 'oauth') {
      let out = '';
      try {
        out = execSync(`openclaw models provider login ${provider}`, { encoding: 'utf-8', timeout: 15000 }).toString();
      } catch (e: any) { out = e.stdout?.toString() || e.message || ''; }

      if (out.includes('already') || out.includes('already authenticated') || out.includes('already connected')) {
        return NextResponse.json({ status: 'already_connected' });
      }

      // Cerca device code flow output
      const uriMatch = out.match(/verification_uri[\s:]+(\S+)/i) || out.match(/uri[\s:]+(\S+)/i) || out.match(/https:\/\/\S+/);
      const codeMatch = out.match(/user_code[\s:]+(\S+)/i) || out.match(/code[\s:]+(\S{4,})/i);

      if (uriMatch || codeMatch) {
        return NextResponse.json({
          status: 'pending',
          verificationUri: uriMatch ? uriMatch[1] : null,
          userCode: codeMatch ? codeMatch[1] : null,
          rawOutput: out.slice(0, 500),
        });
      }

      return NextResponse.json({ status: 'pending', rawOutput: out.slice(0, 500) });
    }

    if (method === 'api-key' && apiKey) {
      return NextResponse.json({ status: 'ok' });
    }

    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
