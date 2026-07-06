import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifyAuthenticated, withRole } from '@/lib/api-auth';
import { apiSuccess, apiError } from '@/lib/api-response';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const session = verifyAuthenticated(req);
    withRole(session, ['admin']);

    const { username, password, role } = await req.json();
    if (!username || !password || !role) {
      return apiError('Champs requis : username, password, role');
    }

    if (role !== 'reception') {
      return apiError('Seul le rôle reception peut être créé via cette API');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { error } = await supabaseAdmin
      .from('gym_users')
      .insert({ username, password_hash: passwordHash, role });

    if (error) return apiError(error.message, 500);

    return apiSuccess({ message: 'Utilisateur créé' }, 201);
  } catch (error: any) {
    return apiError(error.message, 401);
  }
}
