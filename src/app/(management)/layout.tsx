'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { Role } from '@/types/enums';
import {
  LayoutDashboard, Users, ClipboardList, Dumbbell,
  ShoppingCart, Wallet, UserCog, ShieldCheck,
  MessageSquare, FileBarChart, Settings, LogOut,
  Menu, X, ChevronDown, ChevronRight, Fingerprint,
  CalendarCheck, TrendingUp, Package, Receipt,
  ChevronLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  roles: string[];
  children?: { label: string; href: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/admin', roles: [Role.ADMIN] },
  {
    label: 'Adhérents', icon: Users, href: '/admin/membres', roles: [Role.ADMIN, Role.RECEPTION],
    children: [
      { label: 'Tous les adhérents', href: '/admin/membres' },
      { label: 'Nouvel adhérent', href: '/admin/membres/nouveau' },
    ],
  },
  {
    label: 'Coachs & Groupes', icon: Dumbbell, href: '/admin/coachs', roles: [Role.ADMIN],
    children: [
      { label: 'Groupes', href: '/admin/coachs/groupes' },
      { label: 'Rémunération', href: '/admin/coachs/remuneration' },
    ],
  },
  {
    label: 'Abonnements', icon: ClipboardList, href: '/admin/abonnements', roles: [Role.ADMIN, Role.RECEPTION],
  },
  {
    label: 'Point de Vente', icon: ShoppingCart, href: '/admin/pos', roles: [Role.ADMIN, Role.RECEPTION],
    children: [
      { label: 'Caisse', href: '/admin/pos' },
      { label: 'Produits', href: '/admin/pos/produits' },
      { label: 'Catégories', href: '/admin/pos/categories' },
      { label: 'Stock', href: '/admin/pos/stock' },
      { label: 'Ventes', href: '/admin/pos/ventes' },
      { label: 'Retours', href: '/admin/pos/retours' },
    ],
  },
  {
    label: 'Finances', icon: Wallet, href: '/admin/finances', roles: [Role.ADMIN],
    children: [
      { label: 'Tableau de bord', href: '/admin/finances' },
      { label: 'Recettes', href: '/admin/finances/recettes' },
      { label: 'Dépenses', href: '/admin/finances/depenses' },
      { label: 'Journal de caisse', href: '/admin/finances/journal' },
    ],
  },
  {
    label: 'Personnel', icon: UserCog, href: '/admin/personnel', roles: [Role.ADMIN],
  },
  {
    label: 'Contrôle d\'accès', icon: ShieldCheck, href: '/admin/acces', roles: [Role.ADMIN, Role.RECEPTION],
    children: [
      { label: 'Check-in', href: '/admin/acces' },
      { label: 'Tourniquets', href: '/admin/acces/tourniquets' },
      { label: 'Logs accès', href: '/admin/acces/logs' },
    ],
  },
  {
    label: 'Analyse & BI', icon: TrendingUp, href: '/admin/analytics', roles: [Role.ADMIN],
  },
  {
    label: 'CRM', icon: MessageSquare, href: '/admin/crm', roles: [Role.ADMIN],
  },
  {
    label: 'Rapports', icon: FileBarChart, href: '/admin/rapports', roles: [Role.ADMIN],
    children: [
      { label: 'Adhérents', href: '/admin/rapports/adherents' },
      { label: 'Finances', href: '/admin/rapports/finances' },
      { label: 'POS', href: '/admin/rapports/pos' },
      { label: 'Personnel', href: '/admin/rapports/personnel' },
      { label: 'Présences', href: '/admin/rapports/presences' },
      { label: 'Abonnements', href: '/admin/rapports/abonnements' },
    ],
  },
  { label: 'Paramètres', icon: Settings, href: '/admin/parametres', roles: [Role.ADMIN] },
];

const RECEPTION_ITEMS: NavItem[] = [
  { label: 'Accueil', icon: LayoutDashboard, href: '/reception', roles: [Role.RECEPTION] },
  {
    label: 'Adhérents', icon: Users, href: '/reception/adherents', roles: [Role.RECEPTION],
    children: [
      { label: 'Liste', href: '/reception/adherents' },
    ],
  },
  {
    label: 'Check-in', icon: Fingerprint, href: '/reception/checkin', roles: [Role.RECEPTION],
  },
  {
    label: 'Point de Vente', icon: ShoppingCart, href: '/reception/pos', roles: [Role.RECEPTION],
  },
  {
    label: 'Paiements', icon: Receipt, href: '/reception/paiements', roles: [Role.RECEPTION],
  },
];

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isReception = pathname.startsWith('/reception');
  const navItems = isReception ? RECEPTION_ITEMS : NAV_ITEMS;

  const toggleExpand = (label: string) => {
    setExpandedItems(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (href: string) => {
    if (href === '/admin' || href === '/reception') return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-sidebar border-r border-border transition-all duration-300 flex flex-col flex-shrink-0`}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                <Dumbbell className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">QLF</p>
                <p className="text-[10px] text-muted">Fitness</p>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center mx-auto">
              <Dumbbell className="w-4 h-4 text-primary" />
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-muted hover:text-foreground p-1">
            {sidebarOpen ? <ChevronLeft size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const expanded = expandedItems[item.label];
            const hasChildren = item.children && item.children.length > 0;

            return (
              <div key={item.label}>
                {hasChildren ? (
                  <>
                    <button
                      onClick={() => toggleExpand(item.label)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        active ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-sidebar-hover hover:text-foreground'
                      }`}
                    >
                      <item.icon size={sidebarOpen ? 18 : 20} className="flex-shrink-0" />
                      {sidebarOpen && (
                        <>
                          <span className="flex-1 text-left">{item.label}</span>
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </>
                      )}
                    </button>
                    {sidebarOpen && expanded && item.children && (
                      <div className="ml-9 mt-1 space-y-1">
                        {item.children.map(child => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                              pathname === child.href ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground'
                            }`}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      active ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-sidebar-hover hover:text-foreground'
                    }`}
                  >
                    <item.icon size={sidebarOpen ? 18 : 20} className="flex-shrink-0" />
                    {sidebarOpen && <span>{item.label}</span>}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-border p-4">
          {sidebarOpen ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground font-medium">{user?.username}</p>
                <p className="text-xs text-muted capitalize">{user?.role === 'admin' ? 'Administrateur' : 'Réception'}</p>
              </div>
              <button onClick={logout} className="text-muted hover:text-danger p-1" title="Déconnexion">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button onClick={logout} className="text-muted hover:text-danger mx-auto block" title="Déconnexion">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}
