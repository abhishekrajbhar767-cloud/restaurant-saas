'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  defaultLoyaltyText,
  isLoyaltyRewardVisit,
  loyaltyBannerCopy,
  sessionFromCustomer,
  type LoyaltySession,
} from '@/lib/customer/loyalty';
import { XIcon } from '@/components/customer/icons';
import type { LoyaltySettings } from '@/types/database';

export function LoyaltySheet({
  open,
  onClose,
  restaurantId,
  session,
  onSession,
  loyalty,
}: {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  session: LoyaltySession | null;
  onSession: (session: LoyaltySession | null) => void;
  loyalty: LoyaltySettings;
}) {
  const [name, setName] = useState(session?.name ?? '');
  const [mobile, setMobile] = useState(session?.mobile_number ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(session?.name ?? '');
    setMobile(session?.mobile_number ?? '');
    setError(null);
  }, [open, session]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    if (name.trim() === '') {
      setError('Please enter your name.');
      return;
    }
    if (mobile.replace(/\D/g, '').length < 7) {
      setError('Please enter a valid mobile number.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('upsert_loyalty_customer', {
      p_restaurant_id: restaurantId,
      p_name: name.trim(),
      p_mobile: mobile.trim(),
    });

    setIsSubmitting(false);

    if (rpcError || !data) {
      setError(rpcError?.message || 'Could not save your Loyalty Pass. Try again.');
      return;
    }

    onSession(sessionFromCustomer(data));
    onClose();
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-surface-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:border-zinc-400';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <button type="button" aria-label="Close Loyalty Pass" onClick={onClose} className="absolute inset-0 bg-black/70" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="loyalty-title"
        className="relative w-full rounded-t-2xl bg-surface-800 text-white shadow-2xl ring-1 ring-white/10 sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 id="loyalty-title" className="font-display text-lg font-bold">
            Loyalty Pass
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {session ? (
            <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-zinc-100">
              Signed in as <span className="font-semibold">{session.name}</span>
              {isLoyaltyRewardVisit(session.visits_count, loyalty.visit_threshold)
                ? ` · your next order is ${loyalty.discount_percentage}% off`
                : ` · ${session.visits_count} visit${session.visits_count === 1 ? '' : 's'} so far`}
            </p>
          ) : (
            <p className="text-sm text-zinc-400">
              Join with your name and mobile. {loyaltyBannerCopy(loyalty) || defaultLoyaltyText(loyalty.visit_threshold, loyalty.discount_percentage)}{' '}
              We&apos;ll remember you on this phone.
            </p>
          )}

          <div>
            <label htmlFor="loyaltyName" className="text-xs font-medium text-zinc-400">
              Your name
            </label>
            <input
              id="loyaltyName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={80}
              placeholder="Name"
              className={`mt-1 ${inputClass}`}
            />
          </div>

          <div>
            <label htmlFor="loyaltyMobile" className="text-xs font-medium text-zinc-400">
              Mobile number
            </label>
            <input
              id="loyaltyMobile"
              type="tel"
              inputMode="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              autoComplete="tel"
              maxLength={20}
              placeholder="Mobile number"
              className={`mt-1 ${inputClass}`}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-brand-bright">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-brand py-3.5 font-display font-semibold text-white transition-colors hover:bg-brand-bright disabled:opacity-60"
          >
            {isSubmitting ? 'Saving…' : session ? 'Update pass' : 'Join now'}
          </button>

          {session && (
            <button
              type="button"
              onClick={() => {
                onSession(null);
                setName('');
                setMobile('');
                onClose();
              }}
              className="w-full text-center text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              Use a different number
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
