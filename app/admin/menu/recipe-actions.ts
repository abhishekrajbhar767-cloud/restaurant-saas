'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { InventoryResult } from '@/lib/inventory/validation';
import { RecipeIngredientsSchema, type RecipeIngredient, type RecipeIngredientInput } from '@/lib/menu/recipe';

type RecipeContext = { supabase: ReturnType<typeof createClient>; restaurantId: string };

async function withRecipeAccess<T>(operation: (context: RecipeContext) => Promise<InventoryResult<T>>): Promise<InventoryResult<T>> {
  const ctx = await requireRole(['owner', 'manager']);
  const membership = ctx.tenantMembership;
  if (!membership?.restaurant_id || !['owner', 'manager'].includes(membership.role)) {
    return { data: null, error: 'An owner or manager restaurant membership is required.' };
  }
  try {
    const supabase = createClient();
    const { data: restaurant, error } = await supabase.from('restaurants')
      .select('inventory_tracking_enabled').eq('id', membership.restaurant_id).single();
    if (error || !restaurant) return { data: null, error: 'Could not verify inventory settings. Please try again.' };
    if (!restaurant.inventory_tracking_enabled) return { data: null, error: 'Enable Raw Inventory Tracking in Settings first.' };
    return await operation({ supabase, restaurantId: membership.restaurant_id });
  } catch (error) {
    console.error('Recipe operation failed', error);
    return { data: null, error: 'Could not complete this recipe request. Please try again.' };
  }
}

async function verifyMenuItem({ supabase, restaurantId }: RecipeContext, menuItemId: string): Promise<string | null> {
  if (!z.string().uuid().safeParse(menuItemId).success) return 'Select a valid menu item.';
  const { data, error } = await supabase.from('menu_items').select('id')
    .eq('id', menuItemId).eq('restaurant_id', restaurantId).maybeSingle();
  if (error) return 'Could not verify this menu item. Please try again.';
  return data ? null : 'Menu item not found in your restaurant.';
}

export async function getMenuItemRecipe(menuItemId: string): Promise<InventoryResult<RecipeIngredient[]>> {
  return withRecipeAccess(async (context) => {
    const accessError = await verifyMenuItem(context, menuItemId);
    if (accessError) return { data: null, error: accessError };
    const rows: RecipeIngredient[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await context.supabase.from('menu_item_recipes')
        .select('*, inventory_item:inventory_items!inner(id, name, unit)')
        .eq('menu_item_id', menuItemId).eq('restaurant_id', context.restaurantId)
        .eq('inventory_item.restaurant_id', context.restaurantId)
        .order('id').range(offset, offset + pageSize - 1)
        .returns<RecipeIngredient[]>();
      if (error) return { data: null, error: 'Could not load this recipe. Please try again.' };
      rows.push(...data);
      if (data.length < pageSize) break;
    }
    return { data: rows.sort((a, b) => a.inventory_item.name.localeCompare(b.inventory_item.name)), error: null };
  });
}

export async function saveMenuItemRecipe(menuItemId: string, ingredients: RecipeIngredientInput[]): Promise<InventoryResult<null>> {
  return withRecipeAccess(async (context) => {
    const accessError = await verifyMenuItem(context, menuItemId);
    if (accessError) return { data: null, error: accessError };
    const parsed = RecipeIngredientsSchema.safeParse(ingredients);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? 'Check the ingredient quantities.' };
    // The RPC validates all ingredient tenants and commits additions/removals together.
    const { error } = await context.supabase.rpc('save_menu_item_recipe', {
      p_menu_item_id: menuItemId,
      p_ingredients: parsed.data,
    });
    if (error) {
      if (error.code === '42501') return { data: null, error: 'Inventory is disabled or you no longer have permission to edit recipes.' };
      if (error.code === '22023') return { data: null, error: 'An ingredient or quantity is no longer valid. Reload the recipe and try again.' };
      console.error('Recipe save failed', error);
      return { data: null, error: 'Could not save this recipe. Please try again.' };
    }
    revalidatePath('/admin/menu');
    return { data: null, error: null };
  });
}

export async function deleteRecipeIngredient(recipeId: string): Promise<InventoryResult<null>> {
  return withRecipeAccess(async (context) => {
    if (!z.string().uuid().safeParse(recipeId).success) return { data: null, error: 'Select a valid recipe ingredient.' };
    const { data: recipe, error: lookupError } = await context.supabase.from('menu_item_recipes')
      .select('menu_item_id').eq('id', recipeId).eq('restaurant_id', context.restaurantId).maybeSingle();
    if (lookupError || !recipe) return { data: null, error: 'Recipe ingredient not found in your restaurant.' };
    const accessError = await verifyMenuItem(context, recipe.menu_item_id);
    if (accessError) return { data: null, error: accessError };
    const { error } = await context.supabase.rpc('delete_recipe_ingredient', { p_recipe_id: recipeId });
    if (error) {
      if (error.code === '42501') return { data: null, error: 'Inventory is disabled or you no longer have permission to edit recipes.' };
      return { data: null, error: 'Could not remove this recipe ingredient. Reload and try again.' };
    }
    revalidatePath('/admin/menu');
    return { data: null, error: null };
  });
}
