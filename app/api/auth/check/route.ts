import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.OLYMPUS_JWT_SECRET ?? 'olympus-jwt-secret-change-in-prod',
);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cookieToken = request.cookies.get('olympus_token')?.value;
  if (cookieToken) {
    try {
      await jwtVerify(cookieToken, JWT_SECRET);
      return NextResponse.json({ authenticated: true });
    } catch {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}
