import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';

// Next.js 16: the `middleware` convention is renamed to `proxy`.
export function proxy(req: NextRequest) {
  const urlToken = req.nextUrl.searchParams.get('token');
  const token = urlToken ?? req.cookies.get('app_token')?.value ?? null;

  if (!isAuthorized(token, process.env.APP_ACCESS_TOKEN)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 把 URL token 寫進 cookie，後續導頁免帶 query
  const res = NextResponse.next();
  if (urlToken) {
    res.cookies.set('app_token', urlToken, { httpOnly: true, sameSite: 'lax' });
  }
  return res;
}

export const config = {
  matcher: ['/monitor/:path*', '/insight/:path*', '/api/:path*'],
};
