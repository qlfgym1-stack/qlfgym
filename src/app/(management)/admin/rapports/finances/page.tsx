'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency } from '@/lib/utils/date';
import * as XLSX from 'xlsx';

export default function RapportFinancesPage() {
  const payments = useLiveQuery(() => db.payments.toArray());
  const sales = useLiveQuery(() => db.sales.toArray());
  const expenses = useLiveQuery(() => db.expenses.toArray());
  const remunerations = useLiveQuery(() => db.coachRemunerations.toArray());

  const exportExcel = () => {
    const revenueData = (payments || []).map(p => ({ Type: 'Abonnement', Montant: p.amount, Date: p.date, Méthode: p.method }));
    const salesData = (sales || []).map(s => ({ Type: 'Vente POS', Montant: s.total, Date: s.createdAt, Ticket: s.receiptNumber }));
    const expenseData = (expenses || []).map(e => ({ Type: 'Dépense', Montant: -e.amount, Date: e.date, Description: e.description }));
    const coachData = (remunerations || []).filter(r => r.status === 'paid').map(r => ({ Type: 'Rémunération coach', Montant: -r.totalAmount, Date: '', Période: r.period }));

    const all = [...revenueData, ...salesData, ...expenseData, ...coachData].sort((a, b) => (a.Date || '').localeCompare(b.Date || ''));
    const ws = XLSX.utils.json_to_sheet(all);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Finances');
    XLSX.writeFile(wb, 'rapport-finances.xlsx');
  };

  const totalRevenue = [...(payments || []), ...(sales || [])].reduce((s, t) => s + ('amount' in t ? t.amount : t.total), 0);
  const totalExpenses = [...(expenses || []), ...(remunerations || []).filter(r => r.status === 'paid')].reduce((s, t) => s + ('amount' in t ? t.amount : t.totalAmount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rapport Finances</h1>
          <p className="text-muted text-sm mt-1">Revenus: {formatCurrency(totalRevenue)} · Dépenses: {formatCurrency(totalExpenses)}</p>
        </div>
        <button onClick={exportExcel} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">Export Excel</button>
      </div>
    </div>
  );
}
