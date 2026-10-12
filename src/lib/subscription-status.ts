export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending_payment'

export interface SubscriptionStatusInput {
  currentStatus: SubscriptionStatus | null
  startDate: string | null
  endDate: string | null
  today: string
}

/**
 * Réplique exactement la logique SQL du RPC admin_manage_subscription (00147)
 * pour afficher un aperçu du statut avant sauvegarde côté client.
 *
 * Règles (cohérentes avec 00114 + 00143) :
 *   - dates manquantes ou start > end → statut invalide (null)
 *   - motif : une date de début FUTURE ne bloque pas l'accès :
 *     statut ACTIF dès que end_date >= today, EXPIRED sinon ;
 *   - si la souscription est déjà pending_payment / cancelled,
 *     le RPC la préserve : on renvoie le statut courant inchangé.
 */
export function computeSubscriptionStatus(input: SubscriptionStatusInput): SubscriptionStatus | null {
  const { currentStatus, startDate, endDate, today } = input

  if (!startDate || !endDate) return null
  if (startDate > endDate) return null

  if (currentStatus === 'pending_payment' || currentStatus === 'cancelled') {
    return currentStatus
  }

  return endDate < today ? 'expired' : 'active'
}