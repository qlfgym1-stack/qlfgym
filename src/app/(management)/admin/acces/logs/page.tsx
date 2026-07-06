'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatDateTime } from '@/lib/utils/date';

export default function AccessLogsPage() {
  const checkins = useLiveQuery(() => db.checkins.toArray());
  const members = useLiveQuery(() => db.members.toArray());

  const sorted = (checkins || []).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Logs d'accès</h1>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-muted">
              <th className="p-3 text-left">Date/Heure</th>
              <th className="p-3 text-left">Membre</th>
              <th className="p-3 text-left">N° membre</th>
              <th className="p-3 text-left">Type</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => {
              const m = (members || []).find(m => m.id === c.memberId);
              return (
                <tr key={c.id} className="border-b border-border hover:bg-card-hover">
                  <td className="p-3 text-muted text-xs">{formatDateTime(c.timestamp)}</td>
                  <td className="p-3 text-foreground">{m?.firstName} {m?.lastName || 'Inconnu'}</td>
                  <td className="p-3 text-muted font-mono text-xs">{m?.memberNumber || '-'}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.type === 'entry' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
                      {c.type === 'entry' ? 'Entrée' : 'Sortie'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
