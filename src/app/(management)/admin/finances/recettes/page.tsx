'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency, formatDate } from '@/lib/utils/date';

export default function RecettesPage() {
  const payments = useLiveQuery(() => db.payments.toArray());
  const sales = useLiveQuery(() => db.sales.toArray());
  const [period, setPeriod] = useState('daily');

  const transactions = useMemo(() => {
    const items: { date: string; label: string; type: string; amount: number }[] = [];
    (payments || []).forEach(p => items.push({ date: p.date, label: `Paiement abonnement`, type: 'Abonnement', amount: p.amount }));
    (sales || []).filter(s => s.status !== 'returned').forEach(s => items.push({ date: s.createdAt, label: `Vente #${s.receiptNumber}`, type: 'POS', amount: s.total }));
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [payments, sales]);

  const grouped = useMemo(() => {
    const groups: Record<string, { count: number; total: number; items: typeof transactions }> = {};
    for (const t of transactions) {
      const key = period === 'daily' ? t.date.slice(0, 10) : period === 'monthly' ? t.date.slice(0, 7) : t.date.slice(0, 4);
      if (!groups[key]) groups[key] = { count: 0, total: 0, items: [] };
      groups[key].count++;
      groups[key].total += t.amount;
      groups[key].items.push(t);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [transactions, period]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recettes</h1>
          <p className="text-muted text-sm mt-1">Total: {formatCurrency(transactions.reduce((s, t) => s + t.amount, 0))}</p>
        </div>
        <select value={period} onChange={e => setPeriod(e.target.value)} className="px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm">
          <option value="daily">Quotidien</option>
          <option value="monthly">Mensuel</option>
          <option value="yearly">Annuel</option>
        </select>
      </div>

      <div className="space-y-3">
        {grouped.map(([key, group]) => (
          <div key={key} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">{key}</span>
              <span className="text-sm text-green-400 font-bold">{formatCurrency(group.total)} ({group.count} transactions)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
