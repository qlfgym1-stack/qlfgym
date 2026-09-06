// rfidScan.ts — logique pure du flux de scan RFID (corrélation scan -> affichage)
// Bug corrigé : « mauvais membre affiché » (lecture du slot partagé mutation.data,
// double-scan non gardé). Fonctions testables unitairement (Vitest).

export type ScanGuard =
  | { allow: true; uid: string }
  | { allow: false; reason: "empty" | "busy" }

/** Normalise un UID scanné : suppression des espaces périphériques uniquement.
 * La casse est préservée : rfid_cards.rfid_uid est comparé tel quel par le RPC.
 */
export function normalizeScanUid(uid: string): string {
  return uid.trim()
}

/** Garde de déclenchement : un scan n'est accepté que si l'UID est non vide
 * et qu'aucun scan n'est déjà en cours (sérialisation).
 * Sérialiser évite de superposer deux scans -> le résultat affiché correspond
 * toujours au dernier scan demandé (pas de stale du slot partagé).
 */
export function evaluateRfidScan(uid: string, isBusy: boolean): ScanGuard {
  const trimmed = normalizeScanUid(uid)
  if (!trimmed) return { allow: false, reason: "empty" }
  if (isBusy) return { allow: false, reason: "busy" }
  return { allow: true, uid: trimmed }
}

/** Invariant de bout de chaîne : le résultat affiché doit correspondre au
 * dernier scan demandé. Retourne false si un résultat périmé (scan précédent)
 * est encore affiché — c'est le bug « mauvais membre affiché ».
 */
export function assertLatestScanIsDisplayed(
  requested: readonly string[],
  displayedUid: string | undefined | null,
): boolean {
  if (requested.length === 0) return displayedUid == null
  return displayedUid === requested[requested.length - 1]
}

/** True si l'UID affiché est déjà celui du dernier scan demandé
 * (cas du même badge scanné deux fois de suite).
 */
export function isLatestScanDisplayed(
  requested: readonly string[],
  displayedUid: string | undefined | null,
): boolean {
  return requested.length > 0 && displayedUid === requested[requested.length - 1]
}