'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils/date';
import { Search, Filter } from 'lucide-react';

export default function AbonnementsPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const members = useLiveQuery(() => db.members.toArray());
  const membershipTypes = useLiveQuery(() => db.membershipTypes.toArray());

  const filtered = (members || []).filter(m => {
    if (m.role === 'coach') return false;
    const matchSearch = !search || m.firstName.toLowerCase().includes(search.toLowerCase()) || m.lastName.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || m.subscription.status === filter;
    return matchSearch && matchFilter;
  });

  const stats = {
    total: filtered.length,
    active: filtered.filter(m => m.subscription.status === 'active').length,
    frozen: filtered.filter(m => m.subscription.status === 'frozen').length,
    expired: filtered.filter(m => m.subscription.status === 'expired' || m.subscription.status === 'canceled').length,
    expiringSoon: filtered.filter(m => {
      if (!m.subscription.endDate) return false;
      const d = daysUntil(m.subscription.endDate);
      return d > 0 && d <= 7;
    }).length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Abonnements</h1>
        <p className="text-muted text-sm mt-1">Gestion des abonnements</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm">Total</p>
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm">Actifs</p>
          <p className="text-2xl font-bold text-green-400">{stats.active}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm">Gelés</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.frozen}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm">Expiration &lt; 7j</p>
          <p className="text-2xl font-bold text-red-400">{stats.expiringSoon}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm">
          <option value="all">Tous</option>
          <option value="active">Actifs</option>
          <option value="frozen">Gelés</option>
          <option value="expired">Expirés</option>
          <option value="canceled">Résiliés</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="text-left p-3 text-muted font-medium">Membre</th>
              <th className="text-left p-3 text-muted font-medium">Type</th>
              <th className="text-left p-3 text-muted font-medium">Début</th>
              <th className="text-left p-3 text-muted font-medium">Fin</th>
              <th className="text-left p-3 text-muted font-medium">Statut</th>
              <th className="text-left p-3 text-muted font-medium">Jours restants</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id} className="border-b border-border hover:bg-card-hover">
                <td className="p-3 text-foreground">{m.firstName} {m.lastName}</td>
                <td className="p-3 text-muted capitalize">{m.subscription.type}</td>
                <td className="p-3 text-muted">{formatDate(m.subscription.startDate)}</td>
                <td className="p-3 text-muted">{formatDate(m.subscription.endDate)}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    m.subscription.status === 'active' ? 'bg-green-600/20 text-green-400' :
                    m.subscription.status === 'frozen' ? 'bg-yellow-600/20 text-yellow-400' :
                    m.subscription.status === 'canceled' ? 'bg-gray-600/20 text-gray-400' :
                    'bg-red-600/20 text-red-400'
                  }`}>
                    {m.subscription.status}
                  </span>
                </td>
                <td className="p-3 text-muted">
                  {m.subscription.endDate ? daysUntil(m.subscription.endDate) + 'j' : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
