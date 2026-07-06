'use client';

import { useState, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { Package, Plus, Edit2, Trash2, Save, X } from 'lucide-react';

export default function ProductsPage() {
  const products = useLiveQuery(() => db.products.toArray());
  const categories = useLiveQuery(() => db.productCategories.toArray());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', barcode: '', categoryId: '', price: 0, cost: 0, stock: 0, alertStock: 5, supplier: '' });

  const resetForm = () => {
    setForm({ name: '', barcode: '', categoryId: '', price: 0, cost: 0, stock: 0, alertStock: 5, supplier: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (editing) {
      await db.products.update(editing, { ...form, updatedAt: new Date().toISOString() });
    } else {
      await db.products.add({ ...form, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    resetForm();
  };

  const deleteProduct = async (id: string) => {
    await db.products.update(id, { active: false });
  };

  const editProduct = (p: NonNullable<typeof products>[number]) => {
    setForm({ name: p.name, barcode: p.barcode || '', categoryId: p.categoryId, price: p.price, cost: p.cost || 0, stock: p.stock, alertStock: p.alertStock, supplier: p.supplier || '' });
    setEditing(p.id!);
    setShowForm(true);
  };

  const activeProducts = (products || []).filter(p => p.active);
  const lowStock = activeProducts.filter(p => p.stock <= p.alertStock);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Produits</h1>
          <p className="text-muted text-sm mt-1">{activeProducts.length} produits · {lowStock.length} stock bas</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm">
          <Plus size={16} /> Nouveau produit
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{editing ? 'Modifier' : 'Nouveau'} produit</h2>
            <button type="button" onClick={resetForm}><X size={18} className="text-muted" /></button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Nom</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Code-barres</label>
              <input type="text" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Catégorie</label>
              <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm">
                <option value="">Sélectionner...</option>
                {(categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Prix vente (DA)</label>
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Prix coût (DA)</label>
              <input type="number" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: Number(e.target.value) }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Stock</label>
              <input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Alerte stock</label>
              <input type="number" value={form.alertStock} onChange={e => setForm(f => ({ ...f, alertStock: Number(e.target.value) }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Fournisseur</label>
              <input type="text" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>
          </div>
          <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm"><Save size={16} /> {editing ? 'Modifier' : 'Créer'}</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {activeProducts.map(p => {
          const cat = (categories || []).find(c => c.id === p.categoryId);
          const low = p.stock <= p.alertStock;
          return (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  {p.barcode && <p className="text-xs text-muted">Code: {p.barcode}</p>}
                </div>
                <button onClick={() => editProduct(p)} className="text-muted hover:text-foreground p-1"><Edit2 size={14} /></button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className={low ? 'text-red-400 font-medium' : ''}>Stock: {p.stock}</span>
                {cat && <span>· {cat.name}</span>}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-primary font-bold">{p.price} DA</span>
                {p.cost != null && p.cost > 0 && <span className="text-xs text-muted">Marge: {Math.round((p.price - p.cost) / p.price * 100)}%</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
