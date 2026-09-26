import { useMemo } from "react"
import { useQuery } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useAuth } from "@/stores/auth"
import { IS_MOCK } from "@/lib/config"
import type { MemberRow, PaymentRow, SubscriptionRow, AttendanceRow, PosTransactionRow, StaffRow } from "../lib/raw"
import { computeMemberKpis, aggregateKpis, analyzeSubscriptionTypes, analyzeAttendance, activitySegment } from "../lib/kpi"
import { churnRiskBatch, churnDistribution } from "../lib/churn"
import { segmentMembers, summarizeSegments } from "../lib/segmentation"
import { behaviorMatrix, highValueAtRisk } from "../lib/behaviorMatrix"
import { analyzeCoaches } from "../lib/coach"
import { generateRecommendations } from "../lib/recommend"
import { analyzeFinance } from "../lib/finance"
import type { MemberInsightsData } from "./types"

interface PosItem {
  id: string
  name: string
  price: number
  quantity: number
}

const DAY = 86400000

function safeNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseItems(items: unknown): PosItem[] {
  if (!Array.isArray(items)) return []
  return items.filter((it: unknown): it is PosItem => !!it && typeof it === "object").map((it: unknown) => ({
    id: String((it as PosItem).id ?? ""),
    name: String((it as PosItem).name ?? ""),
    price: safeNum((it as PosItem).price),
    quantity: safeNum((it as PosItem).quantity),
  }))
}

const MOCK_STAFF: StaffRow[] = [
  { id: "mock-coach-0", first_name: "Karim", last_name: "Slimani", role: "coach" },
  { id: "mock-coach-1", first_name: "Nadia", last_name: "Bekkar", role: "coach" },
  { id: "mock-staff-0", first_name: "Rachid", last_name: "Mansouri", role: "manager" },
]

const MOCK_MEMBERS: MemberRow[] = Array.from({ length: 40 }, (_, i) => {
  const active = i % 5 !== 0
  const lastVisit = active
    ? new Date(Date.now() - (i % 12) * DAY).toISOString()
    : new Date(Date.now() - (90 + i) * DAY).toISOString()
  return {
    id: `mock-m-${i}`,
    first_name: `Prénom${i}`,
    last_name: `Nom${i}`,
    full_name: `Membre ${i}`,
    status: active ? "active" : "inactive",
    last_visit: lastVisit,
    created_at: new Date(Date.now() - (30 + i * 3) * DAY).toISOString(),
    coach_id: i % 3 === 0 ? `mock-coach-${i % 2}` : null,
    corporate_id: null,
  }
})

const MOCK_SUBSCRIPTIONS: SubscriptionRow[] = Array.from({ length: 40 }, (_, i) => {
  const active = i % 5 !== 0
  const isMonthly = i % 2 === 0
  const start = new Date(Date.now() - (active ? 20 : 200) * DAY)
  const end = new Date(Date.now() + (active ? (isMonthly ? 10 : 60) : -12) * DAY)
  return {
    id: `mock-sub-${i}`,
    member_id: `mock-m-${i}`,
    subscription_type_id: isMonthly ? "type-mensuel" : "type-trimestriel",
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    total_amount: isMonthly ? 2500 : 6000,
    amount_paid: isMonthly ? 2500 : 6000,
    status: active ? "active" : "expired",
    type_name: isMonthly ? "Mensuel" : "Trimestriel",
    type_duration: isMonthly ? 30 : 90,
    type_price: isMonthly ? 2500 : 6000,
  }
})

const MOCK_PAYMENTS: PaymentRow[] = Array.from({ length: 60 }, (_, i) => {
  const amounts = [2500, 6000, 800, 1500]
  return {
    id: `mock-pay-${i}`,
    member_id: `mock-m-${i % 40}`,
    subscription_id: `mock-sub-${i % 40}`,
    amount: amounts[i % 4]!,
    payment_method: "cash",
    payment_date: new Date(Date.now() - (i % 30) * DAY).toISOString(),
    status: "completed",
  }
})

