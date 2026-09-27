export interface LedgerPaymentLike {
  memberId: string | null
  amount: number
  date: string
  subscriptionId?: string | null
}

export interface LedgerPosLike {
  memberId: string | null
  amount: number
  date: string
  items?: unknown
}

export interface VirtualSubscriptionRefs {
  /** subscription_id encodés dans les items `__subscription__<uuid>` */
  subscriptionIds: string[]
  /** true si au moins un item `__renewal__<uuid>` est présent */
  hasRenewal: boolean
}

export interface SubscriptionIndex {
  /** payments.subscription_id — appariement exact et déterministe */
  bySubscriptionId: Set<string>
  /** fallback `membre|montant|minute` pour les cas sans clé déterministe */
  byMinuteKey: Set<string>
}

const SUBSCRIPTION_PREFIX = "__subscription__"
const RENEWAL_PREFIX = "__renewal__"

function hasOwn(item: unknown): item is Record<string, unknown> {
  return typeof item === "object" && item !== null
}

export function paymentDedupeKey(memberId: string | null, amount: number, date: string): string | null {
  if (!memberId) return null
  const ts = new Date(date).getTime()
  if (!Number.isFinite(ts)) return null
  return `${memberId}|${Math.round((Number(amount) || 0) * 100)}|${Math.floor(ts / 60000)}`
}

export function buildSubscriptionIndex(payments: LedgerPaymentLike[]): SubscriptionIndex {
  const bySubscriptionId = new Set<string>()
  const byMinuteKey = new Set<string>()
  for (const p of payments) {
    if (p.subscriptionId) bySubscriptionId.add(p.subscriptionId)
    const k = paymentDedupeKey(p.memberId, p.amount, p.date)
    if (k) byMinuteKey.add(k)
  }
  return { bySubscriptionId, byMinuteKey }
}

export function isVirtualSubscriptionItem(item: unknown): boolean {
  if (!hasOwn(item)) return false
  const id = item.id
  return typeof id === "string" && (id.startsWith(SUBSCRIPTION_PREFIX) || id.startsWith(RENEWAL_PREFIX))
}

export function hasVirtualSubscriptionItems(items: unknown): boolean {
  return Array.isArray(items) && items.some(isVirtualSubscriptionItem)
}

/**
 * Extrait les références d'abonnement portées par les items virtuels d'un panier POS.
 * `__subscription__<uuid>` porte le subscription_id réellement payé (déterministe).
 * `__renewal__<uuid>` porte l'ancien subscription_id, qui ne correspond jamais au
 * paiement (le renouvellement crée un nouveau subscription_id) : il sert donc
 * uniquement à signaler l'absence de clé déterministe.
 */
export function extractVirtualSubscriptionRefs(items: unknown): VirtualSubscriptionRefs {
  const subscriptionIds: string[] = []
  let hasRenewal = false
  if (!Array.isArray(items)) return { subscriptionIds, hasRenewal }
  for (const item of items) {
    if (!hasOwn(item)) continue
    const id = item.id
    if (typeof id !== "string") continue
    if (id.startsWith(SUBSCRIPTION_PREFIX)) {
      const subId = id.slice(SUBSCRIPTION_PREFIX.length)
      if (subId) subscriptionIds.push(subId)
    } else if (id.startsWith(RENEWAL_PREFIX)) {
      hasRenewal = true
    }
  }
  return { subscriptionIds, hasRenewal }
}

/**
 * Une vente POS d'abonnement est un doublon d'un paiement déjà enregistré quand :
 *  - le panier porte des items `__subscription__` ET l'un de ces subscription_id a
 *    été payé (appariement exact, jamais de faux positif) ;
 *  - sinon, en repli, la clé `membre|montant|minute` correspond.
 *
 * Le repli minute ne peut que manquer un doublon (faux négatif) : le POS et le
 * paiement sont déclenchés à quelques secondes d'écart, donc un simple passage de
 * frontière de minute les désapparie. Il ne peut pas supprimer une vente légitime.
 */
export function isDuplicateSubscriptionMatch(
  memberId: string | null,
  amount: number,
  date: string,
  refs: VirtualSubscriptionRefs,
  index: SubscriptionIndex
): boolean {
  const hasVirtual = refs.subscriptionIds.length > 0 || refs.hasRenewal
  if (!hasVirtual) return false
  // null si le membre est absent ou la date invalide : la clé minute est alors
  // inapplicable, mais l'appariement par abonnement reste possible.
  const minuteKey = paymentDedupeKey(memberId, amount, date)
  if (!refs.hasRenewal && refs.subscriptionIds.length > 0) {
    // L'identifiant d'abonnement est une preuve déterministe : s'il est connu et
    // absent de l'index, la vente est légitime. Ne surtout pas retomber sur la
    // clé minute ici, sinon deux achats distincts du même membre dans la même
    // minute seraient confondus (faux positif = perte de CA réelle).
    if (index.bySubscriptionId.size > 0) {
      return refs.subscriptionIds.some((subId) => index.bySubscriptionId.has(subId))
    }
    // Aucun paiement ne porte de subscription_id (requête sans la colonne) :
    // seule la clé minute est disponible.
    return minuteKey !== null && index.byMinuteKey.has(minuteKey)
  }
  return minuteKey !== null && index.byMinuteKey.has(minuteKey)
}

export function isDuplicateSubscriptionPos(pos: LedgerPosLike, index: SubscriptionIndex): boolean {
  if (!hasVirtualSubscriptionItems(pos.items)) return false
  return isDuplicateSubscriptionMatch(
    pos.memberId,
    pos.amount,
    pos.date,
    extractVirtualSubscriptionRefs(pos.items),
    index
  )
}
