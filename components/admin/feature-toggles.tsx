'use client';

import { useState, useTransition } from 'react';
import { setFeatureToggle } from '@/app/admin/settings/actions';
import type { Restaurant, RestaurantFeatureToggle } from '@/types/database';

const TOGGLES: { setting: RestaurantFeatureToggle; label: string; description: string }[] = [
  {
    setting: 'require_table_assignment',
    label: 'Require a table on every order',
    description: 'Turn this off for takeaway or counter service, where an order need not belong to a table.',
  },
  {
    setting: 'enable_customer_name',
    label: 'Ask for the customer’s name',
    description: 'Shows a name field before the customer places their order.',
  },
  {
    setting: 'enable_customer_mobile',
    label: 'Ask for the customer’s mobile number',
    description: 'Shows a mobile number field before the customer places their order.',
  },
];

export function FeatureToggles({ restaurant }: { restaurant: Restaurant }) {
  const [values, setValues] = useState<Record<RestaurantFeatureToggle, boolean>>({
    require_table_assignment: restaurant.require_table_assignment,
    enable_customer_name: restaurant.enable_customer_name,
    enable_customer_mobile: restaurant.enable_customer_mobile,
  });
  const [pending, setPending] = useState<RestaurantFeatureToggle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleToggle(setting: RestaurantFeatureToggle) {
    if (pending) return;

    const next = !values[setting];
    const previous = values[setting];

    setError(null);
    setPending(setting);
    setValues((prev) => ({ ...prev, [setting]: next }));

    startTransition(async () => {
      const { error: saveError } = await setFeatureToggle(setting, next);
      setPending(null);
      if (saveError) {
        setValues((prev) => ({ ...prev, [setting]: previous }));
        setError(saveError);
      }
    });
  }

  return (
    <section className="card p-4 sm:p-5">
      <div>
        <h2 className="font-display text-lg font-bold">Ordering Options</h2>
        <p className="text-xs text-text-muted">
          Changes save as soon as you flip a switch and apply to every new order.
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="mt-4 divide-y divide-line">
        {TOGGLES.map((toggle) => {
          const on = values[toggle.setting];
          const busy = pending === toggle.setting;

          return (
            <li key={toggle.setting} className={`flex items-start gap-4 py-3 ${busy ? 'opacity-60' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{toggle.label}</p>
                <p className="mt-0.5 text-xs text-text-muted">{toggle.description}</p>
              </div>

              <span
                className={`mt-0.5 shrink-0 text-[10px] font-medium uppercase tracking-wide ${
                  on ? 'text-success' : 'text-text-muted'
                }`}
              >
                {on ? 'On' : 'Off'}
              </span>

              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={toggle.label}
                disabled={pending !== null}
                onClick={() => handleToggle(toggle.setting)}
                className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:pointer-events-none ${
                  on ? 'border-success/60 bg-success/70' : 'border-line bg-ink-700'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-paper transition-transform ${
                    on ? 'translate-x-6' : 'translate-x-1'
                  }`}
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
