import type { PaymentRow, PosTransactionRow } from "./raw"
import { buildSubscriptionKeys, isDuplicateSubscriptionPos, isVirtualSubscriptionItem } from "@/lib/ledger-dedupe"

export interface TopProduct {
  id: string
  name: string
  quantity: number
  revenue: number
}

export interface PaymentMethodShare {
  method: string
  count: number
  total: number
  pct: number
}

export interface FinanceStats {
  totalPosRevenue: number
  totalSubscriptionRevenue: number
  totalRevenue: number
  topProducts: TopProduct[]
  paymentMethods: PaymentMethodShare[]
}

function safeNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function analyzeFinance(payments: PaymentRow[], pos: PosTransactionRow[]): FinanceStats {
  const products = new Map<string, TopProduct>()
  const subscriptionKeys = buildSubscriptionKeys(
    payments.filter((p) => p.status === "completed").map((p) => ({ memberId: p.member_id, amount: p.amount, date: p.payment_date }))
  )
  let totalPosRevenue = 0

  for (const tx of pos) {
    if (isDuplicateSubscriptionPos(
      { memberId: tx.member_id, amount: tx.total, date: tx.created_at, items: tx.items },
      subscriptionKeys
    )) continue
    totalPosRevenue += safeNum(tx.total)
    for (const it of tx.items ?? []) {
      if (!it?.id || isVirtualSubscriptionItem(it)) continue
      const cur = products.get(it.id) ?? { id: it.id, name: it.name ?? "", quantity: 0, revenue: 0 }
      cur.quantity += safeNum(it.quantity)
      cur.revenue += safeNum(it.price) * safeNum(it.quantity)
      products.set(it.id, cur)
    }
  }

  const topProducts = Array.from(products.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  const byMethod = new Map<string, { count: number; total: number }>()
  let totalSubscriptionRevenue = 0
  for (const p of payments) {
    if (p.status !== "completed") continue
    const method = p.payment_method || "other"
    const cur = byMethod.get(method) ?? { count: 0, total: 0 }
    cur.count += 1
    cur.total += safeNum(p.amount)
    byMethod.set(method, cur)
    totalSubscriptionRevenue += safeNum(p.amount)
  }

  const paymentMethods = Array.from(byMethod.entries())
    .map(([method, v]) => ({
      method,
      count: v.count,
      total: v.total,
      pct: totalSubscriptionRevenue > 0 ? (v.total / totalSubscriptionRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)

  return {
    totalPosRevenue,
    totalSubscriptionRevenue,
    totalRevenue: totalPosRevenue + totalSubscriptionRevenue,
    topProducts,
    paymentMethods,
  }
}
