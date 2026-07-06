'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency, formatDate } from '@/lib/utils/date';
import * as XLSX from 'xlsx';

export default function RapportAdherentsPage() {
  const members = useLiveQuery(() => db.members.toArray());
  const payments = useLiveQuery(() => db.payments.toArray());

  const exportExcel = () => {
    const data = (members || []).map(m => ({
      'N° membre': m.memberNumber,
      'Prénom': m.firstName,
      'Nom': m.lastName,
      'Email': m.email,
      'Téléphone': m.phone,
      'Sexe': m.gender === 'male' ? 'Masculin' : 'Féminin',
      'Ville': m.city || '',
      'Type': m.role === 'coach' ? 'Coach' : 'Adhérent',
      'Abonnement': m.subscription.type,
      'Statut': m.subscription.status,
      'Début': formatDate(m.subscription.startDate),
      'Fin': formatDate(m.subscription.endDate),
      'Créé le': formatDate(m.createdAt),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Adhérents');
    XLSX.writeFile(wb, 'rapport-adherents.xlsx');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rapport Adhérents</h1>
          <p className="text-muted text-sm mt-1">Exportez la liste des adhérents</p>
        </div>
        <button onClick={exportExcel} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">
          Export Excel
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-muted">
              <th className="p-2 text-left">N°</th>
              <th className="p-2 text-left">Nom</th>
              <th className="p-2 text-left">Téléphone</th>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-left">Abonnement</th>
              <th className="p-2 text-left">Statut</th>
            </tr>
          </thead>
          <tbody>
            {(members || []).map(m => (
              <tr key={m.id} className="border-b border-border">
                <td className="p-2 text-muted font-mono text-xs">{m.memberNumber}</td>
                <td className="p-2 text-foreground">{m.firstName} {m.lastName}</td>
                <td className="p-2 text-muted">{m.phone}</td>
                <td className="p-2">{m.role === 'coach' ? <span className="text-cyan-400 text-xs">Coach</span> : <span className="text-xs">Adhérent</span>}</td>
                <td className="p-2 text-muted capitalize">{m.subscription.type}</td>
                <td className="p-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${m.subscription.status === 'active' ? 'bg-green-600/20 text-green-400' : m.subscription.status === 'frozen' ? 'bg-yellow-600/20 text-yellow-400' : 'bg-red-600/20 text-red-400'}`}>
                    {m.subscription.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
