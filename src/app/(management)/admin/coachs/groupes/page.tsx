'use client';

import { useState, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { Plus, Trash2, Users, Save } from 'lucide-react';
import { logAudit } from '@/lib/audit/index';

export default function CoachGroupesPage() {
  const [newName, setNewName] = useState('');
  const [selectedCoach, setSelectedCoach] = useState('');
  const [saving, setSaving] = useState(false);

  const coaches = useLiveQuery(() => db.members.where('role').equals('coach').toArray());
  const groups = useLiveQuery(() => db.coachGroups.toArray());
  const groupMembers = useLiveQuery(() => db.coachGroupMembers.toArray());
  const members = useLiveQuery(() => db.members.where('role').equals('member').toArray());
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const createGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName || !selectedCoach) return;
    setSaving(true);
    try {
      await db.coachGroups.add({ coachId: selectedCoach, name: newName, createdAt: new Date().toISOString() });
      setNewName('');
    } finally {
      setSaving(false);
    }
  };

  const deleteGroup = async (id: string) => {
    await db.coachGroups.delete(id);
    const toDelete = (groupMembers || []).filter(gm => gm.groupId === id);
    for (const gm of toDelete) await db.coachGroupMembers.delete(gm.id!);
  };

  const addMemberToGroup = async (groupId: string, memberId: string) => {
    const exists = (groupMembers || []).some(gm => gm.groupId === groupId && gm.memberId === memberId);
    if (exists) return;
    await db.coachGroupMembers.add({ groupId, memberId, assignedAt: new Date().toISOString() });
  };

  const removeMember = async (id: string) => {
    await db.coachGroupMembers.delete(id);
  };

  const assignedMemberIds = (groupMembers || []).filter(gm => gm.groupId === selectedGroup).map(gm => gm.memberId);
  const availableMembers = (members || []).filter(m => !assignedMemberIds.includes(m.id!));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Groupes de coachs</h1>
        <p className="text-muted text-sm mt-1">Créez des groupes et assignez des membres aux coachs</p>
      </div>

      <form onSubmit={createGroup} className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-sm text-muted mb-1">Nom du groupe</label>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Groupe A" className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required />
        </div>
        <div className="flex-1">
          <label className="block text-sm text-muted mb-1">Coach</label>
          <select value={selectedCoach} onChange={e => setSelectedCoach(e.target.value)} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required>
            <option value="">Sélectionner...</option>
            {(coaches || []).map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
          </select>
        </div>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm flex items-center gap-2">
          <Plus size={16} /> Créer
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Groupes ({groups?.length || 0})</h2>
          {(groups || []).map(g => {
            const coach = (coaches || []).find(c => c.id === g.coachId);
            const count = (groupMembers || []).filter(gm => gm.groupId === g.id).length;
            return (
              <div key={g.id} className={`p-3 rounded-lg border cursor-pointer transition-colors flex items-center justify-between ${selectedGroup === g.id ? 'bg-primary/10 border-primary' : 'bg-card border-border hover:bg-card-hover'}`} onClick={() => setSelectedGroup(g.id!)}>
                <div>
                  <p className="text-sm text-foreground font-medium">{g.name}</p>
                  <p className="text-xs text-muted">{coach?.firstName} {coach?.lastName} · {count} membres</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteGroup(g.id!); }} className="text-muted hover:text-danger p-1"><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-2">
          {selectedGroup ? (
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Membres du groupe
              </h2>

              <div className="mb-4">
                <label className="block text-sm text-muted mb-1">Ajouter un membre</label>
                <div className="flex gap-2">
                  <select className="flex-1 px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" value="" onChange={e => { if (e.target.value) { addMemberToGroup(selectedGroup, e.target.value); e.target.value = ''; } }}>
                    <option value="">Sélectionner...</option>
                    {availableMembers.map(m => <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.memberNumber})</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                {(groupMembers || []).filter(gm => gm.groupId === selectedGroup).map(gm => {
                  const member = (members || []).find(m => m.id === gm.memberId);
                  return (
                    <div key={gm.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                      <span className="text-sm text-foreground">{member?.firstName} {member?.lastName} <span className="text-muted">({member?.memberNumber})</span></span>
                      <button onClick={() => removeMember(gm.id!)} className="text-muted hover:text-danger p-1"><Trash2 size={14} /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted">
              <Users size={40} className="mx-auto mb-3 opacity-50" />
              <p>Sélectionnez un groupe pour gérer ses membres</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
