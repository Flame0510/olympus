import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const stdout = execSync('openclaw models status --json', { timeout: 15000, maxBuffer: 1024 * 1024 }).toString();
    const data = JSON.parse(stdout.trim());
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