const MOCK_ATTENDANCE: AttendanceRow[] = (() => {
  const arr: AttendanceRow[] = []
  for (let i = 0; i < 400; i++) {
    const memberIdx = i % 40
    const active = memberIdx % 5 !== 0
    if (!active && i % 4 !== 0) continue
    const d = new Date(Date.now() - (active ? i % 15 : 65 + (i % 20)) * DAY)
    arr.push({
      member_id: `mock-m-${memberIdx}`,
      check_in: d.toISOString(),
      check_out: null,
      type: "check-in",
    })
  }
  return arr
})()

const MOCK_POS: PosTransactionRow[] = Array.from({ length: 70 }, (_, i) => {
  const names = ["Whey 1kg", "Shaker", "Boisson isotonique", "Gants"]
  const prices = [4500, 800, 250, 1800]
  const idx = i % 4
  const items: PosItem[] = [
    { id: `prod-${idx}`, name: names[idx]!, price: prices[idx]!, quantity: 1 },
    ...(i % 3 === 0 ? [{ id: "prod-1", name: names[1]!, price: prices[1]!, quantity: 1 }] : []),
  ]
  const total = items.reduce((s: number, it: PosItem) => s + it.price * it.quantity, 0)
  return {
    id: `mock-pos-${i}`,
    member_id: `mock-m-${i % 40}`,
    total,
    created_at: new Date(Date.now() - (i % 60) * DAY).toISOString(),
    items,
  }
})

