import { requireAuth } from '@/lib/requireAuth';
import MemoryContextPageClient from './MemoryContextPageClient';

export const dynamic = 'force-dynamic';

export default async function MemoryPage() {
  await requireAuth();

  return <MemoryContextPageClient />;
}
