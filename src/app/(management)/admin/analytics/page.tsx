'use client';

import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency, calculateAge, getAgeGroup, getTimeSlot, getWeekPeriod } from '@/lib/utils/date';
import { Gender, TimeSlot, WeekPeriod } from '@/types/enums';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { Users, Calendar, Clock, TrendingUp, Filter, Download } from 'lucide-react';
import { groupBy, sumBy } from '@/lib/utils/transform';

const COLORS = ['#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const COLORS_PIE = ['#3b82f6', '#ec4899', '#8b5cf6'];

export default function AnalyticsPage() {
  const members = useLiveQuery(() => db.members.toArray());
  const checkins = useLiveQuery(() => db.checkins.toArray());
  const payments = useLiveQuery(() => db.payments.toArray());

  const [filterGender, setFilterGender] = useState<string>('all');
  const [filterAge, setFilterAge] = useState<string>('all');

  const filteredMembers = useMemo(() => {
    return (members || []).filter(m => {
      if (filterGender !== 'all' && m.gender !== filterGender) return false;
      if (filterAge !== 'all') {
        const age = calculateAge(m.birthDate);
        if (getAgeGroup(age) !== filterAge) return false;
      }
      return true;
    });
  }, [members, filterGender, filterAge]);

  const filteredCheckins = useMemo(() => {
    const memberIds = new Set(filteredMembers.map(m => m.id));
    return (checkins || []).filter(c => memberIds.has(c.memberId));
  }, [checkins, filteredMembers]);

  const entryCheckins = useMemo(() => filteredCheckins.filter(c => c.type === 'entry'), [filteredCheckins]);

  const activeMembers = filteredMembers.filter(m => m.subscription.status === 'active');
  const coaches = filteredMembers.filter(m => m.role === 'coach');

  const demographyByGender = useMemo(() => {
    const g = groupBy(filteredMembers, m => m.gender);
    return Object.entries(g).map(([key, items]) => ({ name: key === 'male' ? 'Masculin' : 'Féminin', value: items.length }));
  }, [filteredMembers]);

  const demographyByAge = useMemo(() => {
    const g = groupBy(filteredMembers, m => getAgeGroup(calculateAge(m.birthDate)));
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => ({ name: `${key} ans`, value: items.length }));
  }, [filteredMembers]);

  const checkinsByTimeSlot = useMemo(() => {
    const slots: Record<string, number> = {};
    for (const c of entryCheckins) {
      const slot = getTimeSlot(new Date(c.timestamp));
      slots[slot] = (slots[slot] || 0) + 1;
    }
    const order = ['6h-9h', '9h-12h', '12h-14h', '14h-17h', '17h-20h', '20h-22h'];
    return order.map(s => ({ name: s, value: slots[s] || 0 }));
  }, [entryCheckins]);

  const checkinsByWeekPeriod = useMemo(() => {
    const debut = entryCheckins.filter(c => getWeekPeriod(new Date(c.timestamp)) === WeekPeriod.DEBUT).length;
    const fin = entryCheckins.filter(c => getWeekPeriod(new Date(c.timestamp)) === WeekPeriod.FIN).length;
    return [
      { name: 'Début semaine (Dim→Mer)', value: debut },
      { name: 'Fin semaine (Jeu→Sam)', value: fin },
    ];
  }, [entryCheckins]);

  const checkinsByMonth = useMemo(() => {
    const g = groupBy(entryCheckins, c => c.timestamp.slice(0, 7));
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([key, items]) => ({
      name: key,
      value: items.length,
    }));
  }, [entryCheckins]);

  const genderTimeSlot = useMemo(() => {
    const slots = ['6h-9h', '9h-12h', '12h-14h', '14h-17h', '17h-20h', '20h-22h'];
    const male = slots.map(s => ({ name: s, value: 0 }));
    const female = slots.map(s => ({ name: s, value: 0 }));
    for (const c of entryCheckins) {
      const m = (members || []).find(m => m.id === c.memberId);
      if (!m) continue;
      const slot = getTimeSlot(new Date(c.timestamp));
      const idx = slots.indexOf(slot);
      if (idx === -1) continue;
      if (m.gender === Gender.MALE) male[idx].value++;
      else female[idx].value++;
    }
    return { male, female };
  }, [entryCheckins, members]);

  const revenuePerMember = useMemo(() => {
    const total = (payments || []).reduce((s, p) => s + p.amount, 0);
    return activeMembers.length > 0 ? total / activeMembers.length : 0;
  }, [payments, activeMembers]);

  const renewalRate = useMemo(() => {
    const total = filteredMembers.length;
    const active = activeMembers.length;
    return total > 0 ? Math.round((active / total) * 100) : 0;
  }, [filteredMembers, activeMembers]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analyse & BI</h1>
          <p className="text-muted text-sm mt-1">Statistiques et analyse des adhérents</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-xs text-muted mb-1">Sexe</label>
          <select value={filterGender} onChange={e => setFilterGender(e.target.value)} className="px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm">
            <option value="all">Tous</option>
            <option value="male">Masculin</option>
            <option value="female">Féminin</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Tranche d'âge</label>
          <select value={filterAge} onChange={e => setFilterAge(e.target.value)} className="px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm">
            <option value="all">Tous</option>
            <option value="12-17">12-17 ans</option>
            <option value="18-25">18-25 ans</option>
            <option value="26-35">26-35 ans</option>
            <option value="36-45">36-45 ans</option>
            <option value="46-60">46-60 ans</option>
            <option value="60+">60+ ans</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-xs">Adhérents actifs</p>
          <p className="text-2xl font-bold text-foreground">{activeMembers.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-xs">Taux renouvellement</p>
          <p className="text-2xl font-bold text-green-400">{renewalRate}%</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-xs">Total présences</p>
          <p className="text-2xl font-bold text-foreground">{entryCheckins.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-xs">Revenu/membre</p>
          <p className="text-2xl font-bold text-cyan-400">{formatCurrency(revenuePerMember)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted text-xs">Coachs</p>
          <p className="text-2xl font-bold text-foreground">{coaches.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Démographie par sexe */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><Users size={16} /> Répartition par sexe</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={demographyByGender} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {demographyByGender.map((_, i) => <Cell key={i} fill={COLORS_PIE[i % COLORS_PIE.length]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Démographie par âge */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><Users size={16} /> Répartition par âge</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={demographyByAge}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Fréquentation par tranche horaire */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><Clock size={16} /> Fréquentation par tranche horaire</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={checkinsByTimeSlot}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Début vs Fin de semaine */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><Calendar size={16} /> Début vs Fin de semaine</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={checkinsByWeekPeriod}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tendances mensuelles */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><TrendingUp size={16} /> Tendances mensuelles</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={checkinsByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Tranche horaire par sexe */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><Clock size={16} /> Tranche horaire × Sexe</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={genderTimeSlot.male.map((m, i) => ({ name: m.name, Masculin: m.value, Féminin: genderTimeSlot.female[i].value }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Masculin" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Féminin" fill="#ec4899" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tableau croisé */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Tableau croisé : Tranche horaire × Période semaine</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="p-2 text-left">Tranche</th>
              <th className="p-2 text-left">Début semaine</th>
              <th className="p-2 text-left">Fin semaine</th>
              <th className="p-2 text-left">Total</th>
            </tr>
          </thead>
          <tbody>
            {checkinsByTimeSlot.map(slot => {
              const debut = entryCheckins.filter(c => getTimeSlot(new Date(c.timestamp)) === slot.name && getWeekPeriod(new Date(c.timestamp)) === WeekPeriod.DEBUT).length;
              const fin = entryCheckins.filter(c => getTimeSlot(new Date(c.timestamp)) === slot.name && getWeekPeriod(new Date(c.timestamp)) === WeekPeriod.FIN).length;
              return (
                <tr key={slot.name} className="border-b border-border">
                  <td className="p-2 text-foreground">{slot.name}</td>
                  <td className="p-2 text-muted">{debut}</td>
                  <td className="p-2 text-muted">{fin}</td>
                  <td className="p-2 text-foreground font-medium">{debut + fin}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
