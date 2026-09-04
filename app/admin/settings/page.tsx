import { requireRole } from '@/lib/auth/session';
import { getRestaurantById } from '@/lib/restaurant/queries';
import { FeatureToggles } from '@/components/admin/feature-toggles';
import { GeofenceSettings } from '@/components/admin/geofence-settings';
import { GoogleReviewSettings } from '@/components/admin/google-review-settings';

export default async function SettingsPage() {
  const ctx = await requireRole(['owner', 'manager']);
  const membership = ctx.tenantMembership!;

  // Re-read rather than trusting the membership snapshot, so a save made from
  // another device shows up here on refresh.
  const restaurant = (await getRestaurantById(membership.restaurant.id)) ?? membership.restaurant;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-sm text-text-muted">{restaurant.name}</p>
      </div>

      <FeatureToggles restaurant={restaurant} />
      <GeofenceSettings restaurant={restaurant} />
      <GoogleReviewSettings restaurant={restaurant} />
    </div>
  );
}
