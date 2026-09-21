import React, { useState, useMemo, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useAuth } from "@/stores/auth"
import { useT } from "@/i18n"
import { useNavigate, useLocation } from "react-router-dom"
import { format, startOfWeek, addDays, parseISO, getDay } from "date-fns"
import { fr } from "date-fns/locale"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toUpper, cn } from "../../lib/utils"
import type { Staff, StaffShift } from "@/types/supabase"
import { Loader2, Plus, ChevronLeft, ChevronRight } from "lucide-react"

const TABS = [
  { value: "list", label: "Staff List", path: "/staff" },
  { value: "timesheet", label: "Timesheet", path: "/staff/timesheet" },
  { value: "planning", label: "Planning", path: "/staff/planning" },
  { value: "leaves", label: "Leaves", path: "/staff/leaves" },
]

const shiftSchema = z.object({
  staffId: z.string().min(1, "Required"),
  day: z.string().min(1, "Required"),
  startTime: z.string().min(1, "Required"),
  endTime: z.string().min(1, "Required"),
  notes: z.string().optional().or(z.literal("")),
})

type ShiftForm = z.infer<typeof shiftSchema>

const DAYS = [
  { key: "Monday", label: "Lundi", color: "bg-blue-500" },
  { key: "Tuesday", label: "Mardi", color: "bg-emerald-500" },
  { key: "Wednesday", label: "Mercredi", color: "bg-amber-500" },
  { key: "Thursday", label: "Jeudi", color: "bg-purple-500" },
  { key: "Friday", label: "Vendredi", color: "bg-rose-500" },
  { key: "Saturday", label: "Samedi", color: "bg-cyan-500" },
  { key: "Sunday", label: "Dimanche", color: "bg-orange-500" },
]

const DAY_INDEX = [1, 2, 3, 4, 5, 6, 0]

function dayKeyToDate(dayKey: string, weekStart: Date): string {
  const idx = DAYS.findIndex(d => d.key === dayKey)
  if (idx < 0) return ""
  return format(addDays(weekStart, idx), "yyyy-MM-dd")
}

function dateToDayKey(dateStr: string): string | null {
  try {
    const d = parseISO(dateStr)
    const jsDay = getDay(d)
    const idx = DAY_INDEX.indexOf(jsDay)
    return idx >= 0 ? DAYS[idx].key : null
  } catch { return null }
}

