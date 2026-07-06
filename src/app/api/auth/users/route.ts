import { NextRequest } from 'next/server';
import { verifyAuthenticated, withRole } from '@/lib/api-auth';
import { apiSuccess, apiError } from '@/lib/api-response';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const session = verifyAuthenticated(req);
    withRole(session, ['admin']);

    const { data, error } = await supabaseAdmin
      .from('gym_users')
      .select('id, username, role, created_at');

    if (error) return apiError(error.message, 500);
    return apiSuccess(data);
  } catch (error: any) {
    return apiError(error.message, 401);
  }
}
