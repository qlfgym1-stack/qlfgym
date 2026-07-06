import { NextRequest } from 'next/server';
import { verifyAuthenticated, withRole } from '@/lib/api-auth';
import { apiSuccess, apiError } from '@/lib/api-response';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const session = verifyAuthenticated(req);
    withRole(session, ['admin', 'reception']);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const { data, error } = await supabaseAdmin.from('synced_members').select('*').eq('id', id).single();
      if (error) return apiError(error.message, 500);
      return apiSuccess(data);
    }

    const { data, error } = await supabaseAdmin.from('synced_members').select('*');
    if (error) return apiError(error.message, 500);
    return apiSuccess(data);
  } catch (error: any) {
    return apiError(error.message, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = verifyAuthenticated(req);
    withRole(session, ['admin', 'reception']);

    const body = await req.json();
    const { data, error } = await supabaseAdmin.from('synced_members').insert(body).select().single();
    if (error) return apiError(error.message, 500);
    return apiSuccess(data, 201);
  } catch (error: any) {
    return apiError(error.message, 401);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = verifyAuthenticated(req);
    withRole(session, ['admin', 'reception']);

    const body = await req.json();
    const { id, ...update } = body;
    if (!id) return apiError('ID requis');

    const { data, error } = await supabaseAdmin.from('synced_members').update(update).eq('id', id).select().single();
    if (error) return apiError(error.message, 500);
    return apiSuccess(data);
  } catch (error: any) {
    return apiError(error.message, 401);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = verifyAuthenticated(req);
    withRole(session, ['admin']);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return apiError('ID requis');

    const { error } = await supabaseAdmin.from('synced_members').delete().eq('id', id);
    if (error) return apiError(error.message, 500);
    return apiSuccess({ message: 'Supprimé' });
  } catch (error: any) {
    return apiError(error.message, 401);
  }
}
