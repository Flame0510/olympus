import { execSync } from 'child_process';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const raw = execSync('openclaw --version', { encoding: 'utf8', timeout: 3000 }).trim();
    return NextResponse.json({ version: raw });
  } catch {
    return NextResponse.json({ version: 'unknown' });
  }
}
