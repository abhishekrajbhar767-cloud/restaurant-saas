import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserContext } from '@/lib/auth/session';
import { dispatchStaffAlert } from '@/lib/push/dispatch';
import type { ServiceRequestType } from '@/types/database';

const BodySchema = z.object({
  kind: z.enum(['KITCHEN_READY', 'CALL_WAITER']),
  orderId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
  qrToken: z.string().uuid().optional(),
});

function hasDispatchSecret(request: NextRequest): boolean {
  const expected = process.env.STAFF_ALERTS_SECRET;
  if (!expected) return false;
  return request.headers.get('x-staff-alert-secret') === expected;
}

export async function POST(request: NextRequest) {
  try {
    return await handleDispatch(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dispatch failed.';
    console.warn('staff-alerts/dispatch', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleDispatch(request: NextRequest) {
  const json: unknown = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const body = parsed.data;
  const privileged = hasDispatchSecret(request);
  const ctx = privileged ? null : await getUserContext();
  const staffOk =
    privileged ||
    ctx?.isSuperAdmin ||
    (ctx?.tenantMembership?.role && ['kitchen', 'waiter', 'manager', 'owner'].includes(ctx.tenantMembership.role));

  if (body.kind === 'KITCHEN_READY') {
    if (!staffOk) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    if (!body.orderId) return NextResponse.json({ error: 'orderId is required.' }, { status: 400 });

    const supabase = createAdminClient();
    const { data: order } = await supabase
      .from('orders')
      .select('id, restaurant_id, table_id, status')
      .eq('id', body.orderId)
      .maybeSingle();

    if (!order || order.status !== 'ready') {
      return NextResponse.json({ error: 'Order is not ready.' }, { status: 409 });
    }
    if (ctx?.tenantMembership && order.restaurant_id !== ctx.tenantMembership.restaurant.id && !ctx.isSuperAdmin) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: table } = await supabase.from('tables').select('table_number').eq('id', order.table_id).maybeSingle();
    const result = await dispatchStaffAlert({
      type: 'KITCHEN_READY',
      restaurantId: order.restaurant_id,
      tableNumber: table?.table_number ?? '—',
      orderId: order.id,
    });
    return NextResponse.json(result);
  }

  if (!body.requestId) return NextResponse.json({ error: 'requestId is required.' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: requestRow } = await supabase
    .from('service_requests')
    .select('id, restaurant_id, table_id, type, status')
    .eq('id', body.requestId)
    .maybeSingle();

  if (!requestRow || requestRow.status !== 'pending') {
    return NextResponse.json({ error: 'Request is not pending.' }, { status: 409 });
  }

  if (!privileged && !staffOk) {
    if (!body.qrToken) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const { data: table } = await supabase
      .from('tables')
      .select('id, qr_token')
      .eq('id', requestRow.table_id)
      .maybeSingle();
    if (!table || table.qr_token !== body.qrToken) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
  } else if (ctx?.tenantMembership && requestRow.restaurant_id !== ctx.tenantMembership.restaurant.id && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { data: table } = await supabase.from('tables').select('table_number').eq('id', requestRow.table_id).maybeSingle();
  const result = await dispatchStaffAlert({
    type: 'CALL_WAITER',
    restaurantId: requestRow.restaurant_id,
    tableNumber: table?.table_number ?? '—',
    requestId: requestRow.id,
    requestType: requestRow.type as ServiceRequestType,
  });
  return NextResponse.json(result);
}
