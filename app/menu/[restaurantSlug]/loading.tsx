export default function Loading() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl animate-pulse px-4 pt-5 sm:px-6 lg:max-w-5xl" aria-busy aria-label="Loading menu">
      {/* Header: name + rating badge */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-44 rounded-lg bg-white/10" />
          <div className="h-3 w-24 rounded bg-white/[0.06]" />
        </div>
        <div className="h-9 w-14 rounded-lg bg-white/10" />
      </div>
      <div className="mt-4 flex gap-3">
        <div className="h-3.5 w-20 rounded bg-white/[0.06]" />
        <div className="h-3.5 w-24 rounded bg-white/[0.06]" />
      </div>
      <div className="mt-4 h-16 rounded-xl bg-white/[0.06]" />

      {/* Search + filter pills */}
      <div className="mt-6 h-11 rounded-xl bg-white/[0.06]" />
      <div className="mt-3 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-20 rounded-lg bg-white/[0.06]" />
        ))}
      </div>

      {/* Item rows */}
      <div className="mt-6 h-6 w-48 rounded bg-white/10" />
      <div className="mt-2 divide-y divide-white/[0.06]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-5">
            <div className="flex-1 space-y-2.5">
              <div className="h-4 w-4 rounded bg-white/[0.06]" />
              <div className="h-5 w-3/4 rounded bg-white/10" />
              <div className="h-4 w-16 rounded bg-white/[0.06]" />
              <div className="h-3 w-full rounded bg-white/[0.06]" />
              <div className="h-3 w-2/3 rounded bg-white/[0.06]" />
            </div>
            <div className="h-[132px] w-[132px] shrink-0 rounded-2xl bg-white/[0.06] sm:h-[148px] sm:w-[148px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
