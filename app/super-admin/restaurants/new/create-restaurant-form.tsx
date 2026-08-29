'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createRestaurant, type CreateRestaurantState } from '@/app/super-admin/actions';

const initialState: CreateRestaurantState = {};

const CURRENCIES = ['INR', 'USD', 'GBP', 'AED', 'EUR'];
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'UTC'];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Creating…' : 'Create restaurant'}
    </button>
  );
}

export function CreateRestaurantForm() {
  const [state, formAction] = useFormState(createRestaurant, initialState);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form action={formAction} className="space-y-8">
      <fieldset className="space-y-4">
        <legend className="font-display font-bold text-sm uppercase tracking-wide text-amber mb-1">Restaurant</legend>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="field-label">
              Restaurant name
            </label>
            <input
              id="name"
              name="name"
              required
              className="field-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder="Urban Spice"
            />
          </div>
          <div>
            <label htmlFor="slug" className="field-label">
              URL slug
            </label>
            <div className="flex items-center gap-1">
              <span className="text-text-muted text-sm font-mono">/menu/</span>
              <input
                id="slug"
                name="slug"
                required
                className="field-input font-mono"
                value={slug}
                onChange={(e) => {
                  setSlug(slugify(e.target.value));
                  setSlugTouched(true);
                }}
                placeholder="urban-spice"
              />
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="currency" className="field-label">
              Currency
            </label>
            <select id="currency" name="currency" className="field-input" defaultValue="INR">
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="timezone" className="field-label">
              Timezone
            </label>
            <select id="timezone" name="timezone" className="field-input" defaultValue="Asia/Kolkata">
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="logoUrl" className="field-label">
              Logo URL (optional)
            </label>
            <input id="logoUrl" name="logoUrl" type="url" className="field-input" placeholder="https://…" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" name="seedDefaultCategories" defaultChecked className="accent-amber" />
          Start with default menu categories (Starters, Main Course, Desserts, Drinks)
        </label>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display font-bold text-sm uppercase tracking-wide text-amber mb-1">Owner</legend>
        <p className="text-xs text-text-muted -mt-2">
          They&apos;ll receive an email invite to set a password and sign in at <span className="font-mono">/admin</span>.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ownerName" className="field-label">
              Owner name
            </label>
            <input id="ownerName" name="ownerName" required className="field-input" placeholder="Priya Shah" />
          </div>
          <div>
            <label htmlFor="ownerEmail" className="field-label">
              Owner email
            </label>
            <input id="ownerEmail" name="ownerEmail" type="email" required className="field-input" placeholder="owner@restaurant.com" />
          </div>
        </div>

        <div className="sm:w-1/2">
          <label htmlFor="ownerPhone" className="field-label">
            Owner phone (optional)
          </label>
          <input id="ownerPhone" name="ownerPhone" type="tel" className="field-input" placeholder="+91 90000 00000" />
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
