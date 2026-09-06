import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { useT } from "@/i18n"
import { useAuth } from "@/stores/auth"
import { useSupabase } from "@/hooks/useSupabase"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useRealtime } from "@/hooks/useRealtime"
import { usePagination } from "@/hooks/usePagination"
import { useExportCsv } from "@/hooks/useExportCsv"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import {
  Clock, UserCheck, CalendarDays,
  Download, Upload, CheckCircle2, XCircle, Loader2,
  CreditCard, QrCode, Camera, History, Settings, X,
  Phone, LogOut, Activity, Keyboard, Zap, Search,
  Timer, Users, ChevronLeft, ChevronRight,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { PageHeader } from "@/components/layout"
import { getInitials, toUpper, formatCurrency, formatPhone, displayPhone } from "@/lib/utils"
import { buildDayStats } from "./lib/dayActivity"
import { MemberDayDetail } from "./components/member-day-detail"

const PAGE_TERMINAL = "pointage"

type AttendanceRow = {
  id: string
  member_id: string
  check_in: string | null
  check_out: string | null
  member: { first_name: string; last_name: string; photo_url: string | null; phone: string | null } | null
}

type PhoneMember = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  photo_url: string | null
  member_subscriptions?: { status: string }[] | null
}

type ScanLogMember = {
  name: string
  photo_url: string | null
  subscription_name: string | null
  start_date: string | null
  end_date: string | null
  days_remaining: number | null
  max_classes: number | null
  sessions_done: number | null
}

type ScanLog = {
  id: number
  time: string
  timestamp: number
  action: string
  type: "granted" | "denied"
  member: ScanLogMember | null
  member_id?: string
  attendance_id?: string
  reason?: string
}

type MonthAttendanceRow = {
  id: string
  member_id: string
  check_in: string
  check_out: string | null
  member: { first_name: string; last_name: string } | null
}

type RfidScanResult = {
  result: string
  reason?: string
  member_id?: string
  member_name?: string
  action?: string
  attendance_id?: string
  _isStaff?: boolean
  _staffName?: string
  _totalHours?: number
}

