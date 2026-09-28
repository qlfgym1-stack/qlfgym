import { describe, it, expect } from 'vitest'
import {
  normalizeHeader,
  buildColumnIndex,
  canonicalValues,
  MEMBER_ALIASES,
  EXPENSE_ALIASES,
  PAYMENT_ALIASES,
  PRODUCT_ALIASES,
} from './xlsxImport'

describe('normalizeHeader', () => {
  it('retire accents, casse et espaces pour les en-têtes français', () => {
    expect(normalizeHeader('Nom complet')).toBe('nom complet')
    expect(normalizeHeader('Téléphone d\'urgence')).toBe('telephone d urgence')
    expect(normalizeHeader('Carte entreprise')).toBe('carte entreprise')
  })
})

describe('buildColumnIndex', () => {
  it("mappe les en-têtes exportés (FR/EN/AR) vers les clés canoniques", () => {
    const exportsFR = ['N°', 'Prénom', 'Nom', 'Nom complet', 'Genre', 'Date de naissance', 'E-mail', 'Téléphone']
    const idx = buildColumnIndex(exportsFR, MEMBER_ALIASES)
    expect(idx.firstName).toBe(1)
    expect(idx.lastName).toBe(2)
    expect(idx.name).toBe(3)
    expect(idx.gender).toBe(4)
    expect(idx.birthDate).toBe(5)
    expect(idx.email).toBe(6)
    expect(idx.phone).toBe(7)
    expect(idx.memberNumber).toBe(0)
  })

  it('mappe les en-têtes anglais (roundtrip EN)', () => {
    const exportsEN = ['No.', 'First Name', 'Last Name', 'Full Name', 'Email', 'Phone', 'Status']
    const idx = buildColumnIndex(exportsEN, MEMBER_ALIASES)
    expect(idx.firstName).toBe(1)
    expect(idx.lastName).toBe(2)
    expect(idx.name).toBe(3)
    expect(idx.email).toBe(4)
    expect(idx.phone).toBe(5)
    expect(idx.status).toBe(6)
    expect(idx.memberNumber).toBe(0)
  })
})

describe('roundtrip membre', () => {
  it('lit une ligne exportée (FR) avec valeurs canoniques', () => {
    const headers = ['N°', 'Nom complet', 'E-mail', 'Téléphone', 'Genre']
    const index = buildColumnIndex(headers, MEMBER_ALIASES)
    const cells = ['QLF-00001', 'Jean Dupont', 'jean@x.com', '0555123456', 'male']
    const row = canonicalValues(cells, index)
    expect(row.memberNumber).toBe('QLF-00001')
    expect(row.name).toBe('Jean Dupont')
    expect(row.email).toBe('jean@x.com')
    expect(row.phone).toBe('0555123456')
    expect(row.gender).toBe('male')
  })

  it('ignore les cellules vides', () => {
    const headers = ['Nom complet', 'E-mail']
    const index = buildColumnIndex(headers, MEMBER_ALIASES)
    const row = canonicalValues(['Jean Dupont', ''], index)
    expect(row.name).toBe('Jean Dupont')
    expect(row.email).toBeUndefined()
  })
})

describe('roundtrip dépenses', () => {
  it('mappe les en-têtes d\'export', () => {
    const headers = ['Catégorie', 'Description', 'Montant', 'Date']
    const index = buildColumnIndex(headers, EXPENSE_ALIASES)
    const row = canonicalValues(['Achat matériel', 'Tapis de sol', '25000', '2026-09-28'], index)
    expect(row.category).toBe('Achat matériel')
    expect(row.description).toBe('Tapis de sol')
    expect(row.amount).toBe('25000')
    expect(row.expense_date).toBe('2026-09-28')
  })
})

describe('roundtrip paiements', () => {
  it('mappe les en-têtes d\'export', () => {
    const headers = ['Membre', 'Montant', 'Méthode', 'Date']
    const index = buildColumnIndex(headers, PAYMENT_ALIASES)
    const row = canonicalValues(['Jean Dupont', '2400', 'cash', '2026-09-28'], index)
    expect(row.member_name).toBe('Jean Dupont')
    expect(row.amount).toBe('2400')
    expect(row.payment_method).toBe('cash')
    expect(row.payment_date).toBe('2026-09-28')
  })
})

describe('roundtrip produits', () => {
  it('mappe les en-têtes d\'export produit', () => {
    const headers = ['Code-barres', 'NOM', 'Catégorie', 'PRICE DA', 'STOCK']
    const index = buildColumnIndex(headers, PRODUCT_ALIASES)
    const row = canonicalValues(['123456', 'Protéine', 'Nutrition', '3500', '12'], index)
    expect(row.barcode).toBe('123456')
    expect(row.name).toBe('Protéine')
    expect(row.category).toBe('Nutrition')
    expect(row.price).toBe('3500')
    expect(row.stock).toBe('12')
  })
})