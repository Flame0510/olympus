import { requireAuth } from '@/lib/requireAuth';
import WorkspaceClient from './WorkspaceClient';

export default async function WorkspacePage() {
  await requireAuth();
  return <WorkspaceClient />;
}
