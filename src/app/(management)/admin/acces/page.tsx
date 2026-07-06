'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatDateTime } from '@/lib/utils/date';
import { Fingerprint, Search, CheckCircle, XCircle } from 'lucide-react';
import { CheckinType } from '@/types/enums';

export default function AccessPage() {
  const [search, setSearch] = useState('');
  const members = useLiveQuery(() => db.members.toArray());
  const today = new Date().toISOString().split('T')[0];

  const todayCheckins = useLiveQuery(() => db.checkins.where('timestamp').startsWith(today).toArray());
  const presentMembers = new Set((todayCheckins || []).filter(c => c.type === 'entry').map(c => c.memberId));

  const checkin = async (memberId: string) => {
    const lastCheckin = (todayCheckins || []).filter(c => c.memberId === memberId).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    const type = !lastCheckin || lastCheckin.type === 'exit' ? CheckinType.ENTRY : CheckinType.EXIT;
    await db.checkins.add({ memberId, timestamp: new Date().toISOString(), type });
  };

  const filteredMembers = (members || []).filter(m => {
    if (!search) return presentMembers.has(m.id!);
    return m.firstName.toLowerCase().includes(search.toLowerCase()) || m.lastName.toLowerCase().includes(search.toLowerCase()) || m.memberNumber.includes(search);
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Contrôle d'accès</h1>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un membre (nom ou n°)" className="w-full pl-9 pr-4 py-3 bg-secondary border border-border rounded-lg text-foreground" autoFocus />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredMembers.map(m => {
          const isPresent = presentMembers.has(m.id!);
          return (
            <button key={m.id} onClick={() => checkin(m.id!)} className={`bg-card border rounded-xl p-4 text-left transition-colors ${isPresent ? 'border-green-600/50 hover:bg-green-600/10' : 'border-border hover:bg-card-hover'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{m.firstName} {m.lastName}</p>
                  <p className="text-xs text-muted">{m.memberNumber}</p>
                </div>
                {isPresent ? <CheckCircle size={20} className="text-green-400" /> : <XCircle size={20} className="text-muted" />}
              </div>
              <p className={`text-xs mt-2 ${isPresent ? 'text-green-400' : 'text-muted'}`}>
                {isPresent ? 'Cliquer pour sortie' : 'Cliquer pour entrée'}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
