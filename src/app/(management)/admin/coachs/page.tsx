'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import Link from 'next/link';
import { Dumbbell, Users, Plus, TrendingUp, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/date';

export default function CoachsPage() {
  const coaches = useLiveQuery(() => db.members.where('role').equals('coach').toArray());
  const groups = useLiveQuery(() => db.coachGroups.toArray());
  const groupMembers = useLiveQuery(() => db.coachGroupMembers.toArray());
  const remunerations = useLiveQuery(() => db.coachRemunerations.toArray());

  const coachStats = (coaches || []).map(coach => {
    const coachGroups = (groups || []).filter(g => g.coachId === coach.id);
    const memberCount = (groupMembers || []).filter(gm => coachGroups.some(cg => cg.id === gm.groupId)).length;
    const coachRemun = (remunerations || []).filter(r => r.coachId === coach.id);
    const totalPaid = coachRemun.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.totalAmount, 0);
    const pendingAmount = coachRemun.filter(r => r.status === 'pending').reduce((sum, r) => sum + r.totalAmount, 0);
    return { coach, groupCount: coachGroups.length, memberCount, totalPaid, pendingAmount };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Coachs & Groupes</h1>
          <p className="text-muted text-sm mt-1">{coaches?.length || 0} coachs · {(groups || []).length} groupes</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/coachs/groupes" className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-card-hover rounded-lg text-sm text-foreground transition-colors">
            <Users size={16} /> Groupes
          </Link>
          <Link href="/admin/coachs/remuneration" className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm transition-colors">
            <TrendingUp size={16} /> Rémunération
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {coachStats.map(({ coach, groupCount, memberCount, totalPaid, pendingAmount }) => (
          <div key={coach.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-cyan-600/20 rounded-full flex items-center justify-center text-sm font-bold text-cyan-400">
                {coach.firstName[0]}{coach.lastName[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{coach.firstName} {coach.lastName}</p>
                <p className="text-xs text-muted">{coach.phone}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-foreground">{groupCount}</p>
                <p className="text-xs text-muted">Groupes</p>
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{memberCount}</p>
                <p className="text-xs text-muted">Membres</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-400">{formatCurrency(totalPaid)}</p>
                <p className="text-xs text-muted">Payé</p>
              </div>
            </div>
            {pendingAmount > 0 && (
              <div className="mt-2 text-xs text-yellow-400 text-center">
                {formatCurrency(pendingAmount)} en attente
              </div>
            )}
          </div>
        ))}
      </div>

      {(!coaches || coaches.length === 0) && (
        <div className="text-center py-12 text-muted">
          <Dumbbell size={40} className="mx-auto mb-3 opacity-50" />
          <p>Aucun coach enregistré</p>
          <p className="text-xs mt-1">Les coachs sont des adhérents avec le type "Coach"</p>
        </div>
      )}
    </div>
  );
}
