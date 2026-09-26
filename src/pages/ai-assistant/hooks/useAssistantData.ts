import { useMemo } from "react"
import { useQuery } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import type { AssistantData, AssistantFilters } from "./types"
import type { AttendanceRow, PaymentRow, PosItem, PosTransactionRow, ProductRow, SubscriptionRow, MemberRow, ExpenseRow, SalaryPaymentRow } from "../lib/raw"
import { analyzePeakHours } from "../lib/peakHours"
import { analyzeFlagshipProducts, isVirtualItem } from "../lib/flagshipProducts"
import { analyzeSubscriptions } from "../lib/subscriptionInsights"
import { forecastRevenue, forecastAttendance } from "../lib/forecast"
import { buildRecommendations } from "../lib/recommendations"
import { buildInsights } from "../lib/insights"
import { format, subDays, subMonths } from "date-fns"

function safeNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseItems(items: unknown): PosItem[] {
  if (!Array.isArray(items)) return []
  return items.filter((it): it is PosItem => !!it && typeof it === "object").map((it) => ({
    id: String((it as PosItem).id ?? ""),
    name: String((it as PosItem).name ?? ""),
    price: safeNum((it as PosItem).price),
    quantity: safeNum((it as PosItem).quantity),
  }))
}

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

function bucketPosRevenue(tx: PosTransactionRow): number {
  let revenue = 0
  for (const item of tx.items ?? []) {
    if (isVirtualItem(item.id)) continue
    revenue += item.price * item.quantity
  }
  return revenue
}

