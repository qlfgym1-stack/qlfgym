import { NextResponse } from 'next/server';
import { apiSuccess } from '@/lib/api-response';

const COOKIE_NAME = 'qlf-auth';

export async function POST() {
  const response = NextResponse.json(apiSuccess({ message: 'Déconnecté' }));
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
