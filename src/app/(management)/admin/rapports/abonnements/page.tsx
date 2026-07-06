'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatDate, formatCurrency } from '@/lib/utils/date';
import * as XLSX from 'xlsx';

export default function RapportAbonnementsPage() {
  const members = useLiveQuery(() => db.members.toArray());

  const exportExcel = () => {
    const data = (members || []).filter(m => m.role !== 'coach').map(m => ({
      'N° membre': m.memberNumber,
      Membre: `${m.firstName} ${m.lastName}`,
      Type: m.subscription.type,
      Statut: m.subscription.status,
      'Date début': formatDate(m.subscription.startDate),
      'Date fin': formatDate(m.subscription.endDate),
      Prix: formatCurrency(m.subscription.price),
      'Paiement fractionné': m.subscription.installmentCount ? `${m.subscription.installmentCount}x ${formatCurrency(m.subscription.installmentAmount || 0)}` : 'Non',
      'Renouvellement auto': m.subscription.autoRenew ? 'Oui' : 'Non',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Abonnements');
    XLSX.writeFile(wb, 'rapport-abonnements.xlsx');
  };

  const subscriptions = (members || []).filter(m => m.role !== 'coach');
  const active = subscriptions.filter(m => m.subscription.status === 'active');
  const revenue = subscriptions.reduce((s, m) => s + m.subscription.price, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rapport Abonnements</h1>
          <p className="text-muted text-sm mt-1">{active.length} actifs / {subscriptions.length} total · {formatCurrency(revenue)}</p>
        </div>
        <button onClick={exportExcel} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">Export Excel</button>
      </div>
    </div>
  );
}
