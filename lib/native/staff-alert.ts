export type StaffAlertType = 'KITCHEN_READY' | 'CALL_WAITER';

export type StaffAlertPayload = {
  type: StaffAlertType;
  title: string;
  body: string;
  tableNumber: string;
  restaurantId: string;
  orderId?: string;
  requestId?: string;
  requestType?: 'waiter' | 'water' | 'bill';
};

export const STAFF_ALERT_CHANNEL_ID = 'staff_alerts_alarm';

export function isStaffAlertType(value: string | undefined): value is StaffAlertType {
  return value === 'KITCHEN_READY' || value === 'CALL_WAITER';
}

export function parseStaffAlertData(data: Record<string, string | undefined>): StaffAlertPayload | null {
  const type = data.type;
  if (!isStaffAlertType(type)) return null;
  const tableNumber = data.tableNumber?.trim() || data.table_number?.trim();
  const restaurantId = data.restaurantId?.trim() || data.restaurant_id?.trim();
  if (!tableNumber || !restaurantId) return null;

  const requestType = data.requestType ?? data.request_type;
  const parsedRequestType =
    requestType === 'waiter' || requestType === 'water' || requestType === 'bill' ? requestType : undefined;

  return {
    type,
    title: data.title?.trim() || defaultStaffAlertTitle(type, tableNumber, parsedRequestType),
    body: data.body?.trim() || defaultStaffAlertBody(type, parsedRequestType),
    tableNumber,
    restaurantId,
    orderId: data.orderId ?? data.order_id,
    requestId: data.requestId ?? data.request_id,
    requestType: parsedRequestType,
  };
}

export function defaultStaffAlertTitle(
  type: StaffAlertType,
  tableNumber: string,
  requestType?: StaffAlertPayload['requestType']
): string {
  if (type === 'KITCHEN_READY') return `Table ${tableNumber} Order is Ready`;
  if (requestType === 'water') return `Table ${tableNumber} needs Water`;
  if (requestType === 'bill') return `Table ${tableNumber} wants the Bill`;
  return `Table ${tableNumber} needs a Waiter`;
}

export function defaultStaffAlertBody(type: StaffAlertType, requestType?: StaffAlertPayload['requestType']): string {
  if (type === 'KITCHEN_READY') return 'Pick up from the kitchen';
  if (requestType === 'water') return 'Guest asked for water';
  if (requestType === 'bill') return 'Guest asked for the bill';
  return 'Guest called for a waiter';
}
