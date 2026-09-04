// lib/shared/geolocation.ts
//
// Browser geolocation, wrapped so callers get a plain result instead of the
// callback API plus a PositionError enum. Every failure here is something a
// staff member can act on, so each one gets its own sentence.

export type Coords = { latitude: number; longitude: number; accuracy: number };

export type GeolocationResult = { coords: Coords } | { error: string };

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  // A fix from the last half minute is fine and avoids a cold GPS wait.
  maximumAge: 30_000,
};

export function getCurrentPosition(options: PositionOptions = DEFAULT_OPTIONS): Promise<GeolocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ error: 'This device or browser cannot report location.' });
  }

  // Chrome and Safari both refuse geolocation outside a secure context, and
  // the resulting error is otherwise indistinguishable from a denial.
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return Promise.resolve({ error: 'Location needs a secure (https) connection.' });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
        }),
      (error) => resolve({ error: describeError(error) }),
      options
    );
  });
}

function describeError(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied. Enable it for this site and try again.';
    case error.POSITION_UNAVAILABLE:
      return 'Your location could not be determined. Move somewhere with a clearer signal.';
    case error.TIMEOUT:
      return 'Timed out waiting for your location. Try again.';
    default:
      return 'Could not read your location.';
  }
}

// Mirrors public.geo_distance_meters() from 0021. The database repeats this
// calculation on clock-in; this copy only exists so the UI can explain the
// refusal before making the round trip.
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}
