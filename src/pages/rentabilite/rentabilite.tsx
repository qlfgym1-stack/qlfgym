import { useState, useMemo } from "react"
import { useAuth } from "@/stores/auth"
import { useT } from "@/i18n"
import { useProfitabilityData } from "./hooks/useProfitabilityData"
import KpiCards from "./components/kpi-cards"
import { RevenueSection } from "./components/revenue-section"
import { ProfitSection } from "./components/profit-section"
import { InvestmentSection } from "./components/investment-section"
import { InvestmentManager } from "./components/investment-manager"
import { ProfitabilityBreakdown } from "./components/profitability-breakdown"
import { ForecastsSection } from "./components/forecasts-section"
import { ObjectivesSection } from "./components/objectives-section"
import { ChartsSection } from "./components/charts-section"
import { AiInsights } from "./components/ai-insights"
import { Button } from "@/components/ui/button"
import { Loader2, Printer } from "lucide-react"
import { format, subMonths } from "date-fns"
import type { ProfitabilityFilters } from "./hooks/types"

const PRINT_STYLES = `
  @media print {
    .no-print { display: none !important; }
    body { background: white !important; }
    * { box-shadow: none !important; }
  }
`

export default function RentabilitePage() {
  const t = useT()
  const { organization } = useAuth()
  const orgId = organization?.id
  const today = useMemo(() => new Date(), [])

  const [period, setPeriod] = useState<ProfitabilityFilters["period"]>("monthly")
  const [dateFrom, setDateFrom] = useState(() => format(subMonths(today, 12), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(() => format(today, "yyyy-MM-dd"))

  const filters: ProfitabilityFilters = useMemo(
    () => ({ period, dateFrom, dateTo }),
    [period, dateFrom, dateTo]
  )

  const data = useProfitabilityData(orgId, filters)

  const handlePrint = () => window.print()

  const avgRoi =
    data.roiData.length > 0
      ? data.roiData.reduce((s, r) => s + r.roi, 0) / data.roiData.length
      : 0

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="h-1.5 w-full rounded-full bg-primary bg-gradient-to-r from-primary to-secondary mb-4" />
      <style>{PRINT_STYLES}</style>

      <div className="flex flex-col sm:flex-row justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("rentabilite.title")}
          </h1>
          <p className="text-muted-foreground">
            {organization?.name} · {t("rentabilite.subtitle")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          {t("assistantComptable.print")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 no-print">
        {(["monthly", "yearly", "custom"] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? "selected" : "outline"}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {t(`rentabilite.${p}`)}
          </Button>
        ))}
        {period === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm"
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm"
            />
          </div>
        )}
      </div>

      {data.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <AiInsights insights={data.insights} t={t} />

          <KpiCards
            totalRevenue={data.totalRevenue}
            netProfit={data.profitData.netProfit}
            grossMargin={data.profitData.grossMargin}
            netMargin={data.profitData.netMargin}
            roi={avgRoi}
            totalInvestment={data.totalInvestment}
            t={t}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevenueSection
              totalRevenue={data.totalRevenue}
              revenueBySource={data.revenueBySource}
              t={t}
            />
            <ProfitSection profitData={data.profitData} t={t} />
          </div>

          <InvestmentSection
            totalInvestment={data.totalInvestment}
            investmentsByCategory={data.investmentsByCategory}
            roiData={data.roiData}
            t={t}
          />

          <InvestmentManager orgId={orgId} t={t} />

          <ChartsSection
            monthlyRevenue={data.monthlyRevenue}
            monthlyExpenses={data.monthlyExpenses}
            monthlyProfit={data.monthlyProfit}
            roiData={data.roiData}
            profitabilityByProduct={data.profitabilityByProduct}
            profitabilityByCoach={data.profitabilityByCoach}
            t={t}
          />

          <ProfitabilityBreakdown
            profitabilityByProduct={data.profitabilityByProduct}
            profitabilityByCategory={data.profitabilityByCategory}
            profitabilityBySubscription={data.profitabilityBySubscription}
            profitabilityByCoach={data.profitabilityByCoach}
            profitabilityByMonth={data.profitabilityByMonth}
            profitabilityByYear={data.profitabilityByYear}
            t={t}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ForecastsSection forecasts={data.forecasts} t={t} />
            <ObjectivesSection objectives={data.objectives} t={t} />
          </div>
        </>
      )}
    </div>
  )
}
