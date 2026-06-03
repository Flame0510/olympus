import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { TOKEN } from '@/lib/db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.OLYMPUS_JWT_SECRET ?? 'olympus-jwt-secret-change-in-prod',
);

export async function requireBrowserAuth(request: NextRequest): Promise<NextResponse | null> {
  const token = new URL(request.url).searchParams.get('token');
  const auth = request.headers.get('authorization');

  if (token === TOKEN || auth === `Bearer ${TOKEN}`) {
    return null;
  }

  const cookieToken = request.cookies.get('olympus_token')?.value;
  if (cookieToken) {
    try {
      await jwtVerify(cookieToken, JWT_SECRET);
      return null;
    } catch {
      // Fall through to unauthorized.
    }
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
