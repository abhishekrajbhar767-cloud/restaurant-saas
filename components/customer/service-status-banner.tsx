'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ServiceRequest, ServiceRequestType } from '@/types/database';

const PENDING_MESSAGE: Record<ServiceRequestType, string> = {
  waiter: 'A waiter has been notified — someone will be with you shortly.',
  water: 'Water request sent — on its way.',
  bill: 'Bill requested — bringing it over shortly.',
};

const CLAIMED_MESSAGE: Record<ServiceRequestType, string> = {
  waiter: 'Your waiter is on the way.',
  water: 'Your water is on the way.',
  bill: 'Your bill is on the way.',
};

export function ServiceStatusBanner({ tableId }: { tableId: string }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from('service_requests')
      .select('*')
      .eq('table_id', tableId)
      .in('status', ['pending', 'claimed'])
      .then(({ data }) => setRequests(data ?? []));

    const channel = supabase
      .channel(`table-requests-${tableId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_requests', filter: `table_id=eq.${tableId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as ServiceRequest;
            if (row.status === 'pending' || row.status === 'claimed') setRequests((prev) => [...prev, row]);
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as ServiceRequest;
            setRequests((prev) =>
              row.status === 'pending' || row.status === 'claimed' ? prev.map((r) => (r.id === row.id ? row : r)) : prev.filter((r) => r.id !== row.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableId]);

  if (requests.length === 0) return null;

  return (
    <div className="mb-2 space-y-1 border-b border-amber/30 bg-amber/15 px-4 py-2 sm:px-6">
      {requests.map((r) => (
        <p key={r.id} role="status" className="text-sm text-amber-bright">
          {r.status === 'claimed' ? CLAIMED_MESSAGE[r.type] : PENDING_MESSAGE[r.type]}
        </p>
      ))}
    </div>
  );
}
