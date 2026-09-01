'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { replaceOwner, retryOwnerCreation, type ReplaceOwnerState, type CreateRestaurantState } from '@/app/super-admin/actions';

export function ManageOwnerSection({
  restaurantId,
  ownerName,
  ownerEmail,
}: {
  restaurantId: string;
  ownerName: string | null;
  ownerEmail: string | null;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="card p-5">
      <h2 className="font-display font-bold text-sm uppercase tracking-wide text-amber mb-3">Owner</h2>
      {ownerEmail ? (
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">{ownerName}</div>
            <div className="text-sm text-text-muted">{ownerEmail}</div>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="btn-secondary text-sm">
            {showForm ? 'Cancel' : 'Replace owner'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-text-muted">No owner assigned yet.</p>
      )}

      {showForm && (
        <div className="mt-4 pt-4 border-t border-line">
          <ReplaceOwnerForm restaurantId={restaurantId} />
        </div>
      )}
    </div>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Used when the very first owner account creation failed at restaurant-creation time. */
export function RetryOwnerForm({ restaurantId }: { restaurantId: string }) {
  const [state, formAction] = useFormState<CreateRestaurantState, FormData>(retryOwnerCreation, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <OwnerFields />
      {state.error && <ErrorText message={state.error} />}
      <SubmitButton label="Create owner account" pendingLabel="Creating…" />
    </form>
  );
}

/** Used to replace an existing owner (deactivates the current one first). */
export function ReplaceOwnerForm({ restaurantId }: { restaurantId: string }) {
  const [state, formAction] = useFormState<ReplaceOwnerState, FormData>(replaceOwner, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <OwnerFields />
      {state.error && <ErrorText message={state.error} />}
      <SubmitButton label="Replace owner" pendingLabel="Creating…" />
    </form>
  );
}

function OwnerFields() {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div>
        <label htmlFor="ownerName" className="field-label">
          New owner name
        </label>
        <input id="ownerName" name="ownerName" required className="field-input" />
      </div>
      <div>
        <label htmlFor="ownerEmail" className="field-label">
          New owner email
        </label>
        <input id="ownerEmail" name="ownerEmail" type="email" required className="field-input" />
      </div>
      <div>
        <label htmlFor="ownerPassword" className="field-label">
          Password
        </label>
        <input
          id="ownerPassword"
          name="ownerPassword"
          type="text"
          required
          minLength={6}
          autoComplete="new-password"
          className="field-input font-mono"
          placeholder="min 6 characters"
        />
      </div>
      <div>
        <label htmlFor="ownerPhone" className="field-label">
          Phone (optional)
        </label>
        <input id="ownerPhone" name="ownerPhone" type="tel" className="field-input" />
      </div>
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
      {message}
    </p>
  );
}
