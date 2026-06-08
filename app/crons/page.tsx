import { requireAuth } from '@/lib/requireAuth';
import CronsPageClient from './PageClient';

export default async function CronsPage() {
  await requireAuth();
  return <CronsPageClient />;
}
