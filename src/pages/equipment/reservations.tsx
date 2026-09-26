import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useAuth } from "@/stores/auth"
import { useT } from "@/i18n"
import { useNavigate, useLocation } from "react-router-dom"
import { useOpenMember } from "@/hooks/useOpenMember"
import { formatDateTime, toUpper } from "@/lib/utils"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { Loader2, Plus, Check, X, Download } from "lucide-react"
import type { EquipmentReservation, Equipment } from "@/types/supabase"
import { usePagination } from "@/hooks/usePagination"
import { useExportCsv } from "@/hooks/useExportCsv"
import { Pagination } from "@/components/ui/pagination"

const TABS = [
  { value: "list", label: "Equipment", path: "/equipment" },
  { value: "reservations", label: "Reservations", path: "/equipment/reservations" },
  { value: "report", label: "Report", path: "/equipment/report" },
]

const reservationSchema = z.object({
  equipmentId: z.string().min(1, "Required"),
  memberId: z.string().min(1, "Required"),
  startTime: z.string().min(1, "Required"),
  endTime: z.string().min(1, "Required"),
})

type ReservationForm = z.infer<typeof reservationSchema>

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  confirmed: "default",
  cancelled: "secondary",
  completed: "outline",
}

export default function ReservationsPage() {
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const t = useT()
  const openMember = useOpenMember()
  const navigate = useNavigate()
  const location = useLocation()
  const { organization } = useAuth()
  const orgId = organization?.id
  const [open, setOpen] = useState(false)

  const form = useForm<ReservationForm>({
    resolver: zodResolver(reservationSchema),
    defaultValues: { equipmentId: "", memberId: "", startTime: "", endTime: "" },
  })

  const { data: equipmentList } = useQuery({
    queryKey: ["equipment", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase.from("equipment").select("*").eq("organization_id", orgId).gt("available_quantity", 0).order("name")
      return data ?? []
    },
    enabled: !!orgId,
  })

  const { data: members } = useQuery({
    queryKey: ["members_minimal", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase.from("members").select("id, first_name, last_name").eq("organization_id", orgId).eq("status", "active").order("first_name")
      return data ?? []
    },
    enabled: !!orgId,
  })

  const { data: reservations, isLoading, isError: reservationsError, error: reservationsQueryError } = useQuery({
    queryKey: ["equipment_reservations", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase.from("equipment_reservations").select("*").eq("organization_id", orgId).order("created_at", { ascending: false })
      return data ?? []
    },
    enabled: !!orgId,
  })

  useEffect(() => {
    if (reservationsError && reservationsQueryError) {
      toast({ title: t("errors.error") || "Error", description: reservationsQueryError.message, variant: "destructive" })
    }
  }, [reservationsError, reservationsQueryError])

  const equipmentMap = new Map<string, Equipment>()
  equipmentList?.forEach((e: Equipment) => equipmentMap.set(e.id, e))

  const memberMap = new Map<string, { first_name: string; last_name: string }>()
  members?.forEach((m: { id: string; first_name: string; last_name: string }) => memberMap.set(m.id, m))

  const createMutation = useMutation({
    mutationFn: async (values: ReservationForm) => {
      const { error } = await supabase.from("equipment_reservations").insert({
        equipment_id: values.equipmentId,
        member_id: values.memberId,
        organization_id: orgId ?? "",
        start_time: values.startTime,
        end_time: values.endTime,
        status: "confirmed",
      })
      if (error) throw error

      // Decrement available_quantity on equipment
      const { data: equip } = await supabase
        .from('equipment')
        .select('available_quantity')
        .eq('id', values.equipmentId)
        .single()
      if (equip) {
        const { error: eqError } = await supabase
          .from('equipment')
          .update({ available_quantity: Math.max(0, (equip.available_quantity ?? 0) - 1) })
          .eq('id', values.equipmentId)
        if (eqError) console.error('Failed to decrement available_quantity:', eqError)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment_reservations"] })
      queryClient.invalidateQueries({ queryKey: ["equipment"] })
      queryClient.invalidateQueries({ queryKey: ["equipment_reservations_report"] })
      toast({ title: t("reservations.created") || "Reservation created" })
      setOpen(false)
      form.reset()
    },
    onError: (err: Error) => toast({ title: t("errors.error"), description: err.message, variant: "destructive" }),
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, equipmentId }: { id: string; status: "confirmed" | "cancelled" | "completed"; equipmentId: string }) => {
      const { error } = await supabase.from("equipment_reservations").update({ status }).eq("id", id)
      if (error) throw error

      // If cancelling or completing, restore available_quantity
      if (status === 'cancelled' || status === 'completed') {
        const { data: equip } = await supabase
          .from('equipment')
          .select('available_quantity')
          .eq('id', equipmentId)
          .single()
        if (equip) {
          await supabase
            .from('equipment')
            .update({ available_quantity: (equip.available_quantity ?? 0) + 1 })
            .eq('id', equipmentId)
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment_reservations"] })
      queryClient.invalidateQueries({ queryKey: ["equipment"] })
      queryClient.invalidateQueries({ queryKey: ["equipment_reservations_report"] })
      toast({ title: t("reservations.updated") || "Reservation updated" })
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  })

  function onSubmit(values: ReservationForm) {
    createMutation.mutate(values)
  }

  const { page, setPage, totalPages, paginatedData: paginatedReservations } = usePagination(reservations, 20)

  const { exportCsv } = useExportCsv(
    (reservations ?? []).map((res: EquipmentReservation) => {
      const equipment = equipmentMap.get(res.equipment_id)
      const member = memberMap.get(res.member_id)
      return {
        equipment: equipment?.name ?? '-',
        member: member ? `${member.first_name} ${member.last_name}` : '-',
        start_time: res.start_time,
        end_time: res.end_time,
        status: res.status,
      }
    }),
    'reservations',
    [
      { key: 'equipment', label: t('reservations.equipment') || 'Equipment' },
      { key: 'member', label: t('reservations.member') || 'Member' },
      { key: 'start_time', label: t('reservations.startTime') || 'Start Time' },
      { key: 'end_time', label: t('reservations.endTime') || 'End Time' },
      { key: 'status', label: t('reservations.status') || 'Status' },
    ]
  )

  const currentTab = TABS.find(t => t.path === location.pathname)?.value ?? "reservations"

  return (
    <div>
      <PageHeader
        title={t("reservations.title") || "Réservations"}
        description={t("reservations.description") || "Gérer les réservations d'équipements"}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportCsv()}>
              <Download className="mr-2 h-4 w-4" />
              {t("common.export") || "Export"}
            </Button>
            <Button onClick={() => { form.reset(); setOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" /> {t("reservations.new") || "New Reservation"}
            </Button>
          </div>
        }
      />

      <Tabs value={currentTab} onValueChange={(v) => { const tab = TABS.find(t => t.value === v); if (tab) navigate(tab.path) }}>
        <TabsList className="mb-6">
          {TABS.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("reservations.equipment") || "Equipment"}</TableHead>
                <TableHead>{t("reservations.member") || "Member"}</TableHead>
                <TableHead>{t("reservations.startTime") || "Start Time"}</TableHead>
                <TableHead>{t("reservations.endTime") || "End Time"}</TableHead>
                <TableHead>{t("reservations.status") || "Status"}</TableHead>
                <TableHead>{t("reservations.actions") || "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : paginatedReservations?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("reservations.noData") || "No reservations found"}</TableCell></TableRow>
              ) : (
                paginatedReservations?.map(res => {
                  const equipment = equipmentMap.get(res.equipment_id)
                  const member = memberMap.get(res.member_id)
                  return (
                    <TableRow key={res.id}>
                      <TableCell className="font-medium">{toUpper(equipment?.name) || "-"}</TableCell>
                      <TableCell>
                        {member ? (
                          <button
                            type="button"
                            onClick={() => openMember(res.member_id)}
                            title="Ouvrir la fiche adhérent"
                            className="text-left cursor-pointer hover:text-primary hover:underline transition-colors"
                          >
                            {toUpper(member.first_name)} {toUpper(member.last_name)}
                          </button>
                        ) : "-"}
                      </TableCell>
                      <TableCell>{formatDateTime(res.start_time)}</TableCell>
                      <TableCell>{formatDateTime(res.end_time)}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[res.status]} className="capitalize">{toUpper(res.status)}</Badge>
                      </TableCell>
                      <TableCell>
                        {res.status === "confirmed" ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="default" onClick={() => statusMutation.mutate({ id: res.id, status: "completed", equipmentId: res.equipment_id })} disabled={statusMutation.isPending}>
                              <Check className="h-3 w-3 mr-1" /> Complete
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => statusMutation.mutate({ id: res.id, status: "cancelled", equipmentId: res.equipment_id })} disabled={statusMutation.isPending}>
                              <X className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground capitalize">{toUpper(res.status)}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          </div>
          <div className="md:hidden space-y-3 p-4">
            {isLoading ? (
              <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
            ) : paginatedReservations?.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">{t("common.noResults")}</p>
            ) : (
              paginatedReservations?.map(res => {
                const equipment = equipmentMap.get(res.equipment_id)
                const member = memberMap.get(res.member_id)
                return (
                  <Card key={res.id} className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">{toUpper(equipment?.name) || "-"}</span>
                      <Badge variant={STATUS_VARIANTS[res.status]} className="ml-auto capitalize">{toUpper(res.status)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {member ? (
                        <button
                          type="button"
                          onClick={() => openMember(res.member_id)}
                          title="Ouvrir la fiche adhérent"
                          className="text-left cursor-pointer hover:text-primary hover:underline transition-colors"
                        >
                          {toUpper(member.first_name)} {toUpper(member.last_name)}
                        </button>
                      ) : "-"}
                    </p>
                    <p className="text-sm text-muted-foreground">{formatDateTime(res.start_time)} → {formatDateTime(res.end_time)}</p>
                    {res.status === "confirmed" && (
                      <div className="flex gap-1 mt-2 justify-end">
                        <Button size="sm" variant="default" onClick={() => statusMutation.mutate({ id: res.id, status: "completed", equipmentId: res.equipment_id })} disabled={statusMutation.isPending}>
                          <Check className="h-3 w-3 mr-1" /> Complete
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => statusMutation.mutate({ id: res.id, status: "cancelled", equipmentId: res.equipment_id })} disabled={statusMutation.isPending}>
                          <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      </div>
                    )}
                  </Card>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
      <Pagination page={page} totalPages={totalPages} totalItems={reservations?.length ?? 0} pageSize={20} onPageChange={setPage} />

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) form.reset() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reservations.newReservation") || "New Reservation"}</DialogTitle>
            <DialogDescription>Reserve equipment for a member</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="equipmentId" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("reservations.equipment") || "Equipment"}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select equipment" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {equipmentList?.map((e: Equipment) => (
                        <SelectItem key={e.id} value={e.id}>{toUpper(e.name)} ({e.available_quantity} available)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="memberId" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("reservations.member") || "Member"}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {members?.map((m: { id: string; first_name: string; last_name: string }) => (
                        <SelectItem key={m.id} value={m.id}>{toUpper(m.first_name)} {toUpper(m.last_name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="startTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("reservations.startTime") || "Start Time"}</FormLabel>
                    <FormControl><Input type="datetime-local" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("reservations.endTime") || "End Time"}</FormLabel>
                    <FormControl><Input type="datetime-local" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setOpen(false); form.reset() }}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Reservation
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
