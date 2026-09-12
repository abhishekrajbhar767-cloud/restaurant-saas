import { z } from 'zod';

export const INVENTORY_UNITS = ['kg', 'gram', 'litre', 'ml', 'pcs'] as const;
export const MAX_STOCK = 999_999_999.999;

const stockNumber = z.number().finite().max(MAX_STOCK, 'Use a value below 1,000,000,000.')
  .refine((value) => value === Number(value.toFixed(3)), 'Use at most 3 decimal places.');

export const CreateInventoryItemSchema = z.object({
  name: z.string().trim().min(1, 'Enter an ingredient name.').max(120, 'Use at most 120 characters.'),
  unit: z.enum(INVENTORY_UNITS),
  min_alert_limit: stockNumber.refine((value) => value >= 0, 'Alert limit cannot be negative.'),
});

export const AddStockSchema = z.object({
  inventoryItemId: z.string().uuid('Select a valid ingredient.'),
  quantity: stockNumber.refine((value) => value > 0, 'Quantity must be greater than zero.'),
  notes: z.string().trim().max(500, 'Use at most 500 characters.').optional(),
});

export type CreateInventoryItemInput = z.input<typeof CreateInventoryItemSchema>;
export type InventoryResult<T> = { data: T; error: null } | { data: null; error: string };

export function formatStock(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value);
}
