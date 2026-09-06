export interface LedgerPaymentLike {
  memberId: string | null
  amount: number
  date: string
}

export interface LedgerPosLike {
  memberId: string | null
  amount: number
  date: string
  items?: unknown
}

function hasOwn(item: unknown): item is Record<string, unknown> {
  return typeof item === "object" && item !== null
}

export function paymentDedupeKey(memberId: string | null, amount: number, date: string): string | null {
  if (!memberId) return null
  const ts = new Date(date).getTime()
  if (!Number.isFinite(ts)) return null
  return `${memberId}|${Math.round((Number(amount) || 0) * 100)}|${Math.floor(ts / 60000)}`
}

export function buildSubscriptionKeys(payments: LedgerPaymentLike[]): Set<string> {
  const keys = new Set<string>()
  for (const p of payments) {
    const k = paymentDedupeKey(p.memberId, p.amount, p.date)
    if (k) keys.add(k)
  }
  return keys
}

export function isVirtualSubscriptionItem(item: unknown): boolean {
  if (!hasOwn(item)) return false
  const id = item.id
  return typeof id === "string" && (id.startsWith("__subscription__") || id.startsWith("__renewal__"))
}

export function hasVirtualSubscriptionItems(items: unknown): boolean {
  return Array.isArray(items) && items.some(isVirtualSubscriptionItem)
}

export function isDuplicateSubscriptionPos(pos: LedgerPosLike, keys: Set<string>): boolean {
  if (!hasVirtualSubscriptionItems(pos.items)) return false
  if (!pos.memberId) return false
  const k = paymentDedupeKey(pos.memberId, pos.amount, pos.date)
  return k !== null && keys.has(k)
}