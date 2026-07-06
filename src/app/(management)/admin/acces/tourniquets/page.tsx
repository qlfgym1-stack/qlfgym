'use client';

import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatDateTime } from '@/lib/utils/date';
import { RotateCw, CheckCircle, XCircle, Users } from 'lucide-react';
import { CheckinType } from '@/types/enums';

export default function TourniquetsPage() {
  const [simulating, setSimulating] = useState(false);
  const [liveEvents, setLiveEvents] = useState<{ id: string; name: string; type: string; time: string }[]>([]);

  const members = useLiveQuery(() => db.members.toArray());
  const today = new Date().toISOString().split('T')[0];
  const todayCheckins = useLiveQuery(() => db.checkins.where('timestamp').startsWith(today).toArray());

  const simulateEntry = async () => {
    setSimulating(true);
    const membersWithCheckins = new Set((todayCheckins || []).filter(c => c.type === 'entry').map(c => c.memberId));
    const membersExited = new Set((todayCheckins || []).filter(c => c.type === 'exit').map(c => c.memberId));
    const inside = new Set([...membersWithCheckins].filter(id => !membersExited.has(id)));

    const available = (members || []).filter(m => !inside.has(m.id!));
    if (available.length === 0) {
      setSimulating(false);
      return;
    }

    const rand = available[Math.floor(Math.random() * available.length)];
    await db.checkins.add({ memberId: rand.id!, timestamp: new Date().toISOString(), type: CheckinType.ENTRY });
    setLiveEvents(prev => [{ id: rand.id!, name: `${rand.firstName} ${rand.lastName}`, type: 'entry', time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
    setSimulating(false);
  };

  const simulateExit = async () => {
    setSimulating(true);
    const membersWithCheckins = new Set((todayCheckins || []).filter(c => c.type === 'entry').map(c => c.memberId));
    const membersExited = new Set((todayCheckins || []).filter(c => c.type === 'exit').map(c => c.memberId));
    const inside = [...membersWithCheckins].filter(id => !membersExited.has(id));

    if (inside.length === 0) {
      setSimulating(false);
      return;
    }

    const rand = (members || []).find(m => m.id === inside[Math.floor(Math.random() * inside.length)]);
    if (!rand) { setSimulating(false); return; }
    await db.checkins.add({ memberId: rand.id!, timestamp: new Date().toISOString(), type: CheckinType.EXIT });
    setLiveEvents(prev => [{ id: rand.id!, name: `${rand.firstName} ${rand.lastName}`, type: 'exit', time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
    setSimulating(false);
  };

  const membersWithCheckins = new Set((todayCheckins || []).filter(c => c.type === 'entry').map(c => c.memberId));
  const membersExited = new Set((todayCheckins || []).filter(c => c.type === 'exit').map(c => c.memberId));
  const insideCount = [...membersWithCheckins].filter(id => !membersExited.has(id)).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Tourniquets</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <Users size={32} className="mx-auto mb-2 text-primary" />
          <p className="text-3xl font-bold text-foreground">{insideCount}</p>
          <p className="text-sm text-muted">Actuellement dans la salle</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
          <p className="text-3xl font-bold text-foreground">{(todayCheckins || []).filter(c => c.type === 'entry').length}</p>
          <p className="text-sm text-muted">Entrées aujourd'hui</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <XCircle size={32} className="mx-auto mb-2 text-red-400" />
          <p className="text-3xl font-bold text-foreground">{(todayCheckins || []).filter(c => c.type === 'exit').length}</p>
          <p className="text-sm text-muted">Sorties aujourd'hui</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={simulateEntry} disabled={simulating} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">
          <RotateCw size={16} className={simulating ? 'animate-spin' : ''} /> Simuler entrée
        </button>
        <button onClick={simulateExit} disabled={simulating} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">
          <RotateCw size={16} className={simulating ? 'animate-spin' : ''} /> Simuler sortie
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Événements en direct</h2>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {liveEvents.length === 0 && <p className="text-muted text-sm text-center py-8">Aucun événement</p>}
          {liveEvents.map((e, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30">
              {e.type === 'entry' ? <CheckCircle size={14} className="text-green-400" /> : <XCircle size={14} className="text-red-400" />}
              <span className="text-sm text-foreground flex-1">{e.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${e.type === 'entry' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
                {e.type === 'entry' ? 'Entrée' : 'Sortie'}
              </span>
              <span className="text-xs text-muted">{e.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
