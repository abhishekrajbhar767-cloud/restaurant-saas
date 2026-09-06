'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cartPayable, cartTotal, clearCart, loyaltyDiscountAmount, type CartLine } from '@/lib/customer/cart';
import { isLoyaltyRewardVisit, type LoyaltySession } from '@/lib/customer/loyalty';
import { MinusIcon, PlusIcon, XIcon } from '@/components/customer/icons';
import type { LoyaltySettings } from '@/types/database';

export function CartSheet({
  open,
  onClose,
  cart,
  onUpdateQuantity,
  onUpdateInstructions,
  restaurantSlug,
  tableQrToken,
  tableId,
  currency,
  askName,
  askMobile,
  needsSeating,
  loyaltyEnabled = false,
  loyaltySession = null,
  loyaltySettings = null,
  onLoyaltyVisits,
}: {
  open: boolean;
  onClose: () => void;
  cart: CartLine[];
  onUpdateQuantity: (menuItemId: string, quantity: number) => void;
  onUpdateInstructions: (menuItemId: string, instructions: string) => void;
  restaurantSlug: string;
  tableQrToken: string;
  tableId: string;
  currency: string;
  askName: boolean;
  askMobile: boolean;
  needsSeating: boolean;
  loyaltyEnabled?: boolean;
  loyaltySession?: LoyaltySession | null;
  loyaltySettings?: LoyaltySettings | null;
  onLoyaltyVisits?: (visitsCount: number) => void;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(loyaltySession?.name ?? '');
  const [mobile, setMobile] = useState(loyaltySession?.mobile_number ?? '');
  const submittedRef = useRef(false); // synchronous guard — blocks a double-tap before React state even updates

  useEffect(() => {
    if (!loyaltySession) return;
    setName((prev) => prev || loyaltySession.name);
    setMobile((prev) => prev || loyaltySession.mobile_number);
  }, [loyaltySession]);

  const subtotal = cartTotal(cart);
  const visitThreshold = loyaltySettings?.visit_threshold ?? 5;
  const discountPercent = loyaltySettings?.discount_percentage ?? 10;
  const loyaltyReward = loyaltyEnabled && isLoyaltyRewardVisit(loyaltySession?.visits_count, visitThreshold);
  const discount = loyaltyDiscountAmount(subtotal, loyaltyReward, discountPercent);
  const payable = cartPayable(cart, discount);

  if (!open) return null;

  async function handlePlaceOrder() {
    if (submittedRef.current) return;

    if (askName && name.trim() === '') {
      setError('Please enter your name.');
      return;
    }
    if (askMobile && digitsIn(mobile) < 7) {
      setError('Please enter a valid mobile number.');
      return;
    }

    submittedRef.current = true;
    setIsSubmitting(true);
    setError(null);

    const orderName = (askName ? name.trim() : null) || loyaltySession?.name || null;
    const orderMobile = loyaltySession?.mobile_number || (askMobile ? mobile.trim() : null) || null;

    const supabase = createClient();
    const { data: orderId, error: rpcError } = await supabase.rpc('create_order', {
      p_qr_token: tableQrToken,
      p_lines: cart.map((line) => ({
        menu_item_id: line.menuItemId,
        quantity: line.quantity,
        special_instructions: line.specialInstructions || null,
      })),
      p_customer_name: orderName,
      p_customer_mobile: orderMobile,
    });

    if (rpcError || !orderId) {
      submittedRef.current = false;
      setIsSubmitting(false);
      setError(friendlyOrderError(rpcError?.message ?? ''));
      return;
    }

    if (loyaltyEnabled && loyaltySession) {
      const { data: visits } = await supabase.rpc('increment_loyalty_visit', {
        p_order_id: orderId,
        p_mobile: loyaltySession.mobile_number,
      });
      if (typeof visits === 'number') onLoyaltyVisits?.(visits);
    }

    clearCart(tableId);
    router.push(`/menu/${restaurantSlug}/order/${orderId}?table=${tableQrToken}`);
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-surface-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:border-zinc-400';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <button aria-label="Close cart" onClick={onClose} className="absolute inset-0 bg-black/70" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        className="relative flex max-h-[88vh] w-full flex-col rounded-t-2xl bg-surface-800 text-white shadow-2xl ring-1 ring-white/10 sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 id="cart-title" className="font-display text-lg font-bold">
            Your order
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {cart.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Your cart is empty.</p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {cart.map((line) => (
                <div key={line.menuItemId} className="flex gap-3 py-4">
                  {line.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- image URL may be any host; next/image would crash on unconfigured hostnames
                    <img src={line.imageUrl} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-white/[0.06]" />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-xl bg-surface-700" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-display text-[15px] font-semibold leading-snug">{line.name}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {currency} {(line.price * line.quantity).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="flex h-8 items-stretch overflow-hidden rounded-lg border border-brand/60 bg-brand/10 text-brand-bright" role="group" aria-label={`${line.name} quantity`}>
                        <button
                          onClick={() => onUpdateQuantity(line.menuItemId, line.quantity - 1)}
                          aria-label={`Remove one ${line.name}`}
                          className="flex w-8 items-center justify-center hover:bg-brand/20"
                        >
                          <MinusIcon size={14} />
                        </button>
                        <span className="flex w-7 items-center justify-center text-sm font-bold tabular-nums text-white">{line.quantity}</span>
                        <button
                          onClick={() => onUpdateQuantity(line.menuItemId, line.quantity + 1)}
                          aria-label={`Add one more ${line.name}`}
                          className="flex w-8 items-center justify-center hover:bg-brand/20"
                        >
                          <PlusIcon size={14} />
                        </button>
                      </div>
                      <span className="text-xs text-zinc-500">
                        {currency} {line.price.toLocaleString('en-IN')} each
                      </span>
                    </div>
                    <input
                      value={line.specialInstructions}
                      onChange={(e) => onUpdateInstructions(line.menuItemId, e.target.value)}
                      placeholder="Add a cooking request (e.g. less spicy, no onion)"
                      aria-label={`Special instructions for ${line.name}`}
                      className={`mt-2.5 ${inputClass}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="space-y-3 border-t border-white/[0.08] px-5 py-4">
            {(askName || askMobile) && (
              <div className="space-y-2">
                {askName && (
                  <div>
                    <label htmlFor="customerName" className="text-xs font-medium text-zinc-400">
                      Your name
                    </label>
                    <input
                      id="customerName"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      maxLength={80}
                      placeholder="Name"
                      className={`mt-1 ${inputClass}`}
                    />
                  </div>
                )}
                {askMobile && (
                  <div>
                    <label htmlFor="customerMobile" className="text-xs font-medium text-zinc-400">
                      Mobile number
                    </label>
                    <input
                      id="customerMobile"
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
                )}
              </div>
            )}

            {needsSeating && (
              <p className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-zinc-200">
                This restaurant takes orders from seated tables only. If nobody has seated you yet, please call a staff
                member first.
              </p>
            )}

            {loyaltyReward && (
              <p
                role="status"
                className="rounded-lg border border-success/40 bg-success/15 px-3 py-2 text-sm font-medium text-zinc-100"
              >
                🎉 Loyalty Reward: {discountPercent}% Discount Applied!
              </p>
            )}

            {loyaltyReward && (
              <div className="flex items-center justify-between text-sm text-zinc-400">
                <span>Subtotal</span>
                <span className="tabular-nums">
                  {currency} {subtotal.toLocaleString('en-IN')}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between font-display text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">
                {currency} {payable.toLocaleString('en-IN')}
              </span>
            </div>
            {error && (
              <p role="alert" className="text-sm text-brand-bright">
                {error}
              </p>
            )}
            <button
              onClick={handlePlaceOrder}
              disabled={isSubmitting}
              className="w-full rounded-xl bg-brand py-3.5 font-display font-semibold text-white transition-colors hover:bg-brand-bright disabled:opacity-60"
            >
              {isSubmitting ? 'Placing order…' : 'Place order'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function digitsIn(value: string): number {
  return value.replace(/\D/g, '').length;
}

// create_order raises tagged messages so the customer sees something they can
// act on instead of a Postgres error.
function friendlyOrderError(message: string): string {
  if (message.includes('TABLE_NOT_SEATED')) {
    return 'Please ask a staff member to seat you before ordering.';
  }
  if (message.includes('CUSTOMER_NAME_REQUIRED')) return 'Please enter your name.';
  if (message.includes('CUSTOMER_MOBILE_REQUIRED')) return 'Please enter a valid mobile number.';
  if (message.includes('unavailable')) return message;
  return 'Could not place your order. Please try again.';
}
