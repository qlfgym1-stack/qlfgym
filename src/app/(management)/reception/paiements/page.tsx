'use client';

import { useState, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency, formatDate } from '@/lib/utils/date';
import { Receipt, Plus } from 'lucide-react';
import { PaymentMethod } from '@/types/enums';

export default function ReceptionPaiementsPage() {
  const payments = useLiveQuery(() => db.payments.toArray());
  const members = useLiveQuery(() => db.members.toArray());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ memberId: '', amount: 0, method: PaymentMethod.CASH, date: new Date().toISOString().split('T')[0] });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.memberId || !form.amount) return;
    await db.payments.add({
      memberId: form.memberId,
      amount: form.amount,
      date: form.date,
      method: form.method as PaymentMethod,
      paymentFor: 'subscription',
      createdAt: new Date().toISOString(),
    });
    setForm({ memberId: '', amount: 0, method: PaymentMethod.CASH, date: new Date().toISOString().split('T')[0] });
    setShowForm(false);
  };

  const sorted = (payments || []).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Paiements</h1>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm">
          <Plus size={16} /> Nouveau paiement
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Adhérent</label>
              <select value={form.memberId} onChange={e => setForm(f => ({ ...f, memberId: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required>
                <option value="">Sélectionner...</option>
                {(members || []).map(m => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Montant (DA)</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Méthode</label>
              <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value as PaymentMethod }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm">
                <option value="cash">Espèces</option>
                <option value="card">Carte</option>
                <option value="transfer">Virement</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm">Enregistrer</button>
        </form>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-muted">
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Membre</th>
              <th className="p-3 text-left">Méthode</th>
              <th className="p-3 text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const m = (members || []).find(m => m.id === p.memberId);
              return (
                <tr key={p.id} className="border-b border-border">
                  <td className="p-3 text-muted text-xs">{formatDate(p.date)}</td>
                  <td className="p-3 text-foreground">{m?.firstName} {m?.lastName || 'Inconnu'}</td>
                  <td className="p-3 text-muted capitalize">{p.method}</td>
                  <td className="p-3 text-right text-green-400 font-medium">{formatCurrency(p.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
