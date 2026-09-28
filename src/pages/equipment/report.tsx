import { useState, useMemo } from "react"
import { useQuery } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useAuth } from "@/stores/auth"
import { useT } from "@/i18n"
import { useToast } from "@/components/ui/toast"
import { format, startOfMonth, endOfMonth } from "date-fns"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNavigate, useLocation } from "react-router-dom"
import { Loader2, Download } from "lucide-react"
import { downloadWorkbook } from "@/lib/exportWorkbook"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"

import { toUpper } from "../../lib/utils"
import type { Equipment, EquipmentReservation } from "@/types/supabase"

const TABS = [
  { value: "list", label: "Equipment", path: "/equipment" },
  { value: "reservations", label: "Reservations", path: "/equipment/reservations" },
  { value: "report", label: "Report", path: "/equipment/report" },
]

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#FF6384"]

export default function ReportPage() {
  const supabase = useSupabase()
  const { organization } = useAuth()
  const t = useT()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const orgId = organization?.id

  const today = new Date()
  const [startDate, setStartDate] = useState(format(startOfMonth(today), "yyyy-MM-dd"))
  const [endDate, setEndDate] = useState(format(endOfMonth(today), "yyyy-MM-dd"))

  const { data: equipmentList } = useQuery({
    queryKey: ["equipment", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase.from("equipment").select("*").eq("organization_id", orgId).order("name")
      return data ?? []
    },
    enabled: !!orgId,
  })

  const { data: reservations, isLoading } = useQuery({
    queryKey: ["equipment_reservations_report", startDate, endDate, orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("equipment_reservations")
        .select("*")
        .eq("organization_id", orgId)
        .gte("start_time", startDate)
        .lte("start_time", `${endDate}T23:59:59`)
        .order("created_at", { ascending: false })
      return data ?? []
    },
    enabled: !!orgId,
  })

  const equipmentMap = useMemo(() => {
    const map = new Map<string, Equipment>()
    equipmentList?.forEach((e: Equipment) => map.set(e.id, e))
    return map
  }, [equipmentList])

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>()
    equipmentList?.forEach((e: Equipment) => {
      const cat = e.category || "other"
      counts.set(cat, (counts.get(cat) || 0) + 1)
    })
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }))
  }, [equipmentList])

  const usageData = useMemo(() => {
    const counts = new Map<string, number>()
    reservations?.forEach((r: EquipmentReservation) => {
      const equip = equipmentMap.get(r.equipment_id)
      const name = equip?.name || "Unknown"
      counts.set(name, (counts.get(name) || 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [reservations, equipmentMap])

  async function exportToExcel() {
    try {
      const ExcelJS = await import("exceljs")
      const wb = new ExcelJS.default.Workbook()
      const ws = wb.addWorksheet("Equipment Report")
      ws.columns = [
        { header: "Equipment Name", key: "name", width: 30 },
        { header: "Usage Count", key: "count", width: 15 },
      ]
      usageData.forEach((d) => {
        ws.addRow({ name: d.name, count: d.count })
      })
      await downloadWorkbook(wb, `equipment-report-${startDate}-to-${endDate}`)
    } catch (err) {
      toast({ title: "Erreur", description: String(err), variant: "destructive" })
    }
  }

  const currentTab = TABS.find(t => t.path === location.pathname)?.value ?? "report"

  return (
    <div>
      <PageHeader
        title={t("report.title") || "Rapport équipement"}
        description={t("report.description") || "Statistiques d'utilisation des équipements"}
        actions={
          <Button onClick={exportToExcel} variant="outline">
            <Download className="mr-2 h-4 w-4" /> {t("report.export") || "Export to Excel"}
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

      <div className="flex gap-4 mb-6 items-end">
        <div>
          <label className="text-sm font-medium mb-1 block">{t("report.startDate") || "Start Date"}</label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">{t("report.endDate") || "End Date"}</label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("report.usageByCategory") || "Equipment by Category"}</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine
                      label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      dataKey="value"
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("report.mostReserved") || "Most Reserved Equipment"}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("report.equipment") || "Equipment"}</TableHead>
                    <TableHead className="text-right">{t("report.usageCount") || "Usage Count"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageData.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center py-8 text-muted-foreground">{t("report.noData") || "No reservations found"}</TableCell></TableRow>
                  ) : (
                    usageData.map((item, i) => (
                      <TableRow key={item.name}>
                        <TableCell className="font-medium">
                          <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          {toUpper(item.name)}
                        </TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
