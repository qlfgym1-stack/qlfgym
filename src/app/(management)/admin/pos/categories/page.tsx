'use client';

import { useState, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { FolderOpen, Plus, Trash2 } from 'lucide-react';

export default function CategoriesPage() {
  const categories = useLiveQuery(() => db.productCategories.toArray());
  const [newName, setNewName] = useState('');

  const addCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    const maxOrder = Math.max(...(categories || []).map(c => c.sortOrder), 0);
    await db.productCategories.add({ name: newName, sortOrder: maxOrder + 1 });
    setNewName('');
  };

  const deleteCategory = async (id: string) => {
    await db.productCategories.delete(id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Catégories de produits</h1>
        <p className="text-muted text-sm mt-1">Gérez les catégories pour le POS</p>
      </div>

      <form onSubmit={addCategory} className="flex gap-3 max-w-md">
        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nouvelle catégorie..." className="flex-1 px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required />
        <button type="submit" className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm flex items-center gap-2"><Plus size={16} /> Ajouter</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(categories || []).map(c => (
          <div key={c.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FolderOpen size={20} className="text-primary" />
              <span className="text-sm text-foreground">{c.name}</span>
            </div>
            <button onClick={() => deleteCategory(c.id!)} className="text-muted hover:text-danger p-1"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
