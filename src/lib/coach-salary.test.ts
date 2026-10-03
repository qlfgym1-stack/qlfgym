import { describe, it, expect } from 'vitest'
import {
  computeCoachSalary,
  countsFromListCoaches,
  legacyCoachSalary,
  ratesFromJson,
  round2,
  type CoachSalaryInput,
} from './coach-salary'

const base: CoachSalaryInput = {
  fixedSalary: 30000,
  bonus: 0,
  baseRate: 500,
  categoryRates: null,
  counts: { adult_male: 10, adult_female: 4, boy: 2, girl: 1, unknown: 1 },
}

describe('computeCoachSalary — régression de la formule historique', () => {
  it('reproduit rate_per_member × effectif actif quand aucun taux n’est saisi', () => {
    const r = computeCoachSalary(base)
    // 18 membres × 500 = 9000 + 30000 fixe
    expect(r.activeTotal).toBe(18)
    expect(r.variableAmount).toBe(9000)
    expect(r.totalAmount).toBe(39000)
  })

  it('ignore les compteurs négatifs ou fractionnaires', () => {
    const r = computeCoachSalary({
      ...base,
      counts: { adult_male: 10.9, adult_female: -3, boy: 2, girl: 1, unknown: 0 },
    })
    expect(r.activeTotal).toBe(13)
    expect(r.variableAmount).toBe(6500)
  })

  it('traite null/NaN comme zéro', () => {
    const r = computeCoachSalary({
      fixedSalary: null,
      bonus: undefined,
      baseRate: null,
      counts: null,
    })
    expect(r.totalAmount).toBe(0)
    expect(r.activeTotal).toBe(0)
  })
})

describe('computeCoachSalary — taux par catégorie', () => {
  it('applique la surcharge uniquement aux catégories concernées', () => {
    const r = computeCoachSalary({
      ...base,
      categoryRates: { boy: 250, girl: 250 },
    })
    // 10x500 + 4x500 + 2x250 + 1x250 + 1x500 (unknown suit le taux de base)
    expect(r.variableAmount).toBe(5000 + 2000 + 500 + 250 + 500)
    expect(r.totalAmount).toBe(30000 + 8250)
  })

  it('marque les lignes à surcharge et laisse les autres sur le taux de base', () => {
    const r = computeCoachSalary({ ...base, categoryRates: { boy: 250 } })
    const byCat = Object.fromEntries(r.lines.map((l) => [l.category, l]))
    expect(byCat.boy.isOverride).toBe(true)
    expect(byCat.boy.rate).toBe(250)
    expect(byCat.girl.isOverride).toBe(false)
    expect(byCat.girl.rate).toBe(500)
  })

  it('ignore une surcharge nulle, négative ou NaN (repli sur le taux de base)', () => {
    const r = computeCoachSalary({
      ...base,
      categoryRates: { boy: -100, girl: Number.NaN, adult_male: 0 },
    })
    const byCat = Object.fromEntries(r.lines.map((l) => [l.category, l]))
    expect(byCat.boy.isOverride).toBe(false)
    expect(byCat.boy.rate).toBe(500)
    expect(byCat.girl.isOverride).toBe(false)
    expect(byCat.girl.rate).toBe(500)
    // 0 est une valeur valide et explicite : elle prime sur le taux de base.
    expect(byCat.adult_male.isOverride).toBe(true)
    expect(byCat.adult_male.rate).toBe(0)
  })

  it('un taux enfant à 0 disable la variable sur cette catégorie', () => {
    const r = computeCoachSalary({ ...base, categoryRates: { boy: 0, girl: 0 } })
    const byCat = Object.fromEntries(r.lines.map((l) => [l.category, l]))
    expect(byCat.boy.amount).toBe(0)
    expect(r.variableAmount).toBe(5000 + 2000 + 500)
  })

  it('applique les 4 taux d’un coup', () => {
    const r = computeCoachSalary({
      ...base,
      categoryRates: { adult_male: 600, adult_female: 550, boy: 250, girl: 200 },
    })
    expect(r.variableAmount).toBe(10 * 600 + 4 * 550 + 2 * 250 + 1 * 200 + 1 * 500)
    expect(r.pricedTotal).toBe(17)
  })
})

