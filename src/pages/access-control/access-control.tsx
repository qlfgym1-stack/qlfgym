import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useT } from "@/i18n"
import { useAuth } from "@/stores/auth"
import { usePagination } from "@/hooks/usePagination"
import { useExportCsv } from "@/hooks/useExportCsv"
import { downloadWorkbook } from "@/lib/exportWorkbook"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Pagination } from "@/components/ui/pagination"
import { useToast } from "@/components/ui/toast"
import { formatDateTime } from "@/lib/utils"
import { useOpenMember } from "@/hooks/useOpenMember"
import {
  Shield, Plus, Search, Edit, Trash2, Wifi, WifiOff, AlertTriangle, UserCheck, Download, X,
} from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import type { TurnstileStatus, AccessControl, ManualValidation, Member } from "@/types/supabase"

type TurnstileDashboard = {
  total_terminals: number
  online: number
  offline: number
  fault: number
  manual_validations_today: number
  manual_validations_total: number
}

type ManualValidationWithMember = ManualValidation & { member: Pick<Member, "first_name" | "last_name"> | null }

const deviceSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  type: z.enum(["turnstile", "door", "barrier"]),
  device_id: z.string().optional(),
  is_active: z.boolean(),
})

type DeviceFormData = z.infer<typeof deviceSchema>

