'use client';

import { useState, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatDateTime } from '@/lib/utils/date';
import { MessageSquare, Phone, Mail, MessageCircle, FileText, Plus } from 'lucide-react';
import { CRMInteractionType } from '@/types/enums';

const typeIcons: Record<string, any> = {
  [CRMInteractionType.CALL]: Phone,
  [CRMInteractionType.EMAIL]: Mail,
  [CRMInteractionType.WHATSAPP]: MessageCircle,
  [CRMInteractionType.NOTE]: FileText,
  [CRMInteractionType.VISIT]: MessageSquare,
};

const typeLabels: Record<string, string> = {
  [CRMInteractionType.CALL]: 'Appel',
  [CRMInteractionType.EMAIL]: 'Email',
  [CRMInteractionType.WHATSAPP]: 'WhatsApp',
  [CRMInteractionType.NOTE]: 'Note',
  [CRMInteractionType.VISIT]: 'Visite',
};

export default function CRMPage() {
  const interactions = useLiveQuery(() => db.crmInteractions.toArray());
  const members = useLiveQuery(() => db.members.toArray());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ memberId: '', type: CRMInteractionType.NOTE, content: '' });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.memberId || !form.content) return;
    await db.crmInteractions.add({
      memberId: form.memberId,
      type: form.type as CRMInteractionType,
      content: form.content,
      staffId: 'admin',
      createdAt: new Date().toISOString(),
    });
    setForm({ memberId: '', type: CRMInteractionType.NOTE, content: '' });
    setShowForm(false);
  };

  const sorted = (interactions || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM</h1>
          <p className="text-muted text-sm mt-1">Suivi des interactions avec les adhérents</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm">
          <Plus size={16} /> Nouvelle interaction
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Adhérent</label>
              <select value={form.memberId} onChange={e => setForm(f => ({ ...f, memberId: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required>
                <option value="">Sélectionner...</option>
                {(members || []).map(m => <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.memberNumber})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as CRMInteractionType }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm">
                {Object.entries(typeLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Contenu</label>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm h-24" required />
          </div>
          <button type="submit" className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm">Enregistrer</button>
        </form>
      )}

      <div className="space-y-2">
        {sorted.map(interaction => {
          const Icon = typeIcons[interaction.type] || FileText;
          const member = (members || []).find(m => m.id === interaction.memberId);
          return (
            <div key={interaction.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon size={16} className="text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{member?.firstName} {member?.lastName} <span className="text-xs text-muted">({member?.memberNumber})</span></span>
                    <span className="text-xs text-muted">{formatDateTime(interaction.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full">{typeLabels[interaction.type]}</span>
                  </div>
                  <p className="text-sm text-muted">{interaction.content}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
