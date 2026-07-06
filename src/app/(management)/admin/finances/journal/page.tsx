'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatDateTime, formatCurrency } from '@/lib/utils/date';

export default function JournalCaissePage() {
  const payments = useLiveQuery(() => db.payments.toArray());
  const sales = useLiveQuery(() => db.sales.toArray());
  const expenses = useLiveQuery(() => db.expenses.toArray());
  const remunerations = useLiveQuery(() => db.coachRemunerations.toArray());

  const entries = useMemo(() => {
    const items: { date: string; label: string; type: 'recette' | 'depense'; amount: number }[] = [];
    (payments || []).forEach(p => items.push({ date: p.date, label: `Paiement abonnement`, type: 'recette', amount: p.amount }));
    (sales || []).filter(s => s.status !== 'returned').forEach(s => items.push({ date: s.createdAt, label: `Vente #${s.receiptNumber}`, type: 'recette', amount: s.total }));
    (expenses || []).forEach(e => items.push({ date: e.date, label: e.description || e.category, type: 'depense', amount: e.amount }));
    (remunerations || []).filter(r => r.status === 'paid').forEach(r => items.push({ date: r.paidAt || r.period, label: `Rémunération coach`, type: 'depense', amount: r.totalAmount }));
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [payments, sales, expenses, remunerations]);

  const totalRecettes = entries.filter(e => e.type === 'recette').reduce((s, e) => s + e.amount, 0);
  const totalDepenses = entries.filter(e => e.type === 'depense').reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Journal de caisse</h1>
        <p className="text-muted text-sm mt-1">Recettes: {formatCurrency(totalRecettes)} · Dépenses: {formatCurrency(totalDepenses)} · Solde: {formatCurrency(totalRecettes - totalDepenses)}</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-muted">
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Libellé</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border-b border-border hover:bg-card-hover">
                <td className="p-3 text-muted text-xs">{e.date.slice(0, 10)}</td>
                <td className="p-3 text-foreground">{e.label}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${e.type === 'recette' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
                    {e.type === 'recette' ? 'Recette' : 'Dépense'}
                  </span>
                </td>
                <td className={`p-3 text-right font-medium ${e.type === 'recette' ? 'text-green-400' : 'text-red-400'}`}>
                  {e.type === 'recette' ? '+' : '-'}{formatCurrency(e.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
