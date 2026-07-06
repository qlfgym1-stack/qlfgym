'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { Users, Fingerprint, ShoppingCart, Receipt } from 'lucide-react';
import Link from 'next/link';

function QuickCard({ icon: Icon, label, value, href, color }: { icon: any; label: string; value: string; href: string; color: string }) {
  return (
    <Link href={href} className="bg-card border border-border rounded-xl p-5 hover:bg-card-hover transition-colors block">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-muted text-sm">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </Link>
  );
}

export default function ReceptionDashboard() {
  const members = useLiveQuery(() => db.members.toArray());
  const todayCheckins = useLiveQuery(() => db.checkins
    .where('timestamp').startsWith(new Date().toISOString().split('T')[0])
    .toArray()
  );

  const totalMembers = members?.length || 0;
  const todayEntries = todayCheckins?.filter(c => c.type === 'entry').length || 0;
  const presentToday = new Set(todayCheckins?.filter(c => c.type === 'entry').map(c => c.memberId)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Accueil - Réception</h1>
        <p className="text-muted text-sm mt-1">Tableau de bord réception</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickCard icon={Users} label="Adhérents" value={totalMembers.toString()} href="/reception/adherents" color="bg-blue-600" />
        <QuickCard icon={Fingerprint} label="Entrées aujourd'hui" value={todayEntries.toString()} href="/reception/checkin" color="bg-green-600" />
        <QuickCard icon={ShoppingCart} label="POS" value="Ventes" href="/reception/pos" color="bg-violet-600" />
        <QuickCard icon={Receipt} label="Paiements" value="Encaissements" href="/reception/paiements" color="bg-cyan-600" />
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-semibold text-foreground mb-4">Adhérents présents ({presentToday})</h2>
        {presentToday === 0 ? (
          <p className="text-muted text-sm">Aucun adhérent présent pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {members?.filter(m => {
              const entries = todayCheckins?.filter(c => c.memberId === m.id && c.type === 'entry') || [];
              const exits = todayCheckins?.filter(c => c.memberId === m.id && c.type === 'exit') || [];
              return entries.length > exits.length;
            }).map(m => (
              <div key={m.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                <div>
                  <span className="text-sm text-foreground">{m.firstName} {m.lastName}</span>
                  <span className="text-xs text-muted ml-2">#{m.memberNumber}</span>
                </div>
                <span className="text-xs text-green-500">Présent</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
