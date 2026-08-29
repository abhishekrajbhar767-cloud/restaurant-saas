export default function Loading() {
  return (
    <div className="min-h-screen bg-paper animate-pulse px-5 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-ink-950/10" />
        <div className="space-y-2">
          <div className="h-4 w-32 bg-ink-950/10 rounded" />
          <div className="h-3 w-16 bg-ink-950/10 rounded" />
        </div>
      </div>
      <div className="h-10 bg-ink-950/10 rounded-full" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-ink-950/10 rounded-full" />
        ))}
      </div>
      <div className="space-y-4 pt-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-ink-950/5 rounded" />
        ))}
      </div>
    </div>
  );
}
