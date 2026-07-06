'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { getTimeSlot, getWeekPeriod } from '@/lib/utils/date';
import * as XLSX from 'xlsx';
import { groupBy } from '@/lib/utils/transform';

export default function RapportPresencesPage() {
  const checkins = useLiveQuery(() => db.checkins.toArray());
  const members = useLiveQuery(() => db.members.toArray());

  const entryCheckins = useMemo(() => (checkins || []).filter(c => c.type === 'entry'), [checkins]);

  const exportExcel = () => {
    const data = entryCheckins.map(c => {
      const m = (members || []).find(m => m.id === c.memberId);
      const dt = new Date(c.timestamp);
      return {
        Membre: m ? `${m.firstName} ${m.lastName}` : 'Inconnu',
        'N° membre': m?.memberNumber || '',
        Date: dt.toLocaleDateString('fr-FR'),
        Heure: dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        'Tranche horaire': getTimeSlot(dt),
        Jour: dt.toLocaleDateString('fr-FR', { weekday: 'long' }),
        'Période semaine': getWeekPeriod(dt) === 'debut' ? 'Début (Dim→Mer)' : 'Fin (Jeu→Sam)',
      };
    }).sort((a, b) => a.Date.localeCompare(b.Date));

    const byDay = groupBy(data, d => d.Date);
    const summary = Object.entries(byDay).map(([date, items]) => ({
      Date: date,
      'Total entrées': items.length,
    })).sort((a, b) => a.Date.localeCompare(b.Date));

    const ws1 = XLSX.utils.json_to_sheet(data);
    const ws2 = XLSX.utils.json_to_sheet(summary);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Détail');
    XLSX.utils.book_append_sheet(wb, ws2, 'Résumé');
    XLSX.writeFile(wb, 'rapport-presences.xlsx');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rapport Présences</h1>
          <p className="text-muted text-sm mt-1">{entryCheckins.length} entrées au total</p>
        </div>
        <button onClick={exportExcel} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">Export Excel</button>
      </div>
    </div>
  );
}
