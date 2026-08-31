import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = [
  'https://qlfgym.vercel.app',
  'https://qlfgym1-stack.github.io',
  'http://localhost:5173',
  'http://localhost:3000',
]

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') || ''
  const corsOrigin = allowedOrigins.includes(origin) ? origin : 'null'
  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':
      request.headers.get('Access-Control-Request-Headers') || 'Authorization, Content-Type, apikey',
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseKey || !supabaseAnonKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const jwt = authHeader.replace('Bearer ', '')
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const { data: roles } = await userClient
      .from('user_roles')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('role', 'admin')

    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await req.json()
    const { action, ...params } = body

    const targetOrg = params.organization_id || roles?.[0]?.organization_id
    const isTargetAdmin = roles?.some((r: any) => r.organization_id === targetOrg)
    if (!isTargetAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required for this organization' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    switch (action) {
      case 'list': {
        const page = params.page || 1
        const perPage = params.perPage || 100
        const { data: users, error } = await supabase.auth.admin.listUsers({ page, perPage })
        if (error) throw error

        const userIds = users.users.map((u: any) => u.id)
        const [{ data: userRoles }, { data: staffRows }] = await Promise.all([
          supabase
            .from('user_roles')
            .select('user_id, organization_id, role')
            .in('user_id', userIds),
          supabase
            .from('staff')
            .select('user_id, rfid_uid, username, is_active')
            .in('user_id', userIds),
        ])

        const staffByUser = new Map<string, any>((staffRows || []).map((s: any) => [s.user_id, s]))

        const enriched = users.users.map((u: any) => ({
          id: u.id,
          email: u.email,
          username: staffByUser.get(u.id)?.username ?? null,
          isActive: staffByUser.get(u.id)?.is_active ?? true,
          phone: u.phone,
          createdAt: u.created_at,
          lastSignIn: u.last_sign_in_at,
          confirmed: u.email_confirmed_at !== null,
          roles: (userRoles || []).filter((r: any) => r.user_id === u.id),
          rfidUid: staffByUser.get(u.id)?.rfid_uid ?? null,
        }))

        return new Response(JSON.stringify({ users: enriched, total: users.total ?? enriched.length }), {
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }

      case 'create': {
        const { email, username, password, first_name, last_name, phone, rfid_uid } = params
        if (!password) {
          return new Response(JSON.stringify({ error: 'password required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
          })
        }

        let finalEmail = email as string | undefined
        let finalUsername: string | null = null

        if (username) {
          finalUsername = String(username).toLowerCase().trim()
          if (!/^[a-z0-9][a-z0-9._-]*$/.test(finalUsername)) {
            return new Response(JSON.stringify({
              error: 'Invalid username format: only lowercase letters, numbers, . _ -',
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
            })
          }
          const { data: existing } = await supabase
            .from('staff')
            .select('id')
            .eq('username', finalUsername)
            .maybeSingle()
          if (existing) {
            return new Response(JSON.stringify({ error: 'Username already taken' }), {
              status: 409,
              headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
            })
          }
          finalEmail = `${finalUsername}@staff.local`
        }

        if (!finalEmail) {
          return new Response(JSON.stringify({ error: 'email or username required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
          })
        }

        const userData: Record<string, unknown> = {
          email: finalEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: [first_name, last_name].filter(Boolean).join(' ') || finalUsername || finalEmail },
        }
        if (phone) userData.phone = phone

        const { data: newUser, error: createError } = await supabase.auth.admin.createUser(userData)
        if (createError) throw createError

        const allowedRoles = ['staff', 'coach', 'admin']
        const role = allowedRoles.includes(params.role) ? params.role : 'staff'
        const { error: roleError } = await supabase.from('user_roles').insert({
          user_id: newUser.user.id,
          organization_id: targetOrg,
          role,
        })
        if (roleError) throw roleError

        if (rfid_uid || role !== 'admin') {
          const staffPayload: Record<string, unknown> = {
            organization_id: targetOrg,
            user_id: newUser.user.id,
            first_name: first_name || '',
            last_name: last_name || '',
            email: finalEmail,
            phone: phone || null,
            role,
            is_active: true,
          }
          if (finalUsername) staffPayload.username = finalUsername
          if (rfid_uid) staffPayload.rfid_uid = rfid_uid

          const { error: staffError } = await supabase.from('staff').insert(staffPayload)
          if (staffError) throw staffError
        }

        return new Response(JSON.stringify({
          user: { id: newUser.user.id, email: newUser.user.email, username: finalUsername },
        }), {
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }

      case 'reset-password': {
        const { user_id, new_password } = params
        if (!user_id) {
          return new Response(JSON.stringify({ error: 'user_id required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
          })
        }

        if (new_password) {
          const { error: updateError } = await supabase.auth.admin.updateUserById(user_id, { password: new_password })
          if (updateError) throw updateError
          return new Response(JSON.stringify({ success: true, message: 'Password updated' }), {
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
          })
        }

        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'recovery',
          email: params.email,
        })
        if (linkError) throw linkError

        return new Response(JSON.stringify({
          success: true,
          recoveryLink: linkData?.properties?.action_link,
          message: 'Recovery link generated',
        }), {
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }

      case 'update': {
        const { user_id, email, phone, role, organization_id, username } = params
        if (!user_id) {
          return new Response(JSON.stringify({ error: 'user_id required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
          })
        }

        const updateData: Record<string, unknown> = {}

        if (username) {
          const normalized = String(username).toLowerCase().trim()
          if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
            return new Response(JSON.stringify({
              error: 'Invalid username format: only lowercase letters, numbers, . _ -',
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
            })
          }
          const { data: existing } = await supabase
            .from('staff')
            .select('id')
            .eq('username', normalized)
            .neq('user_id', user_id)
            .maybeSingle()
          if (existing) {
            return new Response(JSON.stringify({ error: 'Username already taken' }), {
              status: 409,
              headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
            })
          }
          const { error: staffUError } = await supabase
            .from('staff')
            .update({ username: normalized })
            .eq('user_id', user_id)
          if (staffUError) throw staffUError
          updateData.email = `${normalized}@staff.local`
        } else if (email) {
          updateData.email = email
        }

        if (phone) updateData.phone = phone

        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase.auth.admin.updateUserById(user_id, updateData)
          if (updateError) throw updateError
        }

        if (role && organization_id) {
          const allowedRoles = ['staff', 'coach', 'admin']
          if (!allowedRoles.includes(role)) {
            return new Response(JSON.stringify({ error: 'Invalid role' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
            })
          }
          const { error: roleError } = await supabase
            .from('user_roles')
            .update({ role })
            .eq('user_id', user_id)
            .eq('organization_id', organization_id)
          if (roleError) throw roleError
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }

      case 'delete': {
        const { user_id } = params
        if (!user_id) {
          return new Response(JSON.stringify({ error: 'user_id required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
          })
        }

        if (user_id === user.id) {
          return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
          })
        }

        // Best-effort: nullify FK references before deleting
        await Promise.all([
          supabase.from('staff').delete().eq('user_id', user_id),
          supabase.from('investments').update({ created_by: null }).eq('created_by', user_id),
        ])
        // user_roles → ON DELETE CASCADE (auto-removed)

        const { error: deleteError } = await supabase.auth.admin.deleteUser(user_id)
        if (deleteError) {
          console.error('deleteUser error:', JSON.stringify(deleteError))
          return new Response(JSON.stringify({ error: `Delete failed: ${deleteError.message || deleteError.code || 'unknown'}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
          })
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }

      case 'set-active': {
        const { user_id, active } = params
        if (!user_id) {
          return new Response(JSON.stringify({ error: 'user_id required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
          })
        }

        if (user_id === user.id) {
          return new Response(JSON.stringify({ error: 'Cannot ban your own account' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
          })
        }

        const isActive = Boolean(active)

        const { error: staffError } = await supabase
          .from('staff')
          .update({ is_active: isActive })
          .eq('user_id', user_id)
        if (staffError) throw staffError

        // Ban/unban the auth user so the technical email cannot be used either
        const { error: banError } = await supabase.auth.admin.updateUserById(user_id, {
          ban_duration: isActive ? 'none' : '876000h',
        })
        if (banError) throw banError

        return new Response(JSON.stringify({ success: true, isActive }), {
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
    }
  } catch (err) {
    console.error('admin-manage-users error:', err)
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }
})