function computePeriod(filters: AssistantFilters): { from: string; to: string } {
  const today = new Date()
  switch (filters.period) {
    case "monthly":
      return { from: format(subDays(today, 30), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") }
    case "quarterly":
      return { from: format(subDays(today, 90), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") }
    default:
      return { from: filters.dateFrom, to: filters.dateTo }
  }
}

const MOCK_ATTENDANCE: AttendanceRow[] = Array.from({ length: 240 }, (_, i) => {
  const d = new Date(Date.now() - i * 86400000)
  const hour = (8 + (i % 12)) % 24
  const checkIn = `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00.000Z`
  return { check_in: checkIn, check_out: null, type: "check-in" }
})

const MOCK_PRODUCTS: ProductRow[] = [
  { id: "p1", name: "Protéine Whey 1kg", price: 4500, cost: 2900, stock: 25, category: "Nutrition" },
  { id: "p2", name: "Shaker 600ml", price: 800, cost: 350, stock: 40, category: "Accessoires" },
  { id: "p3", name: "Gants de musculation", price: 1800, cost: 900, stock: 12, category: "Accessoires" },
  { id: "p4", name: "Boisson isotonique", price: 250, cost: 120, stock: 60, category: "Nutrition" },
  { id: "p5", name: "Corde à sauter pro", price: 1400, cost: 700, stock: 3, category: "Accessoires" },
  { id: "p6", name: "Bandages poignets", price: 600, cost: 250, stock: 50, category: "Accessoires" },
]

const MOCK_POS: PosTransactionRow[] = Array.from({ length: 90 }, (_, i) => {
  const d = new Date(Date.now() - i * 86400000)
  const items: PosItem[] = []
  if (i % 2 === 0) items.push({ id: "p1", name: "Protéine Whey 1kg", price: 4500, quantity: 1 })
  if (i % 3 === 0) items.push({ id: "p4", name: "Boisson isotonique", price: 250, quantity: 2 })
  if (i % 4 === 0) items.push({ id: "p2", name: "Shaker 600ml", price: 800, quantity: 1 })
  if (i % 5 === 0) items.push({ id: "p3", name: "Gants de musculation", price: 1800, quantity: 1 })
  if (i % 6 === 0) items.push({ id: "p6", name: "Bandages poignets", price: 600, quantity: 2 })
  const total = items.reduce((s, it) => s + it.price * it.quantity, 0)
  return { id: `mock-pos-${i}`, total, created_at: `${d.toISOString().slice(0, 10)}T10:00:00.000Z`, items }
})

const MOCK_PAYMENTS: PaymentRow[] = Array.from({ length: 120 }, (_, i) => {
  const d = new Date(Date.now() - i * 86400000 * 2)
  return { amount: 2500, payment_date: d.toISOString() }
})

const MOCK_SUBSCRIPTIONS: SubscriptionRow[] = Array.from({ length: 30 }, (_, i) => {
  const end = new Date(Date.now() + (i * 5 - 10) * 86400000)
  return {
    id: `mock-sub-${i}`,
    total_amount: 2500,
    amount_paid: 2500,
    status: i < 6 ? "active" : "expired",
    start_date: "2026-01-01",
    end_date: end.toISOString().slice(0, 10),
    member_id: `mock-m-${i}`,
    member_name: `Membre ${i}`,
    type_name: i % 2 === 0 ? "Mensuel" : "Trimestriel",
  }
})

const MOCK_MEMBERS: MemberRow[] = Array.from({ length: 60 }, (_, i) => ({
  id: `mock-m-${i}`,
  status: i % 6 === 0 ? "inactive" : "active",
  created_at: "2026-01-01T00:00:00.000Z",
  last_visit: new Date(Date.now() - (i % 10) * 86400000).toISOString(),
}))

const MOCK_EXPENSES: ExpenseRow[] = [
  { amount: 45000, expense_date: format(subDays(new Date(), 5), "yyyy-MM-dd") },
  { amount: 12000, expense_date: format(subDays(new Date(), 12), "yyyy-MM-dd") },
]

const MOCK_SALARY: SalaryPaymentRow[] = [{ amount: 60000, payment_date: format(subDays(new Date(), 8), "yyyy-MM-dd") }]

export function useAssistantData(
  orgId: string | undefined,
  filters: AssistantFilters
): AssistantData {
  const db = useSupabase()
  const { from, to } = useMemo(() => computePeriod(filters), [filters])
  const histFrom = useMemo(() => format(subMonths(new Date(to + "T00:00:00"), 11), "yyyy-MM-dd"), [to])

  const { data: attendanceData, error: attendanceError } = useQuery({
    queryKey: ["assistant", "attendance", orgId, from, to],
    queryFn: async () => {
      const { data, error } = await db
        .from("attendance")
        .select("check_in, check_out, type")
        .eq("organization_id", orgId!)
        .gte("check_in", from)
        .lte("check_in", to)
      if (error) throw error
      return (data ?? []) as unknown as AttendanceRow[]
    },
    enabled: !!orgId,
  })

  const { data: posData, error: posError } = useQuery({
    queryKey: ["assistant", "pos", orgId, histFrom, to],
    queryFn: async () => {
      const { data, error } = await db
        .from("pos_transactions")
        .select("id, total, created_at, items")
        .eq("organization_id", orgId!)
        .eq("payment_status", "completed")
        .gte("created_at", histFrom)
        .lte("created_at", to)
      if (error) throw error
      return (data ?? []).map((r: { id: string; total: number; created_at: string; items: unknown }) => ({
        id: r.id,
        total: safeNum(r.total),
        created_at: r.created_at,
        items: parseItems(r.items),
      })) as PosTransactionRow[]
    },
    enabled: !!orgId,
  })

  const { data: productsData, error: productsError } = useQuery({
    queryKey: ["assistant", "products", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("products")
        .select("id, name, price, cost, stock, category")
        .eq("organization_id", orgId!)
      if (error) throw error
      return (data ?? []) as unknown as ProductRow[]
    },
    enabled: !!orgId,
  })

  const { data: paymentsData, error: paymentsError } = useQuery({
    queryKey: ["assistant", "payments", orgId, histFrom, to],
    queryFn: async () => {
      const { data, error } = await db
        .from("payments")
        .select("amount, payment_date")
        .eq("organization_id", orgId!)
        .eq("status", "completed")
        .gte("payment_date", histFrom)
        .lte("payment_date", to)
      if (error) throw error
      return (data ?? []).map((r: { amount: number; payment_date: string }) => ({
        amount: safeNum(r.amount),
        payment_date: r.payment_date,
      })) as PaymentRow[]
    },
    enabled: !!orgId,
  })

  const { data: subscriptionsData, error: subscriptionsError } = useQuery({
    queryKey: ["assistant", "subscriptions", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("member_subscriptions")
        .select("id, total_amount, amount_paid, status, start_date, end_date, member_id, members(first_name, last_name), subscription_types(name)")
        .eq("organization_id", orgId!)
      if (error) throw error
      return (data ?? []).map((r: {
        id: string
        total_amount: number
        amount_paid: number
        status: string
        start_date: string
        end_date: string
        member_id: string
        members: { first_name: string; last_name: string } | null
        subscription_types: { name: string } | null
      }) => ({
        id: r.id,
        total_amount: safeNum(r.total_amount),
        amount_paid: safeNum(r.amount_paid),
        status: r.status,
        start_date: r.start_date,
        end_date: r.end_date,
        member_id: r.member_id,
        member_name: r.members ? `${r.members.first_name} ${r.members.last_name}` : "—",
        type_name: r.subscription_types?.name ?? "—",
      })) as SubscriptionRow[]
    },
    enabled: !!orgId,
  })

  const { data: membersData, error: membersError } = useQuery({
    queryKey: ["assistant", "members", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("members")
        .select("id, status, created_at, last_visit")
        .eq("organization_id", orgId!)
      if (error) throw error
      return (data ?? []) as unknown as MemberRow[]
    },
    enabled: !!orgId,
  })

  const { data: expensesData, error: expensesError } = useQuery({
    queryKey: ["assistant", "expenses", orgId, from, to],
    queryFn: async () => {
      const { data, error } = await db
        .from("expenses")
        .select("amount, expense_date")
        .eq("organization_id", orgId!)
        .gte("expense_date", from)
        .lte("expense_date", to)
      if (error) throw error
      return (data ?? []).map((r: { amount: number; expense_date: string }) => ({
        amount: safeNum(r.amount),
        expense_date: r.expense_date,
      })) as ExpenseRow[]
    },
    enabled: !!orgId,
  })

  const { data: salaryData, error: salaryError } = useQuery({
    queryKey: ["assistant", "salary", orgId, from, to],
    queryFn: async () => {
      const { data, error } = await db
        .from("staff_salary_payments")
        .select("amount, payment_date")
        .eq("organization_id", orgId!)
        .gte("payment_date", from)
        .lte("payment_date", to)
      if (error) throw error
      return (data ?? []).map((r: { amount: number; payment_date: string }) => ({
        amount: safeNum(r.amount),
        payment_date: r.payment_date,
      })) as SalaryPaymentRow[]
    },
    enabled: !!orgId,
  })

  const { data: staffBonusesData, error: staffBonusesError } = useQuery({
    queryKey: ["assistant", "staff-bonuses", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("staff")
        .select("bonus")
        .eq("organization_id", orgId!)
        .eq("is_active", true)
      if (error) throw error
      return (data ?? []).reduce((sum, r) => sum + safeNum((r as { bonus: number | null }).bonus), 0)
    },
    enabled: !!orgId,
  })

  const isMock = !orgId

  const attendance = attendanceData ?? (isMock ? MOCK_ATTENDANCE : [])
  const posTransactions = posData ?? (isMock ? MOCK_POS : [])
  const products = productsData ?? (isMock ? MOCK_PRODUCTS : [])
  const payments = paymentsData ?? (isMock ? MOCK_PAYMENTS : [])
  const subscriptions = subscriptionsData ?? (isMock ? MOCK_SUBSCRIPTIONS : [])
  const members = membersData ?? (isMock ? MOCK_MEMBERS : [])
  const expenses = expensesData ?? (isMock ? MOCK_EXPENSES : [])
  const salaryPayments = salaryData ?? (isMock ? MOCK_SALARY : [])
  const staffBonuses = staffBonusesData ?? 0

  const isLoading = useMemo(
    () =>
      attendanceData === undefined ||
      posData === undefined ||
      productsData === undefined ||
      paymentsData === undefined ||
      subscriptionsData === undefined ||
      membersData === undefined ||
      expensesData === undefined ||
      salaryData === undefined ||
      staffBonusesData === undefined,
    [
      attendanceData, posData, productsData, paymentsData,
      subscriptionsData, membersData, expensesData, salaryData, staffBonusesData,
    ]
  )

  const error = useMemo(
    () =>
      attendanceError ?? posError ?? productsError ?? paymentsError ?? subscriptionsError ??
      membersError ?? expensesError ?? salaryError ?? staffBonusesError ?? null,
    [
      attendanceError, posError, productsError, paymentsError, subscriptionsError,
      membersError, expensesError, salaryError, staffBonusesError,
    ]
  )

  return useMemo(() => {
    const windowPos = posTransactions.filter((tx: PosTransactionRow) => tx.created_at.slice(0, 10) >= from && tx.created_at.slice(0, 10) <= to)
    const windowPayments = payments.filter((p: PaymentRow) => p.payment_date.slice(0, 10) >= from && p.payment_date.slice(0, 10) <= to)

    const peakHours = analyzePeakHours(attendance)
    const flagship = analyzeFlagshipProducts(windowPos, products)
    const subscription = analyzeSubscriptions(subscriptions, members)

    const posRevenue = windowPos.reduce((s: number, tx: PosTransactionRow) => s + bucketPosRevenue(tx), 0)
    const subscriptionRevenue = windowPayments.reduce((s: number, p: PaymentRow) => s + p.amount, 0)
    const totalRevenue = posRevenue + subscriptionRevenue
    const totalExpenses = expenses.reduce((s: number, e: ExpenseRow) => s + e.amount, 0) + staffBonuses
    const netProfit = totalRevenue - totalExpenses

    const monthLabels: string[] = []
    const monthly: number[] = []
    for (let k = 11; k >= 0; k--) {
      const d = new Date(new Date(to + "T00:00:00").getFullYear(), new Date(to + "T00:00:00").getMonth() - k, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      monthLabels.push(`${["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"][d.getMonth()]} ${d.getFullYear()}`)
      const rev =
        payments.filter((p: PaymentRow) => monthKey(p.payment_date) === key).reduce((s: number, p: PaymentRow) => s + p.amount, 0) +
        posTransactions.filter((tx: PosTransactionRow) => monthKey(tx.created_at) === key).reduce((s: number, tx: PosTransactionRow) => s + bucketPosRevenue(tx), 0)
      monthly.push(Math.round(rev))
    }

    const revenueForecast = forecastRevenue(monthly, monthLabels)
    const attendanceForecast = forecastAttendance(attendance)
    const hasData = totalRevenue > 0 || attendance.length > 0 || posTransactions.length > 0

    const actions = buildRecommendations({
      netProfit,
      totalRevenue,
      totalExpenses,
      revenueForecast,
      peakHours,
      flagship,
      subscription,
      hasData,
    })
    const insights = buildInsights({
      netProfit,
      totalRevenue,
      totalExpenses,
      posRevenue,
      revenueForecast,
      peakHours,
      flagship,
      subscription,
      hasData,
    })

    return {
      isLoading,
      error,
      peakHours,
      flagship,
      subscription,
      revenueForecast,
      attendanceForecast,
      actions,
      insights,
      totalRevenue,
      totalExpenses,
      netProfit,
      posRevenue,
    }
  }, [
    isLoading, error, attendance, posTransactions, products, payments, subscriptions, members,
    expenses, salaryPayments, from, to,
  ])
}
