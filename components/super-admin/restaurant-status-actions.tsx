'use client';

import { useTransition } from 'react';
import { setRestaurantStatus } from '@/app/super-admin/actions';
import type { RestaurantStatus } from '@/types/database';

export function RestaurantStatusActions({ restaurantId, status }: { restaurantId: string; status: RestaurantStatus }) {
  const [isPending, startTransition] = useTransition();

  function change(next: RestaurantStatus) {
    startTransition(() => setRestaurantStatus(restaurantId, next));
  }

  return (
    <div className="flex gap-2">
      {status !== 'active' && (
        <button onClick={() => change('active')} disabled={isPending} className="btn-secondary text-success border-success/40">
          Activate
        </button>
      )}
      {status === 'active' && (
        <button onClick={() => change('suspended')} disabled={isPending} className="btn-secondary text-danger border-danger/40">
          Suspend
        </button>
      )}
      {status !== 'archived' && (
        <button onClick={() => change('archived')} disabled={isPending} className="btn-secondary">
          Archive
        </button>
      )}
    </div>
  );
}
