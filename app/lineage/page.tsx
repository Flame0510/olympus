import { Suspense } from 'react';
import LineageGraphPage from '../components/LineageGraphPage';

export const dynamic = 'force-dynamic';

export default function LineagePage() {
  return (
    <Suspense>
      <LineageGraphPage initialCosts={{ today: 0, allTime: 0, byModel: [] }} />
    </Suspense>
  );
}
