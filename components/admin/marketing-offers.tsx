'use client';

import { useState } from 'react';
import {
  createPromotionalBanner,
  setLoyaltyPassEnabled,
  setPromotionalBannerActive,
} from '@/lib/manager/actions';
import type { PromotionalBanner } from '@/types/database';

export function MarketingOffers({
  restaurantId,
  loyaltyEnabled,
  initialBanners,
}: {
  restaurantId: string;
  loyaltyEnabled: boolean;
  initialBanners: PromotionalBanner[];
}) {
  const [loyaltyOn, setLoyaltyOn] = useState(loyaltyEnabled);
  const [loyaltyPending, setLoyaltyPending] = useState(false);
  const [banners, setBanners] = useState(initialBanners);
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [pendingBannerId, setPendingBannerId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoyaltyToggle() {
    if (loyaltyPending) return;
    const next = !loyaltyOn;
    setError(null);
    setLoyaltyPending(true);
    setLoyaltyOn(next);

    const { error: writeError } = await setLoyaltyPassEnabled(restaurantId, next);
    setLoyaltyPending(false);
    if (writeError) {
      setLoyaltyOn(!next);
      setError(writeError);
    }
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (adding) return;

    setError(null);
    setAdding(true);
    const { banner, error: writeError } = await createPromotionalBanner(restaurantId, { title, imageUrl });
    setAdding(false);

    if (writeError || !banner) {
      setError(writeError ?? 'Could not add that banner.');
      return;
    }

    setBanners((prev) => [banner, ...prev]);
    setTitle('');
    setImageUrl('');
  }

  async function handleToggleBanner(banner: PromotionalBanner) {
    if (pendingBannerId) return;
    const next = !banner.is_active;
    setError(null);
    setPendingBannerId(banner.id);
    setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, is_active: next } : b)));

    const { error: writeError } = await setPromotionalBannerActive(banner.id, next);
    setPendingBannerId(null);
    if (writeError) {
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, is_active: banner.is_active } : b)));
      setError(writeError);
    }
  }

  const activeCount = banners.filter((b) => b.is_active).length;

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="font-display text-lg font-bold">Marketing / Offers</h2>
          <p className="text-xs text-text-muted">
            Banners land on the customer menu. Loyalty Pass is a 10% reward on a guest&apos;s 5th visit.
          </p>
        </div>
        <span className={`text-xs font-medium ${activeCount > 0 || loyaltyOn ? 'text-success' : 'text-text-muted'}`}>
          {activeCount} live banner{activeCount === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div
        className={`mt-4 flex items-start gap-4 rounded-lg border border-line bg-ink-800/50 px-3.5 py-3 ${
          loyaltyPending ? 'opacity-60' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Loyalty Pass</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Shows &ldquo;Unlock 10% OFF on your 5th visit&rdquo; on the menu and applies the discount automatically.
          </p>
        </div>
        <span className={`mt-0.5 shrink-0 text-[10px] font-medium uppercase tracking-wide ${loyaltyOn ? 'text-success' : 'text-text-muted'}`}>
          {loyaltyOn ? 'On' : 'Off'}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={loyaltyOn}
          aria-label="Loyalty Pass"
          disabled={loyaltyPending}
          onClick={() => void handleLoyaltyToggle()}
          className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:pointer-events-none ${
            loyaltyOn ? 'border-success/60 bg-success/70' : 'border-line bg-ink-700'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-paper transition-transform ${
              loyaltyOn ? 'translate-x-6' : 'translate-x-1'
            }`}
            aria-hidden
          />
        </button>
      </div>

      <form onSubmit={handleAdd} className="mt-4 space-y-3 border-t border-line pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">New banner</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="bannerTitle" className="field-label">
              Title
            </label>
            <input
              id="bannerTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekend thali · 20% off"
              maxLength={80}
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="bannerImageUrl" className="field-label">
              Image URL
            </label>
            <input
              id="bannerImageUrl"
              type="url"
              inputMode="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              className="field-input"
            />
          </div>
        </div>
        <button type="submit" disabled={adding} className="btn-primary text-sm">
          {adding ? 'Adding…' : 'Add banner'}
        </button>
      </form>

      {banners.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {banners.map((banner) => {
            const busy = pendingBannerId === banner.id;
            return (
              <li key={banner.id} className={`flex items-center gap-3 py-3 ${busy ? 'opacity-60' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied URL can be any host */}
                <img
                  src={banner.image_url}
                  alt=""
                  width={56}
                  height={36}
                  className="h-9 w-14 shrink-0 rounded object-cover ring-1 ring-line"
                />
                <p className="min-w-0 flex-1 truncate text-sm">{banner.title}</p>
                <span
                  className={`shrink-0 text-[10px] font-medium uppercase tracking-wide ${
                    banner.is_active ? 'text-success' : 'text-text-muted'
                  }`}
                >
                  {banner.is_active ? 'On' : 'Off'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={banner.is_active}
                  aria-label={`${banner.is_active ? 'Hide' : 'Show'} ${banner.title}`}
                  disabled={pendingBannerId !== null}
                  onClick={() => void handleToggleBanner(banner)}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:pointer-events-none ${
                    banner.is_active ? 'border-success/60 bg-success/70' : 'border-line bg-ink-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-paper transition-transform ${
                      banner.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
