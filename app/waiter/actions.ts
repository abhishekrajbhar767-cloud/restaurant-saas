'use server';

import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { OrderLineInput } from '@/types/database';

const OrderSchema = z.object({
  tableId: z.string().uuid('Pick a table first.'),
  lines: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().positive().max(99, 'That quantity looks like a typo.'),
        note: z.string().trim().max(200).optional(),
      })
    )
    .min(1, 'Add at least one item.'),
  customerName: z.string().trim().max(80).optional(),
  customerMobile: z.string().trim().max(20).optional(),
});

export type WaiterOrderInput = z.input<typeof OrderSchema>;

export type WaiterOrderResult = {
  orderNumber: number | null;
  error: string | null;
};

export async function createWaiterOrder(input: WaiterOrderInput): Promise<WaiterOrderResult> {
  const ctx = await requireRole(['waiter', 'manager', 'owner']);
  const restaurantId = ctx.tenantMembership?.restaurant.id;
  if (!restaurantId) return { orderNumber: null, error: 'No restaurant membership found.' };

  const parsed = OrderSchema.safeParse(input);
  if (!parsed.success) {
    return { orderNumber: null, error: parsed.error.issues[0]?.message ?? 'That order is not valid.' };
  }

  const supabase = createClient();

  // create_order() is keyed on the QR token. Resolving it here rather than in
  // the browser keeps table tokens off the wire, and scoping the lookup to the
  // caller's own restaurant stops a tampered table id reaching another tenant.
  const { data: table } = await supabase
    .from('tables')
    .select('qr_token')
    .eq('id', parsed.data.tableId)
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .maybeSingle()
    .returns<{ qr_token: string }>();

  if (!table) return { orderNumber: null, error: 'That table is not available.' };

  const lines: OrderLineInput[] = parsed.data.lines.map((line) => ({
    menu_item_id: line.menuItemId,
    quantity: line.quantity,
    special_instructions: line.note?.trim() || null,
  }));

  // Deliberately the same RPC a customer's QR order goes through, so the
  // resulting order is indistinguishable on the kitchen board — and so the
  // restaurant's name/mobile toggles are enforced in exactly one place.
  const { data: orderId, error } = await supabase.rpc('create_order', {
    p_qr_token: table.qr_token,
    p_lines: lines,
    p_customer_name: parsed.data.customerName || null,
    p_customer_mobile: parsed.data.customerMobile || null,
  });

  if (error || !orderId) {
    return { orderNumber: null, error: error?.message || 'Could not send that order to the kitchen.' };
  }

  const { data: created } = await supabase
    .from('orders')
    .select('order_number')
    .eq('id', orderId)
    .maybeSingle()
    .returns<{ order_number: number }>();

  return { orderNumber: created?.order_number ?? null, error: null };
}
