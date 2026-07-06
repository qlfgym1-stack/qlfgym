import { TimeSlot, WeekPeriod } from '@/types/enums';

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount);
}

export function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function getTimeSlot(date: Date): TimeSlot {
  const h = date.getHours();
  if (h < 9) return TimeSlot.SIX_NINE;
  if (h < 12) return TimeSlot.NINE_TWELVE;
  if (h < 14) return TimeSlot.TWELVE_FOURTEEN;
  if (h < 17) return TimeSlot.FOURTEEN_SEVENTEEN;
  if (h < 20) return TimeSlot.SEVENTEEN_TWENTY;
  return TimeSlot.TWENTY_TWENTYTWO;
}

export function getWeekPeriod(date: Date): WeekPeriod {
  const day = date.getDay();
  return day <= 3 ? WeekPeriod.DEBUT : WeekPeriod.FIN;
}

export function isExpired(endDate: string): boolean {
  return new Date(endDate) < new Date();
}

export function daysUntil(endDate: string): number {
  const diff = new Date(endDate).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function generateMemberNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `QLF-${year}-${random}`;
}

export function generateReceiptNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `RCP-${ts}-${rand}`;
}

export function getAgeGroup(age: number): string {
  if (age < 18) return '12-17';
  if (age < 26) return '18-25';
  if (age < 36) return '26-35';
  if (age < 46) return '36-45';
  if (age < 61) return '46-60';
  return '60+';
}
