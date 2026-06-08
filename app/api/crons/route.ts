import { NextResponse, type NextRequest } from 'next/server';

import { listOpenClawCronJobs } from '@/lib/openclaw-cron';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {

  const result = await listOpenClawCronJobs();
  if (!result.ok) {
    return NextResponse.json({
      jobs: [],
      total: 0,
      source: result.source,
      unavailableReason: result.unavailableReason,
      error: result.rawError,
    }, { status: 200 });
  }

  return NextResponse.json(result.jobs);
}
