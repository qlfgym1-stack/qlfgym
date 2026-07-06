'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import Link from 'next/link';
import { FileBarChart, Users, Wallet, ShoppingCart, UserCog, CalendarCheck, ClipboardList } from 'lucide-react';

const reportModules = [
  { label: 'Adhérents', href: '/admin/rapports/adherents', icon: Users, desc: 'Liste, statuts, abonnements' },
  { label: 'Finances', href: '/admin/rapports/finances', icon: Wallet, desc: 'CA, recettes, dépenses, bénéfices' },
  { label: 'POS', href: '/admin/rapports/pos', icon: ShoppingCart, desc: 'Ventes, produits, stocks' },
  { label: 'Personnel', href: '/admin/rapports/personnel', icon: UserCog, desc: 'Employés, planning, performance' },
  { label: 'Présences', href: '/admin/rapports/presences', icon: CalendarCheck, desc: 'Fréquentation, horaires, tendances' },
  { label: 'Abonnements', href: '/admin/rapports/abonnements', icon: ClipboardList, desc: 'Types, renouvellements, expirations' },
];

export default function RapportsPage() {
  const members = useLiveQuery(() => db.members.toArray());
  const payments = useLiveQuery(() => db.payments.toArray());
  const sales = useLiveQuery(() => db.sales.toArray());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Centre de rapports</h1>
        <p className="text-muted text-sm mt-1">Générez et exportez des rapports PDF et Excel</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportModules.map(mod => (
          <Link key={mod.href} href={mod.href} className="bg-card border border-border rounded-xl p-5 hover:bg-card-hover transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <mod.icon size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{mod.label}</p>
                <p className="text-xs text-muted">{mod.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