describe('computeCoachSalary — structure de sortie', () => {
  it('renvoie toujours les 5 lignes, même à effectif nul', () => {
    const r = computeCoachSalary({ ...base, counts: {} })
    expect(r.lines).toHaveLength(5)
    expect(r.lines.map((l) => l.category)).toEqual([
      'adult_male',
      'adult_female',
      'boy',
      'girl',
      'unknown',
    ])
  })

  it('unknown suit toujours le taux de base et n’est jamais une surcharge', () => {
    const r = computeCoachSalary({
      ...base,
      categoryRates: { adult_male: 600, adult_female: 550, boy: 250, girl: 200 },
    })
    const unknown = r.lines.find((l) => l.category === 'unknown')!
    expect(unknown.rate).toBe(500)
    expect(unknown.isOverride).toBe(false)
  })

  it('inclut le bonus exceptionnel dans le total', () => {
    const r = computeCoachSalary({ ...base, bonus: 5000 })
    expect(r.bonusAmount).toBe(5000)
    expect(r.totalAmount).toBe(30000 + 9000 + 5000)
  })

  it('arrondit au centime (pas de 0.1 + 0.2)', () => {
    const r = computeCoachSalary({
      fixedSalary: 0,
      bonus: 0,
      baseRate: 0.1,
      counts: { adult_male: 3 },
    })
    expect(r.variableAmount).toBe(0.3)
    expect(r.totalAmount).toBe(0.3)
  })

  it('précision décimale sur les montants en dinars', () => {
    const r = computeCoachSalary({
      ...base,
      fixedSalary: 33333.33,
      bonus: 0,
      baseRate: 123.45,
      counts: { adult_male: 7 },
    })
    expect(r.variableAmount).toBe(864.15)
    expect(r.totalAmount).toBe(34197.48)
  })
})

describe('helpers', () => {
  it('round2', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(round2(1.005)).toBe(1.01)
    expect(round2(-2.345)).toBe(-2.34)
    expect(round2(2.675)).toBe(2.68)
  })

  it('legacyCoachSalary — ancien snapshot global', () => {
    expect(legacyCoachSalary(30000, 500, 18)).toBe(39000)
    expect(legacyCoachSalary(30000, 500, 0)).toBe(30000)
    expect(legacyCoachSalary(null, null, null)).toBe(0)
  })

  it('countsFromListCoaches lit les compteurs de la RPC', () => {
    expect(
      countsFromListCoaches({
        adult_male_count: 10,
        adult_female_count: 4,
        boy_count: 2,
        girl_count: 1,
        unknown_count: 3,
      })
    ).toEqual({ adult_male: 10, adult_female: 4, boy: 2, girl: 1, unknown: 3 })
  })

  it('countsFromListCoaches tolère des champs absents', () => {
    expect(countsFromListCoaches({})).toEqual({
      adult_male: 0,
      adult_female: 0,
      boy: 0,
      girl: 0,
      unknown: 0,
    })
  })

  it('ratesFromJson ne garde que ce qui diffère du taux de base', () => {
    // list_coaches renvoie déjà le repli dans le jsonb : garder les valeurs
    // identiques ferait dire `isOverride: true` à tort dans l'UI.
    expect(
      ratesFromJson(
        { adult_male: 500, adult_female: 500, boy: 250, girl: 500 },
        500
      )
    ).toEqual({ boy: 250 })
  })

  it('ratesFromJson tolère une entrée invalide', () => {
    expect(ratesFromJson(null, 500)).toEqual({})
    expect(ratesFromJson('peu importe', 500)).toEqual({})
    expect(ratesFromJson({ boy: -5, girl: Number.NaN }, 500)).toEqual({})
  })
})