import { requireAuth } from '@/lib/requireAuth';
import PluginsPageClient from './PageClient';

export default async function PluginsPage() {
  await requireAuth();
  return <PluginsPageClient />;
}
