import { describe, it, expect } from 'vitest'
import {
  CHILD_MAX_AGE,
  MAX_PLAUSIBLE_AGE,
  MEMBER_CATEGORIES,
  asMemberCategory,
  countByCategory,
  emptyCategoryCounts,
  isChildCategory,
  memberAge,
  memberCategory,
  parsePlainDate,
  type MemberCategory,
} from './member-category'

/** Date de référence fixe : les tests ne doivent pas dépendre du jour réel. */
const TODAY = new Date(2026, 9, 3) // 3 octobre 2026

describe('parsePlainDate', () => {
  it('découpe une date ISO', () => {
    expect(parsePlainDate('1990-05-15')).toEqual({ y: 1990, m: 5, d: 15 })
  })

  it('accepte une date avec suffixe heure ISO', () => {
    expect(parsePlainDate('1990-05-15T00:00:00Z')).toEqual({ y: 1990, m: 5, d: 15 })
  })

  it('rejette les entrées invalides', () => {
    expect(parsePlainDate(null)).toBeNull()
    expect(parsePlainDate(undefined)).toBeNull()
    expect(parsePlainDate('')).toBeNull()
    expect(parsePlainDate('pas une date')).toBeNull()
    expect(parsePlainDate('1990-13-01')).toBeNull()
    expect(parsePlainDate('1990-05-99')).toBeNull()
  })
})

describe('memberAge', () => {
  it('compte les années pleines', () => {
    expect(memberAge('2000-10-03', TODAY)).toBe(26)
    // L'anniversaire est aujourd'hui : l'âge vient de monter.
    expect(memberAge('2000-10-04', TODAY)).toBe(25)
  })

  it("gère le changement d'année et le 29 février", () => {
    expect(memberAge('2000-12-31', new Date(2026, 0, 1))).toBe(25)
    expect(memberAge('2004-02-29', new Date(2026, 1, 28))).toBe(21)
    expect(memberAge('2004-02-29', new Date(2026, 2, 1))).toBe(22)
  })

  it('renvoie null pour une date absente, future ou illisible', () => {
    expect(memberAge(null, TODAY)).toBeNull()
    expect(memberAge('', TODAY)).toBeNull()
    expect(memberAge('nawak', TODAY)).toBeNull()
    expect(memberAge('2026-10-04', TODAY)).toBeNull()
    expect(memberAge('275760-04-07', TODAY)).toBeNull()
  })

  it('renvoie null au-delà de 120 ans (artefacts d’import)', () => {
    expect(memberAge('0003-04-30', TODAY)).toBeNull()
    expect(memberAge('1900-01-01', TODAY)).toBeNull()
    expect(MAX_PLAUSIBLE_AGE).toBe(120)
  })

  it('ne décale pas la date à cause du fuseau horaire', () => {
    // `new Date('1990-05-15')` est interprété en UTC : en UTC-5 il afficherait le
    // 14 mai et l'anniversaire glisserait d'un jour. Notre découpage manuel
    // impose que la bascule tombe exactement le 15 mai, quoi que soit le fuseau.
    expect(memberAge('1990-05-15', new Date(2026, 4, 14))).toBe(35)
    expect(memberAge('1990-05-15', new Date(2026, 4, 15))).toBe(36)
    expect(memberAge('1990-05-15', new Date(2026, 4, 16))).toBe(36)
  })
})

