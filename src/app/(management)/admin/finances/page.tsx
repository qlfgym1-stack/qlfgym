'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency } from '@/lib/utils/date';
import { TrendingUp, TrendingDown, Wallet, BarChart3 } from 'lucide-react';

export default function FinancesPage() {
  const payments = useLiveQuery(() => db.payments.toArray());
  const sales = useLiveQuery(() => db.sales.toArray());
  const expenses = useLiveQuery(() => db.expenses.toArray());
  const remunerations = useLiveQuery(() => db.coachRemunerations.toArray());

  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const today = now.toISOString().split('T')[0];

  const stats = useMemo(() => {
    const subRevenue = (payments || []).reduce((s, p) => s + p.amount, 0);
    const posRevenue = (sales || []).filter(s => s.status !== 'returned').reduce((s, sa) => s + sa.total, 0);
    const totalRevenue = subRevenue + posRevenue;
    const totalExpenses = (expenses || []).reduce((s, e) => s + e.amount, 0);
    const coachPayments = (remunerations || []).filter(r => r.status === 'paid').reduce((s, r) => s + r.totalAmount, 0);
    const totalCosts = totalExpenses + coachPayments;
    const profit = totalRevenue - totalCosts;

    const todayPayments = (payments || []).filter(p => p.date.startsWith(today));
    const todaySales = (sales || []).filter(s => s.createdAt.startsWith(today) && s.status !== 'returned');
    const todayRevenue = [...todayPayments, ...todaySales].reduce((s, t) => s + ('amount' in t ? t.amount : t.total), 0);

    const monthPayments = (payments || []).filter(p => p.date.startsWith(thisMonth));
    const monthSales = (sales || []).filter(s => s.createdAt.startsWith(thisMonth) && s.status !== 'returned');
    const monthRevenue = [...monthPayments, ...monthSales].reduce((s, t) => s + ('amount' in t ? t.amount : t.total), 0);

    return { subRevenue, posRevenue, totalRevenue, totalExpenses, coachPayments, totalCosts, profit, todayRevenue, monthRevenue };
  }, [payments, sales, expenses, remunerations]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tableau de bord financier</h1>
        <p className="text-muted text-sm mt-1">Vue d'ensemble des finances</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm flex items-center gap-2"><TrendingUp size={14} /> Revenus abonnements</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.subRevenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm flex items-center gap-2"><BarChart3 size={14} /> Revenus POS</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.posRevenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm flex items-center gap-2"><TrendingDown size={14} /> Dépenses + Coachs</p>
          <p className="text-2xl font-bold text-red-400">{formatCurrency(stats.totalCosts)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm flex items-center gap-2"><Wallet size={14} /> Bénéfice</p>
          <p className={`text-2xl font-bold ${stats.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(stats.profit)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Aujourd'hui</h2>
          <p className="text-3xl font-bold text-foreground">{formatCurrency(stats.todayRevenue)}</p>
          <p className="text-sm text-muted mt-1">Revenus du {new Date().toLocaleDateString('fr-FR')}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Ce mois-ci</h2>
          <p className="text-3xl font-bold text-foreground">{formatCurrency(stats.monthRevenue)}</p>
          <p className="text-sm text-muted mt-1">Revenus de {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
        </div>
      </div>
    </div>
  );
}
