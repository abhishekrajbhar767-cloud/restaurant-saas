'use client';

import { isLoyaltyRewardVisit, loyaltyBannerCopy, type LoyaltySession } from '@/lib/customer/loyalty';
import { GiftIcon } from '@/components/customer/icons';
import type { LoyaltySettings, PromotionalBanner } from '@/types/database';

export function BannerCarousel({
  banners,
  loyalty,
  loyaltySession,
  onLoyaltyClick,
}: {
  banners: PromotionalBanner[];
  loyalty: LoyaltySettings | null;
  loyaltySession: LoyaltySession | null;
  onLoyaltyClick: () => void;
}) {
  const activeBanners = banners.filter((banner) => banner.is_active);
  const loyaltyEnabled = Boolean(loyalty?.is_enabled);

  // Strict: no active offers and no Loyalty Pass means the carousel must
  // occupy exactly 0px — no wrapper, no margin, no reserved height.
  if (activeBanners.length === 0 && !loyaltyEnabled) return null;

  const threshold = loyalty?.visit_threshold ?? 5;
  const percent = loyalty?.discount_percentage ?? 10;
  const firstName = loyaltySession?.name.split(' ')[0] ?? '';

  let loyaltyHeadline = loyalty ? loyaltyBannerCopy(loyalty) : '';
  if (loyaltySession && loyalty) {
    if (isLoyaltyRewardVisit(loyaltySession.visits_count, threshold)) {
      loyaltyHeadline = `Tonight’s the one, ${firstName} — ${percent}% off this order.`;
    } else if (loyaltySession.visits_count >= threshold) {
      loyaltyHeadline = `Thanks for coming back, ${firstName}.`;
    } else {
      loyaltyHeadline = `${firstName} · visit ${loyaltySession.visits_count + 1} of ${threshold}`;
    }
  }

  return (
    <div className="mt-4">
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
        {loyaltyEnabled && loyalty && (
          <button
            type="button"
            onClick={onLoyaltyClick}
            className="relative h-36 w-[min(100%,20rem)] shrink-0 snap-start overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dim text-left shadow-lg shadow-black/40 ring-1 ring-white/10"
          >
            {loyalty.banner_image_url && (
              // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded storage URL
              <img src={loyalty.banner_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )}
            <div
              className={`absolute inset-0 ${
                loyalty.banner_image_url
                  ? 'bg-gradient-to-t from-black/80 via-black/35 to-black/10'
                  : 'bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_55%)]'
              }`}
              aria-hidden
            />
            <div className="relative flex h-full flex-col justify-between p-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
                <GiftIcon size={18} />
              </span>
              <div>
                <p className="font-display text-[15px] font-bold leading-snug text-white">{loyaltyHeadline}</p>
                <p className="mt-1 text-xs text-white/75">
                  {loyaltySession ? 'Tap to manage your Loyalty Pass' : 'Join now · takes 10 seconds'}
                </p>
              </div>
            </div>
          </button>
        )}

        {activeBanners.map((banner) => (
          <article
            key={banner.id}
            className="relative h-36 w-[min(100%,20rem)] shrink-0 snap-start overflow-hidden rounded-2xl bg-surface-800 shadow-lg shadow-black/40 ring-1 ring-white/10"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied URL can be any host */}
            <img src={banner.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" aria-hidden />
            <h3 className="absolute inset-x-0 bottom-0 p-4 font-display text-[15px] font-bold leading-snug text-white">
              {banner.title}
            </h3>
          </article>
        ))}
      </div>
    </div>
  );
}
