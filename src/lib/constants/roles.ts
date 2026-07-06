import { Role } from '@/types/enums';

export const ROLE_LABELS: Record<string, string> = {
  [Role.ADMIN]: 'Administrateur',
  [Role.RECEPTION]: 'Réception',
};

export const PERMISSIONS = {
  members: {
    view: [Role.ADMIN, Role.RECEPTION],
    create: [Role.ADMIN, Role.RECEPTION],
    edit: [Role.ADMIN, Role.RECEPTION],
    delete: [Role.ADMIN],
  },
  personnel: {
    view: [Role.ADMIN],
    create: [Role.ADMIN],
    edit: [Role.ADMIN],
    delete: [Role.ADMIN],
  },
  pos: {
    view: [Role.ADMIN, Role.RECEPTION],
    create: [Role.ADMIN, Role.RECEPTION],
    edit: [Role.ADMIN],
    delete: [Role.ADMIN],
  },
  finance: {
    view: [Role.ADMIN],
    create: [Role.ADMIN],
    edit: [Role.ADMIN],
    delete: [Role.ADMIN],
  },
  subscriptions: {
    view: [Role.ADMIN, Role.RECEPTION],
    create: [Role.ADMIN, Role.RECEPTION],
    edit: [Role.ADMIN],
    delete: [Role.ADMIN],
  },
  coaches: {
    view: [Role.ADMIN],
    create: [Role.ADMIN],
    edit: [Role.ADMIN],
    delete: [Role.ADMIN],
  },
  crm: {
    view: [Role.ADMIN],
    create: [Role.ADMIN],
    edit: [Role.ADMIN],
    delete: [Role.ADMIN],
  },
  reports: {
    view: [Role.ADMIN],
    create: [Role.ADMIN],
  },
  settings: {
    view: [Role.ADMIN],
    edit: [Role.ADMIN],
  },
  checkin: {
    view: [Role.ADMIN, Role.RECEPTION],
    create: [Role.ADMIN, Role.RECEPTION],
  },
  dashboard: {
    view: [Role.ADMIN],
  },
} as const;

export const REDIRECTS: Record<string, string> = {
  [Role.ADMIN]: '/admin',
  [Role.RECEPTION]: '/reception',
};
