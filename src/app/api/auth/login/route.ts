import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { signCookie, stringifyCookieValue } from '@/lib/cookie-signature';
import { apiSuccess, apiError } from '@/lib/api-response';
import { supabaseAdmin } from '@/lib/supabase/server';

const COOKIE_NAME = 'qlf-auth';
const AUTH_SECRET = process.env.AUTH_SECRET || 'qlf-dev-secret-change-in-production';

interface StoredUser {
  username: string;
  passwordHash: string;
  role: 'admin' | 'reception';
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('admin123', 10);
const RECEPTION_PASSWORD_HASH = bcrypt.hashSync('reception123', 10);

const localUsers: StoredUser[] = [
  { username: ADMIN_USERNAME, passwordHash: ADMIN_PASSWORD_HASH, role: 'admin' },
  { username: 'reception', passwordHash: RECEPTION_PASSWORD_HASH, role: 'reception' },
];

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return apiError('Identifiant et mot de passe requis');
    }

    let user = localUsers.find(u => u.username === username);
    let fromSupabase = false;

    if (user) {
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return apiError('Identifiant ou mot de passe incorrect', 401);
    } else {
      const { data: supabaseUser, error } = await supabaseAdmin
        .from('gym_users')
        .select('id, username, password_hash, role')
        .eq('username', username)
        .single();

      if (error || !supabaseUser) {
        return apiError('Identifiant ou mot de passe incorrect', 401);
      }

      const valid = await bcrypt.compare(password, supabaseUser.password_hash);
      if (!valid) return apiError('Identifiant ou mot de passe incorrect', 401);

      user = { username: supabaseUser.username, passwordHash: supabaseUser.password_hash, role: supabaseUser.role as 'admin' | 'reception' };
      fromSupabase = true;
    }

    const cookiePayload = stringifyCookieValue({
      username: user.username,
      role: user.role,
      supabaseUserId: fromSupabase ? username : user.username,
      profileId: user.username,
    });

    const signedCookie = await signCookie(cookiePayload, AUTH_SECRET);

    const response = NextResponse.json(apiSuccess({
      user: { username: user.username, role: user.role },
      redirect: user.role === 'admin' ? '/admin' : '/reception',
    }));

    response.cookies.set(COOKIE_NAME, signedCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    return response;
  } catch (error) {
    return apiError('Erreur serveur', 500);
  }
}