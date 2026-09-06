'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useMemo, useState } from 'react';
import { resetOwnerPassword, type SuperAdminActionState } from '@/app/super-admin/actions';
import { Modal } from '@/components/super-admin/modal';

function suggestedPassword(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `Tmp-${token}!`;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Updating…' : 'Set temporary password'}
    </button>
  );
}

export function ResetPasswordModal({
  restaurantId,
  restaurantName,
  ownerEmail,
  onClose,
}: {
  restaurantId: string;
  restaurantName: string;
  ownerEmail: string | null;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState<SuperAdminActionState, FormData>(resetOwnerPassword, {});
  const initial = useMemo(suggestedPassword, []);
  const [password, setPassword] = useState(initial);

  return (
    <Modal title="Reset owner password" onClose={onClose}>
      <p className="text-sm text-text-muted mb-4">
        Raw passwords are never stored. This sets a temporary password for{' '}
        <span className="text-text font-medium">{restaurantName}</span>
        {ownerEmail ? (
          <>
            {' '}
            (<span className="font-mono text-xs">{ownerEmail}</span>)
          </>
        ) : null}{' '}
        via the Auth Admin API.
      </p>

      {state.success ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-success bg-success/10 border border-success/30 rounded px-3 py-2">
            {state.success}
          </p>
          <p className="text-xs text-text-muted">
            Temporary password (copy it now): <span className="font-mono text-text">{password}</span>
          </p>
          <button type="button" className="btn-secondary w-full" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="restaurantId" value={restaurantId} />
          <div>
            <label htmlFor="password" className="field-label">
              Temporary password
            </label>
            <input
              id="password"
              name="password"
              type="text"
              required
              minLength={6}
              autoComplete="new-password"
              className="field-input font-mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="text-xs text-text-muted hover:text-text underline underline-offset-2"
            onClick={() => setPassword(suggestedPassword())}
          >
            Generate another
          </button>
          {state.error && (
            <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
              {state.error}
            </p>
          )}
          <SubmitButton />
        </form>
      )}
    </Modal>
  );
}
