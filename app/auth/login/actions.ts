'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getUserContext, homeRouteFor } from '@/lib/auth/session';

const LoginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  redirectTo: z.string().optional(),
});

export interface LoginState {
  error?: string;
}

export async function signIn(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    redirectTo: formData.get('redirectTo') ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: 'Incorrect email or password.' };
  }

  // Determine destination server-side from real membership data — never
  // trust a client-supplied redirect target beyond "is it a known route".
  const ctx = await getUserContext();
  if (!ctx) {
    return { error: 'Signed in, but no account context could be loaded. Contact support.' };
  }

  const safeRedirect = parsed.data.redirectTo;
  const isSafeInternalPath = safeRedirect?.startsWith('/') && !safeRedirect.startsWith('//');

  redirect(isSafeInternalPath ? safeRedirect! : homeRouteFor(ctx));
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/auth/login');
}
