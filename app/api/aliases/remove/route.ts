import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const alias = body.alias;

    if (!alias) {
      return NextResponse.json({ error: 'Missing alias' }, { status: 400 });
    }

    const stdout = execSync(
      `openclaw models aliases remove "${alias.replace(/"/g, '\\"')}"`,
      { timeout: 15000, maxBuffer: 1024 * 1024 },
    ).toString();

    return NextResponse.json({ ok: true, output: stdout.trim() });
  } catch (e: unknown) {
    const message = (e as Error).message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
