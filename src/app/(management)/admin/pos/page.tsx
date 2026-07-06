'use client';

import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie-db';
import { formatCurrency, generateReceiptNumber } from '@/lib/utils/date';
import { ShoppingCart, Plus, Minus, Trash2, Search, CreditCard, Banknote, Smartphone } from 'lucide-react';
import { PaymentMethod, SaleStatus } from '@/types/enums';

export default function POSPage() {
  const products = useLiveQuery(() => db.products.filter(p => p.active).toArray());
  const categories = useLiveQuery(() => db.productCategories.toArray());

  const [cart, setCart] = useState<{ productId: string; name: string; price: number; quantity: number }[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [memberId, setMemberId] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const filteredProducts = (products || []).filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode && p.barcode.includes(search));
    const matchCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
    return matchSearch && matchCat;
  });

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const discount = 0;
  const total = subtotal - discount;

  const addToCart = (product: NonNullable<typeof products>[number]) => {
    setCart(prev => {
      const existing = prev.find(c => c.productId === product.id);
      if (existing) return prev.map(c => c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { productId: product.id!, name: product.name, price: product.price, quantity: 1 }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev.map(c => c.productId === productId ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(c => c.productId !== productId));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const receiptNumber = generateReceiptNumber();
      const saleItems = cart.map(c => ({
        saleId: '',
        productId: c.productId,
        productName: c.name,
        quantity: c.quantity,
        unitPrice: c.price,
        discount: 0,
        subtotal: c.price * c.quantity,
      }));

      const saleId = await db.sales.add({
        receiptNumber,
        items: saleItems,
        subtotal,
        discount,
        tax: 0,
        total,
        paymentMethod,
        memberId: memberId || undefined,
        status: SaleStatus.COMPLETED,
        createdAt: new Date().toISOString(),
      });

      for (const item of cart) {
        const product = products?.find(p => p.id === item.productId);
        if (product) {
          await db.products.update(item.productId, { stock: product.stock - item.quantity });
        }
      }

      setSuccessMsg(`Vente #${receiptNumber} enregistrée - ${formatCurrency(total)}`);
      setCart([]);
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Point de Vente</h1>
        <p className="text-muted text-sm mt-1">Caisse enregistreuse</p>
      </div>

      {successMsg && (
        <div className="bg-green-600/20 border border-green-600/30 text-green-400 px-4 py-3 rounded-lg text-sm">{successMsg}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Products grid */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher produit ou code-barres..." className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>
            <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm">
              <option value="all">Toutes catégories</option>
              {(categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filteredProducts.map(p => (
              <button key={p.id} onClick={() => addToCart(p)} className="bg-card border border-border rounded-xl p-3 text-left hover:bg-card-hover transition-colors">
                <p className="text-sm font-medium text-foreground">{p.name}</p>
                <p className="text-sm text-primary font-bold mt-1">{formatCurrency(p.price)}</p>
                <p className="text-xs text-muted">Stock: {p.stock}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Cart */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <ShoppingCart size={18} /> Panier ({cart.length})
            </h2>

            {cart.length === 0 ? (
              <p className="text-muted text-sm text-center py-8">Panier vide</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {cart.map(item => (
                  <div key={item.productId} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{item.name}</p>
                      <p className="text-xs text-muted">{formatCurrency(item.price)} x {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(item.productId, -1)} className="p-1 text-muted hover:text-foreground"><Minus size={14} /></button>
                      <span className="text-sm w-6 text-center text-foreground">{item.quantity}</span>
                      <button onClick={() => updateQty(item.productId, 1)} className="p-1 text-muted hover:text-foreground"><Plus size={14} /></button>
                      <button onClick={() => removeFromCart(item.productId)} className="p-1 text-muted hover:text-danger ml-1"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Sous-total</span>
                <span className="text-foreground">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span className="text-foreground">Total</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">Moyen de paiement</label>
              <div className="flex gap-2">
                {[
                  { value: PaymentMethod.CASH, label: 'Espèces', icon: Banknote },
                  { value: PaymentMethod.CARD, label: 'Carte', icon: CreditCard },
                  { value: PaymentMethod.TRANSFER, label: 'Mobile', icon: Smartphone },
                ].map(m => (
                  <button key={m.value} onClick={() => setPaymentMethod(m.value as PaymentMethod)} className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs transition-colors ${paymentMethod === m.value ? 'bg-primary text-white' : 'bg-secondary text-muted hover:text-foreground'}`}>
                    <m.icon size={14} /> {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">Membre (optionnel)</label>
              <input type="text" value={memberId} onChange={e => setMemberId(e.target.value)} placeholder="ID membre" className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm" />
            </div>

            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || saving}
              className="w-full py-3 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              {saving ? 'Enregistrement...' : `Payer ${formatCurrency(total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
