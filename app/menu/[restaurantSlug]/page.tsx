import { cache } from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { MenuApp } from '@/components/customer/menu-app';
import type { Restaurant, RestaurantTable } from '@/types/database';

type PageProps = {
  params: { restaurantSlug: string };
  searchParams: { table?: string };
};

// Deduped so generateMetadata and the page itself share one round trip.
const getRestaurant = cache(async (slug: string): Promise<Restaurant | null> => {
  const supabase = createClient();
  const { data } = await supabase.from('restaurants').select('*').eq('slug', slug).maybeSingle();
  return data;
});

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const restaurant = await getRestaurant(params.restaurantSlug);
  if (!restaurant || restaurant.status !== 'active') return { title: 'Menu' };

  const title = `${restaurant.name} — Menu`;
  const description = `Browse the full menu from ${restaurant.name}. Scan the QR code at your table to order.`;
  const images = restaurant.logo_url ? [restaurant.logo_url] : undefined;

  return {
    title,
    description,
    openGraph: { type: 'website', title, description, images },
    twitter: { card: 'summary_large_image', title, description, images },
    // A ?table= link carries that table's ordering token, so keep those URLs
    // out of search indexes. The plain menu URL is the shareable one.
    robots: searchParams.table ? { index: false, follow: false } : undefined,
  };
}

export default async function CustomerMenuPage({ params, searchParams }: PageProps) {
  const restaurant = await getRestaurant(params.restaurantSlug);

  if (!restaurant) {
    return <ErrorScreen title="Restaurant not found" message="Double-check the QR code or link and try again." />;
  }

  if (restaurant.status !== 'active') {
    return <ErrorScreen title={restaurant.name} message="This restaurant is currently inactive. Please contact support." />;
  }

  // No table code (a link shared on WhatsApp / social) or one that no longer
  // resolves to an active table both fall back to browse-only mode: the menu
  // stays fully browsable, but nothing can start an order.
  const supabase = createClient();
  const tableToken = searchParams.table;
  let table: RestaurantTable | null = null;

  if (tableToken) {
    const { data } = await supabase
      .from('tables')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('qr_token', tableToken)
      .eq('is_active', true)
      .maybeSingle();
    table = data;
  }

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from('menu_categories').select('*').eq('restaurant_id', restaurant.id).eq('is_active', true).order('sort_order'),
    supabase.from('menu_items').select('*').eq('restaurant_id', restaurant.id).order('sort_order'),
  ]);

  return (
    <MenuApp
      restaurant={restaurant}
      table={table}
      categories={categories ?? []}
      items={items ?? []}
      tableCodeRejected={tableToken !== undefined && table === null}
    />
  );
}

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-950 px-6 text-white">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 font-display text-xl font-bold">{title}</h1>
        <p className="text-sm text-zinc-400">{message}</p>
      </div>
    </div>
  );
}
