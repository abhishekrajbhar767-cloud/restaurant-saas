import { createAdminClient } from '@/lib/supabase/admin';
import { sendStaffPush } from '@/lib/push/fcm';
import {
  defaultStaffAlertBody,
  defaultStaffAlertTitle,
  type StaffAlertPayload,
  type StaffAlertType,
} from '@/lib/native/staff-alert';

type DispatchInput = {
  type: StaffAlertType;
  restaurantId: string;
  tableNumber: string;
  orderId?: string;
  requestId?: string;
  requestType?: StaffAlertPayload['requestType'];
};

function isFloorRole(role: string): boolean {
  return role === 'waiter' || role === 'manager' || role === 'owner';
}

export async function dispatchStaffAlert(input: DispatchInput): Promise<{ sent: number; error: string | null }> {
  const title = defaultStaffAlertTitle(input.type, input.tableNumber, input.requestType);
  const body = defaultStaffAlertBody(input.type, input.requestType);

  const data: Record<string, string> = {
    type: input.type,
    title,
    body,
    tableNumber: input.tableNumber,
    restaurantId: input.restaurantId,
  };
  if (input.orderId) data.orderId = input.orderId;
  if (input.requestId) data.requestId = input.requestId;
  if (input.requestType) data.requestType = input.requestType;

  try {
    const supabase = createAdminClient();
    const { data: tokenRows, error: tokenError } = await supabase
      .from('staff_push_tokens')
      .select('token, member_id')
      .eq('restaurant_id', input.restaurantId);

    if (tokenError) return { sent: 0, error: tokenError.message };
    if (!tokenRows?.length) return { sent: 0, error: null };

    const memberIds = [...new Set(tokenRows.map((row) => row.member_id))];
    const { data: members, error: memberError } = await supabase
      .from('restaurant_members')
      .select('id, role, is_active')
      .in('id', memberIds);

    if (memberError) return { sent: 0, error: memberError.message };

    const floorMemberIds = new Set(
      (members ?? []).filter((member) => member.is_active && isFloorRole(member.role)).map((member) => member.id)
    );
    const floorTokens = tokenRows.filter((row) => floorMemberIds.has(row.member_id)).map((row) => row.token);

    if (floorTokens.length === 0) return { sent: 0, error: null };

    const sent = await sendStaffPush(floorTokens, data);
    return { sent, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to dispatch staff alert';
    console.warn('dispatchStaffAlert', message);
    return { sent: 0, error: message };
  }
}
