import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.OLYMPUS_JWT_SECRET ?? 'olympus-jwt-secret-change-in-prod',
);

export async function requireAuth(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get('olympus_token')?.value;

  if (token) {
    try {
      await jwtVerify(token, JWT_SECRET);
      return; // valid JWT
    } catch {
      // Invalid — redirect
    }
  }
  redirect('/login');
}
