import { Suspense } from 'react';
import { requireAuth } from '@/lib/requireAuth';
import DashboardLayout from './components/DashboardLayout';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  await requireAuth();

  return (
    <Suspense>
      <DashboardLayout initialCosts={{ today: 0, allTime: 0, byModel: [] }} />
    </Suspense>
  );
}
