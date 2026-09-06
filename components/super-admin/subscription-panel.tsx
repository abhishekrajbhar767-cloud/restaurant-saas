'use client';

import { useState } from 'react';
import { SubscriptionBadge } from '@/components/super-admin/subscription-badge';
import { ResetPasswordModal } from '@/components/super-admin/reset-password-modal';
import { ExtendPlanModal } from '@/components/super-admin/extend-plan-modal';
import type { PlanType, Subscription } from '@/types/database';
import {
  effectiveSubscriptionStatus,
  expiryCaption,
  expiryUrgency,
  formatExpiry,
  planLabel,
  relevantExpiryAt,
} from '@/lib/super-admin/subscription';

export function SubscriptionPanel({
  restaurantId,
  restaurantName,
  ownerEmail,
  hasOwner,
  subscription,
}: {
  restaurantId: string;
  restaurantName: string;
  ownerEmail: string | null;
  hasOwner: boolean;
  subscription: Subscription | null;
}) {
  const [showReset, setShowReset] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

  const planType: PlanType | null = subscription?.plan_type ?? null;
  const trialEndsAt = subscription?.trial_ends_at ?? null;
  const expiresAt = subscription?.expires_at ?? null;
  const status = effectiveSubscriptionStatus(planType, trialEndsAt, expiresAt);
  const expiry = relevantExpiryAt(planType, trialEndsAt, expiresAt);
  const urgency = expiryUrgency(expiry);
  const caption = expiryCaption(expiry);

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-amber mb-3">Subscription</h2>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-display font-medium">{planLabel(planType)}</span>
            <SubscriptionBadge status={status} />
          </div>
          <div className="text-sm text-text-muted">
            Trial ends {formatExpiry(trialEndsAt)} · Paid until {formatExpiry(expiresAt)}
          </div>
          {caption && (
            <div className={`text-xs mt-1 ${urgency === 'expired' ? 'text-danger' : urgency === 'soon' ? 'text-amber' : 'text-text-muted'}`}>
              {caption}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={() => setShowPlan(true)}>
            Extend plan
          </button>
          <button type="button" className="btn-secondary text-sm" onClick={() => setShowReset(true)} disabled={!hasOwner}>
            Reset password
          </button>
        </div>
      </div>

      {showReset && (
        <ResetPasswordModal
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          ownerEmail={ownerEmail}
          onClose={() => setShowReset(false)}
        />
      )}
      {showPlan && (
        <ExtendPlanModal
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          planType={planType}
          trialEndsAt={trialEndsAt}
          expiresAt={expiresAt}
          subscriptionStatus={status}
          onClose={() => setShowPlan(false)}
        />
      )}
    </section>
  );
}
