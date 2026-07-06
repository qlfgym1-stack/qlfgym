'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { Fingerprint, Search, CheckCircle, XCircle } from 'lucide-react';
import { CheckinType } from '@/types/enums';

export default function ReceptionCheckinPage() {
  const [search, setSearch] = useState('');
  const members = useLiveQuery(() => db.members.toArray());
  const today = new Date().toISOString().split('T')[0];
  const todayCheckins = useLiveQuery(() => db.checkins.where('timestamp').startsWith(today).toArray());

  const filtered = (members || []).filter(m => {
    if (!search) return true;
    return m.firstName.toLowerCase().includes(search.toLowerCase()) || m.lastName.toLowerCase().includes(search.toLowerCase()) || m.memberNumber.includes(search);
  });

  const checkin = async (memberId: string) => {
    const last = (todayCheckins || []).filter(c => c.memberId === memberId).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    const type = !last || last.type === 'exit' ? CheckinType.ENTRY : CheckinType.EXIT;
    await db.checkins.add({ memberId, timestamp: new Date().toISOString(), type });
  };

  const getStatus = (memberId: string) => {
    const entries = (todayCheckins || []).filter(c => c.memberId === memberId && c.type === 'entry').length;
    const exits = (todayCheckins || []).filter(c => c.memberId === memberId && c.type === 'exit').length;
    return entries > exits;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Fingerprint size={24} /> Check-in</h1>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un membre..." className="w-full pl-9 pr-4 py-3 bg-secondary border border-border rounded-lg text-foreground" autoFocus />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(m => {
          const present = getStatus(m.id!);
          return (
            <button key={m.id} onClick={() => checkin(m.id!)} className={`bg-card border rounded-xl p-4 text-left transition-colors ${present ? 'border-green-600/50 bg-green-600/5' : 'border-border hover:bg-card-hover'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{m.firstName} {m.lastName}</p>
                  <p className="text-xs text-muted">{m.memberNumber}</p>
                </div>
                {present ? <CheckCircle className="text-green-400" size={20} /> : <XCircle className="text-muted" size={20} />}
              </div>
              <p className={`text-xs mt-1 ${present ? 'text-green-400' : 'text-muted'}`}>{present ? 'Cliquer pour sortie' : 'Cliquer pour entrée'}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
