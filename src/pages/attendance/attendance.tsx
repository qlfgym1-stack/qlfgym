import { useState, useMemo, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useRealtime } from "@/hooks/useRealtime"
import { useT } from "@/i18n"
import { useAuth } from "@/stores/auth"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { downloadWorkbook } from "@/lib/exportWorkbook"
import {
  Search, LogIn, LogOut, Download, Clock, UserCheck, UserX, AlertTriangle, Loader2,
} from "lucide-react"
import { usePagination } from "@/hooks/usePagination"
import { useExportCsv } from "@/hooks/useExportCsv"
import { Pagination } from "@/components/ui/pagination"
import { formatDate, formatDateTime, cn, toUpper } from "@/lib/utils"
import type { Member, Attendance } from "@/types/supabase"
import { format, startOfDay, endOfDay, differenceInMinutes } from "date-fns"
import { useOpenMember } from "@/hooks/useOpenMember"


interface MemberWithAttendance extends Pick<Member, "id" | "first_name" | "last_name" | "photo_url"> {
  attendance: Attendance | null
}

type HistoryEntry = Attendance & { members: { first_name: string; last_name: string } }

export default function AttendancePage() {
  const t = useT()
  const openMember = useOpenMember()
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { organization } = useAuth()
  const { toast } = useToast()
  const orgId = organization?.id

  useRealtime({ table: "attendance", queryKey: ["attendance-today", orgId ?? ""], filter: orgId ? `organization_id=eq.${orgId}` : undefined })

  const [search, setSearch] = useState("")
  const [historyDateFrom, setHistoryDateFrom] = useState(format(new Date(), "yyyy-MM-dd"))
  const [historyDateTo, setHistoryDateTo] = useState(format(new Date(), "yyyy-MM-dd"))
  const [sourceFilter, setSourceFilter] = useState<"all" | "rfid" | "manual" | "app">("all")

  const todayStart = startOfDay(new Date()).toISOString()
  const todayEnd = endOfDay(new Date()).toISOString()

  const { data: activeMembers, isError: activeMembersError, error: activeMembersQueryError } = useQuery({
    queryKey: ["active-members", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("members")
        .select("id, first_name, last_name, photo_url")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .order("first_name")
      return data as Pick<Member, "id" | "first_name" | "last_name" | "photo_url">[]
    },
    enabled: !!orgId,
  })

  useEffect(() => {
    if (activeMembersError && activeMembersQueryError) {
      toast({ title: t("common.error") || "Error", description: activeMembersQueryError.message, variant: "destructive" })
    }
  }, [activeMembersError, activeMembersQueryError])

  const { data: todayAttendance, isError: todayError, error: todayQueryError } = useQuery({
    queryKey: ["attendance-today", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("organization_id", orgId)
        .gte("check_in", todayStart)
        .lte("check_in", todayEnd)
        .order("check_in", { ascending: false })
      return data as Attendance[]
    },
    enabled: !!orgId,
  })

  useEffect(() => {
    if (todayError && todayQueryError) {
      toast({ title: t("common.error") || "Error", description: todayQueryError.message, variant: "destructive" })
    }
  }, [todayError, todayQueryError])

  const { data: history } = useQuery({
    queryKey: ["attendance-history", orgId, historyDateFrom, historyDateTo],
    queryFn: async () => {
      if (!orgId) return []
      const from = startOfDay(new Date(historyDateFrom)).toISOString()
      const to = endOfDay(new Date(historyDateTo)).toISOString()
      const { data } = await supabase
        .from("attendance")
        .select("*, members(first_name, last_name)")
        .eq("organization_id", orgId)
        .gte("check_in", from)
        .lte("check_in", to)
        .order("check_in", { ascending: false })
      return data as (Attendance & { members: { first_name: string; last_name: string } })[]
    },
    enabled: !!orgId,
  })

  const checkInMutation = useMutation({
    mutationFn: async (memberId: string) => {
      if (!orgId) throw new Error("No organization")
      const { error } = await supabase.from("attendance").insert({
        organization_id: orgId,
        member_id: memberId,
        check_in: new Date().toISOString(),
        type: "check-in",
        source: "app",
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-today"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      toast({ title: t("attendance.toastCheckIn") })
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" })
    },
  })

  const checkOutMutation = useMutation({
    mutationFn: async (attendanceId: string) => {
      const { error } = await supabase
        .from("attendance")
        .update({ check_out: new Date().toISOString() })
        .eq("id", attendanceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-today"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      toast({ title: t("attendance.toastCheckOut") })
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" })
    },
  })

  const membersWithAttendance: MemberWithAttendance[] = useMemo(() => {
    if (!activeMembers || !todayAttendance) return []
    const filteredAttendance = sourceFilter === "all"
      ? todayAttendance
      : todayAttendance.filter((a: Attendance) => a.source === sourceFilter)
    return activeMembers.map((m: Pick<Member, "id" | "first_name" | "last_name" | "photo_url">) => {
      const att = filteredAttendance.find((a: Attendance) => a.member_id === m.id)
      return { ...m, attendance: att ?? null }
    })
  }, [activeMembers, todayAttendance, sourceFilter])

  const checkedInCount = membersWithAttendance.filter((m) => m.attendance && !m.attendance.check_out).length
  const totalToday = todayAttendance?.length ?? 0

  const filteredMembers = membersWithAttendance.filter((m) => {
    const name = `${m.first_name} ${m.last_name}`.toLowerCase()
    return name.includes(search.toLowerCase())
  })

  const { page: historyPage, setPage: setHistoryPage, totalPages: historyTotalPages, paginatedData: paginatedHistory } = usePagination(history, 20)

  const { exportCsv: exportHistoryCsv } = useExportCsv(
    (history ?? []).map((h: HistoryEntry) => ({
      member_name: `${h.members?.first_name ?? ""} ${h.members?.last_name ?? ""}`,
      check_in: h.check_in ? format(new Date(h.check_in), "HH:mm") : "-",
      check_out: h.check_out ? format(new Date(h.check_out), "HH:mm") : "-",
      duration: h.check_in && h.check_out
        ? `${differenceInMinutes(new Date(h.check_out), new Date(h.check_in))} ${t("attendance.min")}`
        : "-",
      source: h.source,
      status: h.check_out ? t("attendance.completed") : t("attendance.inProgress"),
    })),
    `attendance-${historyDateFrom}-${historyDateTo}`,
    [
      { key: 'member_name', label: t("attendance.member") },
      { key: 'check_in', label: t("attendance.checkIn") },
      { key: 'check_out', label: t("attendance.checkOut") },
      { key: 'duration', label: t("attendance.duration") },
      { key: 'source', label: t("attendance.source") || "Source" },
      { key: 'status', label: t("common.status") },
    ]
  )

  const handleExportHistory = async () => {
    if (!history) return
    const ExcelJS = await import("exceljs")
    const memberLabel = t("attendance.member")
    const checkInLabel = t("attendance.checkIn")
    const checkOutLabel = t("attendance.checkOut")
    const durationLabel = t("attendance.duration")
    const sourceLabel = t("attendance.source") || "Source"
    const statusLabel = t("common.status")
    const wb = new ExcelJS.default.Workbook()
    const ws = wb.addWorksheet(t("attendance.title"))
    ws.columns = [
      { header: memberLabel, key: memberLabel, width: 30 },
      { header: checkInLabel, key: checkInLabel, width: 15 },
      { header: checkOutLabel, key: checkOutLabel, width: 15 },
      { header: durationLabel, key: durationLabel, width: 20 },
      { header: sourceLabel, key: sourceLabel, width: 15 },
      { header: statusLabel, key: statusLabel, width: 15 },
    ]
    history.forEach((h: HistoryEntry) => {
      ws.addRow({
        [memberLabel]: `${h.members?.first_name ?? ""} ${h.members?.last_name ?? ""}`,
        [checkInLabel]: h.check_in ? format(new Date(h.check_in), "HH:mm") : "-",
        [checkOutLabel]: h.check_out ? format(new Date(h.check_out), "HH:mm") : "-",
        [durationLabel]: h.check_in && h.check_out
          ? `${differenceInMinutes(new Date(h.check_out), new Date(h.check_in))} ${t("attendance.min")}`
          : "-",
        [sourceLabel]: h.source,
        [statusLabel]: h.check_out ? t("attendance.completed") : t("attendance.inProgress"),
      })
    })
    await downloadWorkbook(wb, `${t("attendance.exportFileName")}-${historyDateFrom}-${historyDateTo}`)
  }

  const presentToday = membersWithAttendance.filter((m) => m.attendance).length
  const lateToday = membersWithAttendance.filter((m) => {
    if (!m.attendance?.check_in) return false
    const hour = new Date(m.attendance.check_in).getHours()
    return hour >= 10
  }).length
  const absentToday = activeMembers ? activeMembers.length - presentToday : 0

  return (
    <div>
      <PageHeader
        title={t("attendance.title")}
        description={t("attendance.description")}
      />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("attendance.presentToday")}</CardTitle>
            <UserCheck className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{presentToday}</div>
            <p className="text-xs text-muted-foreground">{checkedInCount} {t("attendance.currentlyInRoom")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("attendance.late")}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lateToday}</div>
            <p className="text-xs text-muted-foreground">{t("attendance.lateDescription")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("attendance.absentMembers")}</CardTitle>
            <UserX className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{absentToday}</div>
            <p className="text-xs text-muted-foreground">{t("attendance.absentNoCheckIn")}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="today" className="mb-6">
        <TabsList>
          <TabsTrigger value="today">{t("attendance.today")}</TabsTrigger>
          <TabsTrigger value="history">{t("attendance.history")}</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("common.search")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={sourceFilter} onValueChange={(v: "all" | "rfid" | "manual" | "app") => setSourceFilter(v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("attendance.all") || "Toutes"}</SelectItem>
                    <SelectItem value="rfid">RFID</SelectItem>
                    <SelectItem value="manual">{t("attendance.manual") || "Manuel"}</SelectItem>
                    <SelectItem value="app">{t("attendance.app") || "App"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3">
                {filteredMembers.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">{t("common.noData")}</p>
                ) : (
                  filteredMembers.map((member) => {
                    const isCheckedIn = !!member.attendance
                    const isCheckedOut = member.attendance?.check_out != null
                    const isActive = isCheckedIn && !isCheckedOut
                    return (
                      <div
                        key={member.id}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-lg border transition-colors",
                          isActive ? "bg-success/5 border-success/20" : "bg-card"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium",
                            isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                          )}>
                            {toUpper(member.first_name.charAt(0))}{toUpper(member.last_name.charAt(0))}
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => openMember(member.id)}
                              title="Ouvrir la fiche adhérent"
                              className="font-medium text-left cursor-pointer hover:text-primary hover:underline transition-colors"
                            >
                              {toUpper(member.first_name)} {toUpper(member.last_name)}
                            </button>
                            {member.attendance?.check_in && (
                              <p className="text-xs text-muted-foreground">
                                {t("attendance.checkInLabel")}{format(new Date(member.attendance.check_in), "HH:mm")}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isActive ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => checkOutMutation.mutate(member.attendance!.id)}
                              disabled={checkOutMutation.isPending}
                            >
                              <LogOut className="mr-2 h-4 w-4" />
                              {t("attendance.checkOut")}
                            </Button>
                          ) : !isCheckedIn ? (
                            <Button
                              size="sm"
                              onClick={() => checkInMutation.mutate(member.id)}
                              disabled={checkInMutation.isPending}
                            >
                              <LogIn className="mr-2 h-4 w-4" />
                              {t("attendance.checkIn")}
                            </Button>
                          ) : (
                            <Badge variant="secondary">{t("attendance.checkOutDone")}</Badge>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("attendance.from")}</label>
                  <Input
                    type="date"
                    value={historyDateFrom}
                    onChange={(e) => setHistoryDateFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("attendance.to")}</label>
                  <Input
                    type="date"
                    value={historyDateTo}
                    onChange={(e) => setHistoryDateTo(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={exportHistoryCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  {t("common.export")}
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("attendance.member")}</TableHead>
                      <TableHead>{t("attendance.checkIn")}</TableHead>
                      <TableHead>{t("attendance.checkOut")}</TableHead>
                      <TableHead>{t("attendance.duration")}</TableHead>
                      <TableHead>{t("attendance.source") || "Source"}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {t("common.noData")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedHistory.map((entry) => {
                        const checkIn = entry.check_in ? new Date(entry.check_in) : null
                        const checkOut = entry.check_out ? new Date(entry.check_out) : null
                        const duration = checkIn && checkOut ? differenceInMinutes(checkOut, checkIn) : null
                        const sourceVariant = entry.source === "rfid" ? "default" : entry.source === "manual" ? "secondary" : "outline"
                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">
                              <button
                                type="button"
                                onClick={() => openMember(entry.member_id)}
                                title="Ouvrir la fiche adhérent"
                                className="text-left font-medium cursor-pointer hover:text-primary hover:underline transition-colors"
                              >
                                {toUpper(entry.members?.first_name)} {toUpper(entry.members?.last_name)}
                              </button>
                            </TableCell>
                            <TableCell>
                              {checkIn ? format(checkIn, "HH:mm") : "-"}
                            </TableCell>
                            <TableCell>
                              {checkOut ? format(checkOut, "HH:mm") : "-"}
                            </TableCell>
                            <TableCell>
                              {duration !== null ? `${duration} ${t("attendance.min")}` : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={sourceVariant} className={
                                entry.source === "rfid" ? "bg-primary/10 text-primary border-primary/30" :
                                entry.source === "manual" ? "bg-accent/10 text-accent border-accent/30" :
                                "bg-success/10 text-success border-success/30"
                              }>
                                {entry.source === "rfid" ? "RFID" :
                                 entry.source === "manual" ? (t("attendance.manual") || "Manuel") :
                                 (t("attendance.app") || "App")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {checkOut ? (
                                <Badge variant="default">{t("attendance.present")}</Badge>
                              ) : checkIn ? (
                                <Badge variant="secondary">{t("attendance.inProgress")}</Badge>
                              ) : (
                                <Badge variant="destructive">{t("attendance.absent")}</Badge>
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
                {paginatedHistory.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">{t("common.noData")}</p>
                ) : (
                  paginatedHistory.map((entry) => {
                    const checkIn = entry.check_in ? new Date(entry.check_in) : null
                    const checkOut = entry.check_out ? new Date(entry.check_out) : null
                    const duration = checkIn && checkOut ? differenceInMinutes(checkOut, checkIn) : null
                    const sourceVariant = entry.source === "rfid" ? "default" : entry.source === "manual" ? "secondary" : "outline"
                    return (
                      <Card key={entry.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <button
                              type="button"
                              onClick={() => openMember(entry.member_id)}
                              title="Ouvrir la fiche adhérent"
                              className="font-medium text-left cursor-pointer hover:text-primary hover:underline transition-colors"
                            >
                              {toUpper(entry.members?.first_name)} {toUpper(entry.members?.last_name)}
                            </button>
                            <p className="text-sm text-muted-foreground">
                              {checkIn ? format(checkIn, "HH:mm") : "-"}
                              {checkOut ? ` → ${format(checkOut, "HH:mm")}` : ""}
                            </p>
                          </div>
                          <Badge variant={sourceVariant} className={
                            entry.source === "rfid" ? "bg-primary/10 text-primary border-primary/30" :
                            entry.source === "manual" ? "bg-accent/10 text-accent border-accent/30" :
                            "bg-success/10 text-success border-success/30"
                          }>
                            {entry.source === "rfid" ? "RFID" :
                             entry.source === "manual" ? (t("attendance.manual") || "Manuel") :
                             (t("attendance.app") || "App")}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            {duration !== null ? `${duration} ${t("attendance.min")}` : "-"}
                          </span>
                          {checkOut ? (
                            <Badge variant="default">{t("attendance.present")}</Badge>
                          ) : checkIn ? (
                            <Badge variant="secondary">{t("attendance.inProgress")}</Badge>
                          ) : (
                            <Badge variant="destructive">{t("attendance.absent")}</Badge>
                          )}
                        </div>
                      </Card>
                    )
                  })
                )}
              </div>

              <div className="px-4 pb-4">
                <Pagination page={historyPage} totalPages={historyTotalPages} totalItems={history?.length ?? 0} pageSize={20} onPageChange={setHistoryPage} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

