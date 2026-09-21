import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return toUpper(new Intl.NumberFormat('fr-DZ', {
    style: 'currency',
    currency: 'DZD',
  }).format(amount));
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd/MM/yyyy', { locale: fr });
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: fr });
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.charAt(0)?.toUpperCase() || ''}${lastName?.charAt(0)?.toUpperCase() || ''}`;
}

type NameParts = { first_name?: string | null; last_name?: string | null; full_name?: string | null };

/** Nom complet d'un membre (NOM & PRÉNOM) : full_name si présent, sinon concaténation. */
export function memberFullName(m: NameParts): string {
  const full = m.full_name?.trim()
  if (full) return full
  return [m.first_name, m.last_name].filter(Boolean).join(" ")
}

/** Découpe un champ unique "NOM & PRÉNOM" en first_name/last_name (compat colonnes existantes). */
export function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first_name: "", last_name: "" }
  if (parts.length === 1) return { first_name: parts[0], last_name: "" }
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") }
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'bg-success/10 text-success',
    expired: 'bg-destructive/10 text-destructive',
    cancelled: 'bg-muted text-muted-foreground',
    pending: 'bg-warning/10 text-warning',
    pending_payment: 'bg-warning/10 text-warning',
    completed: 'bg-success/10 text-success',
    open: 'bg-primary/10 text-primary',
    closed: 'bg-muted text-muted-foreground',
  };
  return colors[status] || 'bg-muted text-muted-foreground';
}

export function getDaysRemaining(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function toUpper(str: string | null | undefined): string {
  if (!str) return str ?? "";
  return str.toUpperCase();
}

const DZ_PHONE_REGEX = /^(05|06|07)\d{8}$/;

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('213') && digits.length === 12) return '0' + digits.slice(3)
  if (digits.startsWith('00213') && digits.length === 14) return '0' + digits.slice(5)
  if (digits.startsWith('0') && digits.length === 10) return digits
  return phone
}

export function isValidDzPhone(phone: string): boolean {
  return DZ_PHONE_REGEX.test(formatPhone(phone))
}

export function displayPhone(phone: string | null | undefined): string {
  const f = formatPhone(phone)
  if (!f) return '-'
  return `${f.slice(0, 2)} ${f.slice(2, 4)} ${f.slice(4, 6)} ${f.slice(6, 8)} ${f.slice(8)}`
}

/**
 * Nettoie les notes de paiement héritées d'un import (format `LINE=5|LEGACY_MEMBER=4|LEGACY_SUB=4 - Mensuel`).
 * Retire les métadonnées techniques (ligne d'import, anciens IDs) et ne garde que le libellé exploitable.
 */
export function cleanPaymentNotes(notes: string | null | undefined): string {
  if (!notes) return ""
  return String(notes)
    .replace(/\bline\s*=\s*[0-9]+\b/gi, " ")
    .replace(/\blegacy_[a-z0-9_]+\s*=\s*[^|\s]+/gi, " ")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
