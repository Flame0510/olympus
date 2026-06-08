import { requireAuth } from '@/lib/requireAuth';
import SkillsPageClient from './PageClient';

export default async function SkillsPage() {
  await requireAuth();
  return <SkillsPageClient />;
}
