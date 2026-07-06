'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { AlertTriangle, Package } from 'lucide-react';

export default function StockPage() {
  const products = useLiveQuery(() => db.products.filter(p => p.active).toArray());
  const categories = useLiveQuery(() => db.productCategories.toArray());

  const lowStock = (products || []).filter(p => p.stock <= p.alertStock);
  const outOfStock = (products || []).filter(p => p.stock === 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gestion des stocks</h1>
        <p className="text-muted text-sm mt-1">État des stocks et alertes</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm">Total produits</p>
          <p className="text-2xl font-bold text-foreground">{products?.length || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm">Stock bas</p>
          <p className="text-2xl font-bold text-yellow-400">{lowStock.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm">Rupture de stock</p>
          <p className="text-2xl font-bold text-red-400">{outOfStock.length}</p>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-warning" /> Produits à réapprovisionner
          </h2>
          <div className="space-y-2">
            {lowStock.map(p => {
              const cat = (categories || []).find(c => c.id === p.categoryId);
              return (
                <div key={p.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                  <div>
                    <span className="text-sm text-foreground">{p.name}</span>
                    {cat && <span className="text-xs text-muted ml-2">{cat.name}</span>}
                  </div>
                  <span className={`text-sm ${p.stock === 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {p.stock === 0 ? 'Rupture' : `${p.stock} restants`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Tous les stocks</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="text-left p-2">Produit</th>
              <th className="text-left p-2">Catégorie</th>
              <th className="text-left p-2">Stock</th>
              <th className="text-left p-2">Seuil alerte</th>
              <th className="text-left p-2">Statut</th>
            </tr>
          </thead>
          <tbody>
            {(products || []).map(p => {
              const cat = (categories || []).find(c => c.id === p.categoryId);
              const status = p.stock === 0 ? 'Rupture' : p.stock <= p.alertStock ? 'Stock bas' : 'OK';
              const color = p.stock === 0 ? 'text-red-400' : p.stock <= p.alertStock ? 'text-yellow-400' : 'text-green-400';
              return (
                <tr key={p.id} className="border-b border-border">
                  <td className="p-2 text-foreground">{p.name}</td>
                  <td className="p-2 text-muted">{cat?.name || '-'}</td>
                  <td className="p-2 text-foreground">{p.stock}</td>
                  <td className="p-2 text-muted">{p.alertStock}</td>
                  <td className={`p-2 ${color}`}>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
