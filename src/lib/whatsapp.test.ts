import { describe, it, expect } from 'vitest'
import {
  WaTemplateKey,
  WA_TEMPLATE_KEYS,
  DEFAULT_TEMPLATES,
  formatPhone,
  formatWhatsAppPhone,
  getTemplate,
} from './whatsapp'

describe('formatPhone', () => {
  it('keeps only digits', () => {
    expect(formatPhone('+213 (0) 555-12 34 56')).toBe('2130555123456')
  })

  it('returns empty string when no digits', () => {
    expect(formatPhone('abc - ()')).toBe('')
  })
})

describe('formatWhatsAppPhone', () => {
  it('converts local DZ number with leading 0 to international', () => {
    expect(formatWhatsAppPhone('0555123456')).toBe('213555123456')
  })

  it('keeps +213 number without leading 0', () => {
    expect(formatWhatsAppPhone('+213555123456')).toBe('213555123456')
  })

  it('converts 00213 prefix', () => {
    expect(formatWhatsAppPhone('00213555123456')).toBe('213555123456')
  })

  it('handles already-standard international digits', () => {
    expect(formatWhatsAppPhone('213555123456')).toBe('213555123456')
  })

  it('returns empty string for invalid or missing number', () => {
    expect(formatWhatsAppPhone('')).toBe('')
    expect(formatWhatsAppPhone('12345')).toBe('')
  })
})

describe('getTemplate', () => {
  it('replaces all occurrences of a placeholder', () => {
    const out = getTemplate('{NOM}, bienvenue chez {NOM}', { NOM: 'Karim' })
    expect(out).toBe('Karim, bienvenue chez Karim')
  })

  it('replaces numeric values as strings', () => {
    const out = getTemplate('expire dans {JOURS} jours', { JOURS: 5 })
    expect(out).toBe('expire dans 5 jours')
  })

  it('leaves unknown placeholders untouched', () => {
    const out = getTemplate('Bonjour {NOM}', { PRENOM: 'Karim' })
    expect(out).toBe('Bonjour {NOM}')
  })
})

describe('DEFAULT_TEMPLATES', () => {
  it('exposes a template for every key', () => {
    for (const key of WA_TEMPLATE_KEYS) {
      expect(DEFAULT_TEMPLATES[key as WaTemplateKey]).toBeTruthy()
    }
  })

  it('renewal template references expected variables', () => {
    const tpl = DEFAULT_TEMPLATES.renewal
    expect(tpl).toContain('{NOM}')
    expect(tpl).toContain('{DATE}')
    expect(tpl).toContain('{NOM_SALLE}')
  })

  it('birthday template references the member name', () => {
    expect(DEFAULT_TEMPLATES.birthday).toContain('{NOM}')
  })
})
