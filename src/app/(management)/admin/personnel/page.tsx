'use client';

import { useState, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { Role } from '@/types/enums';

export default function PersonnelPage() {
  const personnel = useLiveQuery(() => db.personnel.toArray());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', role: Role.RECEPTION, contractType: '', salary: 0, hireDate: new Date().toISOString().split('T')[0] });

  const resetForm = () => {
    setForm({ firstName: '', lastName: '', email: '', phone: '', role: Role.RECEPTION, contractType: '', salary: 0, hireDate: new Date().toISOString().split('T')[0] });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (editing) {
      await db.personnel.update(editing, { ...form, updatedAt: new Date().toISOString() });
    } else {
      await db.personnel.add({ ...form, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    resetForm();
  };

  const editPerson = (p: NonNullable<typeof personnel>[number]) => {
    setForm({ firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone, role: p.role as Role, contractType: p.contractType || '', salary: p.salary || 0, hireDate: p.hireDate });
    setEditing(p.id!);
    setShowForm(true);
  };

  const toggleActive = async (p: NonNullable<typeof personnel>[number]) => {
    await db.personnel.update(p.id!, { active: !p.active });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Personnel</h1>
          <p className="text-muted text-sm mt-1">{(personnel || []).length} employés</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm">
          <Plus size={16} /> Nouvel employé
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{editing ? 'Modifier' : 'Nouvel'} employé</h2>
            <button type="button" onClick={resetForm}><X size={18} className="text-muted" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-muted mb-1">Prénom</label><input type="text" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required /></div>
            <div><label className="block text-sm text-muted mb-1">Nom</label><input type="text" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required /></div>
            <div><label className="block text-sm text-muted mb-1">Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" /></div>
            <div><label className="block text-sm text-muted mb-1">Téléphone</label><input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" /></div>
            <div><label className="block text-sm text-muted mb-1">Rôle</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm">
                <option value="admin">Administrateur</option>
                <option value="reception">Réception</option>
              </select>
            </div>
            <div><label className="block text-sm text-muted mb-1">Salaire (DA)</label><input type="number" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: Number(e.target.value) }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" /></div>
            <div><label className="block text-sm text-muted mb-1">Type contrat</label><input type="text" value={form.contractType} onChange={e => setForm(f => ({ ...f, contractType: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" placeholder="CDI, CDD, etc." /></div>
            <div><label className="block text-sm text-muted mb-1">Date d'embauche</label><input type="date" value={form.hireDate} onChange={e => setForm(f => ({ ...f, hireDate: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" /></div>
          </div>
          <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm"><Save size={16} /> {editing ? 'Modifier' : 'Créer'}</button>
        </form>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-muted">
              <th className="p-3 text-left">Nom</th>
              <th className="p-3 text-left">Rôle</th>
              <th className="p-3 text-left">Contact</th>
              <th className="p-3 text-left">Salaire</th>
              <th className="p-3 text-left">Statut</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(personnel || []).map(p => (
              <tr key={p.id} className="border-b border-border hover:bg-card-hover">
                <td className="p-3 text-foreground">{p.firstName} {p.lastName}</td>
                <td className="p-3 capitalize">{p.role === 'admin' ? 'Administrateur' : 'Réception'}</td>
                <td className="p-3 text-muted">{p.email}<br />{p.phone}</td>
                <td className="p-3 text-foreground">{p.salary ? `${p.salary} DA` : '-'}</td>
                <td className="p-3">
                  <button onClick={() => toggleActive(p)} className={`text-xs px-2 py-0.5 rounded-full ${p.active ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
                    {p.active ? 'Actif' : 'Inactif'}
                  </button>
                </td>
                <td className="p-3">
                  <button onClick={() => editPerson(p)} className="text-muted hover:text-foreground p-1"><Edit2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
