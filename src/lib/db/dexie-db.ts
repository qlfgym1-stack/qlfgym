import Dexie, { type EntityTable } from 'dexie';
import type { Member, Profile, Contract, Document, Checkin, MembershipType, Payment, Product, ProductCategory, Sale, SaleItem, Return, Personnel, StaffSchedule, StaffPerformance, Turnstile, AccessLog, CoachGroup, CoachGroupMember, CoachRemuneration, FinanceTransaction, RevenueDaily, Expense, CRMInteraction, Campaign, Notification, AuditLog, SyncQueueEntry } from '@/types/models';

export class QLFDatabase extends Dexie {
  members!: EntityTable<Member, 'id'>;
  profiles!: EntityTable<Profile, 'id'>;
  contracts!: EntityTable<Contract, 'id'>;
  documents!: EntityTable<Document, 'id'>;
  checkins!: EntityTable<Checkin, 'id'>;
  membershipTypes!: EntityTable<MembershipType, 'id'>;
  payments!: EntityTable<Payment, 'id'>;
  products!: EntityTable<Product, 'id'>;
  productCategories!: EntityTable<ProductCategory, 'id'>;
  sales!: EntityTable<Sale, 'id'>;
  saleItems!: EntityTable<SaleItem, 'id'>;
  returns!: EntityTable<Return, 'id'>;
  personnel!: EntityTable<Personnel, 'id'>;
  staffSchedules!: EntityTable<StaffSchedule, 'id'>;
  staffPerformance!: EntityTable<StaffPerformance, 'id'>;
  turnstiles!: EntityTable<Turnstile, 'id'>;
  accessLogs!: EntityTable<AccessLog, 'id'>;
  coachGroups!: EntityTable<CoachGroup, 'id'>;
  coachGroupMembers!: EntityTable<CoachGroupMember, 'id'>;
  coachRemunerations!: EntityTable<CoachRemuneration, 'id'>;
  financeTransactions!: EntityTable<FinanceTransaction, 'id'>;
  revenueDaily!: EntityTable<RevenueDaily, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  crmInteractions!: EntityTable<CRMInteraction, 'id'>;
  campaigns!: EntityTable<Campaign, 'id'>;
  notifications!: EntityTable<Notification, 'id'>;
  auditLogs!: EntityTable<AuditLog, 'id'>;
  syncQueue!: EntityTable<SyncQueueEntry, 'id'>;
  clubInfo!: EntityTable<{ id: string; [key: string]: any }, 'id'>;

  constructor() {
    super('qlf-fitness');
    this.version(1).stores({
      members: '++id, &email, &phone, &memberNumber, gender, birthDate, role, coachId, subscription.status',
      profiles: '++id, memberId',
      contracts: '++id, memberId, status',
      documents: '++id, memberId, type',
      checkins: '++id, memberId, timestamp, type',
      membershipTypes: '++id, duration',
      payments: '++id, memberId, date, method',
      products: '++id, name, barcode, categoryId, active',
      productCategories: '++id, name, parentId',
      sales: '++id, receiptNumber, createdAt, status',
      saleItems: '++id, saleId, productId',
      returns: '++id, saleId, productId',
      personnel: '++id, &email, role, active',
      staffSchedules: '++id, personnelId, dayOfWeek',
      staffPerformance: '++id, personnelId, period',
      turnstiles: '++id, name, status',
      accessLogs: '++id, memberId, turnstileId, timestamp',
      coachGroups: '++id, coachId',
      coachGroupMembers: '++id, groupId, memberId',
      coachRemunerations: '++id, coachId, period, status',
      financeTransactions: '++id, type, category, date',
      revenueDaily: '++id, date',
      expenses: '++id, category, date',
      crmInteractions: '++id, memberId, type, createdAt',
      campaigns: '++id, name, status',
      notifications: '++id, userId, read, createdAt',
      auditLogs: '++id, userId, action, entity, entityId, timestamp',
      syncQueue: '++id, entity, status, timestamp',
      clubInfo: 'id',
    });
  }
}

export const db = new QLFDatabase();
