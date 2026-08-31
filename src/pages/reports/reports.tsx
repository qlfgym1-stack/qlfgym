import { PageHeader } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n"
import { useQuery } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useAuth } from "@/stores/auth"
import { useExportCsv } from "@/hooks/useExportCsv"
import { formatCurrency } from "@/lib/utils"
import { TrendingUp, Users, CalendarCheck, DollarSign, ArrowUp, ArrowDown, Loader2, Download } from "lucide-react"
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const COLORS = ["var(--primary)", "var(--success)", "var(--warning)", "var(--destructive)"]

function StatCard({ title, value, change, icon: Icon, format, loading }: { title: string; value: number; change: number; icon: React.ElementType; format?: boolean; loading?: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-24 bg-muted animate-pulse rounded" />
        ) : (
          <>
            <div className="text-2xl font-bold">{format ? formatCurrency(value) : value.toLocaleString()}</div>
            <div className={`flex items-center gap-1 text-sm mt-1 ${change >= 0 ? "text-success" : "text-destructive"}`}>
              {change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(change)}% from last month
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function ReportsPage() {
  const t = useT()
  const supabase = useSupabase()
  const { organization } = useAuth()
  const orgId = organization?.id

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

  const { data: revenueData, isLoading: revLoading } = useQuery({
    queryKey: ["reports-revenue", orgId],
    queryFn: async () => {
      if (!orgId) return [] as { month: string; revenue: number; expenses: number }[]
      const result: { month: string; revenue: number; expenses: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const start = m.toISOString()
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).toISOString()
        const { data: rev } = await supabase.from("payments").select("amount").eq("organization_id", orgId).eq("status", "completed").gte("payment_date", start).lt("payment_date", end)
        const { data: exp } = await supabase.from("expenses").select("amount").eq("organization_id", orgId).gte("expense_date", start).lt("expense_date", end)
        result.push({
          month: MONTHS[m.getMonth()],
          revenue: rev?.reduce((s, p) => s + p.amount, 0) ?? 0,
          expenses: exp?.reduce((s, e) => s + (e.amount || 0), 0) ?? 0,
        })
      }
      return result
    },
    enabled: !!orgId,
  })

  const { data: membersData } = useQuery({
    queryKey: ["reports-members", orgId],
    queryFn: async () => {
      if (!orgId) return [] as { month: string; new: number; active: number }[]
      const result: { month: string; new: number; active: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const start = m.toISOString()
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).toISOString()
        const { count: newCount } = await supabase.from("members").select("*", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", start).lt("created_at", end)
        const { count: activeCount } = await supabase.from("members").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active")
        result.push({ month: MONTHS[m.getMonth()], new: newCount ?? 0, active: activeCount ?? 0 })
      }
      return result
    },
    enabled: !!orgId,
  })

  const { data: attendanceData } = useQuery({
    queryKey: ["reports-attendance", orgId],
    queryFn: async () => {
      if (!orgId) return [] as { month: string; checkins: number; classes: number }[]
      const result: { month: string; checkins: number; classes: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const start = m.toISOString()
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).toISOString()
        const { count: checkins } = await supabase.from("attendance").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("type", "check-in").gte("check_in", start).lt("check_in", end)
        const { count: classes } = await supabase.from("attendance").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("type", "class").gte("check_in", start).lt("check_in", end)
        result.push({ month: MONTHS[m.getMonth()], checkins: checkins ?? 0, classes: classes ?? 0 })
      }
      return result
    },
    enabled: !!orgId,
  })

  const { data: subscriptionPie } = useQuery({
    queryKey: ["reports-sub-pie", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase.from("member_subscriptions").select("subscription_types!inner(name)").eq("organization_id", orgId).eq("status", "active")
      if (!data) return []
      const counts: Record<string, number> = {}
      for (const row of data as any[]) {
        const name = row.subscription_types?.name ?? "Unknown"
        counts[name] = (counts[name] ?? 0) + 1
      }
      return Object.entries(counts).map(([name, value]) => ({ name, value }))
    },
    enabled: !!orgId,
  })

  const { data: statsTotals, isLoading: statsLoading } = useQuery({
    queryKey: ["reports-stats", orgId],
    queryFn: async () => {
      if (!orgId) return null
      const thisMonth = monthStart
      const lastMonthEnd = prevMonthEnd
      const lastMonthStart = prevMonthStart

      const { data: thisRev } = await supabase.from("payments").select("amount").eq("organization_id", orgId).eq("status", "completed").gte("payment_date", thisMonth)
      const { data: lastRev } = await supabase.from("payments").select("amount").eq("organization_id", orgId).eq("status", "completed").gte("payment_date", lastMonthStart).lte("payment_date", lastMonthEnd)
      const thisRevenue = thisRev?.reduce((s, p) => s + p.amount, 0) ?? 0
      const lastRevenue = lastRev?.reduce((s, p) => s + p.amount, 0) ?? 0

      const { count: activeMembers } = await supabase.from("members").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active")

      const { count: thisCheckins } = await supabase.from("attendance").select("*", { count: "exact", head: true }).eq("organization_id", orgId).gte("check_in", thisMonth)
      const { count: lastCheckins } = await supabase.from("attendance").select("*", { count: "exact", head: true }).eq("organization_id", orgId).gte("check_in", lastMonthStart).lte("check_in", lastMonthEnd)

      return {
        revenue: thisRevenue,
        revenueChange: lastRevenue ? ((thisRevenue - lastRevenue) / lastRevenue) * 100 : 0,
        members: activeMembers ?? 0,
        membersChange: 0,
        checkins: thisCheckins ?? 0,
        checkinsChange: lastCheckins ? (((thisCheckins ?? 0) - lastCheckins) / lastCheckins) * 100 : 0,
        classes: 0,
        classesChange: 0,
      }
    },
    enabled: !!orgId,
  })

  const { exportCsv } = useExportCsv(
    (revenueData ?? []).map((r: { month: string; revenue: number; expenses: number }) => ({ month: r.month, revenue: r.revenue, expenses: r.expenses })),
    'revenue-report',
    [
      { key: 'month', label: t('reports.month') || 'Month' },
      { key: 'revenue', label: t('reports.revenue') || 'Revenue' },
      { key: 'expenses', label: t('reports.expenses') || 'Expenses' },
    ]
  )

  return (
    <div>
      <PageHeader
        title={t("reports.title")}
        description={t("reports.description")}
        actions={
          <Button variant="outline" onClick={() => exportCsv()}>
            <Download className="mr-2 h-4 w-4" />
            {t("common.export") || "Export"}
          </Button>
        }
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Revenue" value={statsTotals?.revenue ?? 0} change={statsTotals?.revenueChange ?? 0} icon={DollarSign} format loading={statsLoading} />
        <StatCard title="Active Members" value={statsTotals?.members ?? 0} change={statsTotals?.membersChange ?? 0} icon={Users} loading={statsLoading} />
        <StatCard title="Monthly Check-ins" value={statsTotals?.checkins ?? 0} change={statsTotals?.checkinsChange ?? 0} icon={CalendarCheck} loading={statsLoading} />
        <StatCard title="Class Attendance" value={statsTotals?.classes ?? 0} change={statsTotals?.classesChange ?? 0} icon={TrendingUp} loading={statsLoading} />
      </div>

      <Tabs defaultValue="revenue">
        <TabsList className="mb-6">
          <TabsTrigger value="revenue">{t("reports.revenue")}</TabsTrigger>
          <TabsTrigger value="members">{t("reports.members")}</TabsTrigger>
          <TabsTrigger value="attendance">{t("reports.attendance")}</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>{t("reports.revenueTrend")}</CardTitle></CardHeader>
              <CardContent>
                <div className="h-80">
                  {revLoading ? (
                    <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revenueData ?? []}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} name="Revenue" />
                        <Line type="monotone" dataKey="expenses" stroke="var(--destructive)" strokeWidth={2} name="Expenses" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t("reports.subscriptionBreakdown")}</CardTitle></CardHeader>
              <CardContent>
                <div className="h-80 flex items-center justify-center">
                  {(subscriptionPie ?? []).length === 0 ? (
                    <p className="text-muted-foreground">{t("common.noData")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={subscriptionPie ?? []} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label>
                          {(subscriptionPie ?? []).map((_: { name: string; value: number }, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader><CardTitle>{t("reports.memberGrowth")}</CardTitle></CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={membersData ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="new" fill="var(--primary)" name="New Members" />
                    <Bar dataKey="active" fill="var(--success)" name="Active Members" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card>
            <CardHeader><CardTitle>{t("reports.attendanceTrend")}</CardTitle></CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={attendanceData ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="checkins" stroke="var(--primary)" strokeWidth={2} name="Check-ins" />
                    <Line type="monotone" dataKey="classes" stroke="var(--warning)" strokeWidth={2} name="Classes" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
