import { useState, useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useT } from "@/i18n"
import { useAuth } from "@/stores/auth"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table"
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select"
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useOpenMember } from "@/hooks/useOpenMember"
import React from "react"
import {
  Plus, CalendarDays, List, Users, Clock, Loader2, Trash2, UserPlus, UserMinus, Pencil, Download, ChevronLeft, ChevronRight,
} from "lucide-react"
import { format, startOfWeek, addDays, parseISO, getDay } from "date-fns"
import { fr } from "date-fns/locale"
import { cn, toUpper } from "@/lib/utils"
import { usePagination } from "@/hooks/usePagination"
import { useExportCsv } from "@/hooks/useExportCsv"
import { Pagination } from "@/components/ui/pagination"
import type { Class, Staff, Member, StaffShift } from "@/types/supabase"

const HOURS = Array.from({ length: 14 }, (_, i) => `${String(i + 7).padStart(2, "0")}:00`)

const classSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  coach_id: z.string().optional(),
  start_time: z.string().min(1, "Start time is required"),
  end_time: z.string().min(1, "End time is required"),
  max_capacity: z.coerce.number().min(1).optional(),
  color: z.string().optional(),
  recurring: z.boolean().default(true),
  day_of_week: z.coerce.number().min(0).max(6).optional(),
})

type ClassFormValues = z.infer<typeof classSchema>

type ClassWithCoach = Class & { staff: { first_name: string; last_name: string } | null }

type ClassEnrollmentRow = {
  id: string
  class_id: string
  member_id: string
  members: { first_name: string; last_name: string }
  classes: { organization_id: string }
}

const colorOptions = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
]

const PLANNING_DAYS = [
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
  const idx = PLANNING_DAYS.findIndex(d => d.key === dayKey)
  if (idx < 0) return ""
  return format(addDays(weekStart, idx), "yyyy-MM-dd")
}

function dateToDayKey(dateStr: string): string | null {
  try {
    const d = parseISO(dateStr)
    const jsDay = getDay(d)
    const idx = DAY_INDEX.indexOf(jsDay)
    return idx >= 0 ? PLANNING_DAYS[idx].key : null
  } catch { return null }
}

const shiftSchema = z.object({
  staffId: z.string().min(1, "Required"),
  day: z.string().min(1, "Required"),
  startTime: z.string().min(1, "Required"),
  endTime: z.string().min(1, "Required"),
  notes: z.string().optional().or(z.literal("")),
})

type ShiftForm = z.infer<typeof shiftSchema>

