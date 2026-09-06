import { describe, it, expect } from "vitest"
import {
  normalizeScanUid,
  evaluateRfidScan,
  assertLatestScanIsDisplayed,
  isLatestScanDisplayed,
} from "./rfidScan"

describe("normalizeScanUid", () => {
  it("supprime les espaces périphériques", () => {
    expect(normalizeScanUid("  RF1A2B3C0001  ")).toBe("RF1A2B3C0001")
    expect(normalizeScanUid(" 0123456789")).toBe("0123456789")
  })

  it("préserve la casse (colonne rfid_uid comparée telle quelle)", () => {
    expect(normalizeScanUid("rf1a2b3c0001")).toBe("rf1a2b3c0001")
    expect(normalizeScanUid("RF1A2B3C0001")).toBe("RF1A2B3C0001")
  })

  it("retourne une chaîne vide pour un UID vierge", () => {
    expect(normalizeScanUid("   ")).toBe("")
    expect(normalizeScanUid("")).toBe("")
  })
})

describe("evaluateRfidScan", () => {
  it("autorise un scan avec UID non vide quand le lecteur est libre", () => {
    expect(evaluateRfidScan("RF1A2B3C0001", false)).toEqual({ allow: true, uid: "RF1A2B3C0001" })
  })

  it("refuse un UID vide", () => {
    expect(evaluateRfidScan("", false)).toEqual({ allow: false, reason: "empty" })
    expect(evaluateRfidScan("   ", false)).toEqual({ allow: false, reason: "empty" })
  })

  it("refuse un scan tant qu'un autre scan est en cours (double Enter)", () => {
    expect(evaluateRfidScan("RF1A2B3C0001", true)).toEqual({ allow: false, reason: "busy" })
  })
})

describe("assertLatestScanIsDisplayed (corrélation scan -> affichage)", () => {
  it("A -> A : résultat affiché = dernier scan -> OK", () => {
    expect(assertLatestScanIsDisplayed(["A"], "A")).toBe(true)
  })

  it("B -> B : OK", () => {
    expect(assertLatestScanIsDisplayed(["B"], "B")).toBe(true)
  })

  it("A puis B affiché A (stale) : DÉTECTE le bug « mauvais membre affiché »", () => {
    expect(assertLatestScanIsDisplayed(["A", "B"], "A")).toBe(false)
  })

  it("double scan rapide : le second est refusé tant que le premier est en vol", () => {
    const first = evaluateRfidScan("A", false)
    const secondWhileBusy = evaluateRfidScan("B", first.allow === true)
    expect(first).toEqual({ allow: true, uid: "A" })
    expect(secondWhileBusy).toEqual({ allow: false, reason: "busy" })
  })

  it("badge inconnu : l'UID reste le dernier demandé même si le RPC refuse", () => {
    expect(assertLatestScanIsDisplayed(["A"], "A")).toBe(true)
  })

  it("espaces parasites : le dernier scan demandé doit être normalisé avant comparaison", () => {
    expect(assertLatestScanIsDisplayed([normalizeScanUid("  A  ")], normalizeScanUid("  A  "))).toBe(true)
  })

  it("doublon même badge : ré-affichage du même UID -> OK", () => {
    const req = ["RF1A2B3C0001"]
    expect(isLatestScanDisplayed(req, "RF1A2B3C0001")).toBe(true)
  })

  it("aucun scan demandé : rien ne doit être affiché", () => {
    expect(assertLatestScanIsDisplayed([], "A")).toBe(false)
    expect(assertLatestScanIsDisplayed([], undefined)).toBe(true)
    expect(assertLatestScanIsDisplayed([], null)).toBe(true)
  })
})