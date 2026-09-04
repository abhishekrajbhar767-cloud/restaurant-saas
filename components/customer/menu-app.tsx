'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ItemCard, formatPrice } from '@/components/customer/item-card';
import { CartSheet } from '@/components/customer/cart-sheet';
import { QuickActions } from '@/components/customer/quick-actions';
import { ActiveOrders } from '@/components/customer/active-orders';
import { ServiceStatusBanner } from '@/components/customer/service-status-banner';
import { MenuHeader, type RestaurantRating } from '@/components/customer/menu-header';
import { FilterBar, DEFAULT_FILTERS, QUICK_PREP_MINUTES, type MenuFilters } from '@/components/customer/filter-bar';
import { MenuSection } from '@/components/customer/menu-section';
import { ChevronRightIcon, MenuBookIcon, SearchIcon, XIcon } from '@/components/customer/icons';
import { loadCart, saveCart, cartTotal, cartCount, type CartLine } from '@/lib/customer/cart';
import { createClient } from '@/lib/supabase/client';
import type { Restaurant, RestaurantTable, MenuCategory, MenuItem, TableStatus, FoodType } from '@/types/database';

const RECOMMENDED_ID = 'category-recommended';
const RECOMMENDED_LIMIT = 6;

export function MenuApp({
  restaurant,
  table,
  categories,
  items,
  rating = null,
}: {
  restaurant: Restaurant;
  table: RestaurantTable;
  categories: MenuCategory[];
  items: MenuItem[];
  /** Aggregate customer rating, when the caller has one. Renders a "New" badge otherwise. */
  rating?: RestaurantRating | null;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<MenuFilters>(DEFAULT_FILTERS);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [tableStatus, setTableStatus] = useState<TableStatus>(table.status);

  useEffect(() => {
    setCart(loadCart(table.id));
    setCartLoaded(true);
  }, [table.id]);

  useEffect(() => {
    setSaved(loadSaved(restaurant.id));
  }, [restaurant.id]);

  // A waiter seating or clearing this table is what unlocks or re-locks
  // ordering at restaurants that only accept orders from seated tables, and
  // the guest is holding a page that was rendered before either happened.
  // tables is already in the realtime publication for the manager's map, and
  // tables_select_public is what lets an anonymous guest receive their own
  // table's row.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`menu-table-${table.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tables', filter: `id=eq.${table.id}` },
        (payload) => setTableStatus((payload.new as RestaurantTable).status)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table.id]);

  // Don't persist until the stored cart has been read, otherwise the initial
  // empty state would overwrite a cart the guest built before a refresh.
  useEffect(() => {
    if (!cartLoaded) return;
    saveCart(table.id, cart);
  }, [table.id, cart, cartLoaded]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  // ---------------------------------------------------------------- derived

  const availableFoodTypes = useMemo(() => new Set<FoodType>(items.map((i) => i.food_type)), [items]);

  const prepRange = useMemo<[number, number] | null>(() => {
    const times = items.filter((i) => i.is_available && i.prep_time > 0).map((i) => i.prep_time);
    if (times.length === 0) return null;
    return [Math.min(...times), Math.max(...times)];
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items.filter((i) => {
      if (q && !i.name.toLowerCase().includes(q) && !(i.description ?? '').toLowerCase().includes(q)) return false;
      if (filters.foodTypes.size > 0 && !filters.foodTypes.has(i.food_type)) return false;
      if (filters.quickOnly && !(i.prep_time > 0 && i.prep_time <= QUICK_PREP_MINUTES)) return false;
      if (filters.hideUnavailable && !i.is_available) return false;
      return true;
    });
    if (filters.sort === 'price_asc') list = [...list].sort((a, b) => a.price - b.price);
    if (filters.sort === 'price_desc') list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [items, search, filters]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of filteredItems) {
      const list = map.get(item.category_id) ?? [];
      list.push(item);
      map.set(item.category_id, list);
    }
    return map;
  }, [filteredItems]);

  // "Recommended" is the owner's own ordering: the first available dishes
  // with photos, in menu sort order. No sales data reaches the anon client,
  // so this stays a presentation heuristic rather than a claim.
  const recommended = useMemo(() => {
    const available = filteredItems.filter((i) => i.is_available);
    const withPhotos = available.filter((i) => i.image_url);
    const pool = withPhotos.length >= 3 ? withPhotos : available;
    return pool.slice(0, RECOMMENDED_LIMIT);
  }, [filteredItems]);

  const isSearching = search.trim().length > 0;

  // ---------------------------------------------------------------- actions

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

  function toggleSaved(itemId: string) {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      persistSaved(restaurant.id, next);
      return next;
    });
  }

  async function shareItem(item: MenuItem) {
    const text = `${item.name} · ${formatPrice(item.price)} at ${restaurant.name}`;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: item.name, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setToast('Copied to clipboard');
    } catch (err) {
      // AbortError = the user closed the share sheet; not worth a toast.
      if (err instanceof Error && err.name === 'AbortError') return;
      setToast("Couldn't share right now");
    }
  }

  function toggleSection(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const jumpToSection = useCallback((id: string) => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setNavOpen(false);
    // Let the section expand before scrolling so the target has a height.
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  const renderItem = (item: MenuItem) => (
    <ItemCard
      key={item.id}
      item={item}
      quantityInCart={quantityFor(item.id)}
      onAdd={() => addToCart(item)}
      onRemove={() => updateQuantity(item.id, quantityFor(item.id) - 1)}
      saved={saved.has(item.id)}
      onToggleSave={() => toggleSaved(item.id)}
      onShare={() => shareItem(item)}
    />
  );

  const visibleCategories = categories.filter((c) => (itemsByCategory.get(c.id)?.length ?? 0) > 0);
  const itemCount = cartCount(cart);
  // Zomato puts the cuisine line under the name; the closest honest analogue
  // here is what the kitchen actually serves — the menu's leading categories.
  const tagline = categories.length > 0 ? categories.slice(0, 3).map((c) => c.name).join(', ') : 'Dine-in menu';

  return (
    <div className="mx-auto w-full max-w-3xl pb-32 lg:max-w-5xl">
      <MenuHeader restaurant={restaurant} table={table} rating={rating} prepRange={prepRange} tagline={tagline} />

      <ActiveOrders tableId={table.id} restaurantSlug={restaurant.slug} tableQrToken={table.qr_token} currency={restaurant.currency} />

      <div className="sticky top-0 z-30 mt-4 bg-surface-950/95 pt-1 backdrop-blur supports-[backdrop-filter]:bg-surface-950/80">
        <ServiceStatusBanner tableId={table.id} />
        <div className="px-4 pb-3 sm:px-6">
          <label className="relative block">
            <span className="sr-only">Search menu</span>
            <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search within menu"
              enterKeyHint="search"
              className="h-11 w-full rounded-xl border border-white/[0.08] bg-surface-800 pl-10 pr-10 text-[15px] text-white placeholder:text-zinc-500 focus-visible:border-zinc-400 [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <XIcon size={16} />
              </button>
            )}
          </label>

          <div className="mt-3">
            <FilterBar filters={filters} onChange={setFilters} availableFoodTypes={availableFoodTypes} />
          </div>
        </div>
        <div className="h-px bg-white/[0.06]" aria-hidden />
      </div>

      <main className="px-4 sm:px-6">
        {isSearching ? (
          <section aria-live="polite">
            <h2 className="mt-4 mb-1 font-display text-sm font-semibold uppercase tracking-wider text-zinc-500">
              {filteredItems.length} result{filteredItems.length === 1 ? '' : 's'} for &ldquo;{search.trim()}&rdquo;
            </h2>
            <div className="divide-y divide-white/[0.06] lg:grid lg:grid-cols-2 lg:gap-x-10 lg:divide-y-0 lg:[&>*]:border-b lg:[&>*]:border-white/[0.06]">
              {filteredItems.map(renderItem)}
            </div>
            {filteredItems.length === 0 && <EmptyState message="No dishes match your search." />}
          </section>
        ) : (
          <>
            {recommended.length > 0 && (
              <MenuSection
                id={RECOMMENDED_ID}
                title="Recommended for you"
                count={recommended.length}
                open={!collapsed.has(RECOMMENDED_ID)}
                onToggle={() => toggleSection(RECOMMENDED_ID)}
              >
                {recommended.map(renderItem)}
              </MenuSection>
            )}

            {visibleCategories.map((category) => {
              const id = `category-${category.id}`;
              const categoryItems = itemsByCategory.get(category.id) ?? [];
              return (
                <MenuSection
                  key={category.id}
                  id={id}
                  title={category.name}
                  count={categoryItems.length}
                  open={!collapsed.has(id)}
                  onToggle={() => toggleSection(id)}
                >
                  {categoryItems.map(renderItem)}
                </MenuSection>
              );
            })}

            {filteredItems.length === 0 && (
              <EmptyState message={items.length === 0 ? 'This menu is being set up — check back soon.' : 'Nothing matches these filters.'} />
            )}
          </>
        )}
      </main>

      {/* Floating category jump list — Zomato's bottom "Menu" pill. */}
      {!isSearching && visibleCategories.length > 0 && (
        <div className="fixed bottom-24 left-4 z-40 sm:left-1/2 sm:-translate-x-1/2">
          <button
            type="button"
            onClick={() => setNavOpen((o) => !o)}
            aria-expanded={navOpen}
            aria-controls="menu-jump-list"
            className="flex h-12 items-center gap-2 rounded-full bg-surface-800 px-5 font-display text-sm font-semibold text-white shadow-xl shadow-black/50 ring-1 ring-white/10 hover:bg-surface-700"
          >
            {navOpen ? <XIcon size={18} /> : <MenuBookIcon size={18} />}
            Menu
          </button>
        </div>
      )}

      {navOpen && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Jump to a menu section">
          <button type="button" aria-label="Close menu sections" onClick={() => setNavOpen(false)} className="absolute inset-0 bg-black/60" />
          <nav
            id="menu-jump-list"
            className="absolute bottom-40 left-4 right-4 mx-auto max-h-[55vh] max-w-sm overflow-y-auto rounded-2xl bg-surface-800 p-2 shadow-2xl ring-1 ring-white/10 sm:left-1/2 sm:right-auto sm:w-80 sm:-translate-x-1/2"
          >
            {recommended.length > 0 && (
              <JumpRow label="Recommended for you" count={recommended.length} onClick={() => jumpToSection(RECOMMENDED_ID)} />
            )}
            {visibleCategories.map((c) => (
              <JumpRow key={c.id} label={c.name} count={itemsByCategory.get(c.id)?.length ?? 0} onClick={() => jumpToSection(`category-${c.id}`)} />
            ))}
          </nav>
        </div>
      )}

      <QuickActions tableId={table.id} tableQrToken={table.qr_token} />

      {toast && (
        <div
          role="status"
          className="fixed bottom-40 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-medium text-surface-950 shadow-xl"
        >
          {toast}
        </div>
      )}

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 pt-6 bg-gradient-to-t from-surface-950 via-surface-950/90 to-transparent">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-xl bg-brand px-5 py-3 text-left font-display text-white shadow-xl shadow-black/50 transition-colors hover:bg-brand-bright"
          >
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">
                {itemCount} item{itemCount === 1 ? '' : 's'} added
              </span>
              <span className="text-xs text-white/80">{formatPrice(cartTotal(cart))} · plus taxes if any</span>
            </span>
            <span className="flex items-center gap-1 text-sm font-bold uppercase tracking-wide">
              View cart
              <ChevronRightIcon size={18} />
            </span>
          </button>
        </div>
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
        askName={restaurant.enable_customer_name}
        askMobile={restaurant.enable_customer_mobile}
        needsSeating={restaurant.require_table_assignment && tableStatus === 'empty'}
      />
    </div>
  );
}

function JumpRow({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-zinc-100 hover:bg-white/5"
    >
      <span className="truncate">{label}</span>
      <span className="ml-3 shrink-0 tabular-nums text-zinc-500">{count}</span>
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="py-14 text-center text-sm text-zinc-500">{message}</p>;
}

// Saved dishes live per restaurant in localStorage — a customer's "bookmarks"
// for this menu, with no account behind them.
function savedKey(restaurantId: string) {
  return `saved:${restaurantId}`;
}

function loadSaved(restaurantId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(savedKey(restaurantId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistSaved(restaurantId: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(savedKey(restaurantId), JSON.stringify([...ids]));
  } catch {
    // Storage may be unavailable (private mode / quota); bookmarks are best-effort.
  }
}
