'use client';

import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency, generateReceiptNumber } from '@/lib/utils/date';
import { ShoppingCart, Plus, Minus, Trash2, Search, Banknote, CreditCard } from 'lucide-react';
import { PaymentMethod, SaleStatus } from '@/types/enums';

export default function ReceptionPOSPage() {
  const products = useLiveQuery(() => db.products.filter(p => p.active).toArray());
  const [cart, setCart] = useState<{ productId: string; name: string; price: number; quantity: number }[]>([]);
  const [search, setSearch] = useState('');

  const filtered = (products || []).filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const total = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);

  const addToCart = (p: NonNullable<typeof products>[number]) => {
    setCart(prev => {
      const existing = prev.find(c => c.productId === p.id);
      if (existing) return prev.map(c => c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { productId: p.id!, name: p.name, price: p.price, quantity: 1 }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev.map(c => c.productId === productId ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(c => c.productId !== productId));
  };

  const checkout = async () => {
    if (cart.length === 0) return;
    const receiptNumber = generateReceiptNumber();
    const items = cart.map(c => ({ saleId: '', productId: c.productId, productName: c.name, quantity: c.quantity, unitPrice: c.price, discount: 0, subtotal: c.price * c.quantity }));
    await db.sales.add({ receiptNumber, items, subtotal: total, discount: 0, tax: 0, total, paymentMethod: PaymentMethod.CASH, status: SaleStatus.COMPLETED, createdAt: new Date().toISOString() });
    for (const item of cart) {
      const p = products?.find(p => p.id === item.productId);
      if (p) await db.products.update(item.productId, { stock: p.stock - item.quantity });
    }
    setCart([]);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Point de Vente</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {filtered.map(p => (
              <button key={p.id} onClick={() => addToCart(p)} className="bg-card border border-border rounded-xl p-3 text-left hover:bg-card-hover">
                <p className="text-sm text-foreground">{p.name}</p>
                <p className="text-sm text-primary font-bold">{formatCurrency(p.price)}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <h2 className="font-semibold text-foreground">Panier ({cart.length})</h2>
          {cart.length === 0 ? <p className="text-muted text-sm text-center py-8">Vide</p> : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {cart.map(item => (
                <div key={item.productId} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-xs text-foreground">{item.name}</p>
                    <p className="text-xs text-muted">{formatCurrency(item.price)} x {item.quantity}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.productId, -1)} className="p-1 text-muted"><Minus size={12} /></button>
                    <span className="text-xs w-5 text-center text-foreground">{item.quantity}</span>
                    <button onClick={() => updateQty(item.productId, 1)} className="p-1 text-muted"><Plus size={12} /></button>
                    <button onClick={() => removeFromCart(item.productId)} className="p-1 text-muted hover:text-danger"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-border pt-3">
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
          </div>
          <button onClick={checkout} disabled={cart.length === 0} className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-lg disabled:opacity-50 text-sm">
            Payer {formatCurrency(total)}
          </button>
        </div>
      </div>
    </div>
  );
}