export default function AccessControlPage() {
  const t = useT()
  const openMember = useOpenMember()
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { organization } = useAuth()
  const { toast } = useToast()
  const orgId = organization?.id

  const [search, setSearch] = useState("")
  const [editingDevice, setEditingDevice] = useState<AccessControl | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState("")

  const form = useForm<DeviceFormData>({
    resolver: zodResolver(deviceSchema),
    defaultValues: { name: "", type: "turnstile", device_id: "", is_active: true },
  })

  const { data: dashboardStats } = useQuery({
    queryKey: ["turnstile-dashboard", orgId],
    queryFn: async () => {
      if (!orgId) return null
      const { data } = await (supabase.rpc as any)("get_turnstile_dashboard", { p_organization_id: orgId })
      return data as TurnstileDashboard
    },
    enabled: !!orgId,
  })

  const { data: turnstileDevices } = useQuery({
    queryKey: ["turnstile-devices", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("turnstile_status")
        .select("*")
        .eq("organization_id", orgId)
        .order("terminal")
      return data as TurnstileStatus[]
    },
    enabled: !!orgId,
  })

  const { data: accessDevices } = useQuery({
    queryKey: ["access-devices", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("access_control")
        .select("*")
        .eq("organization_id", orgId)
        .order("name")
      return data as AccessControl[]
    },
    enabled: !!orgId,
  })

  const { data: manualValidations } = useQuery({
    queryKey: ["manual-validations", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("manual_validations")
        .select("*, member:members(first_name, last_name)")
        .eq("organization_id", orgId)
        .order("validated_at", { ascending: false })
      return data as (ManualValidation & { member: Pick<Member, "first_name" | "last_name"> | null })[]
    },
    enabled: !!orgId,
  })

  const upsertMutation = useMutation({
    mutationFn: async (device: DeviceFormData & { id?: string }) => {
      if (device.id) {
        const { error } = await supabase.from("access_control").update({
          name: device.name, type: device.type, device_id: device.device_id || null, is_active: device.is_active,
        }).eq("id", device.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("access_control").insert({
          organization_id: orgId!, name: device.name, type: device.type, device_id: device.device_id || null, is_active: device.is_active,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-devices"] })
      setDialogOpen(false)
      toast({ title: editingDevice ? t("common.updated") : t("common.created") })
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("access_control").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-devices"] })
      toast({ title: t("common.deleted") })
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("access_control").update({ is_active }).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-devices"] })
    },
  })

  const heartbeatMutation = useMutation({
    mutationFn: async (params: { terminal: string; status: string }) => {
      const { data } = await (supabase.rpc as any)("turnstile_heartbeat", {
        p_organization_id: orgId,
        p_terminal: params.terminal,
        p_status: params.status,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["turnstile-devices"] })
      queryClient.invalidateQueries({ queryKey: ["turnstile-dashboard"] })
      toast({ title: t("common.updated") })
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" })
    },
  })

  function openCreate() {
    setEditingDevice(null)
    form.reset({ name: "", type: "turnstile", device_id: "", is_active: true })
    setDialogOpen(true)
  }

  function openEdit(d: AccessControl) {
    setEditingDevice(d)
    form.reset({ name: d.name, type: d.type, device_id: d.device_id ?? "", is_active: d.is_active })
    setDialogOpen(true)
  }

  function save(data: DeviceFormData) {
    upsertMutation.mutate({ id: editingDevice?.id, ...data })
  }

  function remove(id: string) {
    deleteMutation.mutate(id)
  }

  function toggleDevice(id: string, current: boolean) {
    toggleMutation.mutate({ id, is_active: !current })
  }

  const filteredDevices = (accessDevices ?? []).filter((d: AccessControl) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.device_id ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const filteredHistory = (manualValidations ?? []).filter((v: ManualValidationWithMember) =>
    !historySearch ||
    v.member?.first_name.toLowerCase().includes(historySearch.toLowerCase()) ||
    v.member?.last_name.toLowerCase().includes(historySearch.toLowerCase()) ||
    v.reason.includes(historySearch)
  )

  const { page: devicePage, setPage: setDevicePage, totalPages: deviceTotalPages, paginatedData: paginatedDevices } = usePagination(filteredDevices, 20)
  const { page: historyPage, setPage: setHistoryPage, totalPages: historyTotalPages, paginatedData: paginatedHistory } = usePagination(filteredHistory, 20)

  const { exportCsv: exportDevicesCsv } = useExportCsv(
    filteredDevices.map((d: AccessControl) => ({ name: d.name, type: d.type, device_id: d.device_id ?? '', is_active: d.is_active ? 'Active' : 'Inactive' })),
    'access-devices',
    [
      { key: 'name', label: t('accessControl.deviceName') || 'Name' },
      { key: 'type', label: t('accessControl.type') || 'Type' },
      { key: 'device_id', label: t('accessControl.deviceId') || 'Device ID' },
      { key: 'is_active', label: t('accessControl.status') || 'Status' },
    ]
  )

  async function exportHistory() {
    try {
      if (!manualValidations || manualValidations.length === 0) return
      const ExcelJS = await import("exceljs")
      const wb = new ExcelJS.default.Workbook()
      const ws = wb.addWorksheet("ManualValidations")
      ws.columns = [
        { header: "member", key: "member", width: 30 },
        { header: "reason", key: "reason", width: 20 },
        { header: "detail", key: "detail", width: 30 },
        { header: "terminal", key: "terminal", width: 20 },
        { header: "validated_at", key: "validated_at", width: 25 },
      ]
      manualValidations.forEach((v: ManualValidationWithMember) => {
        ws.addRow({
          member: v.member ? `${v.member.first_name} ${v.member.last_name}` : "—",
          reason: v.reason,
          detail: v.reason_detail ?? "",
          terminal: v.terminal ?? "",
          validated_at: v.validated_at,
        })
      })
      await downloadWorkbook(wb, "manual-validations")
    } catch (err) {
      toast({ title: "Erreur", description: String(err), variant: "destructive" })
    }
  }

  return (
    <div>
      <PageHeader
        title={t("accessControl.title")}
        description={t("accessControl.description")}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t("accessControl.addDevice")}
          </Button>
        }
      />

      {dashboardStats && dashboardStats.total_terminals > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <Wifi className="h-8 w-8 mx-auto mb-2 text-success" />
              <p className="text-3xl font-bold text-success">{dashboardStats.online}</p>
              <p className="text-sm text-muted-foreground">{t("accessControl.connected") || "Connecté"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <WifiOff className="h-8 w-8 mx-auto mb-2 text-warning" />
              <p className="text-3xl font-bold text-warning">{dashboardStats.offline}</p>
              <p className="text-sm text-muted-foreground">{t("accessControl.offline") || "Hors ligne"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
              <p className="text-3xl font-bold text-destructive">{dashboardStats.fault}</p>
              <p className="text-sm text-muted-foreground">{t("accessControl.fault") || "En panne"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <UserCheck className="h-8 w-8 mx-auto mb-2" />
              <p className="text-3xl font-bold">{dashboardStats.manual_validations_today}</p>
              <p className="text-sm text-muted-foreground">{t("accessControl.validationsToday") || "Validations manuelles ajd"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" size="icon" onClick={() => { setSearch(""); setDevicePage(1) }} title="Reset filters">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="turnstiles">
        <TabsList className="mb-4">
          <TabsTrigger value="turnstiles">{t("accessControl.turnstiles") || "Tourniquets"}</TabsTrigger>
          <TabsTrigger value="devices">{t("accessControl.devices")}</TabsTrigger>
          <TabsTrigger value="history">{t("accessControl.history") || "Historique"}</TabsTrigger>
        </TabsList>

        <TabsContent value="turnstiles">
          <p className="text-sm text-muted-foreground mb-2">{(turnstileDevices ?? []).length} {t("accessControl.turnstiles") || "Tourniquets"}</p>
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("accessControl.terminal") || "Terminal"}</TableHead>
                  <TableHead>{t("accessControl.status") || "Statut"}</TableHead>
                  <TableHead>{t("accessControl.lastHeartbeat") || "Dernier battement"}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(turnstileDevices ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      {t("common.noData")}
                    </TableCell>
                  </TableRow>
                ) : (turnstileDevices ?? []).map((d: TurnstileStatus) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium font-mono">{d.terminal}</TableCell>
                    <TableCell>
                      <Badge variant={
                        d.status === "online" ? "default" :
                        d.status === "offline" ? "secondary" : "destructive"
                      }>
                        {d.status === "online" ? <Wifi className="h-3 w-3 mr-1" /> :
                         d.status === "offline" ? <WifiOff className="h-3 w-3 mr-1" /> :
                         <AlertTriangle className="h-3 w-3 mr-1" />}
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.last_heartbeat ? formatDateTime(d.last_heartbeat) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => heartbeatMutation.mutate({ terminal: d.terminal, status: "online" })}>
                          {t("accessControl.markOnline") || "Marquer en ligne"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => heartbeatMutation.mutate({ terminal: d.terminal, status: "offline" })}>
                          {t("accessControl.markOffline") || "Marquer hors ligne"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-3 p-4">
            {(turnstileDevices ?? []).length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">{t("common.noData")}</p>
            ) : (turnstileDevices ?? []).map((d: TurnstileStatus) => (
              <Card key={d.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium font-mono">{d.terminal}</span>
                  <Badge variant={d.status === "online" ? "default" : d.status === "offline" ? "secondary" : "destructive"}>
                    {d.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{d.last_heartbeat ? formatDateTime(d.last_heartbeat) : "—"}</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => heartbeatMutation.mutate({ terminal: d.terminal, status: "online" })}>
                    <Wifi className="h-3 w-3 mr-1" /> Online
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => heartbeatMutation.mutate({ terminal: d.terminal, status: "offline" })}>
                    <WifiOff className="h-3 w-3 mr-1" /> Offline
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="devices">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">{filteredDevices.length} {t("accessControl.devices")}</p>
            <Button variant="outline" size="sm" onClick={() => exportDevicesCsv()}>
              <Download className="mr-2 h-4 w-4" /> {t("common.export") || "Export"}
            </Button>
          </div>
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("accessControl.deviceName")}</TableHead>
                  <TableHead>{t("accessControl.type")}</TableHead>
                  <TableHead>{t("accessControl.deviceId")}</TableHead>
                  <TableHead>{t("accessControl.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {t("common.noResults")}
                    </TableCell>
                  </TableRow>
                ) : paginatedDevices.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        {d.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{d.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{d.device_id ?? "—"}</TableCell>
                    <TableCell>
                      <Switch checked={d.is_active} onCheckedChange={() => toggleDevice(d.id, d.is_active)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(d.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-3 p-4">
            {paginatedDevices.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">{t("common.noResults")}</p>
            ) : paginatedDevices.map((d) => (
              <Card key={d.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{d.name}</span>
                  </div>
                  <Switch checked={d.is_active} onCheckedChange={() => toggleDevice(d.id, d.is_active)} />
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <Badge variant="outline">{d.type}</Badge>
                  <span className="font-mono text-xs">{d.device_id ?? "—"}</span>
                </div>
                <div className="flex justify-end gap-1 mt-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(d.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <Pagination page={devicePage} totalPages={deviceTotalPages} totalItems={filteredDevices.length} pageSize={20} onPageChange={setDevicePage} />
        </TabsContent>

        <TabsContent value="history">
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t("common.search")} value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="pl-9" />
            </div>
            <Button variant="outline" size="icon" onClick={() => { setHistorySearch(""); setHistoryPage(1) }} title="Reset filters">
              <X className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={exportHistory}>
              <Download className="mr-2 h-4 w-4" /> {t("common.export")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mb-2">{filteredHistory.length} {t("accessControl.history") || "Historique"}</p>
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("accessControl.member")}</TableHead>
                  <TableHead>{t("accessControl.reason") || "Motif"}</TableHead>
                  <TableHead>{t("accessControl.detail") || "Détail"}</TableHead>
                  <TableHead>{t("accessControl.terminal") || "Terminal"}</TableHead>
                  <TableHead>{t("accessControl.date") || "Date"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {t("common.noData")}
                    </TableCell>
                  </TableRow>
                ) : paginatedHistory.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">
                      {v.member ? (
                        <button
                          type="button"
                          onClick={() => openMember(v.member_id)}
                          title="Ouvrir la fiche adhérent"
                          className="text-left font-medium cursor-pointer hover:text-primary hover:underline transition-colors"
                        >
                          {v.member.first_name} {v.member.last_name}
                        </button>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{v.reason}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.reason_detail ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{v.terminal ?? "—"}</TableCell>
                    <TableCell className="text-sm">{formatDateTime(v.validated_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden space-y-3 p-4">
            {paginatedHistory.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">{t("common.noData")}</p>
            ) : paginatedHistory.map((v) => (
              <Card key={v.id} className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">
                    {v.member ? (
                      <button
                        type="button"
                        onClick={() => openMember(v.member_id)}
                        title="Ouvrir la fiche adhérent"
                        className="text-left font-medium cursor-pointer hover:text-primary hover:underline transition-colors"
                      >
                        {v.member.first_name} {v.member.last_name}
                      </button>
                    ) : "—"}
                  </span>
                  <Badge variant="outline" className="text-xs">{v.reason}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{v.reason_detail ?? "—"}</p>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span className="font-mono">{v.terminal ?? "—"}</span>
                  <span>{formatDateTime(v.validated_at)}</span>
                </div>
              </Card>
            ))}
          </div>
          <Pagination page={historyPage} totalPages={historyTotalPages} totalItems={filteredHistory.length} pageSize={20} onPageChange={setHistoryPage} />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(save)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingDevice ? t("accessControl.editDevice") : t("accessControl.addDevice")}</DialogTitle>
                <DialogDescription>{t("accessControl.deviceFormDescription")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("accessControl.deviceName")}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("accessControl.type")}</FormLabel>
                      <FormControl>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="turnstile">Turnstile</SelectItem>
                            <SelectItem value="door">Door</SelectItem>
                            <SelectItem value="barrier">Barrier</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="device_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("accessControl.deviceId")}</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit">{t("common.save")}</Button>
              </DialogFooter>
            </DialogContent>
          </form>
        </Form>
      </Dialog>
    </div>
  )
}
