'use client';

import { useEffect, useState } from 'react';
import { IncomingAlertModal } from '@/components/waiter/incoming-alert-modal';
import {
  handleStaffAlert,
  initNotificationService,
  stopStaffRingtone,
  subscribeStaffAlerts,
} from '@/lib/native/NotificationService';
import { defaultStaffAlertBody, defaultStaffAlertTitle, type StaffAlertPayload } from '@/lib/native/staff-alert';
import type { Order, ServiceRequest, WaiterAvailability } from '@/types/database';

export function StaffAlertsHost({
  restaurantId,
  availability,
  onAcceptRequest,
}: {
  restaurantId: string;
  availability: WaiterAvailability;
  onAcceptRequest?: (requestId: string) => Promise<void>;
}) {
  const [alert, setAlert] = useState<StaffAlertPayload | null>(null);

  useEffect(() => {
    void initNotificationService();
    return subscribeStaffAlerts((next) => {
      if (next.restaurantId !== restaurantId) return;
      if (next.type === 'CALL_WAITER' && availability !== 'free') return;
      setAlert(next);
    });
  }, [restaurantId, availability]);

  async function handleAccept() {
    const current = alert;
    setAlert(null);
    await stopStaffRingtone();
    if (current?.type === 'CALL_WAITER' && current.requestId && onAcceptRequest) {
      await onAcceptRequest(current.requestId);
    }
  }

  return alert ? <IncomingAlertModal alert={alert} onAccept={() => void handleAccept()} /> : null;
}

export function staffAlertFromServiceRequest(request: ServiceRequest, tableNumber: string): StaffAlertPayload {
  return {
    type: 'CALL_WAITER',
    title: defaultStaffAlertTitle('CALL_WAITER', tableNumber, request.type),
    body: defaultStaffAlertBody('CALL_WAITER', request.type),
    tableNumber,
    restaurantId: request.restaurant_id,
    requestId: request.id,
    requestType: request.type,
  };
}

export function staffAlertFromReadyOrder(order: Order, tableNumber: string): StaffAlertPayload {
  return {
    type: 'KITCHEN_READY',
    title: defaultStaffAlertTitle('KITCHEN_READY', tableNumber),
    body: defaultStaffAlertBody('KITCHEN_READY'),
    tableNumber,
    restaurantId: order.restaurant_id,
    orderId: order.id,
  };
}

export { handleStaffAlert };
