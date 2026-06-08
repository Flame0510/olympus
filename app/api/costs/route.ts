import { NextResponse, type NextRequest } from 'next/server';
import { openDb } from '@/lib/db';
import { isBillableDollarModel } from '@/lib/billing';

export const dynamic = 'force-dynamic';

interface ModelCostRow {
  model: string | null;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
}

function sumBillableCosts(rows: ModelCostRow[]): number {
  return rows.reduce(
    (sum, row) => (isBillableDollarModel(row.model) ? sum + Number(row.cost_usd ?? 0) : sum),
    0,
  );
}

function getStartOfDaySeconds(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor(now.getTime() / 1000);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const db = openDb();
    const startOfDay = getStartOfDaySeconds();

    const todayRows = db
      .prepare(
        `SELECT model,
          COALESCE(SUM(cost_usd), 0) AS cost_usd,
          COALESCE(SUM(tokens_in), 0) AS tokens_in,
          COALESCE(SUM(tokens_out), 0) AS tokens_out
         FROM sessions WHERE started_at >= ?
         GROUP BY model ORDER BY cost_usd DESC`,
      )
      .all(startOfDay) as ModelCostRow[];

    const allTimeRows = db
      .prepare(
        `SELECT model,
          COALESCE(SUM(cost_usd), 0) AS cost_usd,
          COALESCE(SUM(tokens_in), 0) AS tokens_in,
          COALESCE(SUM(tokens_out), 0) AS tokens_out
         FROM sessions
         GROUP BY model ORDER BY cost_usd DESC`,
      )
      .all() as ModelCostRow[];

    const today = sumBillableCosts(todayRows);
    const sessionsAllTime = sumBillableCosts(allTimeRows);

    const byModel = todayRows.filter((row) => isBillableDollarModel(row.model));

    db.close();

    return NextResponse.json({
      today,
      allTime: sessionsAllTime,
      allTimeSource: 'sessions_billable',
      byModel,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
