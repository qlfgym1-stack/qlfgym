'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Phone, Mail, MapPin, Calendar, CreditCard, QrCode, Download, Activity } from 'lucide-react';
import { formatDate, formatCurrency, calculateAge, daysUntil } from '@/lib/utils/date';
import { QRCodeCanvas } from 'qrcode.react';

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon size={14} className="text-muted" />
      <span className="text-muted">{label} :</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export default function MemberProfile() {
  const params = useParams();
  const member = useLiveQuery(() => db.members.get(params.slug as string));
  const checkins = useLiveQuery(() => db.checkins.where('memberId').equals(params.slug as string).toArray());
  const payments = useLiveQuery(() => db.payments.where('memberId').equals(params.slug as string).toArray());
  const groups = useLiveQuery(() => db.coachGroupMembers.where('memberId').equals(params.slug as string).toArray());
  const allGroups = useLiveQuery(() => db.coachGroups.toArray());

  const memberGroup = useMemo(() => {
    if (!groups || !allGroups) return null;
    const gm = groups[0];
    if (!gm) return null;
    return allGroups.find(g => g.id === gm.groupId);
  }, [groups, allGroups]);

  if (!member) {
    return <div className="text-center py-12 text-muted">Chargement...</div>;
  }

  const age = calculateAge(member.birthDate);
  const today = new Date().toISOString().split('T')[0];
  const todayCheckins = checkins?.filter(c => c.timestamp.startsWith(today)) || [];
  const isPresent = todayCheckins.filter(c => c.type === 'entry').length > todayCheckins.filter(c => c.type === 'exit').length;
  const daysLeft = member.subscription.endDate ? daysUntil(member.subscription.endDate) : 0;

  const statusColor: Record<string, string> = {
    active: 'bg-green-600/20 text-green-400',
    frozen: 'bg-yellow-600/20 text-yellow-400',
    expired: 'bg-red-600/20 text-red-400',
    canceled: 'bg-gray-600/20 text-gray-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/membres" className="text-muted hover:text-foreground p-1">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Profil adhérent</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center text-xl font-bold text-primary">
                  {member.firstName[0]}{member.lastName[0]}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">{member.firstName} {member.lastName}</h2>
                  <p className="text-sm text-muted">{member.memberNumber}</p>
                  <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${statusColor[member.subscription.status] || ''}`}>
                    {member.subscription.status === 'active' ? 'Actif' :
                     member.subscription.status === 'frozen' ? 'Gelé' :
                     member.subscription.status === 'expired' ? 'Expiré' : 'Résilié'}
                  </span>
                  {isPresent && <span className="ml-2 text-xs px-2 py-0.5 bg-green-600/20 text-green-400 rounded-full">Présent</span>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <InfoRow icon={User} label="Sexe" value={member.gender === 'male' ? 'Masculin' : 'Féminin'} />
              <InfoRow icon={Calendar} label="Âge" value={`${age} ans`} />
              <InfoRow icon={Phone} label="Téléphone" value={member.phone} />
              <InfoRow icon={Mail} label="Email" value={member.email || '-'} />
              <InfoRow icon={MapPin} label="Ville" value={member.city || '-'} />
              <InfoRow icon={Activity} label="Coach" value={memberGroup?.name || 'Non assigné'} />
            </div>
          </div>

          {/* Subscription */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <CreditCard size={16} /> Abonnement
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow icon={Calendar} label="Début" value={formatDate(member.subscription.startDate)} />
              <InfoRow icon={Calendar} label="Fin" value={formatDate(member.subscription.endDate)} />
              <InfoRow icon={CreditCard} label="Prix" value={formatCurrency(member.subscription.price)} />
              <InfoRow icon={Calendar} label="Jours restants" value={daysLeft > 0 ? `${daysLeft} jours` : 'Expiré'} />
              <InfoRow icon={Activity} label="Type" value={member.subscription.type} />
            </div>
          </div>

          {/* Checkins */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Dernières présences</h3>
            <div className="space-y-2">
              {(checkins || []).slice(-10).reverse().map(c => (
                <div key={c.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg text-sm">
                  <span className="text-muted">{formatDate(c.timestamp)}</span>
                  <span className={c.type === 'entry' ? 'text-green-400' : 'text-red-400'}>
                    {c.type === 'entry' ? 'Entrée' : 'Sortie'}
                  </span>
                </div>
              ))}
              {(!checkins || checkins.length === 0) && (
                <p className="text-muted text-sm">Aucune présence enregistrée.</p>
              )}
            </div>
          </div>

          {/* Payments */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Derniers paiements</h3>
            <div className="space-y-2">
              {(payments || []).slice(-5).reverse().map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg text-sm">
                  <span className="text-foreground">{formatDate(p.date)}</span>
                  <span className="text-green-400 font-medium">{formatCurrency(p.amount)}</span>
                </div>
              ))}
              {(!payments || payments.length === 0) && (
                <p className="text-muted text-sm">Aucun paiement enregistré.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right column - QR */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center">
            <h3 className="text-lg font-semibold text-foreground mb-4">QR Code</h3>
            <QRCodeCanvas value={member.id || member.memberNumber} size={180} bgColor="#1e293b" fgColor="#f8fafc" />
            <p className="text-xs text-muted mt-3">ID: {member.id}</p>
            <button className="mt-4 flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-card-hover rounded-lg text-sm text-foreground transition-colors">
              <Download size={14} />
              Télécharger
            </button>
          </div>

          {member.goals && member.goals.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">Objectifs</h3>
              <ul className="space-y-1">
                {member.goals.map((g, i) => (
                  <li key={i} className="text-sm text-muted">• {g}</li>
                ))}
              </ul>
            </div>
          )}

          {memberGroup && (
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">Groupe coach</h3>
              <p className="text-sm text-foreground">{memberGroup.name}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
