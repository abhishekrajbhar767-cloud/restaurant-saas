'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const STARS = [1, 2, 3, 4, 5];

const RATING_LABEL: Record<number, string> = {
  1: 'Poor',
  2: 'Not great',
  3: 'Fine',
  4: 'Good',
  5: 'Excellent',
};

export function FeedbackPanel({
  orderId,
  initialRating,
  googleReviewUrl,
}: {
  orderId: string;
  initialRating: number | null;
  googleReviewUrl: string | null;
}) {
  const [rating, setRating] = useState(initialRating);
  // Tracked separately from `rating` so hovering previews a score without
  // discarding what the customer already submitted.
  const [preview, setPreview] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = preview ?? rating;

  async function submit(value: number) {
    if (pending) return;
    const previous = rating;

    setPending(true);
    setError(null);
    setRating(value);

    const supabase = createClient();
    const { error: writeError } = await supabase.rpc('submit_customer_rating', {
      p_order_id: orderId,
      p_rating: value,
    });

    setPending(false);
    if (writeError) {
      setRating(previous);
      setError('Could not save your rating. Please try again.');
    }
  }

  return (
    <div className="rounded-lg border border-ink-950/10 p-4 mt-4">
      <h2 className="font-display font-bold text-sm uppercase tracking-wide text-text-onPaper/50">
        How was your service?
      </h2>

      <div
        role="radiogroup"
        aria-label="Rate your service from 1 to 5 stars"
        className="mt-3 flex items-center gap-1"
        onMouseLeave={() => setPreview(null)}
      >
        {STARS.map((value) => {
          const filled = shown !== null && value <= shown;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} ${value === 1 ? 'star' : 'stars'} — ${RATING_LABEL[value]}`}
              disabled={pending}
              onMouseEnter={() => setPreview(value)}
              onFocus={() => setPreview(value)}
              onBlur={() => setPreview(null)}
              onClick={() => submit(value)}
              className={`text-3xl leading-none transition-transform disabled:opacity-60 hover:scale-110 ${
                filled ? 'text-amber' : 'text-ink-950/20'
              }`}
            >
              <span aria-hidden>★</span>
            </button>
          );
        })}

        <span className="ml-2 text-sm text-text-onPaper/60">
          {pending ? 'Saving…' : shown !== null ? RATING_LABEL[shown] : 'Tap a star'}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : (
        rating !== null && !pending && (
          <p role="status" className="mt-2 text-sm text-text-onPaper/60">
            Thanks — your feedback went straight to the manager. Tap another star to change it.
          </p>
        )
      )}

      {googleReviewUrl && (
        <div className="mt-4 border-t border-ink-950/10 pt-4">
          <a
            href={googleReviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-ink-950 px-4 py-3 font-display text-sm font-bold text-paper"
          >
            <span aria-hidden>★</span>
            Rate us on Google
          </a>
          <p className="mt-2 text-center text-xs text-text-onPaper/50">
            Enjoyed your meal? A public review helps us a lot.
          </p>
        </div>
      )}
    </div>
  );
}
