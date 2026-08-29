import Link from 'next/link';
import { CreateRestaurantForm } from './create-restaurant-form';

export default function NewRestaurantPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/super-admin" className="text-xs text-text-muted hover:text-text underline underline-offset-2">
        ← Back to overview
      </Link>
      <h1 className="font-display text-2xl font-bold mt-3 mb-1">Create a restaurant</h1>
      <p className="text-sm text-text-muted mb-8">
        It becomes available at its slug immediately — no new deploy, no new database.
      </p>

      <div className="card p-6">
        <CreateRestaurantForm />
      </div>
    </div>
  );
}
