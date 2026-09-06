'use client';

import { useState } from 'react';
import { SubscriptionBadge } from '@/components/super-admin/subscription-badge';
import { ResetPasswordModal } from '@/components/super-admin/reset-password-modal';
import { ExtendPlanModal } from '@/components/super-admin/extend-plan-modal';
import type { PlanType, Subscription } from '@/types/database';
import {
  expiryCaption,
  formatExpiresOn,
  planLabel,
  relevantExpiryAt,
  trackingStatus,
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
  const subscriptionExpiresAt = subscription?.subscription_expires_at ?? null;
  const expiry = relevantExpiryAt(planType, trialEndsAt, expiresAt, subscriptionExpiresAt);
  const tracking = trackingStatus(expiry);
  const caption = expiryCaption(expiry);

  return (
    <section className={`card p-5 ${tracking === 'expired' ? 'border-danger/40' : tracking === 'expiring_soon' ? 'border-amber/40' : 'border-success/30'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-amber mb-3">Subscription</h2>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-display font-medium">{planLabel(planType)}</span>
            <SubscriptionBadge status={tracking} />
          </div>
          <div
            className={`text-sm font-medium ${
              tracking === 'expired' ? 'text-danger' : tracking === 'expiring_soon' ? 'text-amber' : 'text-success'
            }`}
          >
            {formatExpiresOn(expiry)}
          </div>
          {caption && <div className="text-xs text-text-muted mt-1">{caption}</div>}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={() => setShowPlan(true)}>
            Manage Plan
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
          subscriptionExpiresAt={subscriptionExpiresAt}
          subscriptionStatus={subscription?.status ?? null}
          onClose={() => setShowPlan(false)}
        />
      )}
    </section>
  );
}
