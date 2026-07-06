'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency } from '@/lib/utils/date';
import { Users, TrendingUp, ShoppingCart, AlertTriangle, Dumbbell, CalendarCheck } from 'lucide-react';

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:bg-card-hover transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-muted text-sm">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const members = useLiveQuery(() => db.members.toArray());
  const checkins = useLiveQuery(() => db.checkins.toArray());
  const payments = useLiveQuery(() => db.payments.toArray());
  const sales = useLiveQuery(() => db.sales.toArray());

  const today = new Date().toISOString().split('T')[0];
  const todayCheckins = checkins?.filter(c => c.timestamp.startsWith(today) && c.type === 'entry') || [];
  const activeMembers = members?.filter(m => m.subscription?.status === 'active') || [];
  const presentToday = new Set(todayCheckins.map(c => c.memberId)).size;
  const todayPayments = payments?.filter(p => p.date.startsWith(today)) || [];
  const todaySales = sales?.filter(s => s.createdAt.startsWith(today)) || [];
  const todayRevenue = [...todayPayments, ...todaySales].reduce((sum, t) => sum + ('amount' in t ? t.amount : t.total), 0);
  const coaches = members?.filter(m => m.role === 'coach') || [];
  const expiringSoon = members?.filter(m => {
    if (!m.subscription?.endDate) return false;
    const days = (new Date(m.subscription.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
    return days > 0 && days <= 7;
  }) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted text-sm mt-1">Vue d'ensemble de votre salle de fitness</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Adhérents actifs" value={activeMembers.length.toString()} sub={`${coaches.length} coachs`} color="bg-blue-600" />
        <StatCard icon={CalendarCheck} label="Présents aujourd'hui" value={presentToday.toString()} sub={`${todayCheckins.length} entrées`} color="bg-green-600" />
        <StatCard icon={TrendingUp} label="Revenus du jour" value={formatCurrency(todayRevenue)} sub={`${todayPayments.length} paiements`} color="bg-cyan-600" />
        <StatCard icon={ShoppingCart} label="Ventes du jour" value={todaySales.length.toString()} sub={`${todaySales.reduce((s, sa) => s + (sa.items?.length || 0), 0)} articles`} color="bg-violet-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-warning" />
            Abonnements expirant bientôt
          </h2>
          {expiringSoon.length === 0 ? (
            <p className="text-muted text-sm">Aucun abonnement n'expire dans les 7 prochains jours.</p>
          ) : (
            <div className="space-y-2">
              {expiringSoon.slice(0, 10).map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                  <span className="text-sm text-foreground">{m.firstName} {m.lastName}</span>
                  <span className="text-xs text-muted">Expire le {new Date(m.subscription.endDate).toLocaleDateString('fr-FR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Dumbbell size={18} className="text-primary" />
            Coachs
          </h2>
          {coaches.length === 0 ? (
            <p className="text-muted text-sm">Aucun coach enregistré.</p>
          ) : (
            <div className="space-y-2">
              {coaches.slice(0, 10).map(c => (
                <div key={c.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                  <span className="text-sm text-foreground">{c.firstName} {c.lastName}</span>
                  <span className="text-xs text-muted">{c.phone}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
