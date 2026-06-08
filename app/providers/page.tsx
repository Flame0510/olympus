import { requireAuth } from '@/lib/requireAuth';
import ProvidersPageClient from './PageClient';

export default async function ProvidersPage() {
  await requireAuth();
  return <ProvidersPageClient />;
}
