/**
 * Calcul des "séances consommées" affiché au pointage.
 *
 * Référence temporelle : Alger (UTC+1, sans heure d'été), alignée sur
 * `(now() AT TIME ZONE 'Africa/Algiers')::date` utilisé par les RPC SQL
 * (subscription_allows_access, rfid_check_in, ...).
 *
 * Une "séance" = un JOUR de présence distinct. Deux pointages le même jour
 * ne consomment qu'une seule séance, et les pointages effectués avant le
 * début de l'abonnement ne sont jamais comptés.
 */

/** Jour civil d'Alger au format YYYY-MM-DD. */
export function algiersDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 60 * 60000).toISOString().slice(0, 10)
}

/** Borne basse inclusive d'un jour calendaire (YYYY-MM-DD) en UTC. */
function dayStartUtc(ymd: string): string {
  return `${ymd}T00:00:00.000Z`
}

/**
 * Borne haute EXCLUSIVE du jour `ymd` : minuit du jour suivant.
 *
 * `end_date` est une DATE SQL : c'est le DERNIER jour valide, pas un instant.
 * Comparer à `new Date(endDate)` (minuit) écarterait à tort toutes les
 * présences du dernier jour — d'où la borne exclusive au jour suivant.
 */
function nextDayUtc(ymd: string): string {
  const d = new Date(dayStartUtc(ymd))
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}

export interface SessionWindow {
  /** Début de l'abonnement (YYYY-MM-DD). */
  startDate: string;
  /** Fin de l'abonnement (YYYY-MM-DD). */
  endDate: string;
  /** Instant courant, ISO. Injecté pour rendre le calcul testable. */
  now: string;
}

/**
 * Nombre de jours de présence distincts sur la période en cours de
 * l'abonnement, c'est-à-dire [startDate, min(now, endDate)].
 *
 * - Abonnement pas encore commencé (now < startDate) => 0.
 * - Abonnement terminé => toutes les présences de la période sont comptées.
 * - Les `check_in` nuls ou invalides sont ignorés.
 * - Les jours au-delà de 500 pointages distincts ne sont pas gérés (plafond
 *   d'une période d'abonnement raisonnable, cf. `MAX_CHECKINS`).
 */
export const MAX_CHECKINS = 500

export function countSessionsDone(
  checkIns: readonly (string | null)[],
  window: SessionWindow,
): number {
  const { startDate, endDate, now } = window

  // start_date / end_date peuvent arriver en DATE ("2026-10-09") ou en
  // timestamp ISO complet : on ne garde que le jour calendaire.
  const startIso = dayStartUtc(startDate.slice(0, 10))
  const endExclusiveIso = nextDayUtc(endDate.slice(0, 10))
  const nowIso = new Date(now).toISOString()

  // Période pas encore commencée : aucune séance consommée.
  if (nowIso < startIso) return 0

  // On ne compte jamais au-delà de l'instant présent ni du dernier jour
  // d'abonnement (borne exclusive = minuit du jour suivant end_date).
  const periodEndExclusive = nowIso < endExclusiveIso ? nowIso : endExclusiveIso

  const days = new Set<string>()
  for (const checkIn of checkIns) {
    if (!checkIn) continue
    const iso = new Date(checkIn).toISOString()
    if (iso < startIso) continue
    if (iso >= periodEndExclusive) continue
    days.add(algiersDay(iso))
    if (days.size > MAX_CHECKINS) break
  }
  return days.size
}