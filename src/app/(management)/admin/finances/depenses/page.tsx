'use client';

import { useState, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency, formatDate } from '@/lib/utils/date';
import { Plus, Trash2 } from 'lucide-react';

export default function DepensesPage() {
  const expenses = useLiveQuery(() => db.expenses.toArray());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: '', amount: 0, date: new Date().toISOString().split('T')[0], description: '' });

  const [categoryFilter, setCategoryFilter] = useState('all');

  const categories = [...new Set((expenses || []).map(e => e.category))];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.category || !form.amount) return;
    await db.expenses.add({ ...form, recurring: false, createdAt: new Date().toISOString() });
    setForm({ category: '', amount: 0, date: new Date().toISOString().split('T')[0], description: '' });
    setShowForm(false);
  };

  const deleteExpense = async (id: string) => {
    await db.expenses.delete(id);
  };

  const filtered = categoryFilter === 'all' ? (expenses || []) : (expenses || []).filter(e => e.category === categoryFilter);
  const total = filtered.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dépenses</h1>
          <p className="text-muted text-sm mt-1">Total: {formatCurrency(total)}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm">
          <Plus size={16} /> Nouvelle dépense
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Catégorie</label>
              <input type="text" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required placeholder="Ex: Électricité, Eau, Loyer..." />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Montant (DA)</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Description</label>
              <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm">Enregistrer</button>
        </form>
      )}

      <div className="flex gap-2">
        <button onClick={() => setCategoryFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs ${categoryFilter === 'all' ? 'bg-primary text-white' : 'bg-secondary text-muted'}`}>Toutes</button>
        {categories.map(c => (
          <button key={c} onClick={() => setCategoryFilter(c)} className={`px-3 py-1.5 rounded-lg text-xs ${categoryFilter === c ? 'bg-primary text-white' : 'bg-secondary text-muted'}`}>{c}</button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.sort((a, b) => b.date.localeCompare(a.date)).map(e => (
          <div key={e.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">{e.description || e.category}</p>
              <p className="text-xs text-muted">{e.category} · {formatDate(e.date)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-400 font-medium">{formatCurrency(e.amount)}</span>
              <button onClick={() => deleteExpense(e.id!)} className="text-muted hover:text-danger"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
