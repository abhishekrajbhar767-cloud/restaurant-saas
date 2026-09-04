'use client';

import { useEffect, useState } from 'react';
import { ClockIcon, MapPinIcon, PercentIcon, StarIcon } from '@/components/customer/icons';
import type { Restaurant, RestaurantTable } from '@/types/database';

export type RestaurantRating = { average: number; count: number };

export function MenuHeader({
  restaurant,
  table,
  rating,
  prepRange,
  tagline,
}: {
  restaurant: Restaurant;
  table: RestaurantTable;
  rating: RestaurantRating | null;
  /** [min, max] prep time in minutes across available items, or null when the menu is empty. */
  prepRange: [number, number] | null;
  /** Cuisine-style line under the name (e.g. the menu's top categories). */
  tagline: string;
}) {
  const distanceKm = useDistanceToRestaurant(restaurant.latitude, restaurant.longitude);

  return (
    <header className="px-4 pt-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {restaurant.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- owner-supplied URL can be any host; next/image would crash on unconfigured hostnames
            <img
              src={restaurant.logo_url}
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 rounded-xl border border-white/10 object-cover"
            />
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl">
              {restaurant.name}
            </h1>
            <p className="mt-0.5 truncate text-xs text-zinc-500">{tagline}</p>
          </div>
        </div>

        <RatingBadge rating={rating} />
      </div>

      <dl className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-zinc-300">
        <div className="flex items-center gap-1.5">
          <MapPinIcon size={15} className="text-zinc-400" />
          <dt className="sr-only">Location</dt>
          <dd>{distanceKm !== null ? `${formatDistance(distanceKm)} · Table ${table.table_number}` : `Dine-in · Table ${table.table_number}`}</dd>
        </div>
        {prepRange && (
          <>
            <span aria-hidden className="h-1 w-1 rounded-full bg-zinc-600" />
            <div className="flex items-center gap-1.5">
              <ClockIcon size={15} className="text-zinc-400" />
              <dt className="sr-only">Preparation time</dt>
              <dd>{formatPrepRange(prepRange)}</dd>
            </div>
          </>
        )}
      </dl>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-gradient-to-r from-surface-800 to-surface-900 px-3.5 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand-bright">
          <PercentIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">Dine-in exclusive · No delivery charges</p>
          <p className="truncate text-xs text-zinc-400">Order from your table, track it live, call a waiter anytime</p>
        </div>
      </div>
    </header>
  );
}

function RatingBadge({ rating }: { rating: RestaurantRating | null }) {
  const hasRating = rating !== null && rating.count > 0;
  return (
    <div className="flex shrink-0 flex-col items-center">
      <div
        className="flex items-center gap-1 rounded-lg bg-rating px-2 py-1 font-display text-sm font-bold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
        aria-label={hasRating ? `Rated ${rating.average.toFixed(1)} out of 5` : 'Newly listed'}
      >
        <span>{hasRating ? rating.average.toFixed(1) : 'New'}</span>
        <StarIcon size={13} />
      </div>
      <span className="mt-1 text-[11px] leading-none text-zinc-400">
        {hasRating ? `${formatCount(rating.count)} review${rating.count === 1 ? '' : 's'}` : 'No reviews yet'}
      </span>
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

function formatPrepRange([min, max]: [number, number]): string {
  if (min === max) return `${min} mins`;
  return `${min}–${max} mins`;
}

function formatDistance(km: number): string {
  if (km < 0.1) return 'You\u2019re here';
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

// Only reads position when the browser already granted geolocation (the app
// asks for it elsewhere for geofenced ordering) — the menu must never be the
// thing that pops a permission prompt.
function useDistanceToRestaurant(lat: number | null, lng: number | null): number | null {
  const [distance, setDistance] = useState<number | null>(null);

  useEffect(() => {
    if (lat === null || lng === null) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions?.query) return;

    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled || status.state !== 'granted') return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!cancelled) setDistance(haversineKm(pos.coords.latitude, pos.coords.longitude, lat, lng));
          },
          () => undefined,
          { maximumAge: 5 * 60_000, timeout: 5000 }
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return distance;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
