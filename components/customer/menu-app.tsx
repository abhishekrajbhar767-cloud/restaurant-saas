'use client';

import { useEffect, useMemo, useState } from 'react';
import { ItemCard } from '@/components/customer/item-card';
import { CartSheet } from '@/components/customer/cart-sheet';
import { QuickActions } from '@/components/customer/quick-actions';
import { ActiveOrders } from '@/components/customer/active-orders';
import { ServiceStatusBanner } from '@/components/customer/service-status-banner';
import { loadCart, saveCart, cartTotal, cartCount, type CartLine } from '@/lib/customer/cart';
import type { Restaurant, RestaurantTable, MenuCategory, MenuItem } from '@/types/database';

export function MenuApp({
  restaurant,
  table,
  categories,
  items,
}: {
  restaurant: Restaurant;
  table: RestaurantTable;
  categories: MenuCategory[];
  items: MenuItem[];
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id ?? '');
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    setCart(loadCart(table.id));
  }, [table.id]);

  useEffect(() => {
    saveCart(table.id, cart);
  }, [table.id, cart]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q));
  }, [items, search]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of filteredItems) {
      const list = map.get(item.category_id) ?? [];
      list.push(item);
      map.set(item.category_id, list);
    }
    return map;
  }, [filteredItems]);

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) => (l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        { menuItemId: item.id, name: item.name, price: item.price, quantity: 1, specialInstructions: '', imageUrl: item.image_url },
      ];
    });
  }

  function updateQuantity(menuItemId: string, quantity: number) {
    setCart((prev) =>
      quantity <= 0 ? prev.filter((l) => l.menuItemId !== menuItemId) : prev.map((l) => (l.menuItemId === menuItemId ? { ...l, quantity } : l))
    );
  }

  function updateInstructions(menuItemId: string, specialInstructions: string) {
    setCart((prev) => prev.map((l) => (l.menuItemId === menuItemId ? { ...l, specialInstructions } : l)));
  }

  const quantityFor = (itemId: string) => cart.find((l) => l.menuItemId === itemId)?.quantity ?? 0;

  return (
    <div className="pb-28">
      <header className="px-5 pt-6 pb-4 flex items-center gap-3">
        {restaurant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-supplied URL can be any host; next/image would crash on unconfigured hostnames
          <img src={restaurant.logo_url} alt={restaurant.name} width={48} height={48} className="rounded-full object-cover" />
        ) : (
          <div className="h-12 w-12 rounded-full bg-ink-950/10 flex items-center justify-center font-display font-bold text-lg">
            {restaurant.name.charAt(0)}
          </div>
        )}
        <div>
          <h1 className="font-display text-xl font-bold">{restaurant.name}</h1>
          <p className="text-xs text-text-onPaper/50">Table {table.table_number}</p>
        </div>
      </header>

      <ActiveOrders
        tableId={table.id}
        restaurantSlug={restaurant.slug}
        tableQrToken={table.qr_token}
        currency={restaurant.currency}
      />

      <div className="sticky top-0 bg-paper z-30 pt-1">
        <ServiceStatusBanner tableId={table.id} />
        <div className="px-5 pb-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the menu…"
            aria-label="Search menu"
            className="w-full rounded-full border border-ink-950/15 bg-white/70 px-4 py-2.5 text-sm placeholder:text-text-onPaper/40"
          />

          {!search && categories.length > 0 && (
            <nav className="flex gap-2 overflow-x-auto mt-3 -mx-5 px-5 pb-1" aria-label="Menu categories">
              {categories.map((c) => (
                <a
                  key={c.id}
                  href={`#category-${c.id}`}
                  onClick={() => setActiveCategory(c.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-display border transition-colors ${
                    activeCategory === c.id ? 'bg-ink-950 text-paper border-ink-950' : 'border-ink-950/15 text-text-onPaper/70 hover:bg-ink-950/5'
                  }`}
                >
                  {c.name}
                </a>
              ))}
            </nav>
          )}
        </div>
      </div>

      <main className="px-5">
        {search ? (
          <section>
            <h2 className="font-display font-bold text-sm uppercase tracking-wide text-text-onPaper/50 mt-4 mb-1">
              {filteredItems.length} result{filteredItems.length === 1 ? '' : 's'}
            </h2>
            {filteredItems.map((item) => (
              <ItemCard key={item.id} item={item} quantityInCart={quantityFor(item.id)} onAdd={() => addToCart(item)} />
            ))}
            {filteredItems.length === 0 && <p className="text-sm text-text-onPaper/50 py-8 text-center">No items match your search.</p>}
          </section>
        ) : (
          categories.map((category) => {
            const categoryItems = itemsByCategory.get(category.id) ?? [];
            if (categoryItems.length === 0) return null;
            return (
              <section key={category.id} id={`category-${category.id}`} className="scroll-mt-32">
                <h2 className="font-display font-bold text-lg mt-6 mb-1">{category.name}</h2>
                {categoryItems.map((item) => (
                  <ItemCard key={item.id} item={item} quantityInCart={quantityFor(item.id)} onAdd={() => addToCart(item)} />
                ))}
              </section>
            );
          })
        )}
      </main>

      <QuickActions tableId={table.id} tableQrToken={table.qr_token} />

      {cart.length > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 z-40 rounded-full bg-amber text-ink-950 font-display font-medium py-3.5 px-5 shadow-xl flex items-center justify-between"
        >
          <span>
            {cartCount(cart)} item{cartCount(cart) === 1 ? '' : 's'}
          </span>
          <span className="font-mono">{restaurant.currency} {cartTotal(cart).toLocaleString('en-IN')}</span>
          <span>View cart →</span>
        </button>
      )}

      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onUpdateQuantity={updateQuantity}
        onUpdateInstructions={updateInstructions}
        restaurantSlug={restaurant.slug}
        tableQrToken={table.qr_token}
        tableId={table.id}
        currency={restaurant.currency}
      />
    </div>
  );
}
