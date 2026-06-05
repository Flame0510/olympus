import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/db';
import { patchCronJob } from '@/lib/openclaw-cron';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Only allow patching safe fields
  const allowed: Record<string, unknown> = {};
  if (typeof body.enabled === 'boolean') allowed.enabled = body.enabled;

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No patchable fields provided' }, { status: 400 });
  }

  const result = await patchCronJob(id, allowed);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error?.includes('not found') ? 404 : 500 });
  }

  return NextResponse.json(result.job);
}
