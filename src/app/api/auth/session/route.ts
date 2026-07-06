import { NextRequest } from 'next/server';
import { getSession } from '@/lib/api-auth';
import { apiSuccess, apiError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return apiError('Non authentifié', 401);
    }
    return apiSuccess({ user: session });
  } catch {
    return apiError('Erreur serveur', 500);
  }
}
