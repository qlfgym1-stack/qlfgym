import { describe, it, expect } from "vitest"
import { azertyToDigits } from "./azerty"

describe("azertyToDigits", () => {
  it("convertit la rangée AZERTY complète en chiffres", () => {
    expect(azertyToDigits("&é\"'(-è_çà")).toBe("1234567890")
  })

  it("conserve exactement l'ordre des caractères", () => {
    expect(azertyToDigits("àç_è(-'\"é&")).toBe("0987564321")
  })

  it("conserve les chiffres déjà saisis", () => {
    expect(azertyToDigits("0001&2é3")).toBe("00011223")
  })

  it("gère les majuscules accentuées", () => {
    expect(azertyToDigits("ÉÈÇÀ")).toBe("2790")
    expect(azertyToDigits("éèçà")).toBe("2790")
  })

  it("ignore les caractères non concernés sans les ajouter", () => {
    expect(azertyToDigits("A&éB C")).toBe("12")
  })

  it("ne retourne aucun espace ni séparateur", () => {
    expect(azertyToDigits("é 3 x")).toBe("23")
  })

  it("retourne une chaîne vide sur entrée vide", () => {
    expect(azertyToDigits("")).toBe("")
  })

  it("ne modifie pas une entrée déjà entièrement numérique", () => {
    expect(azertyToDigits("0003805582")).toBe("0003805582")
  })
})