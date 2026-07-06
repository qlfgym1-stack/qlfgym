'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency, formatDateTime } from '@/lib/utils/date';
import { Search, Undo2, ArrowLeft } from 'lucide-react';
import { SaleStatus } from '@/types/enums';

export default function RetoursPage() {
  const [search, setSearch] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});

  const sales = useLiveQuery(() => db.sales.toArray());
  const products = useLiveQuery(() => db.products.toArray());

  const filteredSales = (sales || []).filter(s => {
    if (!search) return true;
    return s.receiptNumber.toLowerCase().includes(search.toLowerCase()) || s.items.some(i => i.productName.toLowerCase().includes(search.toLowerCase()));
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const openReturn = (saleId: string) => {
    setSelectedSaleId(saleId);
    const sale = sales?.find(s => s.id === saleId);
    if (sale) {
      const qtys: Record<string, number> = {};
      sale.items.forEach(i => { qtys[i.productId] = 0; });
      setReturnQtys(qtys);
    }
  };

  const processReturn = async () => {
    if (!selectedSaleId) return;
    const sale = sales?.find(s => s.id === selectedSaleId);
    if (!sale) return;

    const itemsToReturn = sale.items.filter(i => (returnQtys[i.productId] || 0) > 0);
    if (itemsToReturn.length === 0) return;

    const allReturned = itemsToReturn.every(i => returnQtys[i.productId] >= i.quantity);
    const newStatus = allReturned ? SaleStatus.RETURNED : SaleStatus.PARTIALLY_RETURNED;

    await db.sales.update(selectedSaleId, { status: newStatus });

    for (const item of itemsToReturn) {
      const qty = returnQtys[item.productId] || 0;
      if (qty > 0) {
        const product = products?.find(p => p.id === item.productId);
        if (product) {
          await db.products.update(item.productId, { stock: product.stock + qty });
        }
      }
    }

    setSelectedSaleId(null);
    setReturnQtys({});
  };

  const selectedSale = sales?.find(s => s.id === selectedSaleId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Retours</h1>

      {selectedSale ? (
        <div className="space-y-4">
          <button onClick={() => setSelectedSaleId(null)} className="flex items-center gap-2 text-sm text-muted hover:text-foreground">
            <ArrowLeft size={16} /> Retour à la liste
          </button>

          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Vente #{selectedSale.receiptNumber}</h2>
            <p className="text-xs text-muted">{formatDateTime(selectedSale.createdAt)}</p>

            {selectedSale.items.map(item => (
              <div key={item.productId} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                <div>
                  <p className="text-sm text-foreground">{item.productName}</p>
                  <p className="text-xs text-muted">{formatCurrency(item.unitPrice)} x {item.quantity}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted">Retourner:</label>
                  <input
                    type="number" min={0} max={item.quantity}
                    value={returnQtys[item.productId] || 0}
                    onChange={e => setReturnQtys(p => ({ ...p, [item.productId]: Math.min(item.quantity, Math.max(0, Number(e.target.value)))}))}
                    className="w-16 px-2 py-1 bg-secondary border border-border rounded text-foreground text-sm text-center"
                  />
                  <span className="text-xs text-muted">/ {item.quantity}</span>
                </div>
              </div>
            ))}

            <button onClick={processReturn} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm">
              <Undo2 size={16} /> Valider le retour
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par n° reçu ou produit..." className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-muted">
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Reçu</th>
                  <th className="p-3 text-left">Articles</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-left">Statut</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map(s => (
                  <tr key={s.id} className="border-b border-border hover:bg-card-hover">
                    <td className="p-3 text-muted text-xs">{formatDateTime(s.createdAt)}</td>
                    <td className="p-3 font-mono text-xs text-foreground">{s.receiptNumber}</td>
                    <td className="p-3 text-xs text-muted">{s.items.length} article(s)</td>
                    <td className="p-3 text-right text-green-400 font-medium">{formatCurrency(s.total)}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'completed' ? 'bg-green-600/20 text-green-400' : s.status === 'returned' ? 'bg-red-600/20 text-red-400' : 'bg-yellow-600/20 text-yellow-400'}`}>
                        {s.status === 'completed' ? 'Complétée' : s.status === 'returned' ? 'Retournée' : 'Retour partiel'}
                      </span>
                    </td>
                    <td className="p-3">
                      {s.status !== 'returned' && (
                        <button onClick={() => openReturn(s.id!)} className="text-xs text-primary hover:underline">Retour</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