export default function PlanningPage() {
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const { organization } = useAuth()
  const orgId = organization?.id
  const [weekOffset, setWeekOffset] = useState(0)
  const [open, setOpen] = useState(false)
  const [draggingStaff, setDraggingStaff] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const currentWeekStart = addDays(weekStart, weekOffset * 7)

  const form = useForm<ShiftForm>({
    resolver: zodResolver(shiftSchema),
    defaultValues: { staffId: "", day: "Monday", startTime: "09:00", endTime: "17:00", notes: "" },
  })

  const { data: staffList } = useQuery({
    queryKey: ["staff", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase.from("staff").select("*").eq("organization_id", orgId).eq("is_active", true).eq("role", "coach").order("first_name")
      return data ?? []
    },
    enabled: !!orgId,
  })

  const weekEnd = addDays(currentWeekStart, 6)

  const { data: shifts, isLoading, isError: shiftsError, error: shiftsQueryError } = useQuery({
    queryKey: ["staff_shifts", format(currentWeekStart, "yyyy-MM-dd"), orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await (supabase.from("staff_shifts") as any)
        .select("*")
        .eq("organization_id", orgId)
        .gte("date", format(currentWeekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
      return (data ?? []) as StaffShift[]
    },
    enabled: !!orgId,
  })

  useEffect(() => {
    if (shiftsError && shiftsQueryError) {
      toast({ title: t("errors.error") || "Error", description: shiftsQueryError.message, variant: "destructive" })
    }
  }, [shiftsError, shiftsQueryError])

  const shiftsByStaffAndDay = useMemo(() => {
    const map = new Map<string, StaffShift[]>()
    shifts?.forEach((s: StaffShift) => {
      const dayName = dateToDayKey(s.date)
      if (!dayName) return
      const key = `${s.staff_id}-${dayName}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    })
    return map
  }, [shifts])

  const upsertMutation = useMutation({
    mutationFn: async (values: ShiftForm) => {
      const dateStr = dayKeyToDate(values.day, currentWeekStart)
      const { error } = await supabase.from("staff_shifts").insert({
        staff_id: values.staffId,
        date: dateStr,
        start_time: values.startTime,
        end_time: values.endTime,
        notes: values.notes || null,
        organization_id: orgId ?? "",
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff_shifts"] })
      toast({ title: "Shift added" })
      setOpen(false)
      form.reset()
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_shifts").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff_shifts"] })
      toast({ title: "Shift removed" })
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  })

  function onSubmit(values: ShiftForm) {
    upsertMutation.mutate(values)
  }

  function handleDragStart(staffId: string) {
    setDraggingStaff(staffId)
  }

  function handleDrop(day: string) {
    if (draggingStaff) {
      form.setValue("staffId", draggingStaff)
      form.setValue("day", day)
      setOpen(true)
      setDraggingStaff(null)
    }
  }

  function handleCellClick(staffId: string, dayKey: string) {
    const existing = shiftsByStaffAndDay.get(`${staffId}-${dayKey}`) || []
    if (existing.length > 0) return
    upsertMutation.mutate({
      staffId,
      day: dayKey,
      startTime: "09:00",
      endTime: "17:00",
      notes: "",
    })
  }

  const currentTab = TABS.find(t => t.path === location.pathname)?.value ?? "planning"

  return (
    <div>
      <PageHeader
        title={t("planning.title") || "Planning"}
        description={t("planning.description") || "Planifier les horaires du personnel"}
        actions={
          <Button onClick={() => { form.reset(); setOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" /> {t("planning.addShift") || "Add Shift"}
          </Button>
        }
      />

      <Tabs value={currentTab} onValueChange={(v) => { const tab = TABS.find(t => t.value === v); if (tab) navigate(tab.path) }}>
        <TabsList className="mb-6">
          {TABS.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(wo => wo - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium">
            {format(currentWeekStart, "dd/MM/yyyy", { locale: fr })} - {format(addDays(currentWeekStart, 6), "dd/MM/yyyy", { locale: fr })}
          </span>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(wo => wo + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>Aujourd'hui</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid grid-cols-[200px_repeat(7,1fr)] gap-px bg-border rounded-lg overflow-hidden min-w-[800px]">
            <div className="bg-muted p-3 font-medium">Coach</div>
            {DAYS.map(day => (
              <div key={day.key} className="bg-muted p-3 font-medium text-center text-sm">{day.label}</div>
            ))}
            {staffList?.map((staff: Staff) => (
              <React.Fragment key={staff.id}>
                <div
                  className="bg-background p-3 text-sm font-medium flex items-center"
                  draggable
                  onDragStart={() => handleDragStart(staff.id)}
                >
                  {toUpper(staff.first_name)} {toUpper(staff.last_name)}
                </div>
                {DAYS.map(day => {
                  const staffShifts = shiftsByStaffAndDay.get(`${staff.id}-${day.key}`) || []
                  return (
                    <div
                      key={`${staff.id}-${day.key}`}
                      className={cn(
                        "bg-background p-2 min-h-[60px] border-l border-t cursor-pointer hover:bg-accent/20 transition-colors",
                        staffShifts.length > 0 && `${day.color}/10 border-l-2`
                      )}
                      onClick={() => handleCellClick(staff.id, day.key)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleDrop(day.key)}
                    >
                      {staffShifts.map(shift => (
                        <div
                          key={shift.id}
                          className={cn("text-white text-xs rounded px-2 py-1 mb-1 flex justify-between items-center group", day.color)}
                        >
                          <span>{shift.start_time}-{shift.end_time}</span>
                          <button
                            className="opacity-0 group-hover:opacity-100 text-white/80 hover:text-white ml-1"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(shift.id); setDeleteConfirmOpen(true) }}
                          >&times;</button>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) form.reset() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("planning.addShift") || "Add Shift"}</DialogTitle>
            <DialogDescription>Ajouter un créneau à un coach</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="staffId" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("planning.staff") || "Staff"}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Sélectionner un coach" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {staffList?.map((s: Staff) => (
                        <SelectItem key={s.id} value={s.id}>{toUpper(s.first_name)} {toUpper(s.last_name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="day" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("planning.day") || "Day"}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Sélectionner le jour" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DAYS.map(d => (
                        <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="startTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("planning.startTime") || "Start Time"}</FormLabel>
                    <FormControl><Input type="time" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("planning.endTime") || "End Time"}</FormLabel>
                    <FormControl><Input type="time" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("planning.notes") || "Notes"}</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setOpen(false); form.reset() }}>{t("common.cancel") || "Annuler"}</Button>
                <Button type="submit" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enregistrer
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.confirm") || "Confirm"}</DialogTitle>
            <DialogDescription>{t("planning.confirmDelete") || "Are you sure you want to delete this shift?"}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteConfirmOpen(false); setDeleteConfirmId(null) }}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); setDeleteConfirmOpen(false); setDeleteConfirmId(null) }}>
              {t("common.delete") || "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