function formatTime(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

function computeStay(a: { check_in: string | null; check_out: string | null }) {
  if (!a.check_in || !a.check_out) return null
  const diff = new Date(a.check_out).getTime() - new Date(a.check_in).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}min`
}

function daysBetween(dateStr: string) {
  const d = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(d / 86400000)
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split("T")[0]
}

export default function PointagePage() {
  const t = useT()
  const supabase = useSupabase()
  const { organization, user, roles } = useAuth()
  const { toast } = useToast()
  const orgId = organization?.id
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const openMember = useCallback((memberId: string) => {
    if (!memberId) return
    navigate(`/members?id=${memberId}`)
  }, [navigate])

  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]

  const [selectedDate, setSelectedDate] = useState(todayStr)
  const nextDayStr = useMemo(() => addDays(selectedDate, 1), [selectedDate])
  const yesterdayStr = useMemo(() => addDays(todayStr, -1), [todayStr])
  const selectedDateLabel = useMemo(() => {
    return new Date(selectedDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
  }, [selectedDate])

  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useRealtime({ table: "attendance", queryKey: ["pointage-day", orgId ?? "", selectedDate], filter: orgId && selectedDate === todayStr ? `organization_id=eq.${orgId}` : undefined })

  useEffect(() => {
    if (!orgId) return
    ;(supabase.rpc as any)("auto_close_stale_attendances").catch((e: unknown) =>
      console.warn('auto_close_stale_attendances failed:', e)
    )
  }, [orgId, supabase])

  const [searchQuery, setSearchQuery] = useState("")
  const [rfidInput, setRfidInput] = useState("")
  const [rfidCheckoutInput, setRfidCheckoutInput] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [isCheckoutScanning, setIsCheckoutScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ result: "granted" | "denied"; reason?: string; action?: string; memberName?: string; member_id?: string } | null>(null)
  const [dayDetail, setDayDetail] = useState<{ memberId: string; memberName: string } | null>(null)
  const [phone, setPhone] = useState("")
  const [checkedInMemberId, setCheckedInMemberId] = useState<string | null>(null)
  const [qrCameraActive, setQrCameraActive] = useState(false)
  const qrVideoRef = useRef<HTMLVideoElement>(null)
  const qrStreamRef = useRef<MediaStream | null>(null)
  const [phoneQuery, setPhoneQuery] = useState("")
  const rfidInputRef = useRef<HTMLInputElement>(null)
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([])
  const [checkedOutLogIds, setCheckedOutLogIds] = useState<Set<string>>(new Set())
  const scanLogIdRef = useRef(0)
  const scanResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: todayAttendance } = useQuery({
    queryKey: ["pointage-day", orgId, selectedDate],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("attendance")
        .select("id, member_id, check_in, check_out, member:members!inner(first_name, last_name, photo_url, phone)")
        .eq("organization_id", orgId)
        .gte("check_in", selectedDate)
        .lt("check_in", nextDayStr)
        .order("check_in", { ascending: false })
        .returns<AttendanceRow[]>()
      return data ?? []
    },
    enabled: !!orgId,
  })

  const { data: phoneMembers, isFetching: isSearchingPhone } = useQuery({
    queryKey: ["pointage-phone", orgId, phoneQuery],
    queryFn: async () => {
      if (!orgId || !phoneQuery.trim()) return []
      const { data } = await supabase
        .from("members")
        .select("id, first_name, last_name, phone, photo_url, member_subscriptions(status)")
        .eq("organization_id", orgId)
        .ilike("phone", `%${phoneQuery.trim()}%`)
        .limit(8)
        .returns<PhoneMember[]>()
      return data ?? []
    },
    enabled: !!orgId && phoneQuery.trim().length >= 2,
  })

  const checkedInToday = todayAttendance ?? []
  const entryCount = checkedInToday.filter((a: AttendanceRow) => a.check_in).length
  const checkedOutCount = checkedInToday.filter((a: AttendanceRow) => a.check_out).length
  const insideCount = checkedInToday.filter((a: AttendanceRow) => a.check_in && !a.check_out).length

  const dayStats = useMemo(() => buildDayStats(checkedInToday as any, selectedDate), [checkedInToday, selectedDate])

  const { data: dayRevenue } = useQuery({
    queryKey: ["pointage-day-revenue", orgId, selectedDate],
    queryFn: async () => {
      if (!orgId) return { pos: 0, posCount: 0, payments: 0 }
      const [posRes, payRes] = await Promise.all([
        supabase
          .from("pos_transactions")
          .select("total")
          .eq("organization_id", orgId)
          .is("cancelled_at", null)
          .gte("created_at", selectedDate)
          .lt("created_at", nextDayStr)
          .returns<{ total: number }[]>(),
        supabase
          .from("payments")
          .select("amount")
          .eq("organization_id", orgId)
          .eq("status", "completed")
          .gte("payment_date", selectedDate)
          .lt("payment_date", nextDayStr)
          .returns<{ amount: number }[]>(),
      ])
      return {
        pos: (posRes.data ?? []).reduce((s: number, r: { total: number }) => s + Number(r.total ?? 0), 0),
        posCount: (posRes.data ?? []).length,
        payments: (payRes.data ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount ?? 0), 0),
      }
    },
    enabled: !!orgId,
  })

  const peakAffluence = useMemo(() => {
    if (checkedInToday.length === 0) return null
    const hourly: Record<number, number> = {}
    checkedInToday.forEach((a: AttendanceRow) => {
      if (a.check_in) {
        const h = new Date(a.check_in).getHours()
        hourly[h] = (hourly[h] || 0) + 1
      }
    })
    const peak = Object.entries(hourly).sort((a, b) => b[1] - a[1])[0]
    return peak ? { hour: `${peak[0]}h`, count: peak[1] } : null
  }, [checkedInToday])

  const avgStay = useMemo(() => {
    const stays = checkedInToday.map((a: AttendanceRow) => computeStay(a)).filter(Boolean) as string[]
    if (stays.length === 0) return null
    const totalMins = stays.reduce((sum, s) => {
      const parts = s.split(/[h ]/)
      let mins = 0
      if (parts.length >= 3) mins = parseInt(parts[0]) * 60 + parseInt(parts[1])
      else if (s.includes("min")) mins = parseInt(s)
      return sum + mins
    }, 0)
    const avg = Math.round(totalMins / stays.length)
    if (avg < 60) return `${avg} min`
    return `${Math.floor(avg / 60)}h ${avg % 60}min`
  }, [checkedInToday])

  const occupancyRate = useMemo(() => {
    if (!checkedInToday.length) return null
    return `${Math.round((checkedInToday.length / 100) * 100)}%`
  }, [checkedInToday])

  const filteredToday = checkedInToday.filter((a: AttendanceRow) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    const name = `${a.member?.first_name ?? ""} ${a.member?.last_name ?? ""}`.toLowerCase()
    if (name.includes(q)) return true
    const phoneDigits = formatPhone(a.member?.phone ?? "")
    const qDigits = q.replace(/\D/g, "")
    return qDigits.length >= 2 && phoneDigits.includes(qDigits)
  })

  const { page, setPage, totalPages, paginatedData: paginatedAttendance } = usePagination(filteredToday, 20)

  const { exportCsv } = useExportCsv(
    filteredToday.map((a: AttendanceRow) => ({
      name: `${a.member?.first_name ?? ""} ${a.member?.last_name ?? ""}`,
      check_in: a.check_in ?? '',
      check_out: a.check_out ?? '',
      stay: computeStay(a) ?? '',
    })),
    'attendance-today',
    [
      { key: 'name', label: t('common.name') || 'Name' },
      { key: 'check_in', label: t('pointage.checkIn') || 'Check-in' },
      { key: 'check_out', label: t('pointage.checkOut') || 'Check-out' },
      { key: 'stay', label: t('pointage.stay') || 'Stay' },
    ]
  )

  const { data: monthAttendance } = useQuery({
    queryKey: ["pointage-analytics", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const d30 = new Date()
      d30.setDate(d30.getDate() - 30)
      const { data } = await supabase
        .from("attendance")
        .select("id, member_id, check_in, check_out, member:members(first_name, last_name)")
        .eq("organization_id", orgId)
        .gte("check_in", d30.toISOString())
        .order("check_in", { ascending: false })
        .returns<{ id: string; member_id: string; check_in: string; check_out: string | null; member: { first_name: string; last_name: string } | null }[]>()
      return data ?? []
    },
    enabled: !!orgId,
  })

  const analytics = useMemo(() => {
    const rows = monthAttendance ?? []
    if (rows.length === 0) return null

    const stays = rows
      .filter((r: MonthAttendanceRow) => r.check_in && r.check_out)
      .map((r: MonthAttendanceRow) => (new Date(r.check_out!).getTime() - new Date(r.check_in).getTime()) / 60000)
    const avgMins = stays.length > 0 ? Math.round(stays.reduce((a: number, b: number) => a + b, 0) / stays.length) : 0

    const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]
    const dayCounts: Record<number, number> = {}
    rows.forEach((r: MonthAttendanceRow) => {
      if (r.check_in) {
        const d = new Date(r.check_in).getDay()
        dayCounts[d] = (dayCounts[d] || 0) + 1
      }
    })
    const sortedDays = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])
    const favDay = sortedDays.length > 0 ? { name: dayNames[Number(sortedDays[0][0])], count: sortedDays[0][1] } : null

    const slots = { "Matin (6h-12h)": 0, "Après-midi (12h-18h)": 0, "Soir (18h-24h)": 0 }
    rows.forEach((r: MonthAttendanceRow) => {
      if (r.check_in) {
        const h = new Date(r.check_in).getHours()
        if (h >= 6 && h < 12) slots["Matin (6h-12h)"]++
        else if (h >= 12 && h < 18) slots["Après-midi (12h-18h)"]++
        else if (h >= 18) slots["Soir (18h-24h)"]++
      }
    })

    const memberVisits: Record<string, { id: string; name: string; count: number; totalMins: number }> = {}
    rows.forEach((r: MonthAttendanceRow) => {
      if (!r.member) return
      const key = r.member_id
      if (!memberVisits[key]) memberVisits[key] = { id: key, name: `${r.member.first_name} ${r.member.last_name}`, count: 0, totalMins: 0 }
      memberVisits[key].count++
      if (r.check_in && r.check_out) {
        memberVisits[key].totalMins += (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000
      }
    })
    const topMembers = Object.values(memberVisits)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(m => ({
        id: m.id,
        name: m.name,
        visits: m.count,
        avgMins: m.count > 0 ? Math.round(m.totalMins / m.count) : 0,
      }))

    const hourCounts: Record<number, number> = {}
    rows.forEach((r: MonthAttendanceRow) => {
      if (r.check_in) {
        const h = new Date(r.check_in).getHours()
        hourCounts[h] = (hourCounts[h] || 0) + 1
      }
    })

    const totalUnique = new Set(rows.map((r: MonthAttendanceRow) => r.member_id)).size
    const maxHourCount = Math.max(...Object.values(hourCounts), 1)

    return {
      avgStay: avgMins < 60 ? `${avgMins} min` : `${Math.floor(avgMins / 60)}h${avgMins % 60 > 0 ? ` ${avgMins % 60}m` : ""}`,
      favDay,
      slots,
      topMembers,
      hourCounts,
      totalUnique,
      maxHourCount,
    }
  }, [monthAttendance])

  const fetchMemberInfo = useCallback(async (memberId: string): Promise<ScanLogMember | null> => {
    if (!orgId) return null
    try {
      const { data: member } = await supabase
        .from("members")
        .select("first_name, last_name, photo_url")
        .eq("id", memberId)
        .single()

      if (!member) return null

      const subRes = await supabase
        .from("member_subscriptions")
        .select("start_date, end_date, status, subscription_type:subscription_types(name, max_classes)")
        .eq("member_id", memberId)
        .eq("organization_id", orgId)
        .in("status", ["active", "expired", "pending_payment"])
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle()

      const sub = subRes.data as unknown as { start_date: string; end_date: string; status: string; subscription_type: { name: string; max_classes: number | null } | null } | null

      const endDate = sub?.end_date ?? null
      const daysLeft = endDate ? daysBetween(endDate) : null
      const subType = sub?.subscription_type ?? null

      let sessionsDone: number | null = null
      if (subType?.max_classes != null && endDate) {
        const { count } = await supabase
          .from("attendance")
          .select("id", { count: "exact", head: true })
          .eq("member_id", memberId)
          .eq("organization_id", orgId)
          .gte("check_in", new Date(new Date(endDate).getTime() - 30 * 86400000).toISOString())
          .lte("check_in", endDate)
        sessionsDone = count ?? 0
      }

      return {
        name: `${member.first_name} ${member.last_name}`,
        photo_url: member.photo_url,
        subscription_name: subType?.name ?? null,
        start_date: sub?.start_date ?? null,
        end_date: endDate,
        days_remaining: daysLeft,
        max_classes: subType?.max_classes ?? null,
        sessions_done: sessionsDone,
      }
    } catch {
      return null
    }
  }, [orgId, supabase])

  const addScanLog = useCallback((member: ScanLogMember | null, action: string, type: "granted" | "denied", reason?: string, extra?: { member_id?: string; attendance_id?: string }) => {
    scanLogIdRef.current += 1
    setScanLogs(prev => [
      {
        id: scanLogIdRef.current,
        time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        timestamp: Date.now(),
        action,
        type,
        member,
        reason,
        member_id: extra?.member_id,
        attendance_id: extra?.attendance_id,
      },
      ...prev,
    ].slice(0, 10))
  }, [])

  const focusRfid = useCallback(() => {
    setTimeout(() => rfidInputRef.current?.focus(), 50)
  }, [])

  const rfidMutation = useMutation({
    mutationFn: async (uid: string) => {
      const rfidData = await (supabase.rpc as any)("rfid_check_in", {
        p_card_uid: uid,
        p_terminal: PAGE_TERMINAL,
      })
      const result = rfidData.data as { result: string; reason?: string; member_id?: string; member_name?: string; action?: string; attendance_id?: string }

      // If member not found, try staff RFID clock
      if (result.result === "denied" && result.reason?.includes("Badge inconnu")) {
        const staffData = await (supabase.rpc as any)("staff_rfid_clock", {
          p_rfid_uid: uid,
        })
        const staffResult = staffData.data as { result: string; action?: string; staff_name?: string; staff_id?: string; reason?: string; total_hours?: number }
        if (staffResult.result === "granted") {
          return {
            result: "granted",
            action: staffResult.action,
            member_name: staffResult.staff_name,
            member_id: undefined,
            attendance_id: undefined,
            _isStaff: true,
            _staffName: staffResult.staff_name,
            _totalHours: staffResult.total_hours,
            _raw: staffResult,
          } as { result: string; reason?: string; member_id?: string; member_name?: string; action?: string; attendance_id?: string; _isStaff?: boolean; _staffName?: string; _totalHours?: number; _raw: any }
        }
        if (staffResult.result === "already_done") {
          return {
            result: "denied",
            reason: staffResult.reason,
            member_name: staffResult.staff_name,
            _raw: staffResult,
          } as { result: string; reason?: string; member_id?: string; member_name?: string; action?: string; attendance_id?: string; _raw: any }
        }
      }

      return { ...result, _raw: result } as { result: string; reason?: string; member_id?: string; member_name?: string; action?: string; attendance_id?: string; _raw: any }
    },
    onSuccess: async (data: RfidScanResult) => {
      const isGranted = data.result === "granted"
      setScanResult({
        result: isGranted ? "granted" : "denied",
        reason: data.reason,
        action: data.action,
        memberName: data.member_name,
        member_id: data.member_id,
      })
      setIsScanning(false)
      setRfidInput("")

      // Staff RFID clock
      if (data._isStaff) {
        const staffLabel = data.action === "clock_out"
          ? `Départ — ${data._staffName} (${data._totalHours}h)`
          : `Arrivée — ${data._staffName}`
        if (isGranted) {
          toast({ title: staffLabel })
        } else {
          toast({ title: "Pointage refusé", description: data.reason, variant: "destructive" })
        }
        queryClient.invalidateQueries({ queryKey: ["staff_timesheet"] })
        queryClient.invalidateQueries({ queryKey: ["staff_timesheet_weekly"] })
        if (scanResultTimeoutRef.current) clearTimeout(scanResultTimeoutRef.current)
        scanResultTimeoutRef.current = setTimeout(() => setScanResult(null), 4000)
        focusRfid()
        return
      }

      let memberInfo: ScanLogMember | null = null
      if (data.member_id) {
        memberInfo = await fetchMemberInfo(data.member_id)
        if (isGranted && data.action !== "check_out") setCheckedInMemberId(data.member_id)
      }

      const actionLabel = isGranted
        ? (data.action === "check_out" ? "Départ enregistré" : "Entrée enregistrée")
        : (data.reason ?? "Accès refusé")

      addScanLog(memberInfo, actionLabel, isGranted ? "granted" : "denied", isGranted ? undefined : data.reason, { member_id: data.member_id, attendance_id: data.attendance_id })

      if (isGranted) {
        toast({ title: actionLabel, description: memberInfo?.name ?? data.member_name })
      } else {
        toast({ title: "Accès refusé", description: `${memberInfo?.name ? memberInfo.name + " — " : ""}${data.reason}`, variant: "destructive" })
      }

      if (scanResultTimeoutRef.current) clearTimeout(scanResultTimeoutRef.current)
      scanResultTimeoutRef.current = setTimeout(() => setScanResult(null), 4000)
      focusRfid()
        queryClient.invalidateQueries({ queryKey: ["pointage-day"] })
    },
    onError: (err: Error) => {
      setIsScanning(false)
      setScanResult(null)
      setRfidInput("")
      addScanLog(null, "Erreur", "denied", err.message)
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
      focusRfid()
    },
  })

  const checkoutMutation = useMutation({
    mutationFn: async (attendanceId: string) => {
      const row = checkedInToday.find((a: AttendanceRow) => a.id === attendanceId)
      const { error } = await supabase
        .from("attendance")
        .update({ check_out: new Date().toISOString() })
        .eq("id", attendanceId)
      if (error) throw error
      return { memberName: row?.member ? `${row.member.first_name} ${row.member.last_name}` : null }
    },
    onSuccess: (_data: { memberName: string | null }) => {
      toast({ title: "Check-out effectué" })
        queryClient.invalidateQueries({ queryKey: ["pointage-day"] })
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    },
  })

  const phoneCheckInMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { data } = await (supabase.rpc as any)("phone_check_in", {
        p_phone: phoneMembers?.find((m: PhoneMember) => m.id === memberId)?.phone ?? "",
        p_org_id: orgId,
      })
      return { ...data, _memberId: memberId } as { result: string; reason?: string; member_id?: string; member_name?: string; action?: string; _memberId: string }
    },
    onSuccess: async (data: { result: string; reason?: string; member_id?: string; member_name?: string; action?: string; _memberId: string }) => {
      let memberInfo: ScanLogMember | null = null
      if (data._memberId) {
        memberInfo = await fetchMemberInfo(data._memberId)
        if (data.result === "granted") setCheckedInMemberId(data.member_id ?? data._memberId)
      }

      if (data.result === "granted") {
        const actionLabel = data.action === "check_out" ? "Départ enregistré" : "Entrée enregistrée"
        addScanLog(memberInfo, actionLabel, "granted", undefined, { member_id: data._memberId })
        toast({ title: actionLabel, description: memberInfo?.name ?? data.member_name })
      } else {
        addScanLog(memberInfo, data.reason ?? "Accès refusé", "denied", data.reason, { member_id: data._memberId })
        toast({ title: "Accès refusé", description: `${memberInfo?.name ? memberInfo.name + " — " : ""}${data.reason}`, variant: "destructive" })
      }
        queryClient.invalidateQueries({ queryKey: ["pointage-day"] })
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    },
  })

  const scanCheckoutMutation = useMutation({
    mutationFn: async (attendanceId: string) => {
      const { error } = await supabase
        .from("attendance")
        .update({ check_out: new Date().toISOString() })
        .eq("id", attendanceId)
      if (error) throw error
    },
    onSuccess: (_data: void, attendanceId: string) => {
      setCheckedOutLogIds(prev => new Set(prev).add(attendanceId))
      toast({ title: "Check-out effectué" })
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    },
  })

  const handleRfidValidate = useCallback(() => {
    const uid = rfidInput.trim()
    if (!uid || isScanning) return
    setIsScanning(true)
    setScanResult(null)
    rfidMutation.mutate(uid)
  }, [rfidInput, rfidMutation, isScanning])

  const checkoutRfidMutation = useMutation({
    mutationFn: async (uid: string) => {
      if (!orgId) return { result: "denied" as const, reason: "Organisation non définie" }
      const currentOrgId = orgId
      const { data: card, error: cardErr } = await supabase
        .from("rfid_cards")
        .select("member_id, status")
        .eq("rfid_uid", uid)
        .eq("status", "ACTIF")
        .single()
      if (cardErr || !card) {
        return { result: "denied" as const, reason: "Badge non trouvé ou inactif" }
      }
      const { data: member } = await supabase
        .from("members")
        .select("id, first_name, last_name, status")
        .eq("id", card.member_id)
        .eq("organization_id", currentOrgId)
        .single()
      if (!member || member.status !== "active") {
        return { result: "denied" as const, reason: "Membre introuvable ou inactif" }
      }
      const { data: attendance, error: attErr } = await supabase
        .from("attendance")
        .select("id")
        .eq("member_id", card.member_id)
        .eq("organization_id", currentOrgId)
        .is("check_out", null)
        .not("check_in", "is", null)
        .eq("type", "check-in")
        .order("check_in", { ascending: false })
        .limit(1)
        .single()
      if (attErr || !attendance) {
        return { result: "denied" as const, reason: "Aucun check-in actif pour ce membre", member_name: `${member.first_name} ${member.last_name}` }
      }
      const { error: updateErr } = await supabase
        .from("attendance")
        .update({ check_out: new Date().toISOString() })
        .eq("id", attendance.id)
      if (updateErr) throw updateErr
      return { result: "granted" as const, action: "check_out", member_name: `${member.first_name} ${member.last_name}`, member_id: member.id, attendance_id: attendance.id }
    },
    onSuccess: async (data: { result: string; reason?: string; action?: string; member_name?: string; member_id?: string; attendance_id?: string }) => {
      setIsCheckoutScanning(false)
      setRfidCheckoutInput("")
      const isGranted = data.result === "granted"
      setScanResult({
        result: isGranted ? "granted" : "denied",
        reason: data.reason,
        action: data.action,
        memberName: data.member_name,
        member_id: data.member_id,
      })
      let memberInfo: ScanLogMember | null = null
      if (data.member_id) {
        memberInfo = await fetchMemberInfo(data.member_id)
      }
      const actionLabel = isGranted ? "Départ enregistré" : (data.reason ?? "Accès refusé")
      addScanLog(memberInfo, actionLabel, isGranted ? "granted" : "denied", isGranted ? undefined : data.reason, { member_id: data.member_id, attendance_id: data.attendance_id })
      if (isGranted) {
        toast({ title: actionLabel, description: memberInfo?.name ?? data.member_name })
      } else {
        toast({ title: "Accès refusé", description: `${memberInfo?.name ? memberInfo.name + " — " : ""}${data.reason}`, variant: "destructive" })
      }
      if (scanResultTimeoutRef.current) clearTimeout(scanResultTimeoutRef.current)
      scanResultTimeoutRef.current = setTimeout(() => setScanResult(null), 4000)
        queryClient.invalidateQueries({ queryKey: ["pointage-day"] })
    },
    onError: (err: Error) => {
      setIsCheckoutScanning(false)
      setRfidCheckoutInput("")
      addScanLog(null, "Erreur", "denied", err.message)
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    },
  })

  const handleCheckoutValidate = useCallback(() => {
    const uid = rfidCheckoutInput.trim()
    if (!uid || isCheckoutScanning) return
    setIsCheckoutScanning(true)
    checkoutRfidMutation.mutate(uid)
  }, [rfidCheckoutInput, checkoutRfidMutation, isCheckoutScanning])

  const handlePhoneCheckIn = (memberId: string) => {
    phoneCheckInMutation.mutate(memberId)
  }

  function stopQrCamera() {
    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach(t => t.stop())
      qrStreamRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      stopQrCamera()
      if (scanResultTimeoutRef.current) clearTimeout(scanResultTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (qrCameraActive && qrVideoRef.current && qrStreamRef.current) {
      qrVideoRef.current.srcObject = qrStreamRef.current
    }
  }, [qrCameraActive])

  async function startQrCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      qrStreamRef.current = stream
      setQrCameraActive(true)
    } catch (e) {
      toast({ title: "Erreur caméra", description: e instanceof Error ? e.message : "Impossible d'accéder à la caméra", variant: "destructive" })
    }
  }

  function handleQrCameraClose() {
    stopQrCamera()
    setQrCameraActive(false)
  }

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault()
        focusRfid()
      }
      if (e.key === "Escape") {
        setRfidInput("")
        setScanResult(null)
        focusRfid()
      }
    }
    window.addEventListener("keydown", handleGlobalKey)
    return () => window.removeEventListener("keydown", handleGlobalKey)
  }, [focusRfid])

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.pointage')}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm bg-muted rounded-lg px-3 py-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono font-semibold text-lg tabular-nums">
                {now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm bg-muted rounded-lg px-3 py-1.5">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium capitalize">{selectedDateLabel}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportCsv()}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" size="sm">
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            <Button variant="outline" size="sm" onClick={qrCameraActive ? handleQrCameraClose : startQrCamera}>
              <QrCode className="mr-2 h-4 w-4" />
              QR Code
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-1">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Scanner badge RFID
              </Label>
              <div className="flex gap-2">
                <Input
                  ref={rfidInputRef}
                  placeholder="Scannez ou tapez le code..."
                  value={rfidInput}
                  onChange={e => setRfidInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleRfidValidate() }}
                  className="font-mono text-lg h-12"
                  autoFocus
                />
                <Button
                  onClick={handleRfidValidate}
                  disabled={!rfidInput.trim() || isScanning}
                  className="h-12 px-6"
                >
                  {isScanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                </Button>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Keyboard className="h-3 w-3" />
                <span><kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">F2</kbd> Focus · <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">Esc</kbd> Effacer</span>
              </div>
            </div>

            <div className="pt-3 border-t space-y-2">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <LogOut className="h-3 w-3" />
                Check-out ({checkedInToday.filter((a: AttendanceRow) => !a.check_out).length})
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Badge RFID pour sortie..."
                  value={rfidCheckoutInput}
                  onChange={e => setRfidCheckoutInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCheckoutValidate() }}
                  className="font-mono text-sm h-9"
                />
                <Button
                  onClick={handleCheckoutValidate}
                  disabled={!rfidCheckoutInput.trim() || isCheckoutScanning}
                  className="h-9 px-4"
                >
                  {isCheckoutScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                </Button>
              </div>
              {checkedInToday.filter((a: AttendanceRow) => !a.check_out).length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-1">Aucun membre en salle</p>
              ) : (
                checkedInToday.filter((a: AttendanceRow) => !a.check_out).map((a: AttendanceRow) => (
                  <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                    <Avatar className="h-7 w-7">
                      {a.member?.photo_url ? <AvatarImage src={a.member.photo_url} /> : null}
                      <AvatarFallback className="text-[9px]">{getInitials(a.member?.first_name ?? "", a.member?.last_name ?? "")}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => openMember(a.member_id)}
                        title="Ouvrir la fiche adhérent"
                        className="text-xs font-medium truncate text-left w-full cursor-pointer hover:text-primary hover:underline transition-colors"
                      >
                        {toUpper(`${a.member?.first_name ?? ""} ${a.member?.last_name ?? ""}`)}
                      </button>
                      <p className="text-[10px] text-muted-foreground">Depuis {formatTime(a.check_in)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {scanResult && (
              <div className={`flex items-center gap-3 p-3 rounded-lg border transition-all animate-in fade-in duration-200 ${
                scanResult.result === "granted"
                  ? "bg-success/10 text-success border-success/30"
                  : "bg-destructive/10 text-destructive border-destructive/30"
              }`}>
                <div className={`rounded-full p-1.5 ${scanResult.result === "granted" ? "bg-success/20" : "bg-destructive/20"}`}>
                  {scanResult.result === "granted"
                    ? <CheckCircle2 className="h-5 w-5" />
                    : <XCircle className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {scanResult.result === "granted" ? "Accès autorisé" : "Accès refusé"}
                  </p>
                  {scanResult.memberName && (
                    scanResult.member_id ? (
                      <button
                        type="button"
                        onClick={() => openMember(scanResult.member_id!)}
                        title="Ouvrir la fiche adhérent"
                        className="text-xs opacity-80 truncate text-left cursor-pointer hover:opacity-100 hover:underline"
                      >
                        {scanResult.memberName}
                      </button>
                    ) : (
                      <p className="text-xs opacity-80 truncate">{scanResult.memberName}</p>
                    )
                  )}
                  {scanResult.reason && (
                    <p className="text-xs opacity-70">{scanResult.reason}</p>
                  )}
                </div>
              </div>
            )}

            <div className="pt-3 border-t space-y-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                Recherche par téléphone
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: 0678, 0551, 06..."
                  value={phoneQuery}
                  onChange={e => setPhoneQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && phoneMembers && phoneMembers.length === 1) {
                      handlePhoneCheckIn(phoneMembers[0].id)
                    }
                  }}
                />
                <Button variant="outline" size="icon" onClick={() => setPhoneQuery("")} disabled={!phoneQuery}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {isSearchingPhone && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {phoneMembers && phoneMembers.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {phoneMembers.map((m: PhoneMember) => {
                    const hasActiveSub = m.member_subscriptions?.some((s: { status: string }) => s.status === "active" || s.status === "trial")
                    const isInside = checkedInToday.some((a: AttendanceRow) => a.member_id === m.id && !a.check_out)
                    return (
                      <div key={m.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${isInside ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10" : "bg-card hover:bg-accent/50"}`}>
                        <Avatar className="h-9 w-9">
                          {m.photo_url ? <AvatarImage src={m.photo_url} /> : null}
                          <AvatarFallback>{getInitials(m.first_name, m.last_name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openMember(m.id)}
                              title="Ouvrir la fiche adhérent"
                              className="font-medium text-sm text-left cursor-pointer hover:text-primary hover:underline transition-colors"
                            >
                              {toUpper(`${m.first_name} ${m.last_name}`)}
                            </button>
                            <Badge variant={hasActiveSub ? "default" : "secondary"} className="text-[9px] px-1 py-0 h-3.5">
                              {hasActiveSub ? "Actif" : "Inactif"}
                            </Badge>
                            {isInside && <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3 animate-pulse">EN SALLE</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{m.phone}</p>
                        </div>
                        <Button
                          size="sm"
                          variant={isInside ? "destructive" : "default"}
                          onClick={() => handlePhoneCheckIn(m.id)}
                          disabled={phoneCheckInMutation.isPending}
                        >
                          {phoneCheckInMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isInside ? (
                            <LogOut className="h-4 w-4 mr-1" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                          )}
                          {isInside ? "Check-out" : "Check-in"}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}

              {phoneQuery.trim().length >= 2 && !isSearchingPhone && phoneMembers && phoneMembers.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Aucun membre trouvé avec ce numéro
                </p>
              )}
            </div>

          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardContent className="pt-6 space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Activité récente
            </h3>
            {scanLogs.length === 0 ? (
              <div className="text-center py-8">
                <Zap className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">Aucun scan récent</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {scanLogs.map((log, idx) => {
                  const isExpired = log.member?.days_remaining !== null && log.member?.days_remaining !== undefined && log.member.days_remaining <= 0
                  const isWarning = log.member?.days_remaining !== null && log.member?.days_remaining !== undefined && log.member.days_remaining > 0 && log.member.days_remaining <= 7
                  const sessionsLeft = (log.member?.max_classes != null && log.member?.sessions_done != null)
                    ? log.member.max_classes - log.member.sessions_done
                    : null
                  const isLowSessions = sessionsLeft !== null && sessionsLeft <= 2
                  const isCheckin = log.type === "granted" && log.action.includes("Entrée")
                  const isAlreadyCheckedOut = log.attendance_id ? checkedOutLogIds.has(log.attendance_id) : false
                  const canCheckout = isCheckin && log.attendance_id && !isAlreadyCheckedOut
                  const elapsedMs = now.getTime() - log.timestamp
                  const elapsedMins = Math.floor(elapsedMs / 60000)
                  const elapsedHrs = Math.floor(elapsedMins / 60)
                  const elapsedDisplay = elapsedHrs > 0 ? `${elapsedHrs}h${elapsedMins % 60 > 0 ? ` ${elapsedMins % 60}m` : ""}` : `${elapsedMins}min`

                  return (
                    <div key={log.id} className={`rounded-lg border overflow-hidden transition-colors ${
                      log.type === "granted" ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"
                    }`}>
                      {log.member ? (
                        <div className="flex gap-3 p-3">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                              {log.member_id ? (
                                <button
                                  type="button"
                                  onClick={() => openMember(log.member_id!)}
                                  title="Ouvrir la fiche adhérent"
                                  className="font-bold text-sm leading-tight text-left hover:underline cursor-pointer truncate"
                                >
                                  {log.member.name}
                                </button>
                              ) : (
                                <p className="font-bold text-sm leading-tight truncate">{log.member.name}</p>
                              )}
                              {isAlreadyCheckedOut && (
                                <Badge variant="secondary" className="text-[9px] shrink-0">Terminé</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-muted-foreground text-xs">{log.action}</p>
                              <p className="text-muted-foreground text-[10px]">{log.time}</p>
                              {canCheckout && (
                                <span className="text-primary text-[10px] font-mono font-bold animate-pulse">⏱ {elapsedDisplay}</span>
                              )}
                            </div>
                            {log.type === "denied" && log.reason && (
                              <p className="text-destructive font-medium text-xs">{log.reason}</p>
                            )}
                            {log.member.subscription_name && (
                              <p className="text-xs font-semibold text-foreground">{log.member.subscription_name}</p>
                            )}
                            {(log.member.start_date || log.member.end_date) && (
                              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                {log.member.start_date && (
                                  <span>Début : {new Date(log.member.start_date).toLocaleDateString("fr-FR")}</span>
                                )}
                                {log.member.end_date && (
                                  <span className={isExpired ? "text-destructive font-bold" : isWarning ? "text-orange-500 font-medium" : ""}>
                                    Fin : {new Date(log.member.end_date).toLocaleDateString("fr-FR")}
                                    {!isExpired && log.member.days_remaining != null && ` (${log.member.days_remaining}j)`}
                                  </span>
                                )}
                              </div>
                            )}
                            {log.member.max_classes != null && (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1 text-[10px]">
                                  <span className="text-muted-foreground">Séances :</span>
                                  <span className={`font-semibold ${isLowSessions ? "text-orange-500" : "text-foreground"}`}>
                                    {log.member.sessions_done ?? 0} / {log.member.max_classes}
                                  </span>
                                </div>
                                <div className="w-full bg-muted rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full ${isLowSessions ? "bg-orange-500" : "bg-primary"}`}
                                    style={{ width: `${Math.min(100, ((log.member.sessions_done ?? 0) / log.member.max_classes) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            {log.member.max_classes == null && (
                              <p className="text-[10px] text-muted-foreground">Séances : Illimité</p>
                            )}
                          </div>
                          <div className="flex flex-col items-center gap-2 shrink-0">
                            <div className="relative">
                              {log.member.photo_url ? (
                                <img src={log.member.photo_url} alt={log.member.name} className="h-16 w-16 rounded-full object-cover" />
                              ) : (
                                <Avatar className="h-16 w-16">
                                  <AvatarFallback className="text-lg">{getInitials(log.member.name.split(" ")[0] ?? "", log.member.name.split(" ").slice(1).join(" ") ?? "")}</AvatarFallback>
                                </Avatar>
                              )}
                              <div className="absolute -bottom-1 -right-1">
                                {log.type === "granted"
                                  ? <span className="bg-success/90 text-white text-[8px] font-bold px-1 py-0.5 rounded-full flex items-center gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" /> {isCheckin ? "ARRIVÉE" : "DÉPART"}</span>
                                  : <span className="bg-destructive/90 text-white text-[8px] font-bold px-1 py-0.5 rounded-full flex items-center gap-0.5"><XCircle className="h-2.5 w-2.5" /> REFUSÉ</span>
                                }
                              </div>
                            </div>
                            {log.member.subscription_name ? (
                              <div className={`rounded-md px-2 py-1 text-center ${
                                isExpired
                                  ? "bg-destructive/15 border border-destructive/30"
                                  : "bg-success/15 border border-success/30"
                              }`}>
                                <p className={`text-[9px] font-bold uppercase leading-tight ${
                                  isExpired ? "text-destructive" : "text-success"
                                }`}>
                                  {isExpired ? "Abonnement expiré" : "Abonnement en cours"}
                                </p>
                              </div>
                            ) : (
                              <div className="rounded-md px-2 py-1 bg-orange-500/15 border border-orange-500/30">
                                <p className="text-[9px] font-bold uppercase text-orange-500 leading-tight">Pas d'abonnement</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="p-3">
                          <p className="text-xs text-muted-foreground">{log.action}</p>
                          <p className="text-[10px] text-muted-foreground">{log.time}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {qrCameraActive && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              Scanner QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative rounded-lg overflow-hidden bg-black">
              <video ref={qrVideoRef} autoPlay playsInline muted className="w-full h-48 object-cover" />
            </div>
            <p className="text-xs text-muted-foreground">
              Problème de caméra ? Saisissez le code QR manuellement :
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="IGC:123 ou INF-..."
                value={rfidInput}
                onChange={e => setRfidInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleRfidValidate() }}
              />
              <Button onClick={handleRfidValidate} disabled={!rfidInput.trim() || isScanning}>
                {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Pointages du Jour
              </CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{filteredToday.length} membre{filteredToday.length !== 1 ? "s" : ""}</span>
                <span className="text-sm text-muted-foreground capitalize">{selectedDateLabel}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(addDays(selectedDate, -1))} title="Jour précédent">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={selectedDate}
                onChange={e => { if (e.target.value) setSelectedDate(e.target.value) }}
                className="h-8 w-[180px]"
              />
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(addDays(selectedDate, 1))} title="Jour suivant">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant={selectedDate === todayStr ? "default" : "outline"} size="sm" className="h-8" onClick={() => setSelectedDate(todayStr)}>
                Aujourd&apos;hui
              </Button>
              <Button variant={selectedDate === yesterdayStr ? "default" : "outline"} size="sm" className="h-8" onClick={() => setSelectedDate(yesterdayStr)}>
                Hier
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{dayStats.uniqueMembers}</p>
              <p className="text-xs text-muted-foreground">Visites uniques</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{formatCurrency(dayRevenue?.pos ?? 0)}</p>
              <p className="text-xs text-muted-foreground">CA POS ({dayRevenue?.posCount ?? 0})</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{formatCurrency(dayRevenue?.payments ?? 0)}</p>
              <p className="text-xs text-muted-foreground">Encaissements</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 rounded-lg bg-success/10 border border-success/20">
              <p className="text-3xl font-bold text-success">{entryCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Entrées</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-3xl font-bold text-destructive">{checkedOutCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Sorties</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-3xl font-bold text-primary">{insideCount}</p>
              <p className="text-xs text-muted-foreground mt-1">{selectedDate === todayStr ? "En salle" : "Sessions en cours"}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Pic d&apos;affluence</p>
              <p className="text-lg font-semibold">{peakAffluence ? `${peakAffluence.hour} (${peakAffluence.count})` : "—"}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Séjour moyen</p>
              <p className="text-lg font-semibold">{avgStay ?? "—"}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Taux occupation</p>
              <p className="text-lg font-semibold">{occupancyRate ?? "—"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom ou téléphone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {searchQuery && (
              <Button variant="outline" size="icon" onClick={() => { setSearchQuery(""); setPage(1) }} title="Reset filters">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {filteredToday.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">Aucun pointage aujourd&apos;hui</p>
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedAttendance.map(a => {
                const isInside = a.check_in && !a.check_out
                return (
                  <div
                    key={a.id}
                    onClick={() => setDayDetail({ memberId: a.member_id, memberName: `${a.member?.first_name ?? ""} ${a.member?.last_name ?? ""}` })}
                    className={`flex items-center gap-4 p-3 rounded-lg border transition-colors cursor-pointer hover:ring-1 hover:ring-primary/40 ${
                      isInside ? "bg-primary/5 border-primary/20" : "bg-card hover:bg-accent/30"
                    }`}
                  >
                    <Avatar className="h-9 w-9">
                      {a.member?.photo_url ? <AvatarImage src={a.member.photo_url} /> : null}
                      <AvatarFallback>{getInitials(a.member?.first_name ?? "", a.member?.last_name ?? "")}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openMember(a.member_id) }}
                        title="Ouvrir la fiche adhérent"
                        className="font-medium text-sm text-left w-full cursor-pointer hover:text-primary hover:underline transition-colors"
                      >
                        {toUpper(`${a.member?.first_name ?? ""} ${a.member?.last_name ?? ""}`)}
                      </button>
                      <div className="flex items-center gap-2 text-xs">
                        {a.member?.phone && (
                          <span className="text-muted-foreground font-mono">{displayPhone(a.member.phone)}</span>
                        )}
                        <span className="text-success font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {formatTime(a.check_in)}
                        </span>
                        {a.check_out ? (
                          <span className="text-destructive font-medium flex items-center gap-1">
                            <XCircle className="h-3 w-3" />
                            {formatTime(a.check_out)}
                          </span>
                        ) : (
                          <span className="text-primary font-medium text-[10px] animate-pulse">EN SALLE</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {isInside && (
                        <span className="text-xs text-primary font-mono font-medium">
                          {(() => {
                            const diff = Date.now() - new Date(a.check_in!).getTime()
                            const mins = Math.floor(diff / 60000)
                            if (mins < 60) return `${mins}min`
                            return `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ""}`
                          })()}
                        </span>
                      )}
                      {a.check_out && computeStay(a) && (
                        <Badge variant="secondary" className="text-[10px] font-mono">{computeStay(a)}</Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} totalItems={filteredToday.length} pageSize={20} onPageChange={setPage} />
        </CardContent>
      </Card>

      {analytics && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Analytics — 30 jours
              </CardTitle>
              <span className="text-xs text-muted-foreground">{analytics.totalUnique} membre{analytics.totalUnique !== 1 ? "s" : ""} actif{analytics.totalUnique !== 1 ? "s" : ""}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{analytics.avgStay}</p>
                <p className="text-xs text-muted-foreground mt-1">Temps moyen en salle</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{analytics.favDay?.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground mt-1">Jour préféré ({analytics.favDay?.count ?? 0} visites)</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{analytics.totalUnique}</p>
                <p className="text-xs text-muted-foreground mt-1">Visiteurs uniques</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{(monthAttendance ?? []).length}</p>
                <p className="text-xs text-muted-foreground mt-1">Total séances</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Affluence par tranche horaire
                </h4>
                {Object.entries(analytics.slots).map(([label, count]) => {
                  const maxSlot = Math.max(...Object.values(analytics.slots), 1)
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${(count / maxSlot) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Top 5 visiteurs
                </h4>
                {analytics.topMembers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune donnée</p>
                ) : (
                  <div className="space-y-2">
                    {analytics.topMembers.map((m, i) => (
                      <div key={m.name} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                        <span className="text-xs font-bold text-muted-foreground w-4 text-center">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => openMember(m.id)}
                            title="Ouvrir la fiche adhérent"
                            className="text-xs font-medium truncate text-left w-full cursor-pointer hover:text-primary hover:underline transition-colors"
                          >
                            {toUpper(m.name)}
                          </button>
                          <p className="text-[10px] text-muted-foreground">{m.visits} visites · ~{m.avgMins}min/séance</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                Répartition par heure
              </h4>
              <div className="flex items-end gap-1 h-24">
                {Array.from({ length: 18 }, (_, i) => i + 6).map(h => {
                  const count = analytics.hourCounts[h] ?? 0
                  const pct = analytics.maxHourCount > 0 ? (count / analytics.maxHourCount) * 100 : 0
                  return (
                    <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full rounded-t" style={{ height: `${pct}%`, backgroundColor: pct > 75 ? "hsl(var(--primary))" : pct > 25 ? "hsl(var(--primary) / 0.5)" : "hsl(var(--primary) / 0.2)" }} />
                      <span className="text-[8px] text-muted-foreground">{h}h</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => toast({ title: "Module installation détecteur RFID" })}>
          <CardContent className="flex flex-col items-center justify-center p-6 gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <span className="font-medium text-sm text-center">Module installation détecteur RFID</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => toast({ title: "Historique & Investigation" })}>
          <CardContent className="flex flex-col items-center justify-center p-6 gap-3">
            <div className="rounded-full bg-amber-500/10 p-3">
              <History className="h-6 w-6 text-amber-500" />
            </div>
            <span className="font-medium text-sm text-center">Historique & Investigation</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => exportCsv()}>
          <CardContent className="flex flex-col items-center justify-center p-6 gap-3">
            <div className="rounded-full bg-emerald-500/10 p-3">
              <Download className="h-6 w-6 text-emerald-500" />
            </div>
            <span className="font-medium text-sm text-center flex items-center gap-2">
              EXPORT
              <Badge className="text-[10px] px-1 py-0 h-4 bg-amber-500 text-white border-0">PRO</Badge>
            </span>
          </CardContent>
        </Card>
      </div>

      <MemberDayDetail
        memberId={dayDetail?.memberId ?? null}
        memberName={dayDetail?.memberName ?? ""}
        date={selectedDate}
        open={!!dayDetail}
        onOpenChange={(o) => { if (!o) setDayDetail(null) }}
      />
    </div>
  )
}
