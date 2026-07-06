'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db/dexie-db';
import { Gender, MemberRole, SubscriptionType, SubscriptionStatus } from '@/types/enums';
import { generateMemberNumber } from '@/lib/utils/date';
import { logAudit } from '@/lib/audit/index';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

export default function NewMember() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    gender: Gender.MALE, birthDate: '', city: '', address: '',
    role: MemberRole.MEMBER, goals: '',
    subType: SubscriptionType.MONTHLY, subPrice: 5000,
    subStart: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const memberNumber = generateMemberNumber();
      const startDate = form.subStart;
      const durationMap: Record<string, number> = { monthly: 30, quarterly: 90, semester: 180, annual: 365, custom: 30 };
      const endDate = new Date(new Date(startDate).getTime() + (durationMap[form.subType] || 30) * 86400000).toISOString();

      const id = await db.members.add({
        memberNumber,
        firstName: form.firstName, lastName: form.lastName,
        email: form.email, phone: form.phone,
        gender: form.gender as Gender, birthDate: form.birthDate,
        city: form.city, address: form.address,
        role: form.role as MemberRole,
        goals: form.goals ? [form.goals] : [],
        subscription: {
          type: form.subType as SubscriptionType,
          status: SubscriptionStatus.ACTIVE,
          startDate: new Date(startDate).toISOString(),
          endDate,
          autoRenew: false,
          price: form.subPrice,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await logAudit({ userId: 'admin', action: 'create', entity: 'members', entityId: id as string });
      router.push(`/admin/membres/profile/${id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const update = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link href="/admin/membres" className="text-muted hover:text-foreground p-1">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nouvel adhérent</h1>
          <p className="text-muted text-sm">Créez une nouvelle fiche adhérent</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Informations personnelles</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Prénom</label>
              <input type="text" value={form.firstName} onChange={e => update('firstName', e.target.value)} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Nom</label>
              <input type="text" value={form.lastName} onChange={e => update('lastName', e.target.value)} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => update('email', e.target.value)} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Téléphone</label>
              <input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Sexe</label>
              <select value={form.gender} onChange={e => update('gender', e.target.value)} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm">
                <option value="male">Masculin</option>
                <option value="female">Féminin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Date de naissance</label>
              <input type="date" value={form.birthDate} onChange={e => update('birthDate', e.target.value)} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Ville</label>
              <input type="text" value={form.city} onChange={e => update('city', e.target.value)} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Type</label>
              <select value={form.role} onChange={e => update('role', e.target.value)} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm">
                <option value="member">Adhérent</option>
                <option value="coach">Coach</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Abonnement</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Type d'abonnement</label>
              <select value={form.subType} onChange={e => update('subType', e.target.value)} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm">
                <option value="monthly">Mensuel</option>
                <option value="quarterly">Trimestriel</option>
                <option value="semester">Semestriel</option>
                <option value="annual">Annuel</option>
                <option value="custom">Personnalisé</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Prix (DA)</label>
              <input type="number" value={form.subPrice} onChange={e => update('subPrice', Number(e.target.value))} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Date de début</label>
              <input type="date" value={form.subStart} onChange={e => update('subStart', e.target.value)} className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors text-sm disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? 'Création...' : 'Créer l\'adhérent'}
        </button>
      </form>
    </div>
  );
}
