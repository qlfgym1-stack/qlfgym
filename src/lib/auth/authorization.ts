import { Role } from '@/types/enums';
import { PERMISSIONS } from '@/lib/constants/roles';

export function canAccessModule(
  role: string,
  module: keyof typeof PERMISSIONS,
  action: 'view' | 'create' | 'edit' | 'delete' = 'view'
): boolean {
  const permissions = PERMISSIONS[module];
  if (!permissions) return false;
  const allowed = (permissions as any)[action] as readonly string[] | undefined;
  if (!allowed) return false;
  return allowed.includes(role);
}

export function requireRole(role: string, allowedRoles: string[]): void {
  if (!allowedRoles.includes(role)) {
    throw new Error('ACCÈS REFUSÉ : permissions insuffisantes');
  }
}
