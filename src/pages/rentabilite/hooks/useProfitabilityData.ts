import { useMemo } from "react"
import { useQuery } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import type { ProfitabilityData, ProfitabilityFilters, ProfitabilityItem } from "./types"
import { buildSubscriptionKeys, isDuplicateSubscriptionPos } from "@/lib/ledger-dedupe"

function safeNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

const INVESTMENT_CATEGORIES: Record<string, string> = {
  produits: "Produits",
  materiel: "Matériel",
  travaux: "Travaux",
  amenagement: "Aménagement",
  logiciels: "Logiciels",
  marketing: "Marketing",
  publicite: "Publicité",
  formation: "Formation",
  consommables: "Consommables",
  autres: "Autres",
}

const SOURCE_COLORS: Record<string, string> = {
  subscriptions: "#3b82f6",
  pos: "#10b981",
  other: "#8b5cf6",
}

type RawPayment = {
  id: string
  amount: number
  payment_date: string
  payment_method: string
  member_id: string | null
  members: { first_name: string; last_name: string } | null
}

type RawPosTransaction = {
  id: string
  total: number
  created_at: string
  payment_method: string
  member_id: string | null
  items: unknown
  members: { first_name: string; last_name: string } | null
}

type RawExpense = {
  id: string
  organization_id: string
  category: string
  description: string
  amount: number
  expense_date: string
}

type RawInvestment = {
  id: string
  organization_id: string
  category: string
  description: string
  amount: number
  investment_date: string
}

type RawProduct = {
  id: string
  name: string
  price: number
  cost: number | null
  stock: number | null
  category: string | null
}

type RawEquipment = {
  id: string
  name: string
  purchase_price: number | null
  purchase_date: string | null
}

type RawSubscription = {
  id: string
  total_amount: number
  amount_paid: number
  status: string
  subscription_type_id: string
  members: { first_name: string; last_name: string } | null
  subscription_types: { name: string; price: number } | null
}

type RawSalaryPayment = {
  id: string
  amount: number
  payment_date: string
  staff_id: string
  staff: { first_name: string; last_name: string } | null
}

type RawEnrollment = {
  id: string
  class_id: string
  status: string
  classes: { name: string } | null
}

type RawObjective = {
  id: string
  organization_id: string
  period_type: string
  period_label: string
  revenue_target: number
  profit_target: number
  investment_budget: number
  member_target: number
}

