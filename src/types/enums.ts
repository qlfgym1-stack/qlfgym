export enum Role {
  ADMIN = 'admin',
  RECEPTION = 'reception',
}

export enum MemberRole {
  MEMBER = 'member',
  COACH = 'coach',
}

export enum SubscriptionType {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  SEMESTER = 'semester',
  ANNUAL = 'annual',
  CUSTOM = 'custom',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  FROZEN = 'frozen',
  EXPIRED = 'expired',
  CANCELED = 'canceled',
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  TRANSFER = 'transfer',
  CHECK = 'check',
}

export enum CheckinType {
  ENTRY = 'entry',
  EXIT = 'exit',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
}

export enum DocumentType {
  MEDICAL = 'medical',
  ID = 'id',
  CONTRACT = 'contract',
  OTHER = 'other',
}

export enum CRMInteractionType {
  CALL = 'call',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  NOTE = 'note',
  VISIT = 'visit',
}

export enum FinanceTransactionType {
  REVENUE = 'revenue',
  EXPENSE = 'expense',
}

export enum RevenueCategory {
  SUBSCRIPTION = 'subscription',
  POS = 'pos',
  OTHER = 'other',
}

export enum SaleStatus {
  COMPLETED = 'completed',
  RETURNED = 'returned',
  PARTIALLY_RETURNED = 'partially_returned',
}

export enum TimeSlot {
  SIX_NINE = '6h-9h',
  NINE_TWELVE = '9h-12h',
  TWELVE_FOURTEEN = '12h-14h',
  FOURTEEN_SEVENTEEN = '14h-17h',
  SEVENTEEN_TWENTY = '17h-20h',
  TWENTY_TWENTYTWO = '20h-22h',
}

export enum WeekPeriod {
  DEBUT = 'debut',
  FIN = 'fin',
}