export function useMemberInsightsData(): MemberInsightsData {
  const db = useSupabase()
  const { organization } = useAuth()
  const orgId = organization?.id
  const isMock = IS_MOCK

  const { data: membersData, error: membersError } = useQuery({
    queryKey: ["member-insights", "members", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("members")
        .select("id, first_name, last_name, full_name, status, last_visit, created_at, coach_id, corporate_id")
        .eq("organization_id", orgId!)
      if (error) throw error
      return (data ?? []) as unknown as MemberRow[]
    },
    enabled: !!orgId && !isMock,
  })

  const { data: subsData, error: subsError } = useQuery({
    queryKey: ["member-insights", "subscriptions", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("member_subscriptions")
        .select("id, member_id, subscription_type_id, start_date, end_date, total_amount, amount_paid, status, subscription_types(name, duration_days, price)")
        .eq("organization_id", orgId!)
      if (error) throw error
      return (data ?? []).map((r: {
        id: string
        member_id: string
        subscription_type_id: string
        start_date: string
        end_date: string
        total_amount: number
        amount_paid: number
        status: string
        subscription_types: { name: string; duration_days: number; price: number } | null
      }) => ({
        id: r.id,
        member_id: r.member_id,
        subscription_type_id: r.subscription_type_id,
        start_date: r.start_date,
        end_date: r.end_date,
        total_amount: safeNum(r.total_amount),
        amount_paid: safeNum(r.amount_paid),
        status: r.status,
        type_name: r.subscription_types?.name ?? "—",
        type_duration: safeNum(r.subscription_types?.duration_days ?? 0),
        type_price: safeNum(r.subscription_types?.price ?? 0),
      })) as SubscriptionRow[]
    },
    enabled: !!orgId && !isMock,
  })

  const { data: paymentsData, error: paymentsError } = useQuery({
    queryKey: ["member-insights", "payments", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("payments")
        .select("id, member_id, subscription_id, amount, payment_method, payment_date, status")
        .eq("organization_id", orgId!)
      if (error) throw error
      return (data ?? []).map((r: {
        id: string
        member_id: string
        subscription_id: string | null
        amount: number
        payment_method: string
        payment_date: string
        status: string
      }) => ({
        id: r.id,
        member_id: r.member_id,
        subscription_id: r.subscription_id,
        amount: safeNum(r.amount),
        payment_method: r.payment_method,
        payment_date: r.payment_date,
        status: r.status,
      })) as PaymentRow[]
    },
    enabled: !!orgId && !isMock,
  })

  const { data: attendanceData, error: attendanceError } = useQuery({
    queryKey: ["member-insights", "attendance", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("attendance")
        .select("member_id, check_in, check_out, type")
        .eq("organization_id", orgId!)
      if (error) throw error
      return (data ?? [])
        .filter((r: { check_in: string | null }) => r.check_in !== null)
        .map((r: { member_id: string; check_in: string | null; check_out: string | null; type: "check-in" | "class" }) => ({
          member_id: r.member_id,
          check_in: r.check_in as string,
          check_out: r.check_out,
          type: r.type,
        })) as AttendanceRow[]
    },
    enabled: !!orgId && !isMock,
  })

  const { data: posData, error: posError } = useQuery({
    queryKey: ["member-insights", "pos", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("pos_transactions")
        .select("id, member_id, total, created_at, items")
        .eq("organization_id", orgId!)
        .eq("payment_status", "completed")
      if (error) throw error
      return (data ?? []).map((r: {
        id: string
        member_id: string | null
        total: number
        created_at: string
        items: unknown
      }) => ({
        id: r.id,
        member_id: r.member_id,
        total: safeNum(r.total),
        created_at: r.created_at,
        items: parseItems(r.items),
      })) as PosTransactionRow[]
    },
    enabled: !!orgId && !isMock,
  })

  const { data: staffData, error: staffError } = useQuery({
    queryKey: ["member-insights", "staff", orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from("staff")
        .select("id, first_name, last_name, role")
        .eq("organization_id", orgId!)
      if (error) throw error
      return (data ?? []) as StaffRow[]
    },
    enabled: !!orgId && !isMock,
  })

  const members = membersData ?? (isMock ? MOCK_MEMBERS : [])
  const subscriptions = subsData ?? (isMock ? MOCK_SUBSCRIPTIONS : [])
  const payments = paymentsData ?? (isMock ? MOCK_PAYMENTS : [])
  const attendance = attendanceData ?? (isMock ? MOCK_ATTENDANCE : [])
  const posTransactions = posData ?? (isMock ? MOCK_POS : [])
  const staff = staffData ?? (isMock ? MOCK_STAFF : [])

  const loading = useMemo(
    () =>
      !isMock &&
      (membersData === undefined ||
        subsData === undefined ||
        paymentsData === undefined ||
        attendanceData === undefined ||
        posData === undefined ||
        staffData === undefined),
    [membersData, subsData, paymentsData, attendanceData, posData, staffData, isMock]
  )

  const error = useMemo(
    () =>
      isMock
        ? null
        : (membersError ?? subsError ?? paymentsError ?? attendanceError ?? posError ?? staffError ?? null),
    [membersError, subsError, paymentsError, attendanceError, posError, staffError, isMock]
  )

  return useMemo(
    () => {
      const memberKpis = computeMemberKpis(members, subscriptions, payments, attendance, posTransactions)
      const aggregate = aggregateKpis(memberKpis)
      const risks = churnRiskBatch(memberKpis)
      const churnDist = churnDistribution(risks)
      const segments = segmentMembers(memberKpis)
      const segmentSummary = summarizeSegments(segments)
      const behavior = behaviorMatrix(memberKpis)
      const activity = activitySegment(memberKpis)
      const attendanceStats = analyzeAttendance(attendance, members.length)
      const typeStats = analyzeSubscriptionTypes(subscriptions)
      const highValue = highValueAtRisk(memberKpis)
      const coachAnalysis = analyzeCoaches(members, staff, memberKpis, payments, attendance)
      const recommendations = generateRecommendations(memberKpis)
      const finance = analyzeFinance(payments, posTransactions)
      return {
        loading,
        error,
        members,
        subscriptions,
        payments,
        attendance,
        posTransactions,
        staff,
        memberKpis,
        aggregate,
        risks,
        churnDist,
        segments,
        segmentSummary,
        behavior,
        activity,
        attendanceStats,
        typeStats,
        highValue,
        coachAnalysis,
        recommendations,
        finance,
      }
    },
    [loading, error, members, subscriptions, payments, attendance, posTransactions, staff]
  )
}
