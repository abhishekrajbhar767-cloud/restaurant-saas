'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { signIn, type LoginState } from './actions';

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction] = useFormState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="redirectTo" value={redirectTo ?? ''} />

      <div>
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field-input" placeholder="you@restaurant.com" />
      </div>

      <div>
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field-input" />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
