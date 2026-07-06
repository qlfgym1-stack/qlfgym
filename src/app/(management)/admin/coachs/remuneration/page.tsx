'use client';

import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency, formatDate } from '@/lib/utils/date';
import { DollarSign, CheckCircle, Clock } from 'lucide-react';
import { logAudit } from '@/lib/audit/index';

export default function CoachRemunerationPage() {
  const coaches = useLiveQuery(() => db.members.where('role').equals('coach').toArray());
  const groups = useLiveQuery(() => db.coachGroups.toArray());
  const groupMembers = useLiveQuery(() => db.coachGroupMembers.toArray());
  const remunerations = useLiveQuery(() => db.coachRemunerations.toArray());

  const [ratePerMember, setRatePerMember] = useState(500);
  const [selectedPeriod, setSelectedPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [saving, setSaving] = useState<string | null>(null);

  const periodLabel = useMemo(() => {
    const [y, m] = selectedPeriod.split('-');
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return `${months[parseInt(m) - 1]} ${y}`;
  }, [selectedPeriod]);

  const calculateRemuneration = (coachId: string) => {
    const coachGroups = (groups || []).filter(g => g.coachId === coachId);
    const memberCount = (groupMembers || []).filter(gm => coachGroups.some(cg => cg.id === gm.groupId)).length;
    return { memberCount, totalAmount: memberCount * ratePerMember };
  };

  const payCoach = async (coachId: string) => {
    setSaving(coachId);
    const { memberCount, totalAmount } = calculateRemuneration(coachId);
    try {
      await db.coachRemunerations.add({
        coachId,
        period: selectedPeriod,
        memberCount,
        ratePerMember,
        totalAmount,
        paidAt: new Date().toISOString(),
        status: 'paid',
      });
    } finally {
      setSaving(null);
    }
  };

  const getExistingRemun = (coachId: string) => {
    return (remunerations || []).filter(r => r.coachId === coachId && r.period === selectedPeriod);
  };

  const totals = useMemo(() => {
    const paid = (remunerations || []).filter(r => r.period === selectedPeriod && r.status === 'paid');
    const pending = (coaches || []).filter(c => !(remunerations || []).some(r => r.coachId === c.id && r.period === selectedPeriod && r.status === 'paid'));
    return {
      totalPaid: paid.reduce((s, r) => s + r.totalAmount, 0),
      pendingCoaches: pending.length,
      totalMemberCount: pending.reduce((s, c) => s + calculateRemuneration(c.id!).memberCount, 0),
    };
  }, [remunerations, coaches, selectedPeriod]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rémunération des coachs</h1>
          <p className="text-muted text-sm mt-1">Gérez la rémunération par membre assigné</p>
        </div>
      </div>

      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-sm text-muted mb-1">Période</label>
          <input type="month" value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} className="px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
        </div>
        <div>
          <label className="block text-sm text-muted mb-1">Taux par membre (DA)</label>
          <input type="number" value={ratePerMember} onChange={e => setRatePerMember(Number(e.target.value))} className="px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm">Période</p>
          <p className="text-lg font-bold text-foreground">{periodLabel}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm">Total payé</p>
          <p className="text-lg font-bold text-green-400">{formatCurrency(totals.totalPaid)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-sm">En attente</p>
          <p className="text-lg font-bold text-yellow-400">{totals.pendingCoaches} coachs · {formatCurrency(totals.pendingCoaches * ratePerMember * (totals.totalMemberCount / Math.max(totals.pendingCoaches, 1)))}</p>
        </div>
      </div>

      <div className="space-y-2">
        {(coaches || []).map(coach => {
          const { memberCount, totalAmount } = calculateRemuneration(coach.id!);
          const existing = getExistingRemun(coach.id!);
          const paid = existing.some(r => r.status === 'paid');

          return (
            <div key={coach.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan-600/20 rounded-full flex items-center justify-center text-sm font-bold text-cyan-400">
                  {coach.firstName[0]}{coach.lastName[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{coach.firstName} {coach.lastName}</p>
                  <p className="text-xs text-muted">{memberCount} membres · {formatCurrency(ratePerMember)}/membre</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-foreground">{formatCurrency(totalAmount)}</p>
                {paid ? (
                  <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Payé</span>
                ) : (
                  <button
                    onClick={() => payCoach(coach.id!)}
                    disabled={saving === coach.id || memberCount === 0}
                    className="text-xs px-3 py-1 bg-primary hover:bg-primary-hover text-white rounded-lg disabled:opacity-50"
                  >
                    {saving === coach.id ? '...' : 'Marquer payé'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Historique */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Historique des paiements</h2>
        {(remunerations || []).filter(r => r.status === 'paid').slice(-20).reverse().map(r => {
          const coach = (coaches || []).find(c => c.id === r.coachId);
          return (
            <div key={r.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg mb-1">
              <span className="text-sm text-foreground">{coach?.firstName} {coach?.lastName}</span>
              <span className="text-xs text-muted">{r.period} · {r.memberCount} membres</span>
              <span className="text-sm text-green-400 font-medium">{formatCurrency(r.totalAmount)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
