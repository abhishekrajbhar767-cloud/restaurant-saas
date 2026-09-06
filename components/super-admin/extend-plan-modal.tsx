'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updateRestaurantPlan, type SuperAdminActionState } from '@/app/super-admin/actions';
import { Modal } from '@/components/super-admin/modal';
import type { PlanType, SubscriptionStatus } from '@/types/database';
import { formatExpiry, planLabel } from '@/lib/super-admin/subscription';

const PRESETS = [7, 15, 30, 90] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Saving…' : 'Save plan'}
    </button>
  );
}

export function ExtendPlanModal({
  restaurantId,
  restaurantName,
  planType,
  trialEndsAt,
  expiresAt,
  subscriptionStatus,
  onClose,
}: {
  restaurantId: string;
  restaurantName: string;
  planType: PlanType | null;
  trialEndsAt: string | null;
  expiresAt: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState<SuperAdminActionState, FormData>(updateRestaurantPlan, {});
  const [plan, setPlan] = useState<PlanType>(planType ?? 'trial');
  const [days, setDays] = useState('15');

  return (
    <Modal title="Assign or extend plan" onClose={onClose}>
      <p className="text-sm text-text-muted mb-4">
        Update billing for <span className="text-text font-medium">{restaurantName}</span>. Adding days extends from
        today or the current end date, whichever is later.
      </p>
      <dl className="text-xs text-text-muted grid grid-cols-2 gap-2 mb-4">
        <div>
          <dt className="uppercase tracking-wide">Current plan</dt>
          <dd className="text-text mt-0.5">{planLabel(planType)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Status</dt>
          <dd className="text-text mt-0.5 capitalize">{subscriptionStatus ?? '—'}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Trial ends</dt>
          <dd className="text-text mt-0.5">{formatExpiry(trialEndsAt)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Subscription ends</dt>
          <dd className="text-text mt-0.5">{formatExpiry(expiresAt)}</dd>
        </div>
      </dl>

      {state.success ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-success bg-success/10 border border-success/30 rounded px-3 py-2">
            {state.success}
          </p>
          <button type="button" className="btn-secondary w-full" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="restaurantId" value={restaurantId} />

          <div>
            <label htmlFor="planType" className="field-label">
              Plan type
            </label>
            <select
              id="planType"
              name="planType"
              className="field-input"
              value={plan}
              onChange={(e) => setPlan(e.target.value as PlanType)}
            >
              <option value="trial">Trial</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>

          <div>
            <span className="field-label">Add days</span>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDays(String(preset))}
                  className={`rounded border px-3 py-1.5 text-xs font-display ${
                    days === String(preset) ? 'border-amber bg-amber/10 text-amber' : 'border-line text-text-muted hover:text-text'
                  }`}
                >
                  {preset} days
                </button>
              ))}
            </div>
            <input
              id="days"
              name="days"
              type="number"
              min={1}
              max={3650}
              className="field-input"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="15"
            />
          </div>

          <div>
            <label htmlFor="exactAt" className="field-label">
              Or set an exact date (optional)
            </label>
            <input id="exactAt" name="exactAt" type="datetime-local" className="field-input" />
            <p className="text-xs text-text-muted mt-1">If set, this overrides the day count.</p>
          </div>

          {state.error && (
            <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
              {state.error}
            </p>
          )}
          <SubmitButton />
        </form>
      )}
    </Modal>
  );
}
