import { db } from '@/lib/db/dexie-db';

export async function logAudit(params: {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  details?: string;
}) {
  await db.auditLogs.add({
    userId: params.userId,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    details: params.details ? JSON.stringify(params.details) : undefined,
    timestamp: new Date().toISOString(),
  });
}
