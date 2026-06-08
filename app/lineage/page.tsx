import { requireAuth } from '@/lib/requireAuth';
import { Suspense } from 'react';
import LineageGraphPage from '../components/LineageGraphPage';

export const dynamic = 'force-dynamic';

export default async function LineagePage() {
  await requireAuth();

  return (
    <Suspense>
      <LineageGraphPage initialCosts={{ today: 0, allTime: 0, byModel: [] }} />
    </Suspense>
  );
}