describe('memberCategory — seuil 16 ans', () => {
  it('classe les hommes', () => {
    expect(memberCategory('male', '1990-05-15', TODAY)).toBe('adult_male')
    expect(memberCategory('MALE', '1990-05-15', TODAY)).toBe('adult_male')
    expect(memberCategory('homme', '1990-05-15', TODAY)).toBe('adult_male')
    expect(memberCategory('m', '1990-05-15', TODAY)).toBe('adult_male')
    expect(memberCategory('  Homme  ', '1990-05-15', TODAY)).toBe('adult_male')
  })

  it('classe les femmes', () => {
    expect(memberCategory('female', '1990-05-15', TODAY)).toBe('adult_female')
    expect(memberCategory('femme', '1990-05-15', TODAY)).toBe('adult_female')
    expect(memberCategory('f', '1990-05-15', TODAY)).toBe('adult_female')
  })

  it('classe les enfants par sexe', () => {
    // Né en 2015 : 11 ans au 03/10/2026.
    expect(memberCategory('male', '2015-06-01', TODAY)).toBe('boy')
    expect(memberCategory('female', '2015-06-01', TODAY)).toBe('girl')
  })

  it('applique exactement la frontière des 16 ans', () => {
    expect(CHILD_MAX_AGE).toBe(15)
    // 15 ans le 03/10/2026 → encore enfant.
    expect(memberCategory('male', '2010-10-04', TODAY)).toBe('boy')
    // 16 ans pile le 03/10/2026 → adulte.
    expect(memberCategory('male', '2010-10-03', TODAY)).toBe('adult_male')
    expect(memberCategory('female', '2010-10-04', TODAY)).toBe('girl')
    expect(memberCategory('female', '2010-10-03', TODAY)).toBe('adult_female')
  })

  it('bascule automatiquement d’une catégorie à l’autre avec l’âge', () => {
    const naissance = '2012-03-10'
    expect(memberCategory('male', naissance, new Date(2026, 9, 3))).toBe('boy') // 14 ans
    expect(memberCategory('male', naissance, new Date(2028, 2, 9))).toBe('boy') // 15 ans
    expect(memberCategory('male', naissance, new Date(2028, 2, 10))).toBe('adult_male') // 16 ans
  })

  it('retombe sur unknown si la date est inexploitable', () => {
    expect(memberCategory('male', null, TODAY)).toBe('unknown')
    expect(memberCategory('male', '0003-04-30', TODAY)).toBe('unknown')
    expect(memberCategory('female', '275760-04-07', TODAY)).toBe('unknown')
  })

  it('retombe sur unknown si le genre n’est pas reconnu', () => {
    expect(memberCategory(null, '1990-05-15', TODAY)).toBe('unknown')
    expect(memberCategory('', '1990-05-15', TODAY)).toBe('unknown')
    expect(memberCategory('autre', '1990-05-15', TODAY)).toBe('unknown')
    // Genre mais date inconnue : la catégorie est indéterminable.
    expect(memberCategory('male', null, TODAY)).toBe('unknown')
  })

  it('ne confond pas « non binaire » avec un enfant', () => {
    // Un genre hors liste ne doit surtout pas être classé enfant/garçon.
    expect(memberCategory('non-binaire', '2015-06-01', TODAY)).toBe('unknown')
  })

  it('accepte les libellés français de genre', () => {
    expect(memberCategory('garçon', '1990-05-15', TODAY)).toBe('adult_male')
    expect(memberCategory('fille', '2015-06-01', TODAY)).toBe('girl')
  })
})

describe('helpers de catégorie', () => {
  it('isChildCategory', () => {
    expect(isChildCategory('boy')).toBe(true)
    expect(isChildCategory('girl')).toBe(true)
    expect(isChildCategory('adult_male')).toBe(false)
    expect(isChildCategory('unknown')).toBe(false)
  })

  it('emptyCategoryCounts couvre les 5 catégories', () => {
    const counts = emptyCategoryCounts()
    expect(Object.keys(counts).sort()).toEqual([...MEMBER_CATEGORIES].sort())
    expect(Object.values(counts).every((n) => n === 0)).toBe(true)
  })

  it('countByCategory', () => {
    const items = ['boy', 'boy', 'girl', 'adult_male', 'unknown'] as MemberCategory[]
    const counts = countByCategory(items, (c) => c)
    expect(counts).toEqual({
      adult_male: 1,
      adult_female: 0,
      boy: 2,
      girl: 1,
      unknown: 1,
    })
  })

  it('countByCategory sur une liste vide', () => {
    expect(countByCategory([], (c: MemberCategory) => c)).toEqual(emptyCategoryCounts())
  })

  it('asMemberCategory tolère une valeur inattendue', () => {
    expect(asMemberCategory('girl')).toBe('girl')
    expect(asMemberCategory('garçon')).toBe('unknown')
    expect(asMemberCategory(null)).toBe('unknown')
    expect(asMemberCategory(42)).toBe('unknown')
  })
})

describe('cohérence avec les données réelles', () => {
  // Répartition mesurée en base le 03/10/2026 (migration 00137 appliquée).
  it('reproduit la répartition constatée', () => {
    const rows: Array<[string, string, MemberCategory]> = [
      ['male', '1990-01-01', 'adult_male'],
      ['female', '1985-03-12', 'adult_female'],
      ['male', '2015-06-01', 'boy'],
      ['female', '2014-02-20', 'girl'],
      ['male', '0003-04-30', 'unknown'],
    ]
    for (const [gender, birth, attendu] of rows) {
      expect(memberCategory(gender, birth, TODAY)).toBe(attendu)
    }
  })
})