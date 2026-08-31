import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useAuth } from "@/stores/auth"
import { useT } from "@/i18n"
import { useNavigate, useLocation } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { formatDate, formatCurrency, cn, toUpper, formatPhone, displayPhone } from "@/lib/utils"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { Plus, Pencil, Loader2, MoreHorizontal, Download } from "lucide-react"
import { usePagination } from "@/hooks/usePagination"
import { useExportCsv } from "@/hooks/useExportCsv"
import { Pagination } from "@/components/ui/pagination"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Staff, Tables } from "@/types/supabase"
import { RfidCreateSection } from "@/pages/members/rfid-management"

const staffSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  role: z.string().optional().or(z.literal("")),
  salary: z.coerce.number().min(0).optional().or(z.literal("")),
  hireDate: z.string().optional().or(z.literal("")),
})

type StaffForm = z.infer<typeof staffSchema>

const ROLES = ["admin", "coach", "staff", "receptionist"]
const TABS = [
  { value: "list", labelKey: "staff.staffList", path: "/staff" },
  { value: "timesheet", labelKey: "staff.timesheet", path: "/staff/timesheet" },
  { value: "planning", labelKey: "staff.planning", path: "/staff/planning" },
  { value: "leaves", labelKey: "staff.leaves", path: "/staff/leaves" },
]

