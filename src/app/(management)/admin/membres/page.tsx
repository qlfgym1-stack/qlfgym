'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import Link from 'next/link';
import { Plus, Search, Users, UserCog } from 'lucide-react';
import { MemberRole } from '@/types/enums';

export default function MembersList() {
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');

  const members = useLiveQuery(() => db.members.toArray());

  const filtered = (members || []).filter(m => {
    const matchSearch = !search ||
      m.firstName.toLowerCase().includes(search.toLowerCase()) ||
      m.lastName.toLowerCase().includes(search.toLowerCase()) ||
      m.memberNumber.toLowerCase().includes(search.toLowerCase()) ||
      m.phone.includes(search);
    const matchRole = filterRole === 'all' || m.role === filterRole;
    return matchSearch && matchRole;
  });

  const coaches = members?.filter(m => m.role === 'coach') || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Adhérents</h1>
          <p className="text-muted text-sm mt-1">{filtered.length} adhérent{(filtered.length > 1 ? 's' : '')}</p>
        </div>
        <Link
          href="/admin/membres/nouveau"
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors text-sm"
        >
          <Plus size={16} />
          Nouvel adhérent
        </Link>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un adhérent..."
            className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm"
          />
        </div>
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm"
        >
          <option value="all">Tous</option>
          <option value="member">Adhérents</option>
          <option value="coach">Coachs</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(member => (
          <Link
            key={member.id}
            href={`/admin/membres/profile/${member.id}`}
            className="bg-card border border-border rounded-xl p-4 hover:bg-card-hover transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${member.role === 'coach' ? 'bg-cyan-600/20 text-cyan-400' : 'bg-primary/20 text-primary'}`}>
                  {member.firstName[0]}{member.lastName[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{member.firstName} {member.lastName}</p>
                  <p className="text-xs text-muted">{member.memberNumber}</p>
                </div>
              </div>
              {member.role === 'coach' && (
                <span className="text-[10px] px-2 py-0.5 bg-cyan-600/20 text-cyan-400 rounded-full flex items-center gap-1">
                  <UserCog size={10} /> Coach
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span>{member.phone}</span>
              {member.subscription?.status && (
                <span className={`px-2 py-0.5 rounded-full ${
                  member.subscription.status === 'active' ? 'bg-green-600/20 text-green-400' :
                  member.subscription.status === 'frozen' ? 'bg-yellow-600/20 text-yellow-400' :
                  'bg-red-600/20 text-red-400'
                }`}>
                  {member.subscription.status === 'active' ? 'Actif' :
                   member.subscription.status === 'frozen' ? 'Gelé' : 'Inactif'}
                </span>
              )}
            </div>
          </Link>
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
