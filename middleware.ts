import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.OLYMPUS_JWT_SECRET ?? 'olympus-jwt-secret-change-in-prod',
);

const TOKEN = process.env.OLYMPUS_TOKEN ?? 'olympus2026';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /api/* routes (skip /api/auth/login and /api/version)
  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (pathname === '/api/auth/login' || pathname === '/api/auth/check' || pathname === '/api/version') return NextResponse.next();

  // 1. Check query param token
  const qpToken = request.nextUrl.searchParams.get('token');
  if (qpToken === TOKEN) return NextResponse.next();

  // 2. Check Authorization header
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${TOKEN}`) return NextResponse.next();

  // 3. Check JWT cookie
  const cookieToken = request.cookies.get('olympus_token')?.value;
  if (cookieToken) {
    try {
      await jwtVerify(cookieToken, JWT_SECRET);
      return NextResponse.next();
    } catch {
      // Invalid JWT — fall through to 401
    }
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export const config = {
  matcher: '/api/:path*',
};
