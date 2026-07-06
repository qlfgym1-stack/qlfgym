import {
  Role, MemberRole, SubscriptionType, SubscriptionStatus,
  PaymentMethod, CheckinType, Gender, DocumentType,
  CRMInteractionType, FinanceTransactionType, RevenueCategory,
  SaleStatus, TimeSlot, WeekPeriod,
} from './enums';

export interface Member {
  id?: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: Gender;
  birthDate: string;
  city?: string;
  address?: string;
  photoUrl?: string;
  role: MemberRole;
  goals?: string[];
  notes?: string;
  coachId?: string;
  subscription: Subscription;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  type: SubscriptionType;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  frozenAt?: string;
  frozenUntil?: string;
  frozenDays?: number;
  canceledAt?: string;
  cancelReason?: string;
  autoRenew: boolean;
  price: number;
  installmentCount?: number;
  installmentAmount?: number;
}

export interface Profile {
  id?: string;
  memberId: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  healthInfo?: string;
  medicalConditions?: string;
}

export interface Contract {
  id?: string;
  memberId: string;
  type: string;
  startDate: string;
  endDate?: string;
  fileUrl?: string;
  signedAt?: string;
  status: string;
  createdAt: string;
}

export interface Document {
  id?: string;
  memberId: string;
  type: DocumentType;
  name: string;
  fileUrl: string;
  uploadedAt: string;
  expiresAt?: string;
}

export interface Checkin {
  id?: string;
  memberId: string;
  timestamp: string;
  type: CheckinType;
}

export interface MembershipType {
  id?: string;
  name: string;
  duration: SubscriptionType;
  durationDays: number;
  price: number;
  fractionalAllowed: boolean;
  maxInstallments: number;
  description?: string;
}

export interface Payment {
  id?: string;
  memberId: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  reference?: string;
  receiptNumber?: string;
  paymentFor: 'subscription' | 'pos' | 'other';
  notes?: string;
  createdAt: string;
}

export interface ProductCategory {
  id?: string;
  name: string;
  parentId?: string;
  sortOrder: number;
}

export interface Product {
  id?: string;
  name: string;
  barcode?: string;
  categoryId: string;
  price: number;
  cost?: number;
  margin?: number;
  stock: number;
  alertStock: number;
  supplier?: string;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Sale {
  id?: string;
  receiptNumber: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  memberId?: string;
  status: SaleStatus;
  returnedAt?: string;
  createdAt: string;
}

export interface SaleItem {
  id?: string;
  saleId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
}

export interface Return {
  id?: string;
  saleId: string;
  productId: string;
  quantity: number;
  reason: string;
  refundAmount: number;
  createdAt: string;
}

export interface Personnel {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: Role;
  photoUrl?: string;
  contractType?: string;
  salary?: number;
  hireDate: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaffSchedule {
  id?: string;
  personnelId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface StaffPerformance {
  id?: string;
  personnelId: string;
  period: string;
  metric: string;
  value: number;
}

export interface StaffSession {
  id?: string;
  userId: string;
  username: string;
  start: string;
  end?: string;
  heartbeat?: string;
}

export interface Turnstile {
  id?: string;
  name: string;
  location: string;
  status: 'active' | 'inactive' | 'maintenance';
}

export interface AccessLog {
  id?: string;
  memberId: string;
  turnstileId: string;
  timestamp: string;
  type: 'granted' | 'denied';
}

export interface CoachGroup {
  id?: string;
  coachId: string;
  name: string;
  createdAt: string;
}

export interface CoachGroupMember {
  id?: string;
  groupId: string;
  memberId: string;
  assignedAt: string;
}

export interface CoachRemuneration {
  id?: string;
  coachId: string;
  period: string;
  memberCount: number;
  ratePerMember: number;
  totalAmount: number;
  paidAt?: string;
  status: 'pending' | 'paid';
}

export interface FinanceTransaction {
  id?: string;
  type: FinanceTransactionType;
  category: string;
  amount: number;
  date: string;
  description: string;
  referenceType?: string;
  referenceId?: string;
  receiptUrl?: string;
  createdAt: string;
}

export interface RevenueDaily {
  id?: string;
  date: string;
  subscriptionsAmount: number;
  posAmount: number;
  otherAmount: number;
  totalAmount: number;
}

export interface Expense {
  id?: string;
  category: string;
  amount: number;
  date: string;
  description: string;
  receiptUrl?: string;
  recurring: boolean;
  recurringInterval?: string;
  createdAt: string;
}

export interface CRMInteraction {
  id?: string;
  memberId: string;
  type: CRMInteractionType;
  content: string;
  staffId: string;
  createdAt: string;
}

export interface Campaign {
  id?: string;
  name: string;
  type: string;
  status: 'draft' | 'active' | 'completed' | 'canceled';
  templateId?: string;
  targetFilter?: string;
  sentAt?: string;
  createdAt: string;
}

export interface Notification {
  id?: string;
  userId: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface AuditLog {
  id?: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  details?: string;
  timestamp: string;
}

export interface SyncQueueEntry {
  id?: number;
  entity: string;
  action: 'create' | 'update' | 'delete';
  payload: string;
  status: 'pending' | 'syncing' | 'synced' | 'error';
  timestamp: string;
}
