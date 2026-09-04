'use client';

import { useState, useTransition } from 'react';
import { clearGeofence, saveGeofence } from '@/app/admin/settings/actions';
import { distanceMeters, formatDistance, getCurrentPosition } from '@/lib/shared/geolocation';
import type { Restaurant } from '@/types/database';

const RADIUS_PRESETS = [50, 100, 200, 500];

export function GeofenceSettings({ restaurant }: { restaurant: Restaurant }) {
  const [latitude, setLatitude] = useState(restaurant.latitude?.toString() ?? '');
  const [longitude, setLongitude] = useState(restaurant.longitude?.toString() ?? '');
  const [radius, setRadius] = useState(restaurant.geofence_radius_meters?.toString() ?? '100');

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [isPending, startTransition] = useTransition();

  const configured = restaurant.latitude !== null && restaurant.longitude !== null;
  const busy = isPending || locating;

  async function handleUseCurrentLocation() {
    setLocating(true);
    setError(null);
    setNotice(null);

    const result = await getCurrentPosition();
    setLocating(false);

    if ('error' in result) {
      setError(result.error);
      return;
    }

    setLatitude(result.coords.latitude.toFixed(6));
    setLongitude(result.coords.longitude.toFixed(6));

    // Accuracy matters here: a 500 m fix would make a 50 m fence meaningless,
    // so surface it rather than silently accepting a vague position.
    const accuracy = Math.round(result.coords.accuracy);
    const moved =
      configured && restaurant.latitude !== null && restaurant.longitude !== null
        ? distanceMeters(result.coords.latitude, result.coords.longitude, restaurant.latitude, restaurant.longitude)
        : null;

    setNotice(
      `Filled in from your device (accurate to about ${accuracy} m).` +
        (moved !== null ? ` That is ${formatDistance(moved)} from the saved location.` : '') +
        ' Review the values, then save.'
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const { error: saveError } = await saveGeofence(formData);
      if (saveError) {
        setError(saveError);
        return;
      }
      setNotice('Geofence saved. Staff must now be inside this radius to clock in.');
    });
  }

  function handleClear() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const { error: clearError } = await clearGeofence();
      if (clearError) {
        setError(clearError);
        return;
      }
      setLatitude('');
      setLongitude('');
      setNotice('Geofence removed. Staff can now clock in from anywhere.');
    });
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="font-display text-lg font-bold">Location &amp; Geofence</h2>
          <p className="text-xs text-text-muted">
            Staff can only clock in within this radius of the restaurant.
          </p>
        </div>
        <span className={`text-xs font-medium ${configured ? 'text-success' : 'text-text-muted'}`}>
          {configured ? 'Active' : 'Not set'}
        </span>
      </div>

      {!configured && (
        <p className="mt-3 rounded border border-line bg-ink-800/60 px-3 py-2 text-xs text-text-muted">
          No geofence is set, so clock-in is currently allowed from anywhere.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 rounded border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {notice}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <button type="button" onClick={handleUseCurrentLocation} disabled={busy} className="btn-secondary text-sm">
            {locating ? 'Reading location…' : 'Get current location'}
          </button>
          <p className="mt-1.5 text-xs text-text-muted">
            Stand inside the restaurant when you use this — it fills the fields from your device.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="latitude" className="field-label">
              Latitude
            </label>
            <input
              id="latitude"
              name="latitude"
              type="number"
              step="any"
              min="-90"
              max="90"
              required
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="19.076090"
              className="field-input font-mono"
            />
          </div>
          <div>
            <label htmlFor="longitude" className="field-label">
              Longitude
            </label>
            <input
              id="longitude"
              name="longitude"
              type="number"
              step="any"
              min="-180"
              max="180"
              required
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="72.877426"
              className="field-input font-mono"
            />
          </div>
        </div>

        <div>
          <label htmlFor="radiusMeters" className="field-label">
            Allowed radius (metres)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="radiusMeters"
              name="radiusMeters"
              type="number"
              min="1"
              step="1"
              required
              inputMode="numeric"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="field-input w-32 font-mono"
            />
            {RADIUS_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRadius(String(preset))}
                className={`rounded border px-2.5 py-1.5 text-xs transition-colors ${
                  radius === String(preset)
                    ? 'border-amber/50 bg-amber/15 text-amber'
                    : 'border-line text-text-muted hover:text-text'
                }`}
              >
                {preset} m
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-text-muted">
            Phone GPS is typically accurate to 10–50 m indoors. A radius under 50 m will lock out staff who are
            genuinely on site.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <button type="submit" disabled={busy} className="btn-primary text-sm">
            {isPending ? 'Saving…' : 'Save geofence'}
          </button>
          {configured && (
            <button type="button" onClick={handleClear} disabled={busy} className="btn-secondary text-sm">
              Remove geofence
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
