'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { FoodType } from '@/types/database';

// Every mutation below re-derives restaurant_id from the caller's own active
// membership (requireRole → ctx.tenantMembership.restaurant.id) and filters
// every write by it — never from a hidden form field. RLS backs this up
// independently, but scoping the query itself means a bug here fails closed
// (touches zero rows) rather than relying on RLS alone to catch it.

async function requireTenant() {
  const ctx = await requireRole(['owner', 'manager']);
  const restaurantId = ctx.tenantMembership?.restaurant.id;
  if (!restaurantId) throw new Error('No restaurant membership found.');
  return { ctx, restaurantId };
}

// ---------------- Categories ----------------

const CategorySchema = z.object({ name: z.string().min(1, 'Name is required') });

export async function addCategory(formData: FormData) {
  const { restaurantId } = await requireTenant();
  const parsed = CategorySchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid input');

  const supabase = createClient();
  const { data: existing } = await supabase
    .from('menu_categories')
    .select('sort_order')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextSortOrder = (existing?.[0]?.sort_order ?? 0) + 1;

  const { error } = await supabase.from('menu_categories').insert({
    restaurant_id: restaurantId,
    name: parsed.data.name,
    sort_order: nextSortOrder,
  });
  if (error) throw new Error('Could not create category.');

  revalidatePath('/admin/menu');
}

export async function renameCategory(categoryId: string, name: string) {
  const { restaurantId } = await requireTenant();
  const parsed = CategorySchema.safeParse({ name });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid input');

  const supabase = createClient();
  const { error } = await supabase
    .from('menu_categories')
    .update({ name: parsed.data.name })
    .eq('id', categoryId)
    .eq('restaurant_id', restaurantId);
  if (error) throw new Error('Could not rename category.');

  revalidatePath('/admin/menu');
}

export async function setCategoryActive(categoryId: string, isActive: boolean) {
  const { restaurantId } = await requireTenant();
  const supabase = createClient();
  const { error } = await supabase
    .from('menu_categories')
    .update({ is_active: isActive })
    .eq('id', categoryId)
    .eq('restaurant_id', restaurantId);
  if (error) throw new Error('Could not update category.');

  revalidatePath('/admin/menu');
}

export async function moveCategory(categoryId: string, direction: 'up' | 'down') {
  const { restaurantId } = await requireTenant();
  const supabase = createClient();

  const { data: categories, error } = await supabase
    .from('menu_categories')
    .select('id, sort_order')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true });
  if (error || !categories) throw new Error('Could not load categories.');

  const index = categories.findIndex((c) => c.id === categoryId);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= categories.length) return;

  const current = categories[index];
  const swap = categories[swapIndex];

  await Promise.all([
    supabase.from('menu_categories').update({ sort_order: swap.sort_order }).eq('id', current.id).eq('restaurant_id', restaurantId),
    supabase.from('menu_categories').update({ sort_order: current.sort_order }).eq('id', swap.id).eq('restaurant_id', restaurantId),
  ]);

  revalidatePath('/admin/menu');
}

// ---------------- Items ----------------

const ItemSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'Price must be 0 or more'),
  foodType: z.enum(['veg', 'non_veg', 'egg', 'vegan']),
  prepTime: z.coerce.number().int().min(0, 'Prep time must be 0 or more'),
});

async function uploadItemImage(restaurantId: string, image: File): Promise<string | null> {
  if (!image || image.size === 0) return null;

  const supabase = createClient();
  const ext = image.name.split('.').pop() || 'jpg';
  const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from('menu-images').upload(path, image, {
    contentType: image.type,
    upsert: false,
  });
  if (error) {
    console.error('uploadItemImage failed', error);
    throw new Error('Could not upload image.');
  }

  const { data } = supabase.storage.from('menu-images').getPublicUrl(path);
  return data.publicUrl;
}

export async function addItem(formData: FormData) {
  const { restaurantId } = await requireTenant();

  const parsed = ItemSchema.safeParse({
    categoryId: formData.get('categoryId'),
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    price: formData.get('price'),
    foodType: formData.get('foodType'),
    prepTime: formData.get('prepTime'),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid input');

  const image = formData.get('image') as File | null;
  const imageUrl = image ? await uploadItemImage(restaurantId, image) : null;

  const supabase = createClient();
  const { data: existing } = await supabase
    .from('menu_items')
    .select('sort_order')
    .eq('restaurant_id', restaurantId)
    .eq('category_id', parsed.data.categoryId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextSortOrder = (existing?.[0]?.sort_order ?? 0) + 1;

  const { error } = await supabase.from('menu_items').insert({
    restaurant_id: restaurantId,
    category_id: parsed.data.categoryId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    price: parsed.data.price,
    food_type: parsed.data.foodType as FoodType,
    prep_time: parsed.data.prepTime,
    image_url: imageUrl,
    sort_order: nextSortOrder,
  });
  if (error) throw new Error('Could not create menu item.');

  revalidatePath('/admin/menu');
}

const UpdateItemSchema = ItemSchema.extend({ itemId: z.string().uuid() });

export async function updateItem(formData: FormData) {
  const { restaurantId } = await requireTenant();

  const parsed = UpdateItemSchema.safeParse({
    itemId: formData.get('itemId'),
    categoryId: formData.get('categoryId'),
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    price: formData.get('price'),
    foodType: formData.get('foodType'),
    prepTime: formData.get('prepTime'),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid input');

  const image = formData.get('image') as File | null;
  const imageUrl = image && image.size > 0 ? await uploadItemImage(restaurantId, image) : undefined;

  const supabase = createClient();
  const { error } = await supabase
    .from('menu_items')
    .update({
      category_id: parsed.data.categoryId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      price: parsed.data.price,
      food_type: parsed.data.foodType as FoodType,
      prep_time: parsed.data.prepTime,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    })
    .eq('id', parsed.data.itemId)
    .eq('restaurant_id', restaurantId);
  if (error) throw new Error('Could not update menu item.');

  revalidatePath('/admin/menu');
}

export async function setItemAvailable(itemId: string, isAvailable: boolean) {
  const { restaurantId } = await requireTenant();
  const supabase = createClient();
  const { error } = await supabase
    .from('menu_items')
    .update({ is_available: isAvailable })
    .eq('id', itemId)
    .eq('restaurant_id', restaurantId);
  if (error) throw new Error('Could not update item.');

  revalidatePath('/admin/menu');
}

export async function moveItem(itemId: string, categoryId: string, direction: 'up' | 'down') {
  const { restaurantId } = await requireTenant();
  const supabase = createClient();

  const { data: items, error } = await supabase
    .from('menu_items')
    .select('id, sort_order')
    .eq('restaurant_id', restaurantId)
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: true });
  if (error || !items) throw new Error('Could not load items.');

  const index = items.findIndex((i) => i.id === itemId);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= items.length) return;

  const current = items[index];
  const swap = items[swapIndex];

  await Promise.all([
    supabase.from('menu_items').update({ sort_order: swap.sort_order }).eq('id', current.id).eq('restaurant_id', restaurantId),
    supabase.from('menu_items').update({ sort_order: current.sort_order }).eq('id', swap.id).eq('restaurant_id', restaurantId),
  ]);

  revalidatePath('/admin/menu');
}
