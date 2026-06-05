import { NextResponse, type NextRequest } from 'next/server';
import { requireBrowserAuth } from '@/lib/auth';
import { getMemoryContextSnapshot } from '@/lib/memory-context';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await requireBrowserAuth(request);
  if (denied) return denied;

  try {
    return NextResponse.json(getMemoryContextSnapshot());
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
