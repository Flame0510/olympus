import { requireAuth } from '@/lib/requireAuth';
import AgentsPageClient from './PageClient';

export default async function AgentsPage() {
  await requireAuth();
  return <AgentsPageClient />;
}
