import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useAuth } from "@/stores/auth"
import { useSupabase } from "@/hooks/useSupabase"
import { useT } from "@/i18n"
import { PageHeader } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { Loader2, Plus, Search, ShieldAlert, Power, PowerOff, KeyRound, Trash2 } from "lucide-react"

const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-manage-users`

interface AdminUser {
  id: string
  email: string
  username?: string | null
  isActive?: boolean
  phone: string | null
  createdAt: string
  lastSignIn: string | null
  confirmed: boolean
  roles: { user_id: string; organization_id: string; role: string }[]
  rfidUid?: string | null
}

const ROLE_OPTIONS = [
  { value: "admin", labelKey: "admin.users.roleAdmin" },
  { value: "coach", labelKey: "admin.users.roleCoach" },
  { value: "staff", labelKey: "admin.users.roleStaff" },
  { value: "receptionist", labelKey: "admin.users.roleReception" },
]

export default function AdminUsersPage() {
  const t = useT()
  const { toast } = useToast()
  const { user } = useAuth()
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const perPage = 50

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ email: "", username: "", phone: "", first_name: "", last_name: "", password: "", role: "staff", rfid_uid: "" })

  const [resetOpen, setResetOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [resetPassword, setResetPassword] = useState("")

  const [statusOpen, setStatusOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<AdminUser | null>(null)
  const [statusPending, setStatusPending] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }

  const callApi = async (action: string, params: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error("Not authenticated")
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...params }),
      signal: AbortSignal.timeout(10000),
    })
    const json = await res.json() as Record<string, unknown>
    if (!res.ok) throw new Error(String(json.error || json.message || `HTTP ${res.status}`))
    return json
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-users', page, search],
    queryFn: async () => {
      const result = await callApi('list', { page, perPage, search: search || undefined })
      if (result.error) throw new Error(String(result.error))
      return { users: (result.users ?? []) as AdminUser[], total: (result.total ?? 0) as number }
    },
  })

  const users = data?.users ?? []
  const total = data?.total ?? 0

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('admin.users.title')} />
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive font-medium">{t('admin.users.error')}</p>
            <p className="text-sm text-muted-foreground mt-2">{error?.message}</p>
            <Button variant="outline" className="mt-4" onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-users'] })}>
              {t('common.retry')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  const totalPages = Math.ceil(total / perPage)

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await callApi('create', {
        email: createForm.email || undefined,
        username: createForm.username || undefined,
        phone: createForm.phone || undefined,
        password: createForm.password,
        first_name: createForm.first_name,
        last_name: createForm.last_name,
        role: createForm.role,
        rfid_uid: createForm.rfid_uid || undefined,
      })
      if (result.error) throw new Error(String(result.error))
      return result as Record<string, unknown>
    },
    onSuccess: (result: Record<string, unknown>) => {
      const user = result.user as { id: string; email: string; username?: string | null } | undefined
      toast({ title: t('admin.users.created'), description: `${user?.username ?? user?.email ?? ''} (password: ${result.password ?? ''})` })
      setCreateOpen(false)
      setCreateForm({ email: "", username: "", phone: "", first_name: "", last_name: "", password: "", role: "staff", rfid_uid: "" })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err: Error) => {
      toast({ title: t('admin.users.error'), description: err.message, variant: 'destructive' })
    },
  })

  const resetMutation = useMutation({
    mutationFn: async () => {
      const result = await callApi('reset-password', {
        user_id: resetTarget?.id,
        email: resetTarget?.email,
        new_password: resetPassword || undefined,
      })
      if (result.error) throw new Error(String(result.error))
      return result as Record<string, unknown>
    },
    onSuccess: (result: Record<string, unknown>) => {
      toast({
        title: t('admin.users.passwordReset'),
        description: resetPassword ? `${t('admin.users.newPassword')}: ${resetPassword}` : (String(result.recoveryLink ?? result.message ?? '')),
      })
      setResetOpen(false)
      setResetTarget(null)
      setResetPassword("")
    },
    onError: (err: Error) => {
      toast({ title: t('admin.users.error'), description: err.message, variant: 'destructive' })
    },
  })

  const toggleStatus = async (target: AdminUser) => {
    setStatusPending(true)
    try {
      const result = await callApi('set-active', { user_id: target.id, active: !target.isActive })
      if (result.error) throw new Error(String(result.error))
      toast({ title: target.isActive ? t('admin.users.deactivated') : t('admin.users.activated') })
      setStatusOpen(false)
      setStatusTarget(null)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    } catch (err) {
      toast({ title: t('admin.users.error'), description: (err as Error).message, variant: 'destructive' })
    } finally {
      setStatusPending(false)
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) throw new Error('No target')
      return await callApi('delete', { user_id: deleteTarget.id })
    },
    onSuccess: () => {
      toast({ title: t('admin.users.deleted') })
      setDeleteOpen(false)
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err: Error) => {
      toast({ title: t('admin.users.error'), description: err.message, variant: 'destructive' })
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.users.title')}
        description={t('admin.users.description')}
        actions={
          <Button onClick={() => { setCreateForm(prev => ({ ...prev, password: generatePassword() })); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            {t('admin.users.create')}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-lg font-semibold">
              {t('admin.users.listTitle')} ({total})
            </CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('admin.users.searchEmail')}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t('admin.users.empty')}</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.users.identifier')}</TableHead>
                    <TableHead>{t('admin.users.phone')}</TableHead>
                    <TableHead>{t('admin.users.roles')}</TableHead>
                    <TableHead>{t('admin.users.status')}</TableHead>
                    <TableHead>{t('admin.users.rfid')}</TableHead>
                    <TableHead>{t('admin.users.confirmed')}</TableHead>
                    <TableHead>{t('admin.users.createdAt')}</TableHead>
                    <TableHead>{t('admin.users.lastLogin')}</TableHead>
                    <TableHead className="w-[120px]">{t('admin.users.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u: AdminUser) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.username || u.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.phone || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {u.roles.length === 0 ? (
                            <Badge variant="secondary" className="text-xs">{t('admin.users.noRole')}</Badge>
                          ) : (
                            u.roles.map((r: AdminUser['roles'][number], i: number) => (
                              <Badge
                                key={i}
                                variant={r.role === 'admin' ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                {r.role}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={u.isActive ? 'default' : 'outline'}
                          className={`text-xs ${u.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}
                        >
                          {u.isActive ? t('admin.users.active') : t('admin.users.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.rfidUid ? (
                          <Badge variant="outline" className="font-mono text-xs">{u.rfidUid}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={u.confirmed ? 'default' : 'outline'}
                          className={`text-xs ${u.confirmed ? 'bg-green-100 text-green-800 border-green-200' : ''}`}
                        >
                          {u.confirmed ? t('admin.users.yes') : t('admin.users.no')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => { setResetTarget(u); setResetPassword(generatePassword()); setResetOpen(true); }}
                            title={t('admin.users.resetPassword')}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className={`h-8 w-8 ${u.isActive ? 'text-amber-600 hover:text-amber-700' : 'text-green-600 hover:text-green-700'}`}
                            onClick={() => { setStatusTarget(u); setStatusOpen(true); }}
                            title={u.isActive ? t('admin.users.deactivate') : t('admin.users.activate')}
                          >
                            {u.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          </Button>
                          {!u.roles.some(r => r.role === 'admin') && u.id !== user?.id && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => { setDeleteTarget(u); setDeleteOpen(true); }}
                              title={t('admin.users.deleteTitle')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    {t('common.previous')}
                  </Button>
                  <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    {t('common.next')}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!createMutation.isPending) setCreateOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.users.createTitle')}</DialogTitle>
            <DialogDescription>{t('admin.users.createDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('admin.users.firstName')}</label>
                <Input value={createForm.first_name} onChange={e => setCreateForm(p => ({ ...p, first_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('admin.users.lastName')}</label>
                <Input value={createForm.last_name} onChange={e => setCreateForm(p => ({ ...p, last_name: e.target.value }))} />
              </div>
            </div>
            {createForm.role === 'admin' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('admin.users.email')} <span className="text-destructive">*</span></label>
                <Input type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} placeholder="admin@votre-salle.com" />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('admin.users.username')} <span className="text-destructive">*</span></label>
                <Input
                  value={createForm.username}
                  onChange={e => setCreateForm(p => ({ ...p, username: e.target.value.toLowerCase() }))}
                  placeholder={t('admin.users.usernamePlaceholder')}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">{t('admin.users.usernameHint')}</p>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('admin.users.phone')}</label>
              <Input type="tel" value={createForm.phone} onChange={e => setCreateForm(p => ({ ...p, phone: e.target.value }))} placeholder="+213555123456" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{t('admin.users.password')}</label>
                <Button variant="ghost" size="sm" onClick={() => setCreateForm(p => ({ ...p, password: generatePassword() }))}>
                  {t('admin.users.generate')}
                </Button>
              </div>
              <Input value={createForm.password} onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('admin.users.role')}</label>
              <Select value={createForm.role} onValueChange={v => setCreateForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('admin.users.rfid')}</label>
              <Input
                value={createForm.rfid_uid}
                onChange={e => setCreateForm(p => ({ ...p, rfid_uid: e.target.value }))}
                placeholder={t('admin.users.rfidPlaceholder')}
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                (createForm.role === 'admin' ? !createForm.email : !createForm.username) ||
                !createForm.password ||
                createMutation.isPending
              }
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('admin.users.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={(open) => { if (!resetMutation.isPending) setResetOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.users.resetTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.users.resetDescription')} <strong>{resetTarget?.username ?? resetTarget?.email}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t('admin.users.newPassword')}</label>
              <Button variant="ghost" size="sm" onClick={() => setResetPassword(generatePassword())}>
                {t('admin.users.generate')}
              </Button>
            </div>
            <Input value={resetPassword} onChange={e => setResetPassword(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t('admin.users.resetHint')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => resetMutation.mutate()} disabled={!resetPassword || resetMutation.isPending}>
              {resetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('admin.users.resetButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status (activate/deactivate) Dialog */}
      <Dialog open={statusOpen} onOpenChange={(open) => { if (!statusPending) setStatusOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{statusTarget?.isActive ? t('admin.users.deactivateTitle') : t('admin.users.activateTitle')}</DialogTitle>
            <DialogDescription>
              {statusTarget?.isActive ? t('admin.users.deactivateDescription') : t('admin.users.activateDescription')}{' '}
              <strong>{statusTarget?.username ?? statusTarget?.email}</strong>.
              {statusTarget?.isActive ? t('admin.users.deactivateWarning') : t('admin.users.activateHint')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)} disabled={statusPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={statusTarget?.isActive ? 'destructive' : 'default'}
              onClick={() => { if (statusTarget) toggleStatus(statusTarget); }}
              disabled={statusPending || !statusTarget}
            >
              {statusPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {statusTarget?.isActive ? t('admin.users.deactivate') : t('admin.users.activate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!deleteMutation.isPending) setDeleteOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.users.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.users.deleteDescription')}{' '}
              <strong>{deleteTarget?.username ?? deleteTarget?.email}</strong>.
              {t('admin.users.deleteWarning')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={!deleteTarget || deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('admin.users.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
