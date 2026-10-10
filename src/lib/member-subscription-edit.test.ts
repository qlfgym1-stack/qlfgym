import { describe, it, expect } from "vitest"
import { shouldCreateSubscriptionOnMemberEdit } from "./member-subscription-edit"

describe("shouldCreateSubscriptionOnMemberEdit", () => {
  it("ne crée rien quand le type n'a pas changé (édition coach/groupe seule)", () => {
    expect(shouldCreateSubscriptionOnMemberEdit("type-1", "type-1")).toBe(false)
  })

  it("crée un abonnement quand l'utilisateur change explicitement le type", () => {
    expect(shouldCreateSubscriptionOnMemberEdit("type-2", "type-1")).toBe(true)
  })

  it("ne crée rien quand aucun type n'est sélectionné", () => {
    expect(shouldCreateSubscriptionOnMemberEdit("", "type-1")).toBe(false)
  })

  it("ne crée rien pour une sélection nulle", () => {
    expect(shouldCreateSubscriptionOnMemberEdit(null, "type-1")).toBe(false)
  })

  it("ne crée rien pour une sélection indéfinie", () => {
    expect(shouldCreateSubscriptionOnMemberEdit(undefined, "type-1")).toBe(false)
  })

  it("crée un abonnement pour un membre sans abonnement préexistant", () => {
    expect(shouldCreateSubscriptionOnMemberEdit("type-1", "")).toBe(true)
  })

  it("ne crée rien quand le champ est vidé sur un membre ayant déjà un type", () => {
    expect(shouldCreateSubscriptionOnMemberEdit("", "")).toBe(false)
  })
})
