'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { resetOwnerPassword, type SuperAdminActionState } from '@/app/super-admin/actions';
import { Modal } from '@/components/super-admin/modal';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Updating password…' : 'Reset password'}
    </button>
  );
}

export function ResetPasswordModal({
  restaurantId,
  restaurantName,
  ownerEmail,
  onClose,
  onSuccess,
}: {
  restaurantId: string;
  restaurantName: string;
  ownerEmail: string | null;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}) {
  const [state, formAction] = useFormState<SuperAdminActionState, FormData>(resetOwnerPassword, {});
  const [show, setShow] = useState(false);
  const onSuccessRef = useRef(onSuccess);
  const onCloseRef = useRef(onClose);
  onSuccessRef.current = onSuccess;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!state.success) return;
    onSuccessRef.current?.(state.success);
    onCloseRef.current();
  }, [state.success]);

  return (
    <Modal title="Reset Password" onClose={onClose}>
      <p className="text-sm text-text-muted mb-4">
        Set a new password for the owner of <span className="text-text font-medium">{restaurantName}</span>
        {ownerEmail ? (
          <>
            {' '}
            (<span className="font-mono text-xs">{ownerEmail}</span>)
          </>
        ) : null}
        . This updates Auth immediately — no email or magic link is sent.
      </p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <div>
          <label htmlFor="password" className="field-label">
            New password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={show ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete="new-password"
              className="field-input font-mono pr-16"
              placeholder="min 6 characters"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-text"
              onClick={() => setShow((s) => !s)}
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="confirm" className="field-label">
            Confirm password
          </label>
          <input
            id="confirm"
            name="confirm"
            type={show ? 'text' : 'password'}
            required
            minLength={6}
            autoComplete="new-password"
            className="field-input font-mono"
          />
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
            {state.error}
          </p>
        )}
        <SubmitButton />
      </form>
    </Modal>
  );
}
