'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import * as XLSX from 'xlsx';

export default function RapportPersonnelPage() {
  const personnel = useLiveQuery(() => db.personnel.toArray());

  const exportExcel = () => {
    const data = (personnel || []).map(p => ({
      Prénom: p.firstName,
      Nom: p.lastName,
      Email: p.email,
      Téléphone: p.phone,
      Rôle: p.role === 'admin' ? 'Administrateur' : 'Réception',
      'Date embauche': p.hireDate,
      Salaire: p.salary || 0,
      Actif: p.active ? 'Oui' : 'Non',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Personnel');
    XLSX.writeFile(wb, 'rapport-personnel.xlsx');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rapport Personnel</h1>
          <p className="text-muted text-sm mt-1">{(personnel || []).length} employés</p>
        </div>
        <button onClick={exportExcel} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">Export Excel</button>
      </div>
    </div>
  );
}
