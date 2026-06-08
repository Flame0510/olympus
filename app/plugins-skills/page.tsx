import { requireAuth } from '@/lib/requireAuth';
import PluginsSkillsPageClient from './PageClient';

export default async function PluginsSkillsPage() {
  await requireAuth();
  return <PluginsSkillsPageClient />;
}
