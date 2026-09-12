import { z } from 'zod';
import type { InventoryItem, MenuItemRecipe } from '@/types/database';

export const MAX_RECIPE_QUANTITY = 999_999_999.999;

export const RecipeIngredientSchema = z.object({
  inventory_item_id: z.string().uuid('Select a valid ingredient.').transform((id) => id.toLowerCase()),
  quantity_required: z.number().finite()
    .positive('Quantity per serving must be greater than zero.')
    .max(MAX_RECIPE_QUANTITY, 'Use a quantity below 1,000,000,000.')
    .refine((value) => value === Number(value.toFixed(3)), 'Use at most 3 decimal places.'),
});

export const RecipeIngredientsSchema = z.array(RecipeIngredientSchema).refine(
  (ingredients) => new Set(ingredients.map((ingredient) => ingredient.inventory_item_id)).size === ingredients.length,
  'Each ingredient can only appear once. Update its quantity instead.',
);

export type RecipeIngredientInput = z.input<typeof RecipeIngredientSchema>;
export type RecipeIngredient = MenuItemRecipe & {
  inventory_item: Pick<InventoryItem, 'id' | 'name' | 'unit'>;
};
