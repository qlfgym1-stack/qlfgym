'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency, formatDateTime } from '@/lib/utils/date';
import * as XLSX from 'xlsx';

export default function RapportPOSPage() {
  const sales = useLiveQuery(() => db.sales.toArray());
  const products = useLiveQuery(() => db.products.toArray());

  const exportExcel = () => {
    const data = (sales || []).filter(s => s.status !== 'returned').map(s => ({
      Ticket: s.receiptNumber,
      Date: formatDateTime(s.createdAt),
      Articles: s.items?.length || 0,
      Total: s.total,
      Paiement: s.paymentMethod,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventes POS');
    XLSX.writeFile(wb, 'rapport-pos.xlsx');
  };

  const totalRevenue = (sales || []).filter(s => s.status !== 'returned').reduce((s, sa) => s + sa.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rapport POS</h1>
          <p className="text-muted text-sm mt-1">Total ventes: {formatCurrency(totalRevenue)}</p>
        </div>
        <button onClick={exportExcel} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">Export Excel</button>
      </div>
    </div>
  );
}