export function useProfitabilityData(
  orgId: string | undefined,
  filters: ProfitabilityFilters
): ProfitabilityData {
  const db = useSupabase()

  const { data: paymentsData } = useQuery({
    queryKey: ["profitability", "payments", orgId, filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      const { data, error } = await db
        .from("payments")
        .select("id, amount, payment_date, payment_method, member_id, members(first_name, last_name)")
        .eq("organization_id", orgId!)
        .eq("status", "completed")
        .gte("payment_date", filters.dateFrom)
        .lte("payment_date", filters.dateTo)
      if (error) throw error
      return (data ?? []) as unknown as RawPayment[]
    },
    enabled: !!orgId,
  })

  const { data: posData } = useQuery({
    queryKey: ["profitability", "pos", orgId, filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      const { data, error } = await db
        .from("pos_transactions")
        .select("id, total, created_at, payment_method, member_id, items, members(first_name, last_name)")
        .eq("organization_id", orgId!)
        .eq("payment_status", "completed")
        .gte("created_at", filters.dateFrom)
        .lte("created_at", filters.dateTo)
      if (error) throw error
      return (data ?? []) as unknown as RawPosTransaction[]
    },
    enabled: !!orgId,
  })

  const { data: expensesData } = useQuery({
    queryKey: ["profitability", "expenses", orgId, filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      const { data, error } = await db
        .from("expenses")
        .select("*")
        .eq("organization_id", orgId!)
        .gte("expense_date", filters.dateFrom)
        .lte("expense_date", filters.dateTo)
      if (error) throw error
      return (data ?? []) as unknown as RawExpense[]
    },
    enabled: !!orgId,
  })

  const { data: investmentsData } = useQuery({
    queryKey: ["profitability", "investments", orgId, filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      const { data, error } = await db
        .from("investments")
        .select("*")
        .eq("organization_id", orgId!)
        .gte("investment_date", filters.dateFrom)
        .lte("investment_date", filters.dateTo)
      if (error) throw error
      return (data ?? []) as unknown as RawInvestment[]
    },
    enabled: !!orgId,
  })

  const { data: productsData } = useQuery({
    queryKey: ["profitability", "products", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("products")
        .select("id, name, price, cost, stock, category")
        .eq("organization_id", orgId!)
      if (error) throw error
      return (data ?? []) as unknown as RawProduct[]
    },
    enabled: !!orgId,
  })

  const { data: equipmentData } = useQuery({
    queryKey: ["profitability", "equipment", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("equipment")
        .select("id, name, purchase_price, purchase_date")
        .eq("organization_id", orgId!)
      if (error) throw error
      return (data ?? []) as unknown as RawEquipment[]
    },
    enabled: !!orgId,
  })

  const { data: subscriptionsData } = useQuery({
    queryKey: ["profitability", "subscriptions", orgId, filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      const { data, error } = await db
        .from("member_subscriptions")
        .select(
          "id, total_amount, amount_paid, status, subscription_type_id, members(first_name, last_name), subscription_types(name, price)"
        )
        .eq("organization_id", orgId!)
        .gte("created_at", filters.dateFrom)
        .lte("created_at", filters.dateTo)
      if (error) throw error
      return (data ?? []) as unknown as RawSubscription[]
    },
    enabled: !!orgId,
  })

  const { data: salaryPaymentsData } = useQuery({
    queryKey: ["profitability", "salaryPayments", orgId, filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      const { data, error } = await db
        .from("staff_salary_payments")
        .select("id, amount, payment_date, staff_id, staff(first_name, last_name)")
        .eq("organization_id", orgId!)
        .gte("payment_date", filters.dateFrom)
        .lte("payment_date", filters.dateTo)
      if (error) throw error
      return (data ?? []) as unknown as RawSalaryPayment[]
    },
    enabled: !!orgId,
  })

  const { data: enrollmentsData } = useQuery({
    queryKey: ["profitability", "enrollments", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("class_enrollments")
        .select("id, class_id, status, classes!inner(name, organization_id)")
        .eq("classes.organization_id", orgId!)
      if (error) throw error
      return (data ?? []) as unknown as RawEnrollment[]
    },
    enabled: !!orgId,
  })

  const { data: objectivesData } = useQuery({
    queryKey: ["profitability", "objectives", orgId, filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      const { data, error } = await db
        .from("profitability_objectives")
        .select("*")
        .eq("organization_id", orgId!)
      if (error) throw error
      return (data ?? []) as unknown as RawObjective[]
    },
    enabled: !!orgId,
  })

  const payments = paymentsData ?? []
  const posTransactions = posData ?? []
  const expenses = expensesData ?? []
  const investments = investmentsData ?? []
  const products = productsData ?? []
  const equipment = equipmentData ?? []
  const subscriptions = subscriptionsData ?? []
  const salaryPayments = salaryPaymentsData ?? []
  const enrollments = enrollmentsData ?? []
  const objectives = objectivesData ?? []

  const isLoading = useMemo(
    () =>
      paymentsData === undefined ||
      posData === undefined ||
      expensesData === undefined ||
      investmentsData === undefined,
    [paymentsData, posData, expensesData, investmentsData]
  )

  const computed = useMemo(() => {
    const subscriptionRevenue = payments.reduce((s: number, p: RawPayment) => s + safeNum(p.amount), 0)

    // Dédoublonnage : les abonnements/renouvellements réglés au POS sont déjà
    // enregistrés dans `payments` — on retire les ventes POS virtuelles doublons.
    const posKeys = buildSubscriptionKeys(payments.map((p: RawPayment) => ({
      memberId: p.member_id ?? null,
      amount: safeNum(p.amount),
      date: p.payment_date,
    })))
    const filteredPosTransactions = posTransactions.filter((t: RawPosTransaction) =>
      !isDuplicateSubscriptionPos({
        memberId: t.member_id ?? null,
        amount: safeNum(t.total),
        date: t.created_at,
        items: t.items,
      }, posKeys)
    )

    const posRevenue = filteredPosTransactions.reduce((s: number, t: RawPosTransaction) => s + safeNum(t.total), 0)

    const otherRevenue = 0
    const totalRevenue = subscriptionRevenue + posRevenue + otherRevenue

    const posCostFromProducts = posTransactions.reduce((s: number, t: RawPosTransaction) => {
      const items = Array.isArray(t.items) ? t.items : []
      return items.reduce((is2: number, item: unknown) => {
        if (typeof item !== "object" || item === null) return is2
        const obj = item as Record<string, unknown>
        if (typeof obj.id === "string" && obj.id.startsWith("__subscription__")) return is2
        const productId = typeof obj.productId === "string" ? obj.productId : null
        const qty = safeNum(obj.quantity ?? obj.qty)
        if (productId) {
          const product = products.find((p: RawProduct) => p.id === productId)
          if (product && product.cost != null) {
            return is2 + safeNum(product.cost) * qty
          }
        }
        return is2
      }, s)
    }, 0)

    const costOfSales = posCostFromProducts > 0 ? posCostFromProducts : totalRevenue * 0.4
    const grossProfit = totalRevenue - costOfSales
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

    const nonSalaryExpenses = expenses.filter((e: RawExpense) => e.category !== 'salaries')
    const expenseTotal = nonSalaryExpenses.reduce((s: number, e: RawExpense) => s + safeNum(e.amount), 0)
    const salaryTotal = salaryPayments.reduce((s: number, sp: RawSalaryPayment) => s + safeNum(sp.amount), 0)
    const totalExpenses = expenseTotal + salaryTotal

    const netProfit = totalRevenue - totalExpenses
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

    const investmentsByCategoryMap: Record<string, number> = {}
    for (const cat of Object.keys(INVESTMENT_CATEGORIES)) {
      investmentsByCategoryMap[cat] = 0
    }
    for (const inv of investments) {
      const cat = inv.category || "autres"
      investmentsByCategoryMap[cat] = (investmentsByCategoryMap[cat] || 0) + safeNum(inv.amount)
    }
    const equipmentTotal = equipment.reduce((s: number, e: RawEquipment) => s + safeNum(e.purchase_price), 0)
    investmentsByCategoryMap["materiel"] = (investmentsByCategoryMap["materiel"] || 0) + equipmentTotal

    const totalInvestment = Object.values(investmentsByCategoryMap).reduce((s, v) => s + v, 0)

    const investmentsByCategory = Object.entries(investmentsByCategoryMap)
      .map(([cat, amount]) => ({
        category: cat,
        label: INVESTMENT_CATEGORIES[cat] || cat,
        amount,
        percentage: totalInvestment > 0 ? (amount / totalInvestment) * 100 : 0,
      }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)

    const revenueBySource = [
      {
        source: "subscriptions",
        label: "Abonnements",
        amount: subscriptionRevenue,
        count: payments.length,
        percentage: totalRevenue > 0 ? (subscriptionRevenue / totalRevenue) * 100 : 0,
        color: SOURCE_COLORS.subscriptions,
      },
      {
        source: "pos",
        label: "Point de Vente",
        amount: posRevenue,
        count: filteredPosTransactions.length,
        percentage: totalRevenue > 0 ? (posRevenue / totalRevenue) * 100 : 0,
        color: SOURCE_COLORS.pos,
      },
      {
        source: "other",
        label: "Autres",
        amount: otherRevenue,
        count: 0,
        percentage: totalRevenue > 0 ? (otherRevenue / totalRevenue) * 100 : 0,
        color: SOURCE_COLORS.other,
      },
    ]

    const roiData = investmentsByCategory.map((inv) => {
      const returnAmount = totalInvestment > 0 ? (totalRevenue / totalInvestment) * inv.amount : 0
      const roi = inv.amount > 0 ? ((returnAmount - inv.amount) / inv.amount) * 100 : 0
      const monthlyRevenue = totalRevenue / 12
      const monthsToRecoup = monthlyRevenue > 0 ? inv.amount / monthlyRevenue : 0
      return {
        category: inv.category,
        label: inv.label,
        invested: inv.amount,
        returnAmount,
        roi,
        monthsToRecoup,
      }
    })

    const profitabilityByProduct: ProfitabilityItem[] = products.map((prod: RawProduct) => {
      const productPosCount = posTransactions.reduce((count: number, t: RawPosTransaction) => {
        const items = Array.isArray(t.items) ? t.items : []
        return (
          count +
          items.reduce((ic: number, item: unknown) => {
            if (typeof item !== "object" || item === null) return ic
            const obj = item as Record<string, unknown>
            if (obj.productId === prod.id) return ic + safeNum(obj.quantity ?? obj.qty)
            return ic
          }, 0)
        )
      }, 0)
      const revenue = productPosCount * safeNum(prod.price)
      const cost = productPosCount * safeNum(prod.cost)
      const profit = revenue - cost
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0
      return {
        label: prod.name,
        revenue,
        cost,
        profit,
        margin,
        trend: "stable" as const,
      }
    })

    const profitabilityByCategory: ProfitabilityItem[] = (() => {
      const catMap: Record<string, { revenue: number; cost: number }> = {}
      for (const prod of products) {
        const cat = prod.category || "Autres"
        if (!catMap[cat]) catMap[cat] = { revenue: 0, cost: 0 }
        const qty = posTransactions.reduce((count: number, t: RawPosTransaction) => {
          const items = Array.isArray(t.items) ? t.items : []
          return (
            count +
            items.reduce((ic: number, item: unknown) => {
              if (typeof item !== "object" || item === null) return ic
              const obj = item as Record<string, unknown>
              if (obj.productId === prod.id) return ic + safeNum(obj.quantity ?? obj.qty)
              return ic
            }, 0)
          )
        }, 0)
        catMap[cat].revenue += qty * safeNum(prod.price)
        catMap[cat].cost += qty * safeNum(prod.cost)
      }
      return Object.entries(catMap).map(([name, data]) => ({
        label: name,
        revenue: data.revenue,
        cost: data.cost,
        profit: data.revenue - data.cost,
        margin: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : 0,
        trend: "stable" as const,
      }))
    })()

    const profitabilityBySubscription: ProfitabilityItem[] = (() => {
      const subMap: Record<string, { revenue: number; count: number; prevRevenue: number }> = {}
      for (const sub of subscriptions) {
        const name = sub.subscription_types?.name || "Inconnu"
        if (!subMap[name]) subMap[name] = { revenue: 0, count: 0, prevRevenue: 0 }
        subMap[name].revenue += safeNum(sub.amount_paid)
        subMap[name].count++
      }
      return Object.entries(subMap).map(([name, data]) => {
        const revenue = data.revenue
        const cost = revenue * 0.4
        const profit = revenue - cost
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0
        return {
          label: name,
          revenue,
          cost,
          profit,
          margin,
          trend: "stable" as const,
        }
      })
    })()

    const profitabilityByCoach: ProfitabilityItem[] = []

    const getMonthLabel = (dateStr: string): string => {
      const d = new Date(dateStr)
      return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
    }

    const profitabilityByMonth: ProfitabilityItem[] = (() => {
      const monthMap: Record<string, { revenue: number; expense: number }> = {}
      for (const p of payments) {
        const key = getMonthLabel(p.payment_date)
        if (!monthMap[key]) monthMap[key] = { revenue: 0, expense: 0 }
        monthMap[key].revenue += safeNum(p.amount)
      }
      for (const t of filteredPosTransactions) {
        const key = getMonthLabel(t.created_at)
        if (!monthMap[key]) monthMap[key] = { revenue: 0, expense: 0 }
        const items = Array.isArray(t.items) ? t.items : []
        const hasSub = items.some(
          (it: unknown) =>
            typeof it === "object" &&
            it !== null &&
            "id" in it &&
            typeof (it as Record<string, unknown>).id === "string" &&
            (it as any).id.startsWith("__subscription__")
        )
        if (!hasSub) monthMap[key].revenue += safeNum(t.total)
      }
      for (const e of expenses) {
        const key = getMonthLabel(e.expense_date)
        if (!monthMap[key]) monthMap[key] = { revenue: 0, expense: 0 }
        monthMap[key].expense += safeNum(e.amount)
      }
      for (const sp of salaryPayments) {
        const key = getMonthLabel(sp.payment_date)
        if (!monthMap[key]) monthMap[key] = { revenue: 0, expense: 0 }
        monthMap[key].expense += safeNum(sp.amount)
      }
      return Object.entries(monthMap).map(([label, data]) => ({
        label,
        revenue: data.revenue,
        cost: data.expense,
        profit: data.revenue - data.expense,
        margin: data.revenue > 0 ? ((data.revenue - data.expense) / data.revenue) * 100 : 0,
        trend: "stable" as const,
      }))
    })()

    const profitabilityByYear: ProfitabilityItem[] = (() => {
      const yearMap: Record<string, { revenue: number; expense: number }> = {}
      for (const p of payments) {
        const key = String(new Date(p.payment_date).getFullYear())
        if (!yearMap[key]) yearMap[key] = { revenue: 0, expense: 0 }
        yearMap[key].revenue += safeNum(p.amount)
      }
      for (const t of filteredPosTransactions) {
        const key = String(new Date(t.created_at).getFullYear())
        if (!yearMap[key]) yearMap[key] = { revenue: 0, expense: 0 }
        const items = Array.isArray(t.items) ? t.items : []
        const hasSub = items.some(
          (it: unknown) =>
            typeof it === "object" &&
            it !== null &&
            "id" in it &&
            typeof (it as Record<string, unknown>).id === "string" &&
            (it as any).id.startsWith("__subscription__")
        )
        if (!hasSub) yearMap[key].revenue += safeNum(t.total)
      }
      for (const e of expenses) {
        const key = String(new Date(e.expense_date).getFullYear())
        if (!yearMap[key]) yearMap[key] = { revenue: 0, expense: 0 }
        yearMap[key].expense += safeNum(e.amount)
      }
      for (const sp of salaryPayments) {
        const key = String(new Date(sp.payment_date).getFullYear())
        if (!yearMap[key]) yearMap[key] = { revenue: 0, expense: 0 }
        yearMap[key].expense += safeNum(sp.amount)
      }
      return Object.entries(yearMap).map(([label, data]) => ({
        label,
        revenue: data.revenue,
        cost: data.expense,
        profit: data.revenue - data.expense,
        margin: data.revenue > 0 ? ((data.revenue - data.expense) / data.revenue) * 100 : 0,
        trend: "stable" as const,
      }))
    })()

    const monthlyRevenue: { label: string; value: number }[] = (() => {
      const now = new Date()
      const result: { label: string; value: number }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
        let total = 0
        for (const p of payments) {
          if (p.payment_date.startsWith(key)) total += safeNum(p.amount)
        }
        for (const t of posTransactions) {
          if (t.created_at.startsWith(key)) {
            const items = Array.isArray(t.items) ? t.items : []
            const hasSub = items.some(
              (it: unknown) =>
                typeof it === "object" &&
                it !== null &&
                "id" in it &&
                typeof (it as Record<string, unknown>).id === "string" &&
                (it as any).id.startsWith("__subscription__")
            )
            if (!hasSub) total += safeNum(t.total)
          }
        }
        result.push({ label, value: total })
      }
      return result
    })()

    const monthlyExpenses: { label: string; value: number }[] = (() => {
      const now = new Date()
      const result: { label: string; value: number }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
        let total = 0
        for (const e of expenses) {
          if (e.expense_date.startsWith(key)) total += safeNum(e.amount)
        }
        for (const sp of salaryPayments) {
          if (sp.payment_date.startsWith(key)) total += safeNum(sp.amount)
        }
        result.push({ label, value: total })
      }
      return result
    })()

    const monthlyProfit: { label: string; value: number }[] = monthlyRevenue.map((r, i) => ({
      label: r.label,
      value: r.value - (monthlyExpenses[i]?.value ?? 0),
    }))

    const last3Revenue = monthlyRevenue.slice(-3)
    const last3Expenses = monthlyExpenses.slice(-3)
    const last3Profit = monthlyProfit.slice(-3)

    const avgRevenue = last3Revenue.length > 0 ? last3Revenue.reduce((s, v) => s + v.value, 0) / last3Revenue.length : 0
    const avgExpenses = last3Expenses.length > 0 ? last3Expenses.reduce((s, v) => s + v.value, 0) / last3Expenses.length : 0
    const avgProfit = last3Profit.length > 0 ? last3Profit.reduce((s, v) => s + v.value, 0) / last3Profit.length : 0

    const activeSubscriptions = subscriptions.filter((s: RawSubscription) => s.status === "active").length
    const avgActiveSubs = activeSubscriptions

    const forecasts = {
      revenueForecast: avgRevenue * 1.05,
      profitForecast: avgProfit * 1.03,
      expenseForecast: avgExpenses * 1.02,
      stockDays: 42,
      cashFlowForecast: avgRevenue * 1.05 - avgExpenses * 1.02,
      renewalForecast: avgActiveSubs * 0.85,
      confidence: 75,
    }

    const matchedObjective = objectives.find(
      (o: RawObjective) => o.period_type === filters.period && o.period_label === filters.dateFrom
    )

    const objectivesList = [
      {
        metric: "revenue_target",
        label: "Chiffre d'affaires",
        target: matchedObjective?.revenue_target ?? totalRevenue * 1.2,
        actual: totalRevenue,
        progress: totalRevenue > 0 ? Math.min((totalRevenue / (matchedObjective?.revenue_target ?? totalRevenue * 1.2)) * 100, 100) : 0,
        forecast: forecasts.revenueForecast,
        status: totalRevenue >= (matchedObjective?.revenue_target ?? totalRevenue * 1.2) * 0.85 ? ("on_track" as const) : totalRevenue >= (matchedObjective?.revenue_target ?? totalRevenue * 1.2) * 0.65 ? ("at_risk" as const) : ("behind" as const),
      },
      {
        metric: "profit_target",
        label: "Bénéfice net",
        target: matchedObjective?.profit_target ?? netProfit * 1.15,
        actual: netProfit,
        progress: netProfit > 0 ? Math.min((netProfit / (matchedObjective?.profit_target ?? netProfit * 1.15)) * 100, 100) : 0,
        forecast: forecasts.profitForecast,
        status: netProfit >= (matchedObjective?.profit_target ?? netProfit * 1.15) * 0.85 ? ("on_track" as const) : netProfit >= (matchedObjective?.profit_target ?? netProfit * 1.15) * 0.65 ? ("at_risk" as const) : ("behind" as const),
      },
      {
        metric: "investment_budget",
        label: "Budget investissement",
        target: matchedObjective?.investment_budget ?? totalInvestment * 1.1,
        actual: totalInvestment,
        progress: totalInvestment > 0 ? Math.min((totalInvestment / (matchedObjective?.investment_budget ?? totalInvestment * 1.1)) * 100, 100) : 0,
        forecast: totalInvestment * 1.1,
        status: totalInvestment <= (matchedObjective?.investment_budget ?? totalInvestment * 1.1) ? ("on_track" as const) : ("at_risk" as const),
      },
      {
        metric: "member_target",
        label: "Nombre de membres",
        target: matchedObjective?.member_target ?? subscriptions.length * 1.1,
        actual: subscriptions.length,
        progress: subscriptions.length > 0 ? Math.min((subscriptions.length / (matchedObjective?.member_target ?? subscriptions.length * 1.1)) * 100, 100) : 0,
        forecast: forecasts.renewalForecast,
        status: subscriptions.length >= (matchedObjective?.member_target ?? subscriptions.length * 1.1) * 0.85 ? ("on_track" as const) : subscriptions.length >= (matchedObjective?.member_target ?? subscriptions.length * 1.1) * 0.65 ? ("at_risk" as const) : ("behind" as const),
      },
    ]

    const insights: ProfitabilityItem["trend"][] = []

    const aiInsights: { type: "positive" | "negative" | "neutral" | "warning"; message: string; action?: string }[] = []

    if (netProfit < 0) {
      aiInsights.push({
        type: "negative",
        message: `Bénéfice négatif de ${Math.abs(netProfit).toLocaleString("fr-DZ")} DA. Les dépenses dépassent les revenus.`,
        action: "Réduire les charges opérationnelles ou augmenter le chiffre d'affaires",
      })
    }

    if (grossMargin > 60) {
      aiInsights.push({
        type: "positive",
        message: `Bonne marge brute à ${grossMargin.toFixed(1)}%. La structure des coûts est maîtrisée.`,
      })
    } else if (grossMargin > 0) {
      aiInsights.push({
        type: "neutral",
        message: `Marge brute de ${grossMargin.toFixed(1)}%. Potentiel d'amélioration sur les coûts d'approvisionnement.`,
      })
    }

    if (totalExpenses > totalRevenue * 0.8 && totalRevenue > 0) {
      aiInsights.push({
        type: "warning",
        message: `Les dépenses représentent ${((totalExpenses / totalRevenue) * 100).toFixed(0)}% du chiffre d'affaires.`,
        action: "Identifier les postes de dépenses les plus élevés pour optimisation",
      })
    }

    if (subscriptionRevenue > posRevenue) {
      aiInsights.push({
        type: "neutral",
        message: "Les abonnements dominent le chiffre d'affaires. Le revenu récurrent est le moteur principal.",
      })
    } else if (posRevenue > subscriptionRevenue) {
      aiInsights.push({
        type: "neutral",
        message: "Les ventes au comptoir dépassent les abonnements. Diversification du revenu.",
      })
    }

    const bestRoi = roiData.find((r) => r.roi > 100)
    if (bestRoi) {
      aiInsights.push({
        type: "positive",
        message: `Bon retour sur investissement pour "${bestRoi.label}" (${bestRoi.roi.toFixed(0)}%).`,
      })
    }

    aiInsights.push({
      type: netProfit > 0 ? "positive" : "warning",
      message: `Trésorerie prévisionnelle : ${forecasts.cashFlowForecast.toLocaleString("fr-DZ")} DA pour le prochain mois.`,
    })

    const topExpenseCat: Record<string, number> = {}
    ;(expenses as any[]).forEach((e: any) => {
      topExpenseCat[e.category] = (topExpenseCat[e.category] || 0) + safeNum(e.amount)
    })
    const sortedCats = Object.entries(topExpenseCat).sort((a, b) => b[1] - a[1])
    const highestCat = sortedCats[0]
    if (highestCat && highestCat[1] > totalRevenue * 0.2) {
      const catLabels: Record<string, string> = {
        rent: "loyer",
        salaries: "salaires",
        electricity: "électricité",
        water: "eau",
        equipment: "équipement",
        maintenance: "maintenance",
        marketing: "marketing",
        insurance: "assurance",
        taxes: "impôts",
        products: "produits",
      }
      aiInsights.push({
        type: "warning",
        message: `La catégorie "${catLabels[highestCat[0]] || highestCat[0]}" représente ${highestCat[1].toLocaleString("fr-DZ")} DA.`,
        action: `Analyser les possibilities de réduction des charges de ${catLabels[highestCat[0]] || highestCat[0]}`,
      })
    }

    if (activeSubscriptions > 0) {
      const avgPerSub = activeSubscriptions > 0 ? subscriptionRevenue / activeSubscriptions : 0
      aiInsights.push({
        type: "neutral",
        message: `Revenu moyen par abonnement actif : ${avgPerSub.toLocaleString("fr-DZ")} DA.`,
      })
    }

    if (forecasts.confidence >= 75 && forecasts.revenueForecast > totalRevenue) {
      aiInsights.push({
        type: "positive",
        message: `Prévision de croissance : +${(((forecasts.revenueForecast - totalRevenue) / (totalRevenue || 1)) * 100).toFixed(1)}% de revenus prévu.`,
      })
    }

    return {
      isLoading,
      totalRevenue,
      totalExpenses,
      totalInvestment,
      investments,
      investmentsByCategory,
      revenueBySource,
      profitData: {
        totalRevenue,
        subscriptionRevenue,
        posRevenue,
        coachingRevenue: 0,
        classRevenue: 0,
        otherRevenue,
        costOfSales,
        grossProfit,
        grossMargin,
        totalExpenses,
        netProfit,
        netMargin,
      },
      roiData,
      profitabilityByProduct,
      profitabilityByCategory,
      profitabilityBySubscription,
      profitabilityByCoach,
      profitabilityByMonth,
      profitabilityByYear,
      forecasts,
      objectives: objectivesList,
      monthlyRevenue,
      monthlyExpenses,
      monthlyProfit,
      insights: aiInsights,
    }
  }, [
    isLoading,
    payments,
    posTransactions,
    expenses,
    investments,
    products,
    equipment,
    subscriptions,
    salaryPayments,
    enrollments,
    objectives,
    filters.period,
    filters.dateFrom,
  ])

  return computed
}
