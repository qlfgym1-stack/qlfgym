'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency, formatDateTime } from '@/lib/utils/date';
import { ShoppingCart } from 'lucide-react';

export default function SalesPage() {
  const sales = useLiveQuery(() => db.sales.toArray());
  const members = useLiveQuery(() => db.members.toArray());

  const completedSales = (sales || []).filter(s => s.status === 'completed' || s.status === 'partially_returned').reverse();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Historique des ventes</h1>
        <p className="text-muted text-sm mt-1">{completedSales.length} ventes · Total: {formatCurrency(completedSales.reduce((s, v) => s + v.total, 0))}</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="text-left p-3 text-muted">Ticket</th>
              <th className="text-left p-3 text-muted">Date</th>
              <th className="text-left p-3 text-muted">Articles</th>
              <th className="text-left p-3 text-muted">Paiement</th>
              <th className="text-left p-3 text-muted">Total</th>
              <th className="text-left p-3 text-muted">Statut</th>
            </tr>
          </thead>
          <tbody>
            {completedSales.map(s => (
              <tr key={s.id} className="border-b border-border hover:bg-card-hover">
                <td className="p-3 text-foreground font-mono text-xs">{s.receiptNumber}</td>
                <td className="p-3 text-muted text-xs">{formatDateTime(s.createdAt)}</td>
                <td className="p-3 text-muted">{s.items?.length || 0} articles</td>
                <td className="p-3 text-muted capitalize">{s.paymentMethod}</td>
                <td className="p-3 text-foreground font-medium">{formatCurrency(s.total)}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'completed' ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-400'}`}>
                    {s.status === 'completed' ? 'Complétée' : 'Retour partiel'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
