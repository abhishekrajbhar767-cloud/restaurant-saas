'use client';

import { useState, useTransition } from 'react';
import { saveGoogleReviewUrl } from '@/app/admin/settings/actions';
import type { Restaurant } from '@/types/database';

export function GoogleReviewSettings({ restaurant }: { restaurant: Restaurant }) {
  const [url, setUrl] = useState(restaurant.google_review_url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const configured = Boolean(restaurant.google_review_url);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const { error: saveError } = await saveGoogleReviewUrl(formData);
      if (saveError) {
        setError(saveError);
        return;
      }
      setNotice(
        url.trim() === ''
          ? 'Review link removed. The button no longer shows on the customer receipt.'
          : 'Saved. Customers now see a "Rate us on Google" button once their bill is out.'
      );
    });
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="font-display text-lg font-bold">Google Reviews</h2>
          <p className="text-xs text-text-muted">
            Where the &quot;Rate us on Google&quot; button on the customer&apos;s order page should send them.
          </p>
        </div>
        <span className={`text-xs font-medium ${configured ? 'text-success' : 'text-text-muted'}`}>
          {configured ? 'Active' : 'Not set'}
        </span>
      </div>

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
          <label htmlFor="googleReviewUrl" className="field-label">
            Review link
          </label>
          <input
            id="googleReviewUrl"
            name="googleReviewUrl"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://g.page/r/your-business/review"
            className="field-input"
          />
          <p className="mt-1.5 text-xs text-text-muted">
            In your Google Business Profile, open <span className="text-text">Ask for reviews</span> and paste the short
            link it gives you. Leave this empty to hide the button.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <button type="submit" disabled={isPending} className="btn-primary text-sm">
            {isPending ? 'Saving…' : 'Save review link'}
          </button>
          {configured && (
            <a
              href={restaurant.google_review_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-sm"
            >
              Test link
            </a>
          )}
        </div>
      </form>
    </section>
  );
}
