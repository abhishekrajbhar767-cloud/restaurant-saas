import { createClient } from '@/lib/supabase/server';
import { MenuApp } from '@/components/customer/menu-app';

export default async function CustomerMenuPage({
  params,
  searchParams,
}: {
  params: { restaurantSlug: string };
  searchParams: { table?: string };
}) {
  const supabase = createClient();

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', params.restaurantSlug)
    .maybeSingle();

  if (restaurantError || !restaurant) {
    return <ErrorScreen title="Restaurant not found" message="Double-check the QR code or link and try again." />;
  }

  if (restaurant.status !== 'active') {
    return <ErrorScreen title={restaurant.name} message="This restaurant is currently inactive. Please contact support." />;
  }

  const tableToken = searchParams.table;
  if (!tableToken) {
    return <ErrorScreen title={restaurant.name} message="This link is missing a table code — please scan the QR code at your table." />;
  }

  const { data: table, error: tableError } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .eq('qr_token', tableToken)
    .eq('is_active', true)
    .maybeSingle();

  if (tableError || !table) {
    return <ErrorScreen title={restaurant.name} message="This table code isn't valid. Please scan the QR code at your table again." />;
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
