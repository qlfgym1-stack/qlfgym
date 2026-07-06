'use client';

import { useState, FormEvent } from 'react';
import { db } from '@/lib/db/dexie-db';
import { Settings, Save, Database, Trash2 } from 'lucide-react';

export default function SettingsPage() {
  const [saving, setSaving] = useState(false);
  const [clubName, setClubName] = useState('QLF Fitness');
  const [message, setMessage] = useState('');

  const saveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await db.clubInfo.put({ id: 'general', name: clubName });
    setMessage('Paramètres enregistrés');
    setSaving(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const resetData = async () => {
    if (confirm('Voulez-vous vraiment réinitialiser toutes les données ?')) {
      await db.delete();
      await db.open();
      setMessage('Base de données réinitialisée');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>

      {message && <div className="bg-green-600/20 border border-green-600/30 text-green-400 px-4 py-3 rounded-lg text-sm">{message}</div>}

      <form onSubmit={saveSettings} className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2"><Settings size={18} /> Informations du club</h2>
        <div>
          <label className="block text-sm text-muted mb-1">Nom du club</label>
          <input type="text" value={clubName} onChange={e => setClubName(e.target.value)} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
        </div>
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm">
          <Save size={16} /> {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2"><Database size={18} /> Base de données</h2>
        <p className="text-sm text-muted">Réinitialiser toutes les données locales</p>
        <button onClick={resetData} className="flex items-center gap-2 px-4 py-2 bg-danger/20 hover:bg-danger/30 text-danger rounded-lg text-sm">
          <Trash2 size={16} /> Réinitialiser
        </button>
      </div>
    </div>
  );
}
