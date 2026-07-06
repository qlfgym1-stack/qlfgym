import { SubscriptionType } from '@/types/enums';

export const SUBSCRIPTION_LABELS: Record<string, string> = {
  [SubscriptionType.MONTHLY]: 'Mensuel',
  [SubscriptionType.QUARTERLY]: 'Trimestriel',
  [SubscriptionType.SEMESTER]: 'Semestriel',
  [SubscriptionType.ANNUAL]: 'Annuel',
  [SubscriptionType.CUSTOM]: 'Personnalisé',
};

export const SUBSCRIPTION_DURATIONS: Record<string, number> = {
  [SubscriptionType.MONTHLY]: 30,
  [SubscriptionType.QUARTERLY]: 90,
  [SubscriptionType.SEMESTER]: 180,
  [SubscriptionType.ANNUAL]: 365,
};

export interface SubscriptionPlan {
  id: string;
  type: SubscriptionType;
  label: string;
  durationDays: number;
  defaultPrice: number;
  fractionalAllowed: boolean;
  maxInstallments: number;
}

export const DEFAULT_PLANS: SubscriptionPlan[] = [
  { id: 'monthly', type: SubscriptionType.MONTHLY, label: 'Mensuel', durationDays: 30, defaultPrice: 5000, fractionalAllowed: false, maxInstallments: 1 },
  { id: 'quarterly', type: SubscriptionType.QUARTERLY, label: 'Trimestriel', durationDays: 90, defaultPrice: 13500, fractionalAllowed: true, maxInstallments: 3 },
  { id: 'semester', type: SubscriptionType.SEMESTER, label: 'Semestriel', durationDays: 180, defaultPrice: 24000, fractionalAllowed: true, maxInstallments: 6 },
  { id: 'annual', type: SubscriptionType.ANNUAL, label: 'Annuel', durationDays: 365, defaultPrice: 42000, fractionalAllowed: true, maxInstallments: 12 },
];
