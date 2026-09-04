'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cartTotal, clearCart, type CartLine } from '@/lib/customer/cart';

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
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const submittedRef = useRef(false); // synchronous guard — blocks a double-tap before React state even updates

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

    const supabase = createClient();
    const { data: orderId, error: rpcError } = await supabase.rpc('create_order', {
      p_qr_token: tableQrToken,
      p_lines: cart.map((line) => ({
        menu_item_id: line.menuItemId,
        quantity: line.quantity,
        special_instructions: line.specialInstructions || null,
      })),
      p_customer_name: askName ? name.trim() : null,
      p_customer_mobile: askMobile ? mobile.trim() : null,
    });

    if (rpcError || !orderId) {
      submittedRef.current = false;
      setIsSubmitting(false);
      setError(friendlyOrderError(rpcError?.message ?? ''));
      return;
    }

    clearCart(tableId);
    router.push(`/menu/${restaurantSlug}/order/${orderId}?table=${tableQrToken}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <button aria-label="Close cart" onClick={onClose} className="absolute inset-0 bg-ink-950/50" />

      <div className="relative w-full sm:max-w-md bg-paper text-text-onPaper rounded-t-lg sm:rounded-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-950/10">
          <h2 className="font-display text-lg font-bold">Your order</h2>
          <button onClick={onClose} aria-label="Close" className="text-text-onPaper/50 hover:text-text-onPaper text-xl leading-none">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {cart.length === 0 ? (
            <p className="text-sm text-text-onPaper/60 py-8 text-center">Your cart is empty.</p>
          ) : (
            <div className="space-y-4">
              {cart.map((line) => (
                <div key={line.menuItemId} className="border-b border-ink-950/10 last:border-0 pb-4 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-display font-medium">{line.name}</span>
                    <span className="font-mono text-sm">{currency} {(line.price * line.quantity).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onUpdateQuantity(line.menuItemId, line.quantity - 1)}
                        aria-label={`Remove one ${line.name}`}
                        className="h-7 w-7 rounded-full border border-ink-950/20 flex items-center justify-center hover:bg-ink-950/5"
                      >
                        −
                      </button>
                      <span className="font-mono w-6 text-center">{line.quantity}</span>
                      <button
                        onClick={() => onUpdateQuantity(line.menuItemId, line.quantity + 1)}
                        aria-label={`Add one more ${line.name}`}
                        className="h-7 w-7 rounded-full border border-ink-950/20 flex items-center justify-center hover:bg-ink-950/5"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    value={line.specialInstructions}
                    onChange={(e) => onUpdateInstructions(line.menuItemId, e.target.value)}
                    placeholder="Special instructions (e.g. less spicy, no onion)"
                    className="mt-2 w-full text-sm rounded border border-ink-950/15 bg-white/60 px-2.5 py-1.5 placeholder:text-text-onPaper/40"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-ink-950/10 px-5 py-4 space-y-3">
            {(askName || askMobile) && (
              <div className="space-y-2">
                {askName && (
                  <div>
                    <label htmlFor="customerName" className="text-xs font-medium text-text-onPaper/60">
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
                      className="mt-1 w-full rounded border border-ink-950/15 bg-white/60 px-2.5 py-2 text-sm placeholder:text-text-onPaper/40"
                    />
                  </div>
                )}
                {askMobile && (
                  <div>
                    <label htmlFor="customerMobile" className="text-xs font-medium text-text-onPaper/60">
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
                      className="mt-1 w-full rounded border border-ink-950/15 bg-white/60 px-2.5 py-2 text-sm placeholder:text-text-onPaper/40"
                    />
                  </div>
                )}
              </div>
            )}

            {needsSeating && (
              <p className="rounded border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-text-onPaper/70">
                This restaurant takes orders from seated tables only. If nobody has seated you yet, please call a staff
                member first.
              </p>
            )}

            <div className="flex items-center justify-between font-display font-bold">
              <span>Total</span>
              <span className="font-mono">{currency} {cartTotal(cart).toLocaleString('en-IN')}</span>
            </div>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <button
              onClick={handlePlaceOrder}
              disabled={isSubmitting}
              className="w-full rounded bg-ink-950 text-paper font-display font-medium py-3 hover:bg-ink-800 disabled:opacity-60 transition-colors"
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
