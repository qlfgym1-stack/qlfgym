'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { Search, Users } from 'lucide-react';

export default function ReceptionAdherentsPage() {
  const [search, setSearch] = useState('');
  const members = useLiveQuery(() => db.members.toArray());

  const filtered = (members || []).filter(m => {
    if (!search) return true;
    return m.firstName.toLowerCase().includes(search.toLowerCase()) ||
      m.lastName.toLowerCase().includes(search.toLowerCase()) ||
      m.memberNumber.includes(search) ||
      m.phone.includes(search);
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Adhérents</h1>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(m => (
          <div key={m.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center text-sm font-bold text-primary">
                {m.firstName[0]}{m.lastName[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{m.firstName} {m.lastName}</p>
                <p className="text-xs text-muted">{m.memberNumber}</p>
              </div>
            </div>
            <p className="text-xs text-muted">{m.phone} · {m.email}</p>
            <p className="text-xs mt-1">
              <span className={`px-2 py-0.5 rounded-full ${m.subscription.status === 'active' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
                {m.subscription.status === 'active' ? 'Abonnement actif' : 'Abonnement inactif'}
              </span>
            </p>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted">
          <Users size={40} className="mx-auto mb-3 opacity-50" />
          <p>Aucun adhérent trouvé</p>
        </div>
      )}
    </div>
  );
}