export default function StaffPage() {
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const { organization } = useAuth()
  const orgId = organization?.id
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false)
  const [statusConfirmStaff, setStatusConfirmStaff] = useState<Staff | null>(null)
  const [rfidUid, setRfidUid] = useState("")

  const form = useForm<StaffForm>({
    resolver: zodResolver(staffSchema),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", role: "", salary: undefined as number | undefined, hireDate: "" },
  })

  const { data: staffList, isLoading, isError: staffError, error: staffQueryError } = useQuery({
    queryKey: ["staff", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase.from("staff").select("*").eq("organization_id", orgId).order("created_at", { ascending: false })
      return data ?? []
    },
    enabled: !!orgId,
  })

  useEffect(() => {
    if (staffError && staffQueryError) {
      toast({ title: t("errors.error") || "Error", description: staffQueryError.message, variant: "destructive" })
    }
  }, [staffError, staffQueryError])

  const upsertMutation = useMutation({
    mutationFn: async (values: StaffForm) => {
      if (!orgId) throw new Error("No org")
      const payload = {
        first_name: values.firstName,
        last_name: values.lastName,
        email: values.email || null,
        phone: values.phone || null,
        role: values.role || null,
        salary: values.salary ? Number(values.salary) : null,
        hire_date: values.hireDate || null,
        rfid_uid: rfidUid || null,
        organization_id: orgId,
      }
      if (editing) {
        const { error } = await supabase.from("staff").update(payload).eq("id", editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("staff").insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] })
      queryClient.invalidateQueries({ queryKey: ["coaches-list"] })
      queryClient.invalidateQueries({ queryKey: ["coaches-with-count"] })
      queryClient.invalidateQueries({ queryKey: ["planning-coaches"] })
      toast({ title: editing ? t("staff.updated") : t("staff.created") })
      setOpen(false)
      setEditing(null)
      setRfidUid("")
      form.reset()
    },
    onError: (err: Error) => toast({ title: t("errors.error"), description: err.message, variant: "destructive" }),
  })

  const toggleStatus = useMutation({
    mutationFn: async (staff: Staff) => {
      const { error } = await supabase.from("staff").update({ is_active: !staff.is_active }).eq("id", staff.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] })
      queryClient.invalidateQueries({ queryKey: ["coaches-list"] })
      queryClient.invalidateQueries({ queryKey: ["coaches-with-count"] })
      queryClient.invalidateQueries({ queryKey: ["planning-coaches"] })
      toast({ title: t("staff.statusUpdated") })
    },
    onError: (err: Error) => toast({ title: t("errors.error"), description: err.message, variant: "destructive" }),
  })

  function openEdit(staff: Staff) {
    setEditing(staff)
    setRfidUid(staff.rfid_uid ?? "")
    form.reset({
      firstName: staff.first_name,
      lastName: staff.last_name,
      email: staff.email ?? "",
      phone: formatPhone(staff.phone) ?? "",
      role: staff.role ?? "",
      salary: staff.salary ?? undefined,
      hireDate: staff.hire_date ?? "",
    })
    setOpen(true)
  }

  function openAdd() {
    setEditing(null)
    setRfidUid("")
    form.reset()
    setOpen(true)
  }

  function onSubmit(values: StaffForm) {
    upsertMutation.mutate(values)
  }

  const { page, setPage, totalPages, paginatedData: paginatedStaff } = usePagination(staffList, 20)

  const { exportCsv } = useExportCsv(
    (staffList ?? []).map((s: Staff) => ({ first_name: s.first_name, last_name: s.last_name, email: s.email ?? '', phone: s.phone ?? '', role: s.role ?? '', salary: s.salary ?? 0, hire_date: s.hire_date ?? '', is_active: s.is_active })),
    'staff',
    [
      { key: 'first_name', label: t('staff.firstName') },
      { key: 'last_name', label: t('staff.lastName') },
      { key: 'email', label: t('staff.email') },
      { key: 'phone', label: t('staff.phone') },
      { key: 'role', label: t('staff.role') },
      { key: 'salary', label: t('staff.salary') },
      { key: 'hire_date', label: t('staff.hireDate') },
      { key: 'is_active', label: t('staff.status') },
    ]
  )

  const currentTab = TABS.find(t => t.path === location.pathname)?.value ?? "list"

  return (
    <div>
      <PageHeader
        title={t("staff.title")}
        description={t("staff.description")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportCsv()}>
              <Download className="mr-2 h-4 w-4" />
              {t("common.export") || "Export"}
            </Button>
            <Button onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              {t("staff.add")}
            </Button>
          </div>
        }
      />

      <Tabs value={currentTab} onValueChange={(v) => { const tab = TABS.find(t => t.value === v); if (tab) navigate(tab.path) }}>
        <TabsList className="mb-6">
          {TABS.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value}>{t(tab.labelKey)}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("staff.name")}</TableHead>
                  <TableHead>{t("staff.email")}</TableHead>
                  <TableHead>{t("staff.phone")}</TableHead>
                  <TableHead>{t("staff.role")}</TableHead>
                  <TableHead>{t("staff.salary")}</TableHead>
                  <TableHead>{t("staff.hireDate")}</TableHead>
                  <TableHead>{t("staff.status")}</TableHead>
                  <TableHead>{t("staff.rfid")}</TableHead>
                  <TableHead className="w-[70px]">{t("staff.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : paginatedStaff?.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">{t("staff.noData")}</TableCell></TableRow>
                ) : (
                  paginatedStaff?.map(staff => (
                    <TableRow key={staff.id}>
                      <TableCell className="font-medium">{toUpper(staff.first_name)} {toUpper(staff.last_name)}</TableCell>
                      <TableCell>{staff.username || staff.email}</TableCell>
                      <TableCell>{displayPhone(staff.phone)}</TableCell>
                      <TableCell className="capitalize">{toUpper(staff.role)}</TableCell>
                      <TableCell>{staff.salary ? formatCurrency(staff.salary) : "-"}</TableCell>
                      <TableCell>{staff.hire_date ? formatDate(staff.hire_date) : "-"}</TableCell>
                      <TableCell>
                        <Badge variant={staff.is_active ? "default" : "secondary"}>{staff.is_active ? t("common.active") : t("common.inactive")}</Badge>
                      </TableCell>
                      <TableCell>
                        {staff.rfid_uid ? (
                          <Badge variant="outline" className="font-mono text-xs">{staff.rfid_uid}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(staff)}>
                              <Pencil className="mr-2 h-4 w-4" /> {t("staff.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setStatusConfirmStaff(staff); setStatusConfirmOpen(true) }}>
                              {staff.is_active ? t("staff.deactivate") : t("staff.activate")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-3 p-4">
            {isLoading ? (
              <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
            ) : paginatedStaff?.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">{t("staff.noData")}</p>
            ) : (
              paginatedStaff?.map(staff => (
                <Card key={staff.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{toUpper(staff.first_name)} {toUpper(staff.last_name)}</p>
                      <p className="text-sm text-muted-foreground">{staff.username || staff.email}</p>
                      {staff.rfid_uid && <p className="text-xs text-muted-foreground font-mono mt-0.5">{staff.rfid_uid}</p>}
                    </div>
                    <Badge variant={staff.is_active ? "default" : "secondary"}>{staff.is_active ? t("common.active") : t("common.inactive")}</Badge>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(staff)}><Pencil className="h-4 w-4" /></Button>
                  </div>
                </Card>
              ))
            )}
          </div>

          <div className="px-4 pb-4">
            <Pagination page={page} totalPages={totalPages} totalItems={staffList?.length ?? 0} pageSize={20} onPageChange={setPage} />
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setRfidUid(""); form.reset() } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editing ? t("staff.editStaff") : t("staff.addStaff")}</DialogTitle>
            <DialogDescription>{editing ? t("staff.editDescription") : t("staff.addDescription")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("staff.firstName")}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("staff.lastName")}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("staff.email")}</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("staff.phone")}</FormLabel>
                    <FormControl><Input {...field} onBlur={() => field.onChange(formatPhone(field.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("staff.role")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder={t("staff.selectRole")} /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROLES.map(r => (
                          <SelectItem key={r} value={r} className="capitalize">{t(`staff.${r}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="salary" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("staff.salary")}</FormLabel>
                    <FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="hireDate" render={({ field }) => (
                <FormItem>
                    <FormLabel>{t("staff.hireDate")}</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <RfidCreateSection rfidUid={rfidUid} onRfidChange={setRfidUid} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setOpen(false); setEditing(null); setRfidUid(""); form.reset() }}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing ? t("common.save") : t("common.create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={statusConfirmOpen} onOpenChange={setStatusConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.confirm") || "Confirm"}</DialogTitle>
            <DialogDescription>
              {statusConfirmStaff?.is_active ? (t("staff.confirmDeactivate") || "Are you sure you want to deactivate this staff member?") : (t("staff.confirmActivate") || "Are you sure you want to activate this staff member?")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStatusConfirmOpen(false); setStatusConfirmStaff(null) }}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => { if (statusConfirmStaff) toggleStatus.mutate(statusConfirmStaff); setStatusConfirmOpen(false); setStatusConfirmStaff(null) }}>
              {t("common.confirm") || "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
