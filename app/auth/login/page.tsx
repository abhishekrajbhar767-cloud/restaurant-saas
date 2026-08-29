import { LoginForm } from './login-form';

const PORTALS = [
  { role: 'Super Admin', desc: 'Platform-wide oversight' },
  { role: 'Owner & Manager', desc: 'Menu, tables, staff, revenue' },
  { role: 'Kitchen', desc: 'Live order queue' },
  { role: 'Waiter', desc: 'Floor requests & service' },
];

export default function LoginPage({ searchParams }: { searchParams: { redirect?: string } }) {
  return (
    <main className="min-h-screen grid lg:grid-cols-[1fr_1.15fr]">
      {/* Signature panel */}
      <section className="hidden lg:flex flex-col justify-between bg-ink-950 border-r border-line px-14 py-12 relative overflow-hidden">
        <div className="absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-amber/10 blur-3xl" aria-hidden />

        <div className="font-display text-lg tracking-tight">Smart Restaurant OS</div>

        <div className="relative">
          <div
            className="inline-block -rotate-3 border-2 border-amber text-amber font-display font-bold tracking-[0.2em] text-sm px-5 py-2.5 rounded-sm"
            style={{ boxShadow: '3px 3px 0 rgba(232,163,61,0.25)' }}
          >
            STAFF ENTRANCE
          </div>

          <div className="mt-10 border-t border-dashed border-line pt-8 space-y-5">
            {PORTALS.map((p) => (
              <div key={p.role} className="flex items-baseline gap-4">
                <span className="h-1.5 w-1.5 shrink-0 bg-amber rounded-full" aria-hidden />
                <div>
                  <div className="font-display text-sm text-text">{p.role}</div>
                  <div className="text-xs text-text-muted">{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-text-muted max-w-xs">
          One login, routed to the right board — order queue, floor requests, or the whole
          platform — by what your account is cleared for.
        </p>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-2xl font-bold mb-1">Sign in</h1>
          <p className="text-sm text-text-muted mb-8">Use the account your restaurant set up for you.</p>

          <LoginForm redirectTo={searchParams.redirect} />

          <div className="mt-8 card px-4 py-3 text-xs text-text-muted">
            <span className="font-mono text-amber">DEMO</span> — owner@urbanspice.demo /
            kitchen@urbanspice.demo / waiter1@urbanspice.demo · password <span className="font-mono">Demo1234!</span>
          </div>
        </div>
      </section>
    </main>
  );
}
