import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { useT } from "@/i18n"
import { useQuery } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useAuth } from "@/stores/auth"
import { useExportCsv } from "@/hooks/useExportCsv"
import { useOpenMember } from "@/hooks/useOpenMember"
import { getInitials } from "@/lib/utils"
import { Users, Calendar, Clock, Activity, TrendingUp, UserCheck, LogIn, Loader2, Download } from "lucide-react"

export default function DisplayPage() {
  const t = useT()
  const supabase = useSupabase()
  const { organization } = useAuth()
  const orgId = organization?.id
  const openMember = useOpenMember()

  const today = new Date().toISOString().slice(0, 10)
  const isoDay = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1

  const formatTime = (v: string | null | undefined) => {
    if (!v) return ""
    const parts = v.split(":")
    return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : v
  }

  const { data: todayCheckins = [] } = useQuery({
    queryKey: ["display-checkins", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("attendance")
        .select("id, check_in, members!inner(id, first_name, last_name)")
        .eq("organization_id", orgId)
        .gte("check_in", today)
        .order("check_in", { ascending: false })
        .limit(8)
      return (data ?? []).map((r: any) => ({
        id: r.id,
        memberId: r.members?.id ?? "",
        name: `${r.members?.first_name ?? ""} ${r.members?.last_name ?? ""}`,
        time: r.check_in ? new Date(r.check_in).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "",
        type: "check-in" as const,
      }))
    },
    enabled: !!orgId,
  })

  const { data: todayClasses = [] } = useQuery({
    queryKey: ["display-classes", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("classes")
        .select("id, name, start_time, end_time, max_capacity, staff!inner(first_name, last_name)")
        .eq("organization_id", orgId)
        .eq("recurring", true)
        .eq("day_of_week", isoDay)
        .order("start_time")
        .limit(10)
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        time: `${formatTime(r.start_time)} - ${formatTime(r.end_time)}`,
        coach: `${r.staff?.first_name ?? ""} ${r.staff?.last_name ?? ""}`,
        enrolled: 0,
        capacity: r.max_capacity ?? 0,
      }))
    },
    enabled: !!orgId,
  })

  const { data: counts } = useQuery({
    queryKey: ["display-counts", orgId],
    queryFn: async () => {
      if (!orgId) return { checkins: 0, members: 0, classes: 0, active: 0 }
      const { count: checkins } = await supabase.from("attendance").select("*", { count: "exact", head: true }).eq("organization_id", orgId).gte("check_in", today)
      const { count: members } = await supabase.from("members").select("*", { count: "exact", head: true }).eq("organization_id", orgId)
      const { count: classes } = await supabase.from("classes").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("recurring", true).eq("day_of_week", isoDay)
      const { count: active } = await supabase.from("members").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active")
      return { checkins: checkins ?? 0, members: members ?? 0, classes: classes ?? 0, active: active ?? 0 }
    },
    enabled: !!orgId,
  })

  const { exportCsv } = useExportCsv(
    todayCheckins.map((r: { id: string; name: string; time: string; type: "check-in" }) => ({ name: r.name, time: r.time, type: r.type })),
    'checkins-today',
    [
      { key: 'name', label: t('common.name') || 'Name' },
      { key: 'time', label: t('display.time') || 'Time' },
      { key: 'type', label: t('display.type') || 'Type' },
    ]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 px-2">
        <h1 className="text-lg font-semibold">{t("display.title") || "Display"}</h1>
        <Button variant="outline" size="sm" onClick={() => exportCsv()}>
          <Download className="mr-2 h-4 w-4" />
          {t("common.export") || "Export"}
        </Button>
      </div>
      <div className="flex-1 grid grid-cols-3 gap-6 overflow-hidden">
        <div className="col-span-2 flex flex-col gap-6 overflow-hidden">
          <div className="grid grid-cols-4 gap-4">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 text-center">
                <Users className="h-8 w-8 mx-auto mb-1 text-primary" />
                <div className="text-3xl font-bold">{counts?.checkins ?? 0}</div>
                <div className="text-sm text-muted-foreground">{t("display.todayCheckins")}</div>
              </CardContent>
            </Card>
            <Card className="bg-success/5 border-success/20">
              <CardContent className="p-4 text-center">
                <UserCheck className="h-8 w-8 mx-auto mb-1 text-success" />
                <div className="text-3xl font-bold">{counts?.active ?? 0}</div>
                <div className="text-sm text-muted-foreground">{t("display.activeMembers")}</div>
              </CardContent>
            </Card>
            <Card className="bg-warning/5 border-warning/20">
              <CardContent className="p-4 text-center">
                <Calendar className="h-8 w-8 mx-auto mb-1 text-warning" />
                <div className="text-3xl font-bold">{counts?.classes ?? 0}</div>
                <div className="text-sm text-muted-foreground">{t("display.todayClasses")}</div>
              </CardContent>
            </Card>
            <Card className="bg-destructive/5 border-destructive/20">
              <CardContent className="p-4 text-center">
                <Users className="h-8 w-8 mx-auto mb-1 text-destructive" />
                <div className="text-3xl font-bold">{counts?.members ?? 0}</div>
                <div className="text-sm text-muted-foreground">{t("display.totalMembers")}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="flex-1">
            <CardContent className="p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                {t("display.recentActivity")}
              </h2>
              <div className="space-y-3">
                {todayCheckins.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">{t("common.noData")}</p>
                ) : todayCheckins.map((r: { id: string; memberId: string; name: string; time: string; type: "check-in" }) => (
                  <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{getInitials(r.name.split(" ")[0] ?? "", r.name.split(" ")[1] ?? "")}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => openMember(r.memberId)}
                        title="Ouvrir la fiche adhérent"
                        className="font-medium text-sm truncate text-left w-full cursor-pointer hover:text-primary hover:underline transition-colors"
                      >
                        {r.name}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {r.type === "check-in" ? t("display.checkedIn") : t("display.attending")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {r.time}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      <LogIn className="h-3 w-3 mr-1" />
                      {r.type === "check-in" ? t("display.checkin") : t("display.class")}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6 overflow-hidden">
          <Card>
            <CardContent className="p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                {t("display.todaySchedule")}
              </h2>
              <div className="space-y-3">
                {todayClasses.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">{t("common.noData")}</p>
                ) : todayClasses.map((c: { id: string; name: string; time: string; coach: string; enrolled: number; capacity: number }) => (
                  <div key={c.id} className="p-3 rounded-lg bg-muted/30 border">
                    <p className="font-medium text-sm">{c.name}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {c.time}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <Badge variant="secondary" className="text-xs">{c.coach}</Badge>
                      <span className="text-xs text-muted-foreground">{c.enrolled}/{c.capacity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
