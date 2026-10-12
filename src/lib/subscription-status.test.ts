import { describe, it, expect } from 'vitest'
import { computeSubscriptionStatus } from './subscription-status'

const TODAY = '2026-10-10'

describe('computeSubscriptionStatus', () => {
  it('returns null when dates are missing', () => {
    expect(computeSubscriptionStatus({ currentStatus: null, startDate: null, endDate: null, today: TODAY })).toBeNull()
    expect(computeSubscriptionStatus({ currentStatus: null, startDate: '', endDate: '2026-12-01', today: TODAY })).toBeNull()
    expect(computeSubscriptionStatus({ currentStatus: null, startDate: '2026-10-01', endDate: '', today: TODAY })).toBeNull()
  })

  it('returns null when start is after end', () => {
    expect(computeSubscriptionStatus({ currentStatus: null, startDate: '2026-12-01', endDate: '2026-11-01', today: TODAY })).toBeNull()
  })

  it('marks an in-progress subscription active', () => {
    expect(computeSubscriptionStatus({ currentStatus: null, startDate: '2026-09-01', endDate: '2026-10-31', today: TODAY })).toBe('active')
  })

  it('marks a subscription ending today active', () => {
    expect(computeSubscriptionStatus({ currentStatus: null, startDate: '2026-01-01', endDate: TODAY, today: TODAY })).toBe('active')
  })

  it('marks an ended subscription expired', () => {
    expect(computeSubscriptionStatus({ currentStatus: null, startDate: '2026-09-01', endDate: '2026-10-01', today: TODAY })).toBe('expired')
  })

  it('treats a future start as active immediately (règle 00143)', () => {
    expect(computeSubscriptionStatus({ currentStatus: null, startDate: '2026-10-20', endDate: '2027-01-20', today: TODAY })).toBe('active')
  })

  it('preserves pending_payment status', () => {
    expect(computeSubscriptionStatus({ currentStatus: 'pending_payment', startDate: '2026-10-01', endDate: '2026-10-31', today: TODAY })).toBe('pending_payment')
    expect(computeSubscriptionStatus({ currentStatus: 'pending_payment', startDate: '2026-12-01', endDate: '2027-01-01', today: TODAY })).toBe('pending_payment')
  })

  it('preserves cancelled status', () => {
    expect(computeSubscriptionStatus({ currentStatus: 'cancelled', startDate: '2026-10-01', endDate: '2026-10-31', today: TODAY })).toBe('cancelled')
  })

  it('recomputes active and expired subscriptions from end date', () => {
    expect(computeSubscriptionStatus({ currentStatus: 'active', startDate: '2026-09-01', endDate: '2026-10-09', today: TODAY })).toBe('expired')
    expect(computeSubscriptionStatus({ currentStatus: 'expired', startDate: '2026-09-01', endDate: '2026-11-01', today: TODAY })).toBe('active')
  })
})