export default function ClassesPage() {
  const t = useT()
  const openMember = useOpenMember()
  const DAYS = [
    t("classes.dayMonday"),
    t("classes.dayTuesday"),
    t("classes.dayWednesday"),
    t("classes.dayThursday"),
    t("classes.dayFriday"),
    t("classes.daySaturday"),
    t("classes.daySunday"),
  ]
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { organization } = useAuth()
  const { toast } = useToast()
  const orgId = organization?.id

  const [view, setView] = useState<"calendar" | "planning" | "list">("calendar")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState("")
  const [editingClass, setEditingClass] = useState<Class | null>(null)

  const [weekOffset, setWeekOffset] = useState(0)
  const [planningOpen, setPlanningOpen] = useState(false)
  const [draggingStaff, setDraggingStaff] = useState<string | null>(null)
  const [deleteShiftConfirmOpen, setDeleteShiftConfirmOpen] = useState(false)
  const [deleteShiftConfirmId, setDeleteShiftConfirmId] = useState<string | null>(null)

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const currentWeekStart = addDays(weekStart, weekOffset * 7)
  const weekEnd = addDays(currentWeekStart, 6)

  const form = useForm<ClassFormValues>({
    resolver: zodResolver(classSchema),
    defaultValues: {
      name: "",
      description: "",
      coach_id: "",
      start_time: "09:00",
      end_time: "10:00",
      max_capacity: 20,
      color: "#3b82f6",
      recurring: true,
      day_of_week: new Date().getDay() === 0 ? 6 : new Date().getDay() - 1,
    },
  })

  const planningForm = useForm<ShiftForm>({
    resolver: zodResolver(shiftSchema),
    defaultValues: { staffId: "", day: "Monday", startTime: "09:00", endTime: "17:00", notes: "" },
  })

  const { data: classes, isLoading, isError: classesError, error: classesQueryError } = useQuery({
    queryKey: ["classes", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("classes")
        .select("*, staff!left(first_name, last_name)")
        .eq("organization_id", orgId)
        .order("start_time")
      return data as ClassWithCoach[]
    },
    enabled: !!orgId,
  })

  useEffect(() => {
    if (classesError && classesQueryError) {
      toast({ title: t("classes.errorToast") || "Error", description: classesQueryError.message, variant: "destructive" })
    }
  }, [classesError, classesQueryError])

  const { data: coaches } = useQuery({
    queryKey: ["coaches-list", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("first_name")
      return data as Pick<Staff, "id" | "first_name" | "last_name">[]
    },
    enabled: !!orgId,
  })

  const { data: members } = useQuery({
    queryKey: ["members-active", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("members")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .order("first_name")
      return data as Pick<Member, "id" | "first_name" | "last_name">[]
    },
    enabled: !!orgId,
  })

  const { data: enrollments } = useQuery({
    queryKey: ["class-enrollments", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("class_enrollments")
        .select("*, members!inner(first_name, last_name), classes!inner(organization_id)")
        .eq("classes.organization_id", orgId)
        .eq("status", "confirmed")
      return data as ClassEnrollmentRow[]
    },
    enabled: !!orgId,
  })

  const { data: planningCoaches } = useQuery({
    queryKey: ["planning-coaches", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase.from("staff").select("*").eq("organization_id", orgId).eq("is_active", true).ilike("role", "%coach%").order("first_name")
      return data ?? []
    },
    enabled: !!orgId,
  })

  const { data: shifts, isLoading: shiftsLoading } = useQuery({
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

  const shiftsByDayHour = useMemo(() => {
    const map = new Map<string, StaffShift[]>()
    shifts?.forEach((s: StaffShift) => {
      const dayName = dateToDayKey(s.date)
      if (!dayName) return
      const dayIdx = PLANNING_DAYS.findIndex(d => d.key === dayName)
      if (dayIdx < 0) return
      const startH = Number(s.start_time.split(":")[0])
      const endH = Number(s.end_time.split(":")[0])
      for (let h = startH; h <= endH; h++) {
        const key = `${dayIdx}-${h}`
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(s)
      }
    })
    return map
  }, [shifts])

  const addMutation = useMutation({
    mutationFn: async (values: ClassFormValues) => {
      if (!orgId) throw new Error("No organization")
      const payload = {
        organization_id: orgId,
        name: values.name,
        description: values.description || null,
        coach_id: values.coach_id || null,
        start_time: values.start_time,
        end_time: values.end_time,
        max_capacity: values.max_capacity || null,
        color: values.color || null,
        recurring: values.recurring,
        day_of_week: values.recurring ? values.day_of_week ?? null : null,
      }
      if (editingClass) {
        const { error } = await supabase.from("classes").update(payload).eq("id", editingClass.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("classes").insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      setAddDialogOpen(false)
      setEditingClass(null)
      form.reset()
      toast({ title: editingClass ? t("classes.classUpdated") || "Class updated" : t("classes.classAdded") })
    },
    onError: (err: Error) => {
      toast({ title: t("classes.errorToast"), description: err.message, variant: "destructive" })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: any) => {
      if (!orgId) throw new Error('No organization')
      const { error } = await supabase.from('classes').update({
        name: values.name,
        description: values.description || null,
        coach_id: values.coach_id || null,
        start_time: values.start_time,
        end_time: values.end_time,
        max_capacity: values.max_capacity ? Number(values.max_capacity) : null,
        color: values.color || '#6366f1',
        recurring: values.recurring || false,
        day_of_week: values.recurring ? (values.day_of_week !== undefined ? Number(values.day_of_week) : null) : null,
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast({ title: t('classes.classUpdated') })
    },
    onError: (err: Error) => {
      toast({ title: t('classes.errorToast'), description: err.message, variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("classes").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      setDetailDialogOpen(false)
      toast({ title: t("classes.classDeleted") })
    },
    onError: (err: Error) => {
      toast({ title: t("classes.errorToast"), description: err.message, variant: "destructive" })
    },
  })

  const enrollMutation = useMutation({
    mutationFn: async ({ classId, memberId }: { classId: string; memberId: string }) => {
      const { error } = await supabase.from("class_enrollments").insert({
        class_id: classId,
        member_id: memberId,
        status: "confirmed",
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-enrollments"] })
      setEnrollDialogOpen(false)
      setSelectedMemberId("")
      toast({ title: t("classes.memberEnrolled") })
    },
    onError: (err: Error) => {
      toast({ title: t("classes.errorToast"), description: err.message, variant: "destructive" })
    },
  })

  const removeEnrollmentMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase.from("class_enrollments").delete().eq("id", enrollmentId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-enrollments"] })
      toast({ title: t("classes.memberUnenrolled") })
    },
    onError: (err: Error) => {
      toast({ title: t("classes.errorToast"), description: err.message, variant: "destructive" })
    },
  })

  const shiftMutation = useMutation({
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
      queryClient.invalidateQueries({ queryKey: ["coaches-with-count"] })
      queryClient.invalidateQueries({ queryKey: ["coaches-list"] })
      queryClient.invalidateQueries({ queryKey: ["planning-coaches"] })
      toast({ title: "Créneau ajouté" })
      setPlanningOpen(false)
      planningForm.reset()
    },
    onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  })

  const deleteShiftMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_shifts").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff_shifts"] })
      queryClient.invalidateQueries({ queryKey: ["coaches-with-count"] })
      queryClient.invalidateQueries({ queryKey: ["coaches-list"] })
      queryClient.invalidateQueries({ queryKey: ["planning-coaches"] })
      toast({ title: "Créneau supprimé" })
    },
    onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  })

  const classEnrollments = (classId: string) =>
    enrollments?.filter((e: ClassEnrollmentRow) => e.class_id === classId) ?? []

  const enrolledMemberIds = (classId: string) =>
    classEnrollments(classId).map((e: ClassEnrollmentRow) => e.member_id)

  const classesByDay = (day: number) =>
    classes?.filter((c: ClassWithCoach) => c.day_of_week === day && c.recurring) ?? []

  function handleCellClick(staffId: string, dayKey: string) {
    const existing = shiftsByStaffAndDay.get(`${staffId}-${dayKey}`) || []
    if (existing.length > 0) return
    shiftMutation.mutate({ staffId, day: dayKey, startTime: "09:00", endTime: "17:00", notes: "" })
  }

  function handlePlanningDrop(dayKey: string) {
    if (draggingStaff) {
      planningForm.setValue("staffId", draggingStaff)
      planningForm.setValue("day", dayKey)
      setPlanningOpen(true)
      setDraggingStaff(null)
    }
  }

  const { page, setPage, totalPages, paginatedData: paginatedClasses } = usePagination(classes, 20)

  const { exportCsv } = useExportCsv(
    (classes ?? []).map((c: ClassWithCoach) => ({ name: c.name, coach: c.staff ? `${c.staff.first_name} ${c.staff.last_name}` : '-', start_time: c.start_time, end_time: c.end_time, max_capacity: c.max_capacity ?? '-', recurring: c.recurring ? 'Yes' : 'No' })),
    'classes',
    [
      { key: 'name', label: t('classes.name') },
      { key: 'coach', label: t('classes.coach') },
      { key: 'start_time', label: t('classes.startTime') },
      { key: 'end_time', label: t('classes.endTime') },
      { key: 'max_capacity', label: t('classes.maxCapacity') },
      { key: 'recurring', label: t('classes.recurring') },
    ]
  )

  const handleViewDetails = (cls: Class) => {
    setSelectedClass(cls)
    setDetailDialogOpen(true)
  }

  return (
    <div>
      <PageHeader
        title={t("classes.title")}
        description={t("classes.description")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportCsv()}>
              <Download className="mr-2 h-4 w-4" />
              {t("common.export") || "Export"}
            </Button>
          <Dialog open={addDialogOpen} onOpenChange={(v) => { setAddDialogOpen(v); if (!v) { setEditingClass(null); form.reset() } }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("classes.add")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <Form {...form}>
              <DialogHeader>
                <DialogTitle>{editingClass ? (t("classes.edit") || "Edit Class") : t("classes.add")}</DialogTitle>
                <DialogDescription>{t("classes.dialogDescription")}</DialogDescription>
              </DialogHeader>
              <div className="overflow-y-auto flex-1 min-h-0 space-y-4">
                <form onSubmit={form.handleSubmit((v) => addMutation.mutate(v))} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("classes.name")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("classes.descriptionLabel")}</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="coach_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("classes.coach")}</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder={t("classes.selectCoach")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">{t("classes.noCoach")}</SelectItem>
                            {coaches?.map((c: Pick<Staff, "id" | "first_name" | "last_name">) => (
                              <SelectItem key={c.id} value={c.id}>
                                {toUpper(c.first_name)} {toUpper(c.last_name)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="start_time"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("classes.startTime")}</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="end_time"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("classes.endTime")}</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="max_capacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("classes.maxCapacity")}</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("classes.color")}</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            {colorOptions.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={cn(
                                  "w-8 h-8 rounded-full border-2 transition-all",
                                  field.value === c ? "border-foreground scale-110" : "border-transparent"
                                )}
                                style={{ backgroundColor: c }}
                                onClick={() => field.onChange(c)}
                              />
                            ))}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="recurring"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel>{t("classes.recurring")}</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {form.watch("recurring") && (
                    <FormField
                      control={form.control}
                      name="day_of_week"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("classes.dayOfWeek")}</FormLabel>
                          <Select value={String(field.value ?? 0)} onValueChange={(v) => field.onChange(Number(v))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DAYS.map((day, idx) => (
                                <SelectItem key={idx} value={String(idx)}>{day}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </form>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">{t("common.cancel")}</Button>
                </DialogClose>
                <Button type="submit" disabled={addMutation.isPending}>
                  {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </Button>
              </DialogFooter>
              </Form>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      <Tabs value={view} onValueChange={(v) => setView(v as "calendar" | "planning" | "list")} className="mb-6">
        <TabsList>
          <TabsTrigger value="calendar">
            <CalendarDays className="mr-2 h-4 w-4" />
            {t("classes.planningTab")}
          </TabsTrigger>
          <TabsTrigger value="planning">
            <Users className="mr-2 h-4 w-4" />
            Planning
          </TabsTrigger>
          <TabsTrigger value="list">
            <List className="mr-2 h-4 w-4" />
            {t("classes.listTab")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "calendar" ? (
        <Card>
          <CardContent className="p-0 overflow-auto">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-8 border-b">
                <div className="p-2 text-sm font-medium text-muted-foreground border-r" />
                {DAYS.map((day, idx) => (
                  <div key={idx} className="p-2 text-sm font-medium text-center border-r last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>
              <div className="relative">
                {HOURS.map((hour) => (
                  <div key={hour} className="grid grid-cols-8 border-b last:border-b-0">
                    <div className="p-2 text-xs text-muted-foreground border-r flex items-start justify-center min-h-[60px]">
                      {hour}
                    </div>
                    {Array.from({ length: 7 }).map((_, dayIdx) => {
                      const hourInt = Number(hour.split(":")[0])
                      const cellClasses = classes?.filter(
                        (c: ClassWithCoach) =>
                          c.day_of_week === dayIdx &&
                          c.recurring &&
                          Number(c.start_time.split(":")[0]) === hourInt
                      )
                      return (
                        <div key={dayIdx} className="p-1 border-r last:border-r-0 min-h-[60px] relative">
                          {cellClasses?.map((cls: ClassWithCoach) => (
                            <button
                              key={cls.id}
                              className="w-full text-left p-1.5 rounded text-xs font-medium text-white mb-1 hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: cls.color || "#3b82f6" }}
                              onClick={() => handleViewDetails(cls)}
                            >
                              <div className="truncate">{toUpper(cls.name)}</div>
                              <div className="opacity-80">
                                {toUpper(cls.start_time)}-{toUpper(cls.end_time)}
                              </div>
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : view === "planning" ? (
        <div>
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
            <Button onClick={() => { planningForm.reset(); setPlanningOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" /> Ajouter un créneau
            </Button>
          </div>

          {shiftsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-[200px_repeat(7,1fr)] gap-px bg-border rounded-lg overflow-hidden min-w-[800px]">
                <div className="bg-muted p-3 font-medium">Coach</div>
                {PLANNING_DAYS.map(day => (
                  <div key={day.key} className="bg-muted p-3 font-medium text-center text-sm">{day.label}</div>
                ))}
                {planningCoaches?.map((staff: Staff) => (
                  <React.Fragment key={staff.id}>
                    <div
                      className="bg-background p-3 text-sm font-medium flex items-center"
                      draggable
                      onDragStart={() => setDraggingStaff(staff.id)}
                    >
                      {toUpper(staff.first_name)} {toUpper(staff.last_name)}
                    </div>
                    {PLANNING_DAYS.map(day => {
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
                          onDrop={() => handlePlanningDrop(day.key)}
                        >
                          {staffShifts.map(shift => (
                            <div
                              key={shift.id}
                              className={cn("text-white text-xs rounded px-2 py-1 mb-1 flex justify-between items-center group", day.color)}
                            >
                              <span>{shift.start_time}-{shift.end_time}</span>
                              <button
                                className="opacity-0 group-hover:opacity-100 text-white/80 hover:text-white ml-1"
                                onClick={(e) => { e.stopPropagation(); setDeleteShiftConfirmId(shift.id); setDeleteShiftConfirmOpen(true) }}
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
        </div>
      ) : (
        <>
        <Card>
          <CardContent className="p-0">
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("classes.name")}</TableHead>
                  <TableHead>{t("classes.coach")}</TableHead>
                  <TableHead>{t("classes.startTime")}</TableHead>
                  <TableHead>{t("classes.endTime")}</TableHead>
                  <TableHead>{t("classes.maxCapacity")}</TableHead>
                  <TableHead>{t("classes.enrolled")}</TableHead>
                  <TableHead>{t("classes.recurring")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : paginatedClasses?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {t("classes.noClasses")}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedClasses?.map((cls) => (
                    <TableRow key={cls.id} className="cursor-pointer" onClick={() => handleViewDetails(cls)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cls.color || "#3b82f6" }} />
                          {toUpper(cls.name)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {cls.staff ? toUpper(`${cls.staff.first_name} ${cls.staff.last_name}`) : "-"}
                      </TableCell>
                      <TableCell>{toUpper(cls.start_time)}</TableCell>
                      <TableCell>{toUpper(cls.end_time)}</TableCell>
                      <TableCell>{cls.max_capacity || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {classEnrollments(cls.id).length}{cls.max_capacity ? `/${cls.max_capacity}` : ""}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {cls.recurring ? (
                          <Badge>{DAYS[cls.day_of_week ?? 0]}</Badge>
                        ) : (
                          <Badge variant="outline">{t("common.no")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleViewDetails(cls) }}>
                          <Users className="h-4 w-4 mr-1" />
                          {t("classes.details")}
                        </Button>
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
              ) : paginatedClasses?.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">{t("common.noResults")}</p>
              ) : (
                paginatedClasses?.map(cls => (
                  <Card key={cls.id} className="p-4 cursor-pointer" onClick={() => handleViewDetails(cls)}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cls.color || "#3b82f6" }} />
                      <span className="font-medium">{toUpper(cls.name)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>{t("classes.coach")}: {cls.staff ? toUpper(`${cls.staff.first_name} ${cls.staff.last_name}`) : "-"}</p>
                      <p>{toUpper(cls.start_time)} - {toUpper(cls.end_time)}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary">
                        {classEnrollments(cls.id).length}{cls.max_capacity ? `/${cls.max_capacity}` : ""}
                      </Badge>
                      {cls.recurring && <Badge>{DAYS[cls.day_of_week ?? 0]}</Badge>}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </CardContent>
        </Card>
        <Pagination page={page} totalPages={totalPages} totalItems={classes?.length ?? 0} pageSize={20} onPageChange={setPage} />
        </>
      )}

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{toUpper(selectedClass?.name)}</DialogTitle>
            <DialogDescription>{t("classes.detailDialogDescription")}</DialogDescription>
          </DialogHeader>
          {selectedClass && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t("classes.descriptionLabel")}</p>
                  <p>{toUpper(selectedClass.description) || t("classes.noDescription")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("classes.coach")}</p>
                  <p>
                    {classes?.find((c: ClassWithCoach) => c.id === selectedClass.id)?.staff
                      ? toUpper(`${classes.find((c: ClassWithCoach) => c.id === selectedClass.id)!.staff!.first_name} ${classes.find((c: ClassWithCoach) => c.id === selectedClass.id)!.staff!.last_name}`)
                      : t("classes.noCoachAssigned")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("classes.scheduleLabel")}</p>
                  <p>{toUpper(selectedClass.start_time)} - {toUpper(selectedClass.end_time)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("classes.recurring")}</p>
                  <p>{selectedClass.recurring ? DAYS[selectedClass.day_of_week ?? 0] : t("classes.nonRecurring")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("classes.maxCapacity")}</p>
                  <p>{selectedClass.max_capacity || t("classes.unlimited")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("classes.enrolled")}</p>
                  <p>{classEnrollments(selectedClass.id).length}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">{t("classes.enrolledMembers")}</h4>
                  <Button size="sm" variant="outline" onClick={() => setEnrollDialogOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-1" />
                    {t("classes.enroll")}
                  </Button>
                </div>
                <ScrollArea className="h-48">
                  {classEnrollments(selectedClass.id).length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("classes.noEnrolledMembers")}</p>
                  ) : (
                    <div className="space-y-1">
                      {classEnrollments(selectedClass.id).map((enr: ClassEnrollmentRow) => (
                        <div key={enr.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <span className="text-sm">
                            <button
                              type="button"
                              onClick={() => openMember(enr.member_id)}
                              title="Ouvrir la fiche adhérent"
                              className="text-left cursor-pointer hover:text-primary hover:underline transition-colors"
                            >
                              {toUpper(enr.members?.first_name)} {toUpper(enr.members?.last_name)}
                            </button>
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeEnrollmentMutation.mutate(enr.id)}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => {
                  if (selectedClass) {
                    setEditingClass(selectedClass)
                    form.reset({
                      name: selectedClass.name,
                      description: selectedClass.description ?? "",
                      coach_id: selectedClass.coach_id ?? "",
                      start_time: selectedClass.start_time,
                      end_time: selectedClass.end_time,
                      max_capacity: selectedClass.max_capacity ?? 20,
                      color: selectedClass.color ?? "#3b82f6",
                      recurring: selectedClass.recurring,
                      day_of_week: selectedClass.day_of_week ?? 0,
                    })
                    setDetailDialogOpen(false)
                    setAddDialogOpen(true)
                  }
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t("common.edit") || "Edit"}
                </Button>
                <Button variant="destructive" onClick={() => deleteMutation.mutate(selectedClass.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("common.delete")}
                </Button>
                <DialogClose asChild>
                  <Button variant="outline">{t("common.close")}</Button>
                </DialogClose>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("classes.enrollTitle")}</DialogTitle>
            <DialogDescription>{t("classes.enrollDescription")} {toUpper(selectedClass?.name)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger>
                <SelectValue placeholder={t("classes.selectMember")} />
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-48">
                  {members
                    ?.filter((m: Pick<Member, "id" | "first_name" | "last_name">) => !enrolledMemberIds(selectedClass?.id ?? "").includes(m.id))
                    .map((m: Pick<Member, "id" | "first_name" | "last_name">) => (
                      <SelectItem key={m.id} value={m.id}>
                        {toUpper(m.first_name)} {toUpper(m.last_name)}
                      </SelectItem>
                    ))}
                </ScrollArea>
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={!selectedMemberId || enrollMutation.isPending}
                onClick={() => {
                  if (selectedClass && selectedMemberId) {
                    enrollMutation.mutate({ classId: selectedClass.id, memberId: selectedMemberId })
                  }
                }}
              >
                {enrollMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("classes.enroll")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={planningOpen} onOpenChange={(v) => { setPlanningOpen(v); if (!v) planningForm.reset() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un créneau</DialogTitle>
            <DialogDescription>Assigner un créneau à un coach</DialogDescription>
          </DialogHeader>
          <Form {...planningForm}>
            <form onSubmit={planningForm.handleSubmit((v) => shiftMutation.mutate(v))} className="space-y-4">
              <FormField control={planningForm.control} name="staffId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Coach</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Sélectionner un coach" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {planningCoaches?.map((s: Staff) => (
                        <SelectItem key={s.id} value={s.id}>{toUpper(s.first_name)} {toUpper(s.last_name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={planningForm.control} name="day" render={({ field }) => (
                <FormItem>
                  <FormLabel>Jour</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Sélectionner le jour" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PLANNING_DAYS.map(d => (
                        <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={planningForm.control} name="startTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Heure début</FormLabel>
                    <FormControl><Input type="time" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={planningForm.control} name="endTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Heure fin</FormLabel>
                    <FormControl><Input type="time" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={planningForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setPlanningOpen(false); planningForm.reset() }}>Annuler</Button>
                <Button type="submit" disabled={shiftMutation.isPending}>
                  {shiftMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enregistrer
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteShiftConfirmOpen} onOpenChange={setDeleteShiftConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer</DialogTitle>
            <DialogDescription>Voulez-vous vraiment supprimer ce créneau ?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteShiftConfirmOpen(false); setDeleteShiftConfirmId(null) }}>Annuler</Button>
            <Button variant="destructive" onClick={() => { if (deleteShiftConfirmId) deleteShiftMutation.mutate(deleteShiftConfirmId); setDeleteShiftConfirmOpen(false); setDeleteShiftConfirmId(null) }}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